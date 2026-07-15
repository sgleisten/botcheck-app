/**
 * Accessibility copy-paste pack: scrape public images/videos and suggest
 * alt text + on-page video summaries for the agency to paste into the CMS.
 */
import Anthropic from '@anthropic-ai/sdk'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

const SUBPAGE_KEYWORDS = [
  '/book',
  '/contact',
  '/pricing',
  '/services',
  '/appointment',
  '/rates',
  '/join',
  '/demo',
  '/signup',
  '/sign-up',
  '/register',
  '/leadership',
  '/about',
  '/get-started',
  '/start',
  '/trial',
  '/enroll',
  '/how-it-works',
  '/product',
  '/features',
]

const SKIP_SRC =
  /sprite|icon[-_/]|favicon|logo[-_]?(mark|icon)?\.|pixel|tracking|1x1|spacer|emoji|gravatar|badge\.|button[-_]?icon/i

export type AltQuality = 'empty' | 'weak' | 'ok'

export type AccessibilityImageItem = {
  kind: 'image'
  pageUrl: string
  src: string
  currentAlt: string
  altQuality: AltQuality
  impact: 'hero' | 'product' | 'content' | 'skip'
  suggestedAlt: string
}

export type AccessibilityVideoItem = {
  kind: 'video'
  pageUrl: string
  /** Best available locator: src, poster, aria-label, or surrounding text. */
  locator: string
  label: string
  suggestedSummary: string
}

export type AccessibilityPack = {
  domain: string
  pagesScanned: string[]
  images: AccessibilityImageItem[]
  videos: AccessibilityVideoItem[]
  generatedAt: string
}

