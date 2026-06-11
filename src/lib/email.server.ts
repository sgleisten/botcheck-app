const FROM = process.env.EMAIL_FROM ?? 'BotCheck <notifications@botcheck.io>'

function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000'
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
