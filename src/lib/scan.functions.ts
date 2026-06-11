import { createServerFn } from '@tanstack/react-start'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const inputSchema = z.object({
  url: z.string().url().max(2048),
})

const emailSchema = z.object({
  scanId: z.string().uuid(),
  email: z.string().email().max(255),
})

type Category = { score: number; finding: string }
type ScanResult = {
  id: string
  url: string
  ars_score: number
  categories: {
    booking: Category
    pricing: Category
    information: Category
    navigation: Category
  }
  top_failures: string[]
  quick_wins: string[]
}

const SUBPAGE_KEYWORDS = ['/book', '/contact', '/pricing', '/services', '/appointment', '/rates']

async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<{ markdown?: string; links?: string[] }> {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'links'],
      onlyMainContent: true,
    }),
  })
  if (!res.ok) {
    throw new Error(`Firecrawl error ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as { data?: { markdown?: string; links?: string[] } }
  return json.data ?? {}
}

function pickSubpages(links: string[] | undefined, baseUrl: string, max = 3): string[] {
  if (!links?.length) return []
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const picked: string[] = []
  for (const raw of links) {
    if (picked.length >= max) break
    try {
      const u = new URL(raw, baseUrl)
      if (u.hostname !== base.hostname) continue
      const path = u.pathname.toLowerCase()
      if (!SUBPAGE_KEYWORDS.some((k) => path.includes(k))) continue
      const key = u.origin + u.pathname
      if (seen.has(key) || key === base.origin + base.pathname) continue
      seen.add(key)
      picked.push(u.toString())
    } catch {
      // ignore bad URL
    }
  }
  return picked
}

export const runScan = createServerFn({ method: 'POST' })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ScanResult> => {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY is not configured')
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')

    // 1. Scrape root page
    const root = await firecrawlScrape(data.url, firecrawlKey)
    const sections: { url: string; markdown: string }[] = [
      { url: data.url, markdown: root.markdown ?? '' },
    ]

    // 2. Scrape up to 3 subpages
    const subpages = pickSubpages(root.links, data.url)
    const subResults = await Promise.allSettled(
      subpages.map((u) =>
        firecrawlScrape(u, firecrawlKey).then((r) => ({ url: u, markdown: r.markdown ?? '' })),
      ),
    )
    for (const r of subResults) {
      if (r.status === 'fulfilled' && r.value.markdown) sections.push(r.value)
    }

    // 3. Build content payload (cap to keep prompt within token limits)
    const MAX_CHARS_PER_PAGE = 8000
    const content = sections
      .map((s) => `=== PAGE: ${s.url} ===\n${s.markdown.slice(0, MAX_CHARS_PER_PAGE)}`)
      .join('\n\n')

    const prompt = `You are an agent-readiness auditor for small business websites. Analyze this website content and score it on how effectively an AI agent could use this site on behalf of a customer.

Score each category 0-25:
- Booking & Contact: Can an agent find and complete a booking form, contact form, or appointment request?
- Pricing Clarity: Can an agent find and understand pricing, rates, or service costs?
- Business Information: Can an agent find hours, location, services offered, and key business details?
- Agent Navigation: Can an agent identify and reach key actions without relying on visual UI elements?

Website content:
${content}

Return ONLY valid JSON, no other text:
{
  "ars_score": [sum of all four category scores],
  "categories": {
    "booking": { "score": 0-25, "finding": "one sentence in plain English, no jargon, written for a small business owner" },
    "pricing": { "score": 0-25, "finding": "..." },
    "information": { "score": 0-25, "finding": "..." },
    "navigation": { "score": 0-25, "finding": "..." }
  },
  "top_failures": [
    "plain English description of failure 1",
    "plain English description of failure 2",
    "plain English description of failure 3"
  ],
  "quick_wins": [
    "plain English description of quick fix 1",
    "plain English description of quick fix 2"
  ]
}`

    // 4. Call Claude via SDK
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) throw new Error('No text response from Claude')

    const cleaned = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')

    let parsed: Omit<ScanResult, 'id' | 'url'>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Claude returned non-JSON response')
      parsed = JSON.parse(match[0])
    }

    // 5. Store in DB
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: inserted, error } = await supabaseAdmin
      .from('scans')
      .insert({
        url: data.url,
        ars_score: parsed.ars_score,
        categories: parsed.categories,
        top_failures: parsed.top_failures,
        quick_wins: parsed.quick_wins,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      throw new Error(`Failed to save scan: ${error?.message ?? 'unknown'}`)
    }

    return { id: inserted.id, url: data.url, ...parsed }
  })

export const saveEmail = createServerFn({ method: 'POST' })
  .validator((input: unknown) => emailSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { error } = await supabaseAdmin
      .from('scans')
      .update({ email: data.email })
      .eq('id', data.scanId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

const checkoutSchema = z.object({
  scanId: z.string().uuid(),
  email: z.string().email(),
  domain: z.string(),
  businessName: z.string().optional(),
})

export const createCheckoutSession = createServerFn({ method: 'POST' })
  .validator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { createStripeCheckoutSession, appBaseUrl } = await import('@/lib/billing.server')

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .insert({
        domain: data.domain,
        business_name: data.businessName ?? null,
        contact_email: data.email,
        status: 'pending_payment',
        billing_type: 'standard',
      })
      .select('id, domain, billing_type, stripe_price_id, quoted_monthly_cents')
      .single()

    if (error || !client) throw new Error(`Failed to create client: ${error?.message}`)

    if (data.scanId) {
      await supabaseAdmin.from('scans').update({ client_id: client.id }).eq('id', data.scanId)
    }

    const url = await createStripeCheckoutSession({
      clientId: client.id,
      domain: data.domain,
      email: data.email,
      billing: { ...client, domain: data.domain },
      scanId: data.scanId,
      cancelUrl: `${appBaseUrl()}/`,
    })

    return { url }
  })
