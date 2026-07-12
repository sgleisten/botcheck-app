import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { z } from 'zod'
import { supabaseAdmin, supabaseAuth } from '@/integrations/supabase/client.server'
import {
  checkoutUrl,
  generateCheckoutToken,
  onboardingUrl,
  type BillingType,
} from '@/lib/billing.server'
import { assertAdmin, sessionConfig, type AdminSession } from './admin-auth.server'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const adminLogin = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const adminUserId = process.env.ADMIN_USER_ID
    if (!adminUserId) throw new Error('ADMIN_USER_ID is not configured')

    const { data: auth, error } = await supabaseAuth.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'Email or password is incorrect.'
          : error.message,
      )
    }
    if (!auth.user) throw new Error('Email or password is incorrect.')
    if (auth.user.id !== adminUserId) throw new Error('Not authorized')

    const session = await useSession<AdminSession>(sessionConfig())
    await session.update({ userId: auth.user.id })
    return { ok: true }
  })

export const adminLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig())
  await session.clear()
})

// ─── Dashboard data ────────────────────────────────────────────────────────────

export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertAdmin()

  const [profilesRes, clientsRes, scansRes, allProfilesRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, client_id, status, generated_at, created_at, clients(domain, business_name)')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('clients')
      .select(
        'id, domain, business_name, contact_email, status, plan, dns_verified, billing_type, quoted_monthly_cents, checkout_token, custom_hostname, custom_hostname_status, custom_hostname_error, created_at',
      )
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('scans')
      .select('id, url, ars_score, email, created_at')
      .order('created_at', { ascending: false })
      .limit(50),

    // Latest profile per client, for the per-row View/Edit/Approve actions.
    supabaseAdmin
      .from('profiles')
      .select('id, client_id, status, version')
      .order('version', { ascending: false }),
  ])

  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (clientsRes.error) throw new Error(clientsRes.error.message)
  if (scansRes.error) throw new Error(scansRes.error.message)
  if (allProfilesRes.error) throw new Error(allProfilesRes.error.message)

  const latestProfileByClient = new Map<string, { id: string; status: string }>()
  for (const p of allProfilesRes.data as Array<{
    id: string
    client_id: string
    status: string
    version: number
  }>) {
    // Rows are version-desc, so the first one seen per client is the latest.
    if (!latestProfileByClient.has(p.client_id)) {
      latestProfileByClient.set(p.client_id, { id: p.id, status: p.status })
    }
  }

  const clients = (
    clientsRes.data as Array<{
      id: string
      domain: string
      business_name: string | null
      contact_email: string | null
      status: string
      plan: string | null
      dns_verified: boolean | null
      billing_type: BillingType
      quoted_monthly_cents: number | null
      checkout_token: string | null
      custom_hostname: string | null
      custom_hostname_status: string | null
      custom_hostname_error: string | null
      created_at: string
    }>
  ).map((c) => ({ ...c, profile: latestProfileByClient.get(c.id) ?? null }))

  return {
    pendingProfiles: profilesRes.data as unknown as Array<{
      id: string
      client_id: string
      status: string
      generated_at: string | null
      created_at: string
      clients: { domain: string; business_name: string | null } | null
    }>,
    clients,
    recentScans: scansRes.data as Array<{
      id: string
      url: string
      ars_score: number | null
      email: string | null
      created_at: string
    }>,
  }
})

// ─── Manual onboarding & profile editing ────────────────────────────────────────

const manualClientSchema = z.object({
  domain: z.string().min(3).max(255),
  businessName: z.string().min(1).max(255),
  contactEmail: z.string().email(),
  plan: z.enum(['starter', 'agency']).default('starter'),
  notes: z.string().max(2000).optional(),
})

export const createManualClient = createServerFn({ method: 'POST' })
  .validator((input: unknown) => manualClientSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const insert: Record<string, unknown> = {
      domain: data.domain,
      business_name: data.businessName,
      contact_email: data.contactEmail,
      plan: data.plan,
      status: 'onboarding',
      billing_type: 'comped',
    }
    // `notes` requires the 20260615 migration; only set it when provided so the
    // insert still works on a DB that hasn't run that migration yet.
    if (data.notes && data.notes.trim()) insert.notes = data.notes.trim()

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .insert(insert)
      .select('id')
      .single()

    if (error || !client) throw new Error(error?.message ?? 'Failed to create client')

    return { clientId: client.id, onboardingUrl: onboardingUrl(client.id) }
  })

