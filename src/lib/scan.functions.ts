import { createServerFn } from '@tanstack/react-start'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

/**
 * Server-only helper: suggest neutral consumer questions an AI assistant might
 * be asked where this business should ideally surface. Kept here (not in
 * admin.functions) so the Anthropic SDK stays out of the client bundle.
 */
export async function generateBrandVisibilityPrompts(
  name: string,
  domain: string,
  summary: string,
): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    messages: [
      {
        role: 'user',
        content: `A person might ask an AI assistant (ChatGPT, Claude, Gemini, etc.) a natural question and we want to see whether this business gets recommended.

Business: ${name}
Website: ${domain}
Profile summary:
${summary || '(no profile yet)'}

Write 8 realistic consumer questions someone would ask an AI assistant where THIS business should ideally be recommended (by service + location if known). Do NOT mention the business name in the questions — they must be neutral discovery questions. Return ONLY a JSON array of strings, no prose.`,
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  const raw = text && text.type === 'text' ? text.text : '[]'
  const match = raw.match(/\[[\s\S]*\]/)
  try {
    const parsed = match ? (JSON.parse(match[0]) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 12)
  } catch {
    return []
  }
}

const inputSchema = z.object({
  url: z.string().url().max(2048),
})

const emailSchema = z.object({
  scanId: z.string().uuid(),
  email: z.string().email().max(255),
})

type Category = { score: number; finding: string }

export type BeforeAfter = {
  user_question?: string
  ai_now: string
  ai_with_botcheck: string
  stakes?: string
  pain_signals?: string[]
  win_signals?: string[]
}

// Older scans sometimes produced bracket placeholders like "[price]" or
// "[booking link]". Patching them in place reads awkwardly, so if a value
// still contains a placeholder we fall back to the clean default copy.
function pickClean(candidate: string | undefined, fallback: string): string {
  const text = candidate?.trim()
  if (!text || /\[[^\]]*\]/.test(text)) return fallback
  return text
}

function normalizeBeforeAfter(
  raw: Partial<BeforeAfter> | null | undefined,
  domain: string,
): BeforeAfter {
  const hostname = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return {
    user_question: pickClean(
      raw?.user_question,
      `What are your prices and how do I book at ${hostname}?`,
    ),
    ai_now: pickClean(
      raw?.ai_now,
      'Based on your website, I can\'t find clear pricing or a reliable way to book. You may want to call them directly — I\'m not confident I have the right details.',
    ),
    ai_with_botcheck: pickClean(
      raw?.ai_with_botcheck,
      'With a BotCheck profile, I can answer instantly with your real pricing, hours, services, and a direct booking link — so customers reach you instead of guessing.',
    ),
    stakes:
      raw?.stakes?.trim() ||
      'That customer just left without booking — and you never knew they were looking.',
    pain_signals: raw?.pain_signals?.filter(Boolean).slice(0, 4) ?? [],
    win_signals: raw?.win_signals?.filter(Boolean).slice(0, 4) ?? [],
  }
}
export type { DiscoverabilityCheck, Discoverability } from './surface-probe'
import { detectDiscoverability, type Discoverability } from './surface-probe'

type ScanResult = {
  id: string
  url: string
  ars_score: number
  /** Site-content readiness (sum of the four categories, 0–100). */
  site_readiness?: number
  categories: {
    booking: Category
    pricing: Category
    information: Category
    navigation: Category
  }
  discoverability?: Discoverability
  top_failures: string[]
  quick_wins: string[]
  before_after: BeforeAfter
}

export type ScanResultWithEmail = ScanResult & { email: string | null }

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

/**
 * Core scan pipeline: scrape, analyze with Claude, score, and persist.
 * Shared by the public `runScan` (unauthenticated, never sets client_id — a
 * raw client_id param on a public endpoint would let anyone attach a scan to
 * someone else's client record) and the admin-only `rerunScan` in
 * admin.functions.ts, which passes clientId to link the result back.
 */
