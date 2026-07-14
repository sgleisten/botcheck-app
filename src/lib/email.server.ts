import { appBaseUrl } from '@/lib/billing.server'

const FROM = process.env.EMAIL_FROM ?? 'BotCheck <notifications@botcheck.io>'

function appUrl(): string {
  return appBaseUrl()
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not configured — skipping:', subject)
    return false
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[email] Failed to send:', subject, res.status, body)
    return false
  }
  return true
}

export type ProfileReviewEmail = {
  profileId: string
  clientId: string
  domain: string
  businessName: string | null
}

export async function sendProfileReviewEmail(data: ProfileReviewEmail): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    console.warn('[email] ADMIN_EMAIL not configured — skipping admin notification')
    return
  }

  const business = data.businessName ?? data.domain
  await sendEmail(
    adminEmail,
    `[Review] New AI profile for ${business}`,
    `
      <p>A new AI presence profile is ready for review.</p>
      <ul>
        <li><strong>Business:</strong> ${business}</li>
        <li><strong>Domain:</strong> ${data.domain}</li>
        <li><strong>Profile ID:</strong> ${data.profileId}</li>
        <li><strong>Client ID:</strong> ${data.clientId}</li>
      </ul>
      <p><a href="${appUrl()}/admin">Open admin dashboard</a></p>
    `,
  )
}

export type AgencyLeadEmail = {
  name: string
  agency: string
  clients: string
  website: string
}

export async function sendAgencyLeadEmail(data: AgencyLeadEmail): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    console.warn('[email] ADMIN_EMAIL not configured — skipping agency lead notification')
    return
  }

  await sendEmail(
    adminEmail,
    `[Agency] Founding partner application — ${data.agency}`,
    `
      <p>New founding agency partner application:</p>
      <ul>
        <li><strong>Name:</strong> ${data.name}</li>
        <li><strong>Agency:</strong> ${data.agency}</li>
        <li><strong>Clients:</strong> ${data.clients || '—'}</li>
        <li><strong>Website:</strong> ${data.website || '—'}</li>
      </ul>
    `,
  )
}

export type PostCheckoutEmail = {
  clientId: string
  email: string
  domain: string
  businessName: string | null
}

export async function sendPostCheckoutEmail(data: PostCheckoutEmail): Promise<void> {
  const business = data.businessName ?? data.domain
  const onboardingUrl = `${appUrl()}/onboarding/${data.clientId}`
  const loginUrl = `${appUrl()}/login?redirectTo=${encodeURIComponent(onboardingUrl)}`

  await sendEmail(
    data.email,
    `Finish your BotCheck setup — ${business}`,
    `
      <p>Thanks for subscribing to BotCheck for <strong>${business}</strong>.</p>
      <p>Next step: set up your AI presence profile. It takes about 10 minutes — we'll walk you through confirming what we found on your site.</p>
      <p><a href="${loginUrl}"><strong>Continue setup →</strong></a></p>
      <p>First time? Create an account with this email (<strong>${data.email}</strong>). Returning? Sign in with your password.</p>
      <p>If the link doesn't work, go to ${appUrl()}/login and use redirect after sign-in.</p>
    `,
  )
}

export type ProfileLiveEmail = {
  clientId: string
  email: string
  domain: string
  businessName: string | null
}

export type ScanTeaserEmail = {
  email: string
  scanId: string
  url: string
  arsScore: number
  topFailure: string | null
}

export async function sendScanTeaserEmail(data: ScanTeaserEmail): Promise<boolean> {
  const domain = (() => {
    try {
      return new URL(data.url).hostname
    } catch {
      return data.url
    }
  })()

  const base = appUrl()
  const reportUrl = `${base}/report/${data.scanId}`
  const pdfUrl = `${base}/print/${data.scanId}`
  const teaser =
    data.topFailure ??
    'AI agents may be sending your customers elsewhere because they cannot read your site clearly.'

  return sendEmail(
    data.email,
    `Your Agent Readiness Score: ${data.arsScore}/100 — ${domain}`,
    `
      <p>Your BotCheck scan for <strong>${domain}</strong> is in.</p>
      <p style="font-size: 28px; font-weight: bold; margin: 16px 0;">${data.arsScore}/100</p>
      <p style="color: #666; margin-top: 0;">Agent Readiness Score</p>
      <p><strong>One thing we found:</strong> ${teaser}</p>
      <p>Your <strong>full report</strong> — every failure, quick wins, and a live before/after of what AI tells your customers — is waiting for you.</p>
      <p>
        <a href="${reportUrl}" style="display: inline-block; background: #e8a054; color: #2a5d67; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px;">See your full report →</a>
      </p>
      <p style="margin-top: 12px;"><a href="${pdfUrl}" style="color: #2a5d67;">Or download a PDF copy of your report →</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p>Want us to handle it? BotCheck builds your AI profile, hosts it, and updates it weekly — plans start at <strong>$299/mo</strong>, no tech skills needed.</p>
      <p><a href="${reportUrl}#fix" style="font-weight: bold;">See your options →</a></p>
    `,
  )
}

export async function sendProfileLiveEmail(data: ProfileLiveEmail): Promise<void> {
  const business = data.businessName ?? data.domain
  const profileBase = `${appUrl()}/sites/${data.clientId}`
  const llmsUrl = `${profileBase}/llms.txt`
  const toolsUrl = `${profileBase}/tools.json`

  await sendEmail(
    data.email,
    `Your BotCheck profile is live — ${business}`,
    `
      <p>Good news — your AI presence profile for <strong>${business}</strong> is now live.</p>
      <p>AI agents can read your business at:</p>
      <ul>
        <li><a href="${llmsUrl}">llms.txt</a> — business summary for AI agents</li>
        <li><a href="${toolsUrl}">tools.json</a> — structured actions agents can take</li>
      </ul>
      <p>We update these weekly as your site changes. Questions? Reply to this email or contact support@botcheck.io.</p>
    `,
  )
}
