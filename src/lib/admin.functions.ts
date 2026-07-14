import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { z } from 'zod'
import { supabaseAdmin, supabaseAuth } from '@/integrations/supabase/client.server'
import {
  appBaseUrl,
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

const RESET_SENT_MESSAGE =
  'If that email is registered for admin access, you will receive a password reset link shortly.'

async function getAdminAuthEmail(): Promise<string | null> {
  const adminUserId = process.env.ADMIN_USER_ID
  if (!adminUserId) return null

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(adminUserId)
  if (error || !data.user?.email) {
    const fallback = process.env.ADMIN_EMAIL?.trim()
    return fallback || null
  }
  return data.user.email
}

export const adminRequestPasswordReset = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    if (!process.env.ADMIN_USER_ID) throw new Error('ADMIN_USER_ID is not configured')

    const adminEmail = await getAdminAuthEmail()
    if (!adminEmail || adminEmail.toLowerCase() !== data.email.trim().toLowerCase()) {
      // Same response whether or not the email matches — avoid account enumeration.
      return { ok: true, message: RESET_SENT_MESSAGE }
    }

    const redirectTo = `${appBaseUrl()}/admin/update-password`
    if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(redirectTo)) {
      throw new Error(
        'Password reset is misconfigured: APP_URL is missing. Set APP_URL=https://www.botcheck.io in Vercel Production, and Supabase Auth → Site URL to the same domain.',
      )
    }

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(adminEmail, { redirectTo })
    if (error) {
      console.error('[admin] resetPasswordForEmail failed:', error.message)
      throw new Error('Could not send reset email. Try again or reset via Supabase dashboard.')
    }

    return { ok: true, message: RESET_SENT_MESSAGE }
  })

export const adminCompletePasswordReset = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        accessToken: z.string().min(1),
        refreshToken: z.string().min(1),
        password: z.string().min(8, 'Password must be at least 8 characters'),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const adminUserId = process.env.ADMIN_USER_ID
    if (!adminUserId) throw new Error('ADMIN_USER_ID is not configured')

    const { data: sessionData, error } = await supabaseAuth.auth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    })

    if (error || !sessionData.user) {
      throw new Error('This reset link is invalid or expired. Request a new one.')
    }
    if (sessionData.user.id !== adminUserId) {
      await supabaseAuth.auth.signOut()
      throw new Error('Not authorized')
    }

    const { error: updateError } = await supabaseAuth.auth.updateUser({ password: data.password })
    if (updateError) throw new Error(updateError.message)

    const session = await useSession<AdminSession>(sessionConfig())
    await session.update({ userId: sessionData.user.id })
    return { ok: true }
  })

// ─── Dashboard data ────────────────────────────────────────────────────────────

const getAdminDataSchema = z.object({ includeArchived: z.boolean().optional() })

