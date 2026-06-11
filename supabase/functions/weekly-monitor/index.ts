import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY')
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.botcheck.io'

async function scrapeUrl(url: string): Promise<string> {
  if (!FIRECRAWL_KEY) throw new Error('FIRECRAWL_API_KEY not set')
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FIRECRAWL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  })
  if (!res.ok) throw new Error(`Firecrawl ${res.status}`)
  const json = await res.json()
  return (json.data?.markdown as string | undefined)?.slice(0, 12000) ?? ''
}

async function detectDrift(
  oldLlms: string,
  newContent: string,
  domain: string,
): Promise<{ changed: boolean; summary: string }> {
  if (!ANTHROPIC_KEY) return { changed: false, summary: 'Anthropic not configured' }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Compare the stored AI profile for ${domain} against fresh website content. Only flag material business changes: pricing, hours, services, booking links, location, contact info.

STORED PROFILE (llms.txt excerpt):
${oldLlms.slice(0, 4000)}

FRESH WEBSITE CONTENT:
${newContent.slice(0, 4000)}

Respond JSON only: {"changed": true|false, "summary": "one paragraph for the business owner"}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const json = await res.json()
  const text = json.content?.[0]?.text ?? '{}'
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return { changed: false, summary: 'Could not parse drift response' }
  }
}

async function sendAlert(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BotCheck <notifications@botcheck.io>',
      to: [to],
      subject,
      html,
    }),
  })
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, client_id, llms_txt, clients(id, domain, contact_email, business_name, status)')
    .eq('status', 'live')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: { clientId: string; changed: boolean; summary?: string }[] = []

  for (const row of profiles ?? []) {
    const client = row.clients as {
      id: string
      domain: string
      contact_email: string | null
      business_name: string | null
      status: string
    } | null

    if (!client?.domain || !row.llms_txt) continue

    const url = client.domain.startsWith('http') ? client.domain : `https://${client.domain}`

    try {
      const content = await scrapeUrl(url)
      const drift = await detectDrift(row.llms_txt, content, client.domain)

      await supabase.from('clients').update({ last_scanned_at: new Date().toISOString() }).eq('id', client.id)

      if (drift.changed) {
        const business = client.business_name ?? client.domain
        const html = `<p>We detected a change on <strong>${business}</strong> that may affect your AI profile:</p><p>${drift.summary}</p><p>We're reviewing and will update your profile. View it at ${APP_URL}/sites/${client.id}/llms.txt</p>`

        if (client.contact_email) {
          await sendAlert(client.contact_email, `Site change detected — ${business}`, html)
        }
        if (ADMIN_EMAIL) {
          await sendAlert(ADMIN_EMAIL, `[Monitor] Drift on ${business}`, html)
        }
      }

      results.push({ clientId: client.id, changed: drift.changed, summary: drift.summary })
    } catch (err) {
      console.error(`Monitor failed for ${client.domain}:`, err)
      results.push({
        clientId: client.id,
        changed: false,
        summary: err instanceof Error ? err.message : 'error',
      })
    }
  }

  return new Response(JSON.stringify({ checked: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