function ensureUrl(domainOrUrl: string): string {
  return /^https?:\/\//i.test(domainOrUrl) ? domainOrUrl : `https://${domainOrUrl}`
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'BotCheck-Scan/1.0' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`)
  return res.text()
}

function absUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw.trim(), base).toString()
  } catch {
    return null
  }
}

function attr(tag: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = tag.match(re)
  if (!m) return ''
  return (m[2] ?? m[3] ?? m[4] ?? '').trim()
}

function pickSubpages(html: string, baseUrl: string, max = 3): string[] {
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const picked: string[] = []
  const hrefRe = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(html)) && picked.length < max) {
    const raw = m[2] ?? m[3] ?? m[4] ?? ''
    try {
      const u = new URL(raw, baseUrl)
      if (u.hostname !== base.hostname) continue
      const path = u.pathname.toLowerCase()
      if (!SUBPAGE_KEYWORDS.some((k) => path.includes(k))) continue
      const key = u.origin + u.pathname
      if (seen.has(key) || key === base.origin + base.pathname) continue
      seen.add(key)
      picked.push(u.origin + u.pathname + u.search)
    } catch {
      // ignore
    }
  }
  return picked
}

function scoreAlt(alt: string): AltQuality {
  const t = alt.trim()
  if (!t) return 'empty'
  if (t.length < 8 || /^(image|photo|picture|img|logo|icon)$/i.test(t)) return 'weak'
  return 'ok'
}

function rankImpact(src: string, tag: string, pageUrl: string, index: number): AccessibilityImageItem['impact'] {
  if (SKIP_SRC.test(src) || /\.svg(\?|$)/i.test(src)) return 'skip'
  const w = parseInt(attr(tag, 'width') || '0', 10)
  const h = parseInt(attr(tag, 'height') || '0', 10)
  if ((w > 0 && w < 40) || (h > 0 && h < 40)) return 'skip'
  const cls = `${attr(tag, 'class')} ${attr(tag, 'id')}`.toLowerCase()
  const path = pageUrl.toLowerCase()
  if (/hero|banner|cover|jumbotron|masthead/.test(cls) || index === 0) return 'hero'
  if (/product|feature|screenshot|demo|app|ui/.test(cls) || /product|feature|how-it-works|demo/.test(path)) {
    return 'product'
  }
  return 'content'
}

function extractImages(html: string, pageUrl: string): Omit<AccessibilityImageItem, 'suggestedAlt'>[] {
  const out: Omit<AccessibilityImageItem, 'suggestedAlt'>[] = []
  const re = /<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(html))) {
    const tag = m[0]
    const rawSrc = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-lazy-src')
    const src = rawSrc ? absUrl(rawSrc, pageUrl) : null
    if (!src || src.startsWith('data:')) continue
    const currentAlt = attr(tag, 'alt')
    const impact = rankImpact(src, tag, pageUrl, index)
    index += 1
    if (impact === 'skip') continue
    out.push({
      kind: 'image',
      pageUrl,
      src,
      currentAlt,
      altQuality: scoreAlt(currentAlt),
      impact,
    })
  }
  return out
}

function extractVideos(html: string, pageUrl: string): Omit<AccessibilityVideoItem, 'suggestedSummary'>[] {
  const out: Omit<AccessibilityVideoItem, 'suggestedSummary'>[] = []
  const seen = new Set<string>()

  const push = (locator: string, label: string) => {
    const key = `${locator}::${label}`.slice(0, 200)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind: 'video', pageUrl, locator, label })
  }

  const videoRe = /<video\b[^>]*>[\s\S]*?<\/video>|<video\b[^>]*\/?>/gi
  let vm: RegExpExecArray | null
  while ((vm = videoRe.exec(html))) {
    const block = vm[0]
    const src = attr(block, 'src') || block.match(/<source[^>]+src\s*=\s*("([^"]*)"|'([^']*)')/i)?.[2]
    const poster = attr(block, 'poster')
    const aria = attr(block, 'aria-label')
    const locator = absUrl(src || poster || '', pageUrl) || aria || 'inline <video>'
    push(locator, aria || poster || src || 'Video player')
  }

  const iframeRe = /<iframe\b[^>]*>/gi
  let im: RegExpExecArray | null
  while ((im = iframeRe.exec(html))) {
    const tag = im[0]
    const src = attr(tag, 'src')
    if (!src || !/youtube|youtu\.be|vimeo|wistia|loom|player\./i.test(src)) continue
    const title = attr(tag, 'title') || attr(tag, 'aria-label') || 'Embedded video'
    push(absUrl(src, pageUrl) || src, title)
  }

  const playRe =
    /<(?:button|a|div)\b[^>]*(?:aria-label\s*=\s*("|')([^"']*play[^"']*)\1|class\s*=\s*("|')[^"']*play[^"']*\3)[^>]*>/gi
  let pm: RegExpExecArray | null
  while ((pm = playRe.exec(html))) {
    const tag = pm[0]
    const label = attr(tag, 'aria-label') || attr(tag, 'title') || 'Play video'
    if (!/play|video|watch/i.test(label) && !/play/i.test(attr(tag, 'class'))) continue
    push(`${pageUrl}#play-${out.length}`, label)
  }

  return out
}

const IMPACT_ORDER = { hero: 0, product: 1, content: 2, skip: 3 } as const

function dedupeImages(
  items: Omit<AccessibilityImageItem, 'suggestedAlt'>[],
): Omit<AccessibilityImageItem, 'suggestedAlt'>[] {
  const bySrc = new Map<string, Omit<AccessibilityImageItem, 'suggestedAlt'>>()
  for (const item of items) {
    const prev = bySrc.get(item.src)
    if (!prev || IMPACT_ORDER[item.impact] < IMPACT_ORDER[prev.impact]) {
      bySrc.set(item.src, item)
    }
  }
  return [...bySrc.values()].sort((a, b) => {
    const qi = { empty: 0, weak: 1, ok: 2 }
    return (
      IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] ||
      qi[a.altQuality] - qi[b.altQuality]
    )
  })
}