export const getAdminData = createServerFn({ method: 'GET' })
  .validator((input: unknown) => getAdminDataSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
  await assertAdmin()

  let clientsQuery = supabaseAdmin
    .from('clients')
    .select(
      'id, domain, business_name, contact_email, status, plan, dns_verified, billing_type, quoted_monthly_cents, checkout_token, custom_hostname, custom_hostname_status, custom_hostname_error, notes, archived_at, created_at, baseline_scan_id, post_delivery_scan_id, hosting_access',
    )
    .order('created_at', { ascending: false })
  if (!data.includeArchived) {
    clientsQuery = clientsQuery.is('archived_at', null)
  }

  const [profilesRes, clientsRes, scansRes, allProfilesRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, client_id, status, generated_at, created_at, clients(domain, business_name)')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false }),

    clientsQuery,

    supabaseAdmin
      .from('scans')
      .select('id, url, client_id, ars_score, email, created_at')
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
      notes: string | null
      archived_at: string | null
      created_at: string
      baseline_scan_id: string | null
      post_delivery_scan_id: string | null
      hosting_access: boolean | null
    }>
  ).map((c) => ({ ...c, profile: latestProfileByClient.get(c.id) ?? null }))

  const scanIds = new Set<string>()
  for (const c of clients) {
    if (c.baseline_scan_id) scanIds.add(c.baseline_scan_id)
    if (c.post_delivery_scan_id) scanIds.add(c.post_delivery_scan_id)
  }

  const scoreByScanId = new Map<string, number>()
  if (scanIds.size > 0) {
    const { data: linkedScans } = await supabaseAdmin
      .from('scans')
      .select('id, ars_score')
      .in('id', [...scanIds])
    for (const s of linkedScans ?? []) {
      if (s.ars_score != null) scoreByScanId.set(s.id as string, s.ars_score as number)
    }
  }

  const clientsWithScores = clients.map((c) => ({
    ...c,
    baselineScore: c.baseline_scan_id ? (scoreByScanId.get(c.baseline_scan_id) ?? null) : null,
    postDeliveryScore: c.post_delivery_scan_id
      ? (scoreByScanId.get(c.post_delivery_scan_id) ?? null)
      : null,
  }))

  return {
    pendingProfiles: profilesRes.data as unknown as Array<{
      id: string
      client_id: string
      status: string
      generated_at: string | null
      created_at: string
      clients: { domain: string; business_name: string | null } | null
    }>,
    clients: clientsWithScores,
    recentScans: scansRes.data as Array<{
      id: string
      url: string
      client_id: string | null
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
  hostingAccess: z.boolean().default(false),
  runBaselineScan: z.boolean().default(true),
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
      hosting_access: data.hostingAccess,
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

    let baselineScanId: string | null = null
    let baselineScore: number | null = null

    if (data.runBaselineScan) {
      try {
        const { performScan } = await import('./scan.functions')
        const url = /^https?:\/\//i.test(data.domain) ? data.domain : `https://${data.domain}`
        const scan = await performScan(url, client.id)
        baselineScanId = scan.id
        baselineScore = scan.ars_score

        await supabaseAdmin
          .from('clients')
          .update({ baseline_scan_id: scan.id, scan_id: scan.id })
          .eq('id', client.id)
      } catch (err) {
        console.error('[admin] Baseline scan failed:', err)
      }
    }

    return {
      clientId: client.id,
      onboardingUrl: onboardingUrl(client.id),
      baselineScanId,
      baselineScore,
    }
  })

export const getClientProfile = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, status, version, llms_txt, tools_json, robots_txt_additions, generated_at')
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
      robotsTxtAdditions: (profile.robots_txt_additions as string | null) ?? '',
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

// ─── Client edit / archive ──────────────────────────────────────────────────

const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  domain: z.string().min(3).max(255),
  businessName: z.string().max(255).optional(),
  contactEmail: z.string().email(),
  plan: z.enum(['starter', 'agency']),
  status: z.enum(['pending_payment', 'onboarding', 'active', 'past_due', 'cancelled']),
  notes: z.string().max(2000).optional(),
})

export const updateClient = createServerFn({ method: 'POST' })
  .validator((input: unknown) => updateClientSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { error } = await supabaseAdmin
      .from('clients')
      .update({
        domain: data.domain,
        business_name: data.businessName?.trim() || null,
        contact_email: data.contactEmail,
        plan: data.plan,
        status: data.status,
        notes: data.notes?.trim() || null,
      })
      .eq('id', data.clientId)

    if (error) throw new Error(error.message)
    return { ok: true }
  })

const clientIdSchema = z.object({ clientId: z.string().uuid() })

export const archiveClient = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()
    const { error } = await supabaseAdmin
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', data.clientId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const unarchiveClient = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()
    const { error } = await supabaseAdmin
      .from('clients')
      .update({ archived_at: null })
      .eq('id', data.clientId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ─── Scan re-run ─────────────────────────────────────────────────────────────

const rerunScanSchema = z.object({
  url: z.string().url().max(2048),
  clientId: z.string().uuid().optional(),
})

export const rerunScan = createServerFn({ method: 'POST' })
  .validator((input: unknown) => rerunScanSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()
    const { performScan } = await import('./scan.functions')
    const result = await performScan(data.url, data.clientId)
    return { id: result.id, ars_score: result.ars_score }
  })

// ─── Agency deploy & before/after tracking ───────────────────────────────────