export async function performScan(url: string, clientId?: string): Promise<ScanResult> {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY is not configured')
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')

    // 1. Scrape root page
    const root = await firecrawlScrape(url, firecrawlKey)
    const sections: { url: string; markdown: string }[] = [
      { url, markdown: root.markdown ?? '' },
    ]

    // 2. Scrape up to 3 subpages
    const subpages = pickSubpages(root.links, url)
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
  ],
  "before_after": {
    "user_question": "One realistic question a real customer would type into ChatGPT or Siri about this business, naming the business or domain. Use the actual business name — NEVER use bracket placeholders like [name].",
    "ai_now": "3-5 sentences: the AI's frustrating answer TODAY — vague, hedging, wrong guesses, or 'I couldn't find...' Write in first person as the AI ('I wasn't able to find...'). Include SPECIFIC wrong or missing details from the scan. Make the business owner feel the pain of losing this customer. Write naturally — NEVER use bracket placeholders like [price] or [link].",
    "ai_with_botcheck": "3-5 sentences: the SAME question answered confidently WITH an accurate BotCheck profile. First person as the AI, like a perfect concierge. CRITICAL: write in natural prose with NO bracket placeholders. If the real price/hours are in the scan, state them. If a detail is NOT on the site, describe the capability naturally instead (e.g. 'you can book instantly through their online scheduler' or 'pricing for each program is listed clearly') — never write '[price]', '[booking link]', or any bracketed token.",
    "stakes": "One gut-punch sentence for the business owner about what they just lost. E.g. 'That customer just booked with your competitor instead.' or 'You paid for the ad — AI sent them away for free.'",
    "pain_signals": ["2-4 short tags, max 6 words each, describing what's wrong in ai_now — e.g. 'No booking link found', 'Pricing unclear', 'Wrong hours guessed'"],
    "win_signals": ["2-4 short tags, max 6 words each, describing wins in ai_with_botcheck — e.g. 'Exact pricing shown', 'Direct booking link', 'Hours confirmed'"]
  }
}`

    // 4. Call Claude via SDK
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
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

    parsed.before_after = normalizeBeforeAfter(parsed.before_after, url)

    // 4b. Detect AI-discoverability signals and blend into the headline score.
    // Site readiness = Claude's sum of the four content categories (0–100).
    // Headline ARS = 70% site readiness + 30% discoverability, so publishing a
    // profile / allowing AI crawlers measurably raises the number.
    const siteReadiness = parsed.ars_score
    const discoverability = await detectDiscoverability(url)
    const headline = Math.round(0.7 * siteReadiness + 0.3 * discoverability.score)

    // 5. Store in DB (extra keys ride along in the `categories` jsonb — no migration).
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: inserted, error } = await supabaseAdmin
      .from('scans')
      .insert({
        url,
        ars_score: headline,
        categories: {
          ...parsed.categories,
          ai_discoverability: discoverability,
          site_readiness: siteReadiness,
        },
        top_failures: parsed.top_failures,
        quick_wins: parsed.quick_wins,
        diff: parsed.before_after,
        ...(clientId ? { client_id: clientId } : {}),
      })
      .select('id')
      .single()

    if (error || !inserted) {
      throw new Error(`Failed to save scan: ${error?.message ?? 'unknown'}`)
    }

    return {
      id: inserted.id,
      url,
      ...parsed,
      ars_score: headline,
      site_readiness: siteReadiness,
      discoverability,
    }
}

export const runScan = createServerFn({ method: 'POST' })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ScanResult> => performScan(data.url))

/** Admin-only: re-run a scan and link the result to a client. */
export async function rerunScanForAdmin(url: string, clientId: string): Promise<ScanResult> {
  return performScan(url, clientId)
}

export const saveEmail = createServerFn({ method: 'POST' })
  .validator((input: unknown) => emailSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendScanTeaserEmail } = await import('@/lib/email.server')

    const { data: scan, error: fetchError } = await supabaseAdmin
      .from('scans')
      .select('url, ars_score, top_failures')
      .eq('id', data.scanId)
      .single()

    if (fetchError || !scan) throw new Error(fetchError?.message ?? 'Scan not found')

    const { error } = await supabaseAdmin
      .from('scans')
      .update({ email: data.email })
      .eq('id', data.scanId)
    if (error) throw new Error(error.message)

    try {
      const topFailures = (scan.top_failures as string[]) ?? []
      const sent = await sendScanTeaserEmail({
        email: data.email,
        scanId: data.scanId,
        url: scan.url,
        arsScore: scan.ars_score ?? 0,
        topFailure: topFailures[0] ?? null,
      })
      if (!sent) {
        throw new Error('Could not send your summary email. Please try again in a moment.')
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Could not send')) throw err
      console.error('[email] Scan teaser email error:', err)
      throw new Error('Could not send your summary email. Please try again in a moment.')
    }

    return { ok: true }
  })

const scanIdSchema = z.object({ scanId: z.string().uuid() })

export const getScanById = createServerFn({ method: 'GET' })
  .validator((input: unknown) => scanIdSchema.parse(input))
  .handler(async ({ data }): Promise<ScanResultWithEmail | null> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: scan, error } = await supabaseAdmin
      .from('scans')
      .select('id, url, ars_score, categories, top_failures, quick_wins, diff, email')
      .eq('id', data.scanId)
      .single()

    if (error || !scan) return null

    const diff = scan.diff as Partial<BeforeAfter> | null
    // Discoverability + site_readiness ride along inside the categories jsonb on
    // newer scans; pull them out and leave the four typed categories clean.
    const rawCategories = (scan.categories ?? {}) as Record<string, unknown>
    const { ai_discoverability, site_readiness, ...categories } = rawCategories
    return {
      id: scan.id,
      url: scan.url,
      ars_score: scan.ars_score ?? 0,
      site_readiness: typeof site_readiness === 'number' ? site_readiness : undefined,
      categories: categories as unknown as ScanResult['categories'],
      discoverability: (ai_discoverability as Discoverability | undefined) ?? undefined,
      top_failures: (scan.top_failures as string[]) ?? [],
      quick_wins: (scan.quick_wins as string[]) ?? [],
      before_after: normalizeBeforeAfter(diff, scan.url),
      email: scan.email as string | null,
    }
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
    const { normalizeDomain } = await import('@/lib/site-scan')

    const domain = normalizeDomain(data.domain)

    const { data: scanRow } = await supabaseAdmin
      .from('scans')
      .select('client_id')
      .eq('id', data.scanId)
      .maybeSingle()

    if (scanRow?.client_id) {
      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('id, domain, billing_type, stripe_price_id, quoted_monthly_cents, status, contact_email')
        .eq('id', scanRow.client_id)
        .maybeSingle()

      if (existingClient?.status === 'pending_payment') {
        if (existingClient.contact_email !== data.email) {
          await supabaseAdmin
            .from('clients')
            .update({ contact_email: data.email })
            .eq('id', existingClient.id)
        }

        const { ensureBaselineScan } = await import('./client-scans.server')
        await ensureBaselineScan(supabaseAdmin, existingClient.id, data.scanId)

        const url = await createStripeCheckoutSession({
          clientId: existingClient.id,
          domain,
          email: data.email,
          billing: { ...existingClient, domain },
          scanId: data.scanId,
          cancelUrl: `${appBaseUrl()}/report/${data.scanId}`,
        })

        return { url }
      }
    }

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .insert({
        domain,
        business_name: data.businessName ?? null,
        contact_email: data.email,
        status: 'pending_payment',
        billing_type: 'standard',
      })
      .select('id, domain, billing_type, stripe_price_id, quoted_monthly_cents')
      .single()

    if (error || !client) throw new Error(`Failed to create client: ${error?.message}`)

    const { ensureBaselineScan } = await import('./client-scans.server')
    await ensureBaselineScan(supabaseAdmin, client.id, data.scanId)

    const url = await createStripeCheckoutSession({
      clientId: client.id,
      domain,
      email: data.email,
      billing: { ...client, domain },
      scanId: data.scanId,
      cancelUrl: `${appBaseUrl()}/report/${data.scanId}`,
    })

    return { url }
  })
