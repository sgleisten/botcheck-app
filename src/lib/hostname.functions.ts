import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Admin-only management of a client's Cloudflare custom hostname. Wraps the
// Cloudflare API client (cloudflare.server.ts) and persists the result on the
// client row so the admin + onboarding UIs can show verification state.

function cleanHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.$/, '')
}

// A single DNS label plus a registrable domain, e.g. ai.example.co.uk.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

const setupSchema = z.object({
  clientId: z.string().uuid(),
  hostname: z.string().min(3).max(253),
})

export type HostnameStatusResult = {
  hostname: string
  status: 'pending' | 'active' | 'error'
  error: string | null
}

export const setupCustomHostname = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setupSchema.parse(input))
  .handler(async ({ data }): Promise<HostnameStatusResult> => {
    const { assertAdmin } = await import('./admin-auth.server')
    await assertAdmin()

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const {
      createCustomHostname,
      deleteCustomHostname,
    } = await import('./cloudflare.server')

    const hostname = cleanHostname(data.hostname)
    if (!HOSTNAME_RE.test(hostname)) {
      throw new Error('Enter a valid subdomain, e.g. ai.example.com')
    }

    const { data: client, error: fetchError } = await supabaseAdmin
      .from('clients')
      .select('id, cf_hostname_id')
      .eq('id', data.clientId)
      .maybeSingle()

    if (fetchError || !client) throw new Error('Client not found')

    // Re-registering: clean up the previous Cloudflare hostname first so we
    // don't orphan it. Best-effort — a stale CF record shouldn't block setup.
    if (client.cf_hostname_id) {
      try {
        await deleteCustomHostname(client.cf_hostname_id)
      } catch (err) {
        console.error('[hostname] failed to delete previous CF hostname:', err)
      }
    }

    const result = await createCustomHostname(hostname)

    const { error: updateError } = await supabaseAdmin
      .from('clients')
      .update({
        custom_hostname: hostname,
        cf_hostname_id: result.cfHostnameId,
        custom_hostname_status: result.status,
        custom_hostname_error: result.error,
      })
      .eq('id', data.clientId)

    if (updateError) throw new Error(updateError.message)

    return { hostname, status: result.status, error: result.error }
  })

export const refreshHostnameStatus = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<HostnameStatusResult> => {
    const { assertAdmin } = await import('./admin-auth.server')
    await assertAdmin()

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { getCustomHostnameStatus } = await import('./cloudflare.server')

    const { data: client, error: fetchError } = await supabaseAdmin
      .from('clients')
      .select('id, custom_hostname, cf_hostname_id')
      .eq('id', data.clientId)
      .maybeSingle()

    if (fetchError || !client) throw new Error('Client not found')
    if (!client.cf_hostname_id || !client.custom_hostname) {
      throw new Error('No custom hostname registered for this client yet.')
    }

    const result = await getCustomHostnameStatus(client.cf_hostname_id)

    const { error: updateError } = await supabaseAdmin
      .from('clients')
      .update({
        custom_hostname_status: result.status,
        custom_hostname_error: result.error,
      })
      .eq('id', data.clientId)

    if (updateError) throw new Error(updateError.message)

    return {
      hostname: client.custom_hostname,
      status: result.status,
      error: result.error,
    }
  })