export const getClientDeployData = createServerFn({ method: 'GET' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { buildIndexJson, buildJsonLd, onSiteDeployChecklist, profileFileUrl } = await import(
      './profile-surfaces'
    )

    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select(
        'id, domain, business_name, contact_email, hosting_access, custom_hostname, custom_hostname_status, dns_verified, baseline_scan_id, post_delivery_scan_id',
      )
      .eq('id', data.clientId)
      .single()

    if (clientError || !client) throw new Error('Client not found')

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, status, llms_txt, tools_json, robots_txt_additions')
      .eq('client_id', data.clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const scanIds = [client.baseline_scan_id, client.post_delivery_scan_id].filter(Boolean) as string[]
    const scoreById = new Map<string, number>()
    if (scanIds.length > 0) {
      const { data: scans } = await supabaseAdmin
        .from('scans')
        .select('id, ars_score')
        .in('id', scanIds)
      for (const s of scans ?? []) {
        if (s.ars_score != null) scoreById.set(s.id as string, s.ars_score as number)
      }
    }

    const { data: brandChecks } = await supabaseAdmin
      .from('brand_checks')
      .select('id, check_type, mention_count, model_count, notes, created_at')
      .eq('client_id', data.clientId)
      .order('created_at', { ascending: true })

    const appUrl = appBaseUrl()
    const surfaceInput = {
      businessName: client.business_name as string | null,
      domain: client.domain as string,
      llmsTxt: (profile?.llms_txt as string | null) ?? null,
      toolsJson: profile?.tools_json ?? null,
    }

    const jsonLd = JSON.stringify(buildJsonLd(surfaceInput), null, 2)
    const jsonLdSnippet = `<script type="application/ld+json">\n${jsonLd}\n</script>`

    return {
      client: {
        id: client.id as string,
        domain: client.domain as string,
        businessName: client.business_name as string | null,
        hostingAccess: Boolean(client.hosting_access),
        customHostname: client.custom_hostname as string | null,
        customHostnameStatus: client.custom_hostname_status as string | null,
        dnsVerified: Boolean(client.dns_verified),
      },
      profile: profile
        ? {
            id: profile.id as string,
            status: profile.status as string,
            llmsTxt: (profile.llms_txt as string | null) ?? '',
            toolsJson: profile.tools_json ? JSON.stringify(profile.tools_json, null, 2) : '',
            robotsTxtAdditions: (profile.robots_txt_additions as string | null) ?? '',
          }
        : null,
      scores: {
        baseline: client.baseline_scan_id
          ? (scoreById.get(client.baseline_scan_id as string) ?? null)
          : null,
        postDelivery: client.post_delivery_scan_id
          ? (scoreById.get(client.post_delivery_scan_id as string) ?? null)
          : null,
        baselineScanId: client.baseline_scan_id as string | null,
        postDeliveryScanId: client.post_delivery_scan_id as string | null,
      },
      brandChecks: (brandChecks ?? []) as Array<{
        id: string
        check_type: string
        mention_count: number
        model_count: number
        notes: string | null
        created_at: string
      }>,
      urls: {
        llmsTxt: profileFileUrl(appUrl, data.clientId, 'llms.txt'),
        toolsJson: profileFileUrl(appUrl, data.clientId, 'tools.json'),
        indexJson: profileFileUrl(appUrl, data.clientId, 'index.json'),
        jsonld: profileFileUrl(appUrl, data.clientId, 'jsonld'),
        dnsSetup: `${appUrl}/onboarding/dns-setup/${data.clientId}`,
        clientReport: `${appUrl}/print/client/${data.clientId}`,
      },
      jsonLdSnippet,
      indexJsonPreview: JSON.stringify(buildIndexJson(surfaceInput), null, 2),
      onSiteChecklist: onSiteDeployChecklist(client.domain as string),
      fallbackOrigin: process.env.CLOUDFLARE_FALLBACK_ORIGIN ?? 'fallback.botcheck.io',
    }
  })

export const runPostDeliveryScan = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, domain')
      .eq('id', data.clientId)
      .single()

    if (error || !client) throw new Error('Client not found')

    const { performScan } = await import('./scan.functions')
    const url = /^https?:\/\//i.test(client.domain) ? client.domain : `https://${client.domain}`
    const result = await performScan(url, client.id)

    const { error: updateError } = await supabaseAdmin
      .from('clients')
      .update({ post_delivery_scan_id: result.id, last_scanned_at: new Date().toISOString() })
      .eq('id', data.clientId)

    if (updateError) throw new Error(updateError.message)

    return { scanId: result.id, arsScore: result.ars_score }
  })

