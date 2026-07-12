import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const clientIdSchema = z.object({ clientId: z.string().uuid() })

/** The Cloudflare for SaaS fallback origin clients point their CNAME at. */
function fallbackOrigin(): string {
  return process.env.CLOUDFLARE_FALLBACK_ORIGIN?.trim() || 'fallback.botcheck.io'
}

/** Split ai.midstatehealth.net -> label "ai" for the DNS "Name/Host" field. */
function subdomainLabel(hostname: string): string {
  const parts = hostname.split('.')
  return parts.length > 2 ? parts.slice(0, parts.length - 2).join('.') : parts[0]
}

export type HostnameStatus = 'pending' | 'active' | 'error' | 'not_setup'

export type DnsSetupData = {
  businessName: string | null
  status: string
  /** The client's custom subdomain, e.g. ai.midstatehealth.net. Null until admin registers it. */
  customHostname: string | null
  hostnameStatus: HostnameStatus
  hostnameError: string | null
  /** CNAME record the client must add at their DNS provider. Null until registered. */
  cname: { name: string; fullHost: string; target: string } | null
}

export const getDnsSetupData = createServerFn({ method: 'GET' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }): Promise<DnsSetupData> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('business_name, status, custom_hostname, custom_hostname_status, custom_hostname_error')
      .eq('id', data.clientId)
      .maybeSingle()

    if (error || !client) throw new Error('We could not find this account.')

    const customHostname = client.custom_hostname as string | null
    const hostnameStatus: HostnameStatus = customHostname
      ? ((client.custom_hostname_status as HostnameStatus | null) ?? 'pending')
      : 'not_setup'

    return {
      businessName: client.business_name,
      status: client.status,
      customHostname,
      hostnameStatus,
      hostnameError: (client.custom_hostname_error as string | null) ?? null,
      cname: customHostname
        ? {
            name: subdomainLabel(customHostname),
            fullHost: customHostname,
            target: fallbackOrigin(),
          }
        : null,
    }
  })

export type HostnameCheckResult = {
  status: HostnameStatus
  error: string | null
}

/**
 * Customer-facing poll of Cloudflare's verification state for their own
 * hostname. Short-circuits once active so we don't keep hitting Cloudflare, and
 * on first activation flips the client to `active` + sends the live email —
 * mirroring the old DNS-verification side effects.
 */
export const checkCustomHostnameStatus = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }): Promise<HostnameCheckResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select(
        'id, custom_hostname, cf_hostname_id, custom_hostname_status, status, contact_email, business_name',
      )
      .eq('id', data.clientId)
      .maybeSingle()

    if (error || !client) throw new Error('We could not find this account.')

    if (!client.cf_hostname_id || !client.custom_hostname) {
      return { status: 'not_setup', error: null }
    }

    // Already active — stay idempotent, no Cloudflare call needed.
    if (client.custom_hostname_status === 'active') {
      return { status: 'active', error: null }
    }

    const { getCustomHostnameStatus } = await import('./cloudflare.server')
    const result = await getCustomHostnameStatus(client.cf_hostname_id)

    const update: Record<string, unknown> = {
      custom_hostname_status: result.status,
      custom_hostname_error: result.error,
    }

    // First transition to active: mark the client live + notify, once.
    const justActivated = result.status === 'active' && client.status !== 'active'
    if (justActivated) {
      update.status = 'active'
      update.dns_verified = true
      update.dns_verified_at = new Date().toISOString()
    }

    const { error: updateError } = await supabaseAdmin
      .from('clients')
      .update(update)
      .eq('id', client.id)

    if (updateError) throw new Error(updateError.message)

    if (justActivated && client.contact_email) {
      try {
        const { sendProfileLiveEmail } = await import('@/lib/email.server')
        await sendProfileLiveEmail({
          clientId: client.id,
          email: client.contact_email,
          domain: client.custom_hostname,
          businessName: client.business_name,
        })
      } catch (err) {
        console.error('[dns] live email error:', err)
      }
    }

    return { status: result.status, error: result.error }
  })