async function suggestWithClaude(
  businessName: string | null,
  domain: string,
  images: Omit<AccessibilityImageItem, 'suggestedAlt'>[],
  videos: Omit<AccessibilityVideoItem, 'suggestedSummary'>[],
  pageSnippets: { url: string; text: string }[],
): Promise<{ alts: Record<string, string>; summaries: Record<string, string> }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const payload = {
    business: businessName || domain,
    domain,
    pages: pageSnippets,
    images: images.map((i) => ({
      src: i.src,
      pageUrl: i.pageUrl,
      currentAlt: i.currentAlt,
      altQuality: i.altQuality,
      impact: i.impact,
    })),
    videos: videos.map((v, idx) => ({
      id: String(idx),
      locator: v.locator,
      label: v.label,
      pageUrl: v.pageUrl,
    })),
  }

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [
      {
        role: 'user',
        content: `You help an agency write accessibility copy for a client's website. Agents and screen readers need clear alt text and short video summaries on the page (not just aria-labels on play buttons).

Return ONLY JSON:
{
  "alts": { "<exact image src>": "<suggested alt, 8–120 chars>" },
  "summaries": { "<video id>": "<2–4 sentence on-page summary of what the video covers>" }
}

Rules:
- Prefer concrete, useful alt (what the image shows + why it matters). No "image of".
- Decorative/logo-only: still give a short brand-aware alt if impact is hero/product.
- Video summaries must stand alone if the visitor cannot play the video.
- Match keys exactly to the src / id values provided.

Inventory:
${JSON.stringify(payload).slice(0, 28000)}`,
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  const raw = text && text.type === 'text' ? text.text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  try {
    const parsed = match ? (JSON.parse(match[0]) as { alts?: Record<string, string>; summaries?: Record<string, string> }) : {}
    return {
      alts: parsed.alts && typeof parsed.alts === 'object' ? parsed.alts : {},
      summaries: parsed.summaries && typeof parsed.summaries === 'object' ? parsed.summaries : {},
    }
  } catch {
    return { alts: {}, summaries: {} }
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Build the accessibility copy-paste pack for a client domain. */
export async function buildAccessibilityPack(
  domain: string,
  businessName: string | null,
): Promise<AccessibilityPack> {
  const rootUrl = ensureUrl(domain)
  const rootHtml = await fetchHtml(rootUrl)
  const pages: { url: string; html: string }[] = [{ url: rootUrl, html: rootHtml }]

  const subpages = pickSubpages(rootHtml, rootUrl, 3)
  const subResults = await Promise.allSettled(
    subpages.map(async (u) => ({ url: u, html: await fetchHtml(u) })),
  )
  for (const r of subResults) {
    if (r.status === 'fulfilled') pages.push(r.value)
  }

  let images = dedupeImages(pages.flatMap((p) => extractImages(p.html, p.url))).slice(0, 24)
  const videos = pages.flatMap((p) => extractVideos(p.html, p.url)).slice(0, 12)

  // Prefer items that need work; still include a few ok alts for review.
  const needsWork = images.filter((i) => i.altQuality !== 'ok')
  const okOnes = images.filter((i) => i.altQuality === 'ok')
  images = [...needsWork, ...okOnes].slice(0, 18)

  const snippets = pages.map((p) => ({
    url: p.url,
    text: stripTags(p.html).slice(0, 1200),
  }))

  const { alts, summaries } = await suggestWithClaude(
    businessName,
    domain.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    images,
    videos,
    snippets,
  )

  return {
    domain: domain.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    pagesScanned: pages.map((p) => p.url),
    images: images.map((i) => ({
      ...i,
      suggestedAlt:
        alts[i.src]?.trim() ||
        (i.currentAlt.trim()
          ? i.currentAlt.trim()
          : `${businessName || 'Product'} — update this alt in your CMS`),
    })),
    videos: videos.map((v, idx) => ({
      ...v,
      suggestedSummary:
        summaries[String(idx)]?.trim() ||
        `Short summary for “${v.label}”: describe what viewers learn in 2–4 sentences, then paste under the video on ${v.pageUrl}.`,
    })),
    generatedAt: new Date().toISOString(),
  }
}