export const runBaselineScan = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, domain')
      .eq('id', data.clientId)
      .single()

    if (error || !client) throw new Error('Client not found')

    const { performScan } = await import('./scan.functions')
    const url = /^https?:\/\//i.test(client.domain) ? client.domain : `https://${client.domain}`
    const result = await performScan(url, client.id)

    const { error: updateError } = await supabaseAdmin
      .from('clients')
      .update({
        baseline_scan_id: result.id,
        scan_id: result.id,
        last_scanned_at: new Date().toISOString(),
      })
      .eq('id', data.clientId)

    if (updateError) throw new Error(updateError.message)

    return { scanId: result.id, arsScore: result.ars_score }
  })

const brandCheckSchema = z.object({
  clientId: z.string().uuid(),
  checkType: z.enum(['baseline', 'post_delivery']),
  mentionCount: z.number().int().min(0).max(100),
  modelCount: z.number().int().min(1).max(20).default(5),
  notes: z.string().max(2000).optional(),
})

export const recordBrandCheck = createServerFn({ method: 'POST' })
  .validator((input: unknown) => brandCheckSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: row, error } = await supabaseAdmin
      .from('brand_checks')
      .insert({
        client_id: data.clientId,
        check_type: data.checkType,
        mention_count: data.mentionCount,
        model_count: data.modelCount,
        notes: data.notes?.trim() || null,
      })
      .select('id')
      .single()

    if (error || !row) throw new Error(error?.message ?? 'Failed to record brand check')
    return { id: row.id as string }
  })