export const getClientProfile = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, status, version, llms_txt, tools_json, generated_at')
      .eq('client_id', data.clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!profile) return null

    return {
      id: profile.id as string,
      status: profile.status as string,
      version: profile.version as number,
      llmsTxt: (profile.llms_txt as string | null) ?? '',
      toolsJson: profile.tools_json ? JSON.stringify(profile.tools_json, null, 2) : '',
      generatedAt: profile.generated_at as string | null,
    }
  })

const updateProfileSchema = z.object({
  profileId: z.string().uuid(),
  llmsTxt: z.string().max(50000),
  toolsJson: z.string().max(50000),
})

export const updateProfile = createServerFn({ method: 'POST' })
  .validator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    let parsedTools: unknown = null
    if (data.toolsJson.trim()) {
      try {
        parsedTools = JSON.parse(data.toolsJson)
      } catch {
        throw new Error('tools.json is not valid JSON — fix it before saving.')
      }
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ llms_txt: data.llmsTxt, tools_json: parsedTools })
      .eq('id', data.profileId)

    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const approveProfile = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const adminUserId = await assertAdmin()

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, client_id')
      .eq('id', data.profileId)
      .single()

    if (fetchError || !profile) throw new Error('Profile not found')

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'live',
        approved_at: new Date().toISOString(),
        approved_by: adminUserId,
      })
      .eq('id', data.profileId)

    if (error) throw new Error(error.message)

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('domain, business_name, contact_email')
      .eq('id', profile.client_id)
      .single()

    if (client?.contact_email) {
      try {
        const { sendProfileLiveEmail } = await import('@/lib/email.server')
        await sendProfileLiveEmail({
          clientId: profile.client_id,
          email: client.contact_email,
          domain: client.domain,
          businessName: client.business_name,
        })
      } catch (err) {
        console.error('[email] Profile live notification error:', err)
      }
    }

    return { ok: true }
  })

const createDealSchema = z.object({
  domain: z.string().min(3).max(255),
  contactEmail: z.string().email(),
  businessName: z.string().max(255).optional(),
  billingType: z.enum(['custom_checkout', 'invoice', 'comped']),
  monthlyPriceDollars: z.number().positive().optional(),
  stripePriceId: z.string().startsWith('price_').optional(),
})

export const createClientDeal = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createDealSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    if (data.billingType === 'custom_checkout' && !data.monthlyPriceDollars && !data.stripePriceId) {
      throw new Error('Custom checkout requires a monthly price or Stripe Price ID.')
    }

    const quotedCents =
      data.monthlyPriceDollars != null ? Math.round(data.monthlyPriceDollars * 100) : null

    const checkoutToken =
      data.billingType === 'custom_checkout' ? generateCheckoutToken() : null

    const status =
      data.billingType === 'comped' ? 'onboarding' : 'pending_payment'

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .insert({
        domain: data.domain,
        business_name: data.businessName ?? null,
        contact_email: data.contactEmail,
        status,
        billing_type: data.billingType,
        stripe_price_id: data.stripePriceId ?? null,
        quoted_monthly_cents: quotedCents,
        checkout_token: checkoutToken,
      })
      .select('id, checkout_token')
      .single()

    if (error || !client) throw new Error(error?.message ?? 'Failed to create client')

    return {
      clientId: client.id,
      checkoutUrl: client.checkout_token ? checkoutUrl(client.checkout_token) : null,
      onboardingUrl: onboardingUrl(client.id),
      billingType: data.billingType,
    }
  })

export const markClientPaid = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: client, error: fetchError } = await supabaseAdmin
      .from('clients')
      .select('id, billing_type, status, domain, business_name, contact_email')
      .eq('id', data.clientId)
      .single()

    if (fetchError || !client) throw new Error('Client not found')
    if (client.billing_type !== 'invoice') {
      throw new Error('Mark paid is only for invoice-billed clients.')
    }
    if (client.status !== 'pending_payment') {
      throw new Error('Client is not awaiting payment.')
    }

    const { error } = await supabaseAdmin
      .from('clients')
      .update({ status: 'onboarding' })
      .eq('id', data.clientId)

    if (error) throw new Error(error.message)

    if (client.contact_email) {
      try {
        const { sendPostCheckoutEmail } = await import('@/lib/email.server')
        await sendPostCheckoutEmail({
          clientId: data.clientId,
          email: client.contact_email,
          domain: client.domain,
          businessName: client.business_name,
        })
      } catch (err) {
        console.error('[email] Post-invoice-paid email error:', err)
      }
    }

    return { ok: true, onboardingUrl: onboardingUrl(data.clientId) }
  })