export const getClientReportData = createServerFn({ method: 'GET' })
  .validator((input: unknown) =>
    z
      .object({ clientId: z.string().uuid(), snapshotId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select(
        'id, domain, business_name, baseline_scan_id, post_delivery_scan_id, custom_hostname, hosting_access',
      )
      .eq('id', data.clientId)
      .single()

    if (error || !client) throw new Error('Client not found')

    const base = {
      domain: client.domain as string,
      businessName: client.business_name as string | null,
      customHostname: client.custom_hostname as string | null,
      hostingAccess: Boolean(client.hosting_access),
    }

    // Snapshot mode: render a frozen, dated record.
    if (data.snapshotId) {
      const { data: snap, error: snapError } = await supabaseAdmin
        .from('client_report_snapshots')
        .select('id, phase, label, ars_score, site_readiness, discoverability_score, findings, brand_summary, captured_at')
        .eq('id', data.snapshotId)
        .eq('client_id', data.clientId)
        .single()
      if (snapError || !snap) throw new Error('Snapshot not found')

      const findings = (snap.findings ?? {}) as {
        top_failures?: string[]
        quick_wins?: string[]
        categories?: CategoryFinding[]
      }
      const brand = (snap.brand_summary ?? {}) as {
        model_count?: number
        mention_count?: number
        results?: Array<{ prompt: string; model: string; mentioned: boolean }>
      }
      return {
        ...base,
        mode: 'snapshot' as const,
        capturedAt: snap.captured_at as string,
        phase: snap.phase as string,
        label: (snap.label as string | null) ?? null,
        score: (snap.ars_score as number | null) ?? null,
        topFailures: findings.top_failures ?? [],
        quickWins: findings.quick_wins ?? [],
        categories: findings.categories ?? [],
        brandModelCount: brand.model_count ?? 0,
        brandMentionCount: brand.mention_count ?? 0,
        brandResults: brand.results ?? [],
      }
    }

    // Live mode: baseline vs post composite.
    const [baseline, post] = await Promise.all([
      loadScanFindings(client.baseline_scan_id as string | null),
      loadScanFindings(client.post_delivery_scan_id as string | null),
    ])

    const { data: brandRows } = await supabaseAdmin
      .from('brand_visibility_results')
      .select('id, phase, prompt, model, mentioned, response_excerpt, notes, created_at')
      .eq('client_id', data.clientId)
      .order('created_at', { ascending: false })
    const rows = (brandRows ?? []) as BrandResultRow[]
    const baselineBrand = rows.filter((r) => r.phase === 'baseline')
    const postBrand = rows.filter((r) => r.phase === 'post_delivery')

    return {
      ...base,
      mode: 'live' as const,
      capturedAt: new Date().toISOString(),
      baselineScore: baseline?.score ?? null,
      postDeliveryScore: post?.score ?? null,
      baselineDate: baseline?.createdAt ?? null,
      postDeliveryDate: post?.createdAt ?? null,
      baselineFindings: baseline
        ? { topFailures: baseline.topFailures, quickWins: baseline.quickWins }
        : null,
      postFindings: post
        ? { topFailures: post.topFailures, quickWins: post.quickWins }
        : null,
      brand: {
        baseline: baselineBrand,
        post: postBrand,
        baselineSummary: summarizeBrandResults(baselineBrand),
        postSummary: summarizeBrandResults(postBrand),
      },
    }
  })

// ─── Consolidated client workspace ───────────────────────────────────────────

const CATEGORY_META_KEYS = new Set(['ai_discoverability', 'site_readiness'])

type CategoryFinding = { key: string; label: string; score: number | null; finding: string | null }

function cleanCategories(categories: Record<string, unknown>): CategoryFinding[] {
  const out: CategoryFinding[] = []
  for (const [key, val] of Object.entries(categories)) {
    if (CATEGORY_META_KEYS.has(key)) continue
    if (val && typeof val === 'object' && 'score' in (val as Record<string, unknown>)) {
      const v = val as { score?: number; finding?: string }
      out.push({
        key,
        label: key.replace(/_/g, ' '),
        score: typeof v.score === 'number' ? v.score : null,
        finding: typeof v.finding === 'string' ? v.finding : null,
      })
    }
  }
  return out
}

type ScanFindings = {
  id: string
  score: number | null
  siteReadiness: number | null
  discoverabilityScore: number | null
  topFailures: string[]
  quickWins: string[]
  categories: CategoryFinding[]
  createdAt: string | null
}

async function loadScanFindings(scanId: string | null): Promise<ScanFindings | null> {
  if (!scanId) return null
  const { data } = await supabaseAdmin
    .from('scans')
    .select('id, ars_score, categories, top_failures, quick_wins, created_at')
    .eq('id', scanId)
    .maybeSingle()
  if (!data) return null
  const categories = (data.categories ?? {}) as Record<string, unknown>
  const disc = categories.ai_discoverability as { score?: number } | undefined
  return {
    id: data.id as string,
    score: (data.ars_score as number | null) ?? null,
    siteReadiness: (categories.site_readiness as number | null) ?? null,
    discoverabilityScore: typeof disc?.score === 'number' ? disc.score : null,
    topFailures: (data.top_failures as string[] | null) ?? [],
    quickWins: (data.quick_wins as string[] | null) ?? [],
    categories: cleanCategories(categories),
    createdAt: (data.created_at as string | null) ?? null,
  }
}

type BrandResultRow = {
  id: string
  phase: string
  prompt: string
  model: string
  mentioned: boolean
  response_excerpt: string | null
  notes: string | null
  created_at: string
}

function summarizeBrandResults(rows: BrandResultRow[]): {
  modelCount: number
  mentionCount: number
} {
  const models = new Map<string, boolean>()
  for (const r of rows) {
    models.set(r.model, (models.get(r.model) ?? false) || r.mentioned)
  }
  let mentionCount = 0
  for (const mentioned of models.values()) if (mentioned) mentionCount++
  return { modelCount: models.size, mentionCount }
}

export const getClientDetail = createServerFn({ method: 'GET' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { buildIndexJson, buildJsonLd, onSiteDeployChecklist, profileFileUrl } = await import(
      './profile-surfaces'
    )

    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select(
        'id, domain, business_name, contact_email, status, plan, notes, hosting_access, custom_hostname, custom_hostname_status, custom_hostname_error, dns_verified, baseline_scan_id, post_delivery_scan_id, last_scanned_at, created_at',
      )
      .eq('id', data.clientId)
      .single()

    if (clientError || !client) throw new Error('Client not found')

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, status, version, llms_txt, tools_json, robots_txt_additions, generated_at')
      .eq('client_id', data.clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const [baseline, post] = await Promise.all([
      loadScanFindings(client.baseline_scan_id as string | null),
      loadScanFindings(client.post_delivery_scan_id as string | null),
    ])

    const { data: brandRows } = await supabaseAdmin
      .from('brand_visibility_results')
      .select('id, phase, prompt, model, mentioned, response_excerpt, notes, created_at')
      .eq('client_id', data.clientId)
      .order('created_at', { ascending: false })

    const { data: snapshots } = await supabaseAdmin
      .from('client_report_snapshots')
      .select('id, phase, label, ars_score, captured_at')
      .eq('client_id', data.clientId)
      .order('captured_at', { ascending: false })

    const { data: brandSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'brand_visibility_url')
      .maybeSingle()
    const storedBrandUrl = ((brandSetting?.value as string | null) ?? '').trim()
    const envBrandUrl = process.env.BRAND_VISIBILITY_URL?.trim() ?? ''
    const configuredBrandUrl = storedBrandUrl || envBrandUrl

    const appUrl = appBaseUrl()
    const surfaceInput = {
      businessName: client.business_name as string | null,
      domain: client.domain as string,
      llmsTxt: (profile?.llms_txt as string | null) ?? null,
      toolsJson: profile?.tools_json ?? null,
    }
    const jsonLd = JSON.stringify(buildJsonLd(surfaceInput), null, 2)

    const brandResults = (brandRows ?? []) as BrandResultRow[]
    const baselineBrand = brandResults.filter((r) => r.phase === 'baseline')
    const postBrand = brandResults.filter((r) => r.phase === 'post_delivery')

    return {
      client: {
        id: client.id as string,
        domain: client.domain as string,
        businessName: client.business_name as string | null,
        contactEmail: client.contact_email as string | null,
        status: client.status as string,
        plan: client.plan as string | null,
        notes: (client.notes as string | null) ?? null,
        hostingAccess: Boolean(client.hosting_access),
        customHostname: client.custom_hostname as string | null,
        customHostnameStatus: client.custom_hostname_status as string | null,
        customHostnameError: (client.custom_hostname_error as string | null) ?? null,
        dnsVerified: Boolean(client.dns_verified),
        lastScannedAt: (client.last_scanned_at as string | null) ?? null,
        createdAt: client.created_at as string,
      },
      profile: profile
        ? {
            id: profile.id as string,
            status: profile.status as string,
            version: profile.version as number,
            llmsTxt: (profile.llms_txt as string | null) ?? '',
            toolsJson: profile.tools_json ? JSON.stringify(profile.tools_json, null, 2) : '',
            robotsTxtAdditions: (profile.robots_txt_additions as string | null) ?? '',
            generatedAt: (profile.generated_at as string | null) ?? null,
          }
        : null,
      scans: { baseline, post },
      brand: {
        baseline: baselineBrand,
        post: postBrand,
        baselineSummary: summarizeBrandResults(baselineBrand),
        postSummary: summarizeBrandResults(postBrand),
      },
      snapshots: (snapshots ?? []) as Array<{
        id: string
        phase: string
        label: string | null
        ars_score: number | null
        captured_at: string
      }>,
      urls: {
        llmsTxt: profileFileUrl(appUrl, data.clientId, 'llms.txt'),
        toolsJson: profileFileUrl(appUrl, data.clientId, 'tools.json'),
        indexJson: profileFileUrl(appUrl, data.clientId, 'index.json'),
        jsonld: profileFileUrl(appUrl, data.clientId, 'jsonld'),
        dnsSetup: `${appUrl}/onboarding/dns-setup/${data.clientId}`,
        onboarding: `${appUrl}/onboarding/${data.clientId}`,
        clientReport: `${appUrl}/print/client/${data.clientId}`,
      },
      jsonLdSnippet: `<script type="application/ld+json">\n${jsonLd}\n</script>`,
      indexJsonPreview: JSON.stringify(buildIndexJson(surfaceInput), null, 2),
      onSiteChecklist: onSiteDeployChecklist(client.domain as string),
      fallbackOrigin: process.env.CLOUDFLARE_FALLBACK_ORIGIN?.trim() || 'fallback.botcheck.io',
      cloudflareConfigured: Boolean(
        process.env.CLOUDFLARE_API_TOKEN?.trim() && process.env.CLOUDFLARE_ZONE_ID?.trim(),
      ),
      // Deployed ai-brand-visibility-template worker URL. Set it from the workspace
      // (stored in app_settings) or via BRAND_VISIBILITY_URL env. When set, the
      // workspace embeds it inline; otherwise we show the deploy flow.
      brandToolUrl: configuredBrandUrl,
      brandToolConfigured: Boolean(configuredBrandUrl),
      brandToolDeployUrl:
        'https://dash.cloudflare.com/d17c0aa58c9de18c589483788bee513a/workers-and-pages/create/deploy-to-workers?repository=https%3A%2F%2Fgithub.com%2Fcloudflare%2Ftemplates%2Ftree%2Fmain%2Fai-brand-visibility-template',
    }
  })

export const setBrandToolUrl = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        url: z
          .string()
          .trim()
          .max(500)
          .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Enter a valid https URL')
          .transform((v) => v.replace(/\/+$/, '')),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await assertAdmin()
    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert(
        { key: 'brand_visibility_url', value: data.url || null, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) throw new Error(error.message)
    return { ok: true, url: data.url }
  })

export const generateBrandPrompts = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data }): Promise<{ prompts: string[] }> => {
    await assertAdmin()

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('domain, business_name')
      .eq('id', data.clientId)
      .single()
    if (error || !client) throw new Error('Client not found')

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('llms_txt')
      .eq('client_id', data.clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const summary = ((profile?.llms_txt as string | null) ?? '').slice(0, 4000)
    const name = (client.business_name as string | null) || (client.domain as string)

    const { generateBrandVisibilityPrompts } = await import('./scan.functions')
    const prompts = await generateBrandVisibilityPrompts(name, client.domain as string, summary)
    return { prompts }
  })

const brandResultSchema = z.object({
  clientId: z.string().uuid(),
  phase: z.enum(['baseline', 'post_delivery']),
  prompt: z.string().min(1).max(2000),
  model: z.string().min(1).max(120),
  mentioned: z.boolean(),
  responseExcerpt: z.string().max(4000).optional(),
  notes: z.string().max(2000).optional(),
})

export const recordBrandVisibilityResult = createServerFn({ method: 'POST' })
  .validator((input: unknown) => brandResultSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()
    const { data: row, error } = await supabaseAdmin
      .from('brand_visibility_results')
      .insert({
        client_id: data.clientId,
        phase: data.phase,
        prompt: data.prompt.trim(),
        model: data.model.trim(),
        mentioned: data.mentioned,
        response_excerpt: data.responseExcerpt?.trim() || null,
        notes: data.notes?.trim() || null,
      })
      .select('id')
      .single()
    if (error || !row) throw new Error(error?.message ?? 'Failed to record result')
    return { id: row.id as string }
  })

export const deleteBrandVisibilityResult = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()
    const { error } = await supabaseAdmin
      .from('brand_visibility_results')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

const snapshotSchema = z.object({
  clientId: z.string().uuid(),
  phase: z.enum(['pre', 'post']),
  label: z.string().max(200).optional(),
})

export const saveReportSnapshot = createServerFn({ method: 'POST' })
  .validator((input: unknown) => snapshotSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, baseline_scan_id, post_delivery_scan_id')
      .eq('id', data.clientId)
      .single()
    if (error || !client) throw new Error('Client not found')

    const scanId =
      data.phase === 'pre'
        ? (client.baseline_scan_id as string | null)
        : (client.post_delivery_scan_id as string | null)
    const findings = await loadScanFindings(scanId)

    const brandPhase = data.phase === 'pre' ? 'baseline' : 'post_delivery'
    const { data: brandRows } = await supabaseAdmin
      .from('brand_visibility_results')
      .select('id, phase, prompt, model, mentioned, response_excerpt, notes, created_at')
      .eq('client_id', data.clientId)
      .eq('phase', brandPhase)
      .order('created_at', { ascending: false })

    const rows = (brandRows ?? []) as BrandResultRow[]
    const summary = summarizeBrandResults(rows)

    const { data: snap, error: insertError } = await supabaseAdmin
      .from('client_report_snapshots')
      .insert({
        client_id: data.clientId,
        phase: data.phase,
        label: data.label?.trim() || null,
        ars_score: findings?.score ?? null,
        site_readiness: findings?.siteReadiness ?? null,
        discoverability_score: findings?.discoverabilityScore ?? null,
        findings: findings
          ? {
              top_failures: findings.topFailures,
              quick_wins: findings.quickWins,
              categories: findings.categories,
            }
          : {},
        brand_summary: {
          model_count: summary.modelCount,
          mention_count: summary.mentionCount,
          results: rows.map((r) => ({
            prompt: r.prompt,
            model: r.model,
            mentioned: r.mentioned,
          })),
        },
      })
      .select('id')
      .single()

    if (insertError || !snap) throw new Error(insertError?.message ?? 'Failed to save snapshot')
    return { id: snap.id as string }
  })

export const deleteReportSnapshot = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await assertAdmin()
    const { error } = await supabaseAdmin
      .from('client_report_snapshots')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
