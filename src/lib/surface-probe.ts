import { CONTENT_SIGNAL } from './profile-surfaces'

export type SurfaceCheck = { ok: boolean; detail: string; url: string }

export type SurfaceProbeResult = {
  baseUrl: string
  llmsTxt: SurfaceCheck
  toolsJson: SurfaceCheck
  indexJson: SurfaceCheck
  jsonld: SurfaceCheck
  contentSignal: SurfaceCheck
  robotsAllowsAi?: SurfaceCheck
  /** Count of llms.txt, tools.json, index.json, jsonld passing. */
  filesLive: number
  fileCount: number
}

export type DiscoverabilityCheck = { ok: boolean; detail: string }

export type Discoverability = {
  /** 0–100, four checks worth 25 each. */
  score: number
  robotsAllowsAi: DiscoverabilityCheck
  structuredData: DiscoverabilityCheck
  llmsTxt: DiscoverabilityCheck
  toolsJson: DiscoverabilityCheck
}

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
]

export type FetchSurfaceResult = {
  ok: boolean
  status: number
  contentType: string
  body: string
  headers: Record<string, string>
}

export async function fetchSurfaceUrl(url: string, timeoutMs = 7000): Promise<FetchSurfaceResult> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'BotCheck-Scan/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    return {
      ok: res.ok,
      status: res.status,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      body,
      headers,
    }
  } catch {
    return { ok: false, status: 0, contentType: '', body: '', headers: {} }
  }
}

/** Heuristic: are the major AI crawlers blocked at the site root by robots.txt? */
export function robotsAllowsAi(robotsBody: string): DiscoverabilityCheck {
  if (!robotsBody.trim()) return { ok: true, detail: 'No robots.txt — AI crawlers allowed by default' }

  const groups = new Map<string, string[]>()
  let current: string[] = []
  let currentAgents: string[] = []
  const commit = () => {
    for (const a of currentAgents) {
      const existing = groups.get(a) ?? []
      groups.set(a, existing.concat(current))
    }
  }
  for (const rawLine of robotsBody.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const [field, ...rest] = line.split(':')
    const key = field.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      if (current.length && currentAgents.length) {
        commit()
        current = []
        currentAgents = []
      }
      currentAgents.push(value.toLowerCase())
    } else if (key === 'disallow' || key === 'allow') {
      current.push(`${key}:${value}`)
    }
  }
  if (currentAgents.length) commit()

  const blockedFor = (agent: string): boolean => {
    const rules = groups.get(agent.toLowerCase()) ?? groups.get('*')
    if (!rules) return false
    const disallowAll = rules.some((r) => r === 'disallow:/' || r === 'disallow:/*')
    const allowsRoot = rules.some((r) => r === 'allow:/')
    return disallowAll && !allowsRoot
  }

  const blocked = AI_CRAWLERS.filter(blockedFor)
  if (blocked.length) {
    return { ok: false, detail: `Blocks ${blocked.slice(0, 3).join(', ')}` }
  }
  return { ok: true, detail: 'AI crawlers allowed' }
}

/** Look for valid Schema.org JSON-LD in the page HTML. */
export function detectStructuredData(html: string): DiscoverabilityCheck {
  if (!html) return { ok: false, detail: 'No structured data found' }
  const matches = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  const types = new Set<string>()
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const collect = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(collect)
        else if (node && typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type']
          if (typeof t === 'string') types.add(t)
          else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x))
        }
      }
      collect(parsed)
    } catch {
      // ignore malformed block
    }
  }
  if (types.size) return { ok: true, detail: `Found: ${[...types].slice(0, 4).join(', ')}` }
  if (matches.length) return { ok: false, detail: 'JSON-LD present but unparseable' }
  return { ok: false, detail: 'No structured data found' }
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

function checkLlmsTxt(res: FetchSurfaceResult, url: string): SurfaceCheck {
  const ok = res.ok && res.contentType.includes('text/plain') && res.body.trim().length > 0
  return {
    ok,
    detail: ok ? 'Published' : res.ok ? 'Invalid content type or empty' : `HTTP ${res.status || 'unreachable'}`,
    url,
  }
}

function checkJsonFile(res: FetchSurfaceResult, url: string): SurfaceCheck {
  let ok = false
  if (res.ok && res.body.trim()) {
    try {
      JSON.parse(res.body)
      ok = true
    } catch {
      ok = false
    }
  }
  return {
    ok,
    detail: ok ? 'Valid JSON' : res.ok ? 'Invalid JSON' : `HTTP ${res.status || 'unreachable'}`,
    url,
  }
}

function checkContentSignal(res: FetchSurfaceResult, url: string): SurfaceCheck {
  const signal = res.headers['content-signal'] ?? ''
  const ok = signal.includes('ai-input=yes')
  return {
    ok,
    detail: ok ? signal : signal ? `Missing ai-input=yes (${signal})` : `No Content-Signal header (expected ${CONTENT_SIGNAL})`,
    url,
  }
}

/** Probe AI discovery files at a base URL (main site, subdomain, or BotCheck-hosted path). */
export async function probeSurface(
  baseUrl: string,
  options?: { includeRobots?: boolean },
): Promise<SurfaceProbeResult> {
  const origin = normalizeBaseUrl(baseUrl)

  const llmsUrl = `${origin}/llms.txt`
  const toolsUrl = `${origin}/tools.json`
  const indexUrl = `${origin}/index.json`
  const jsonldUrl = `${origin}/jsonld`

  const fetches: Promise<FetchSurfaceResult | null>[] = [
    fetchSurfaceUrl(llmsUrl),
    fetchSurfaceUrl(toolsUrl),
    fetchSurfaceUrl(indexUrl),
    fetchSurfaceUrl(jsonldUrl),
    options?.includeRobots ? fetchSurfaceUrl(`${origin}/robots.txt`) : Promise.resolve(null),
  ]

  const [llmsRes, toolsRes, indexRes, jsonldRes, robotsRes] = await Promise.all(fetches)

  const llmsTxt = checkLlmsTxt(llmsRes!, llmsUrl)
  const toolsJson = checkJsonFile(toolsRes!, toolsUrl)
  const indexJson = checkJsonFile(indexRes!, indexUrl)
  const jsonld = checkJsonFile(jsonldRes!, jsonldUrl)
  const contentSignal = checkContentSignal(llmsRes!, llmsUrl)

  const fileChecks = [llmsTxt, toolsJson, indexJson, jsonld]
  const filesLive = fileChecks.filter((c) => c.ok).length

  let robotsAllowsAiCheck: SurfaceCheck | undefined
  if (options?.includeRobots && robotsRes) {
    const robots =
      robotsRes.status === 0
        ? { ok: true, detail: 'robots.txt unreachable — assumed open' }
        : robotsAllowsAi(robotsRes.body)
    robotsAllowsAiCheck = {
      ok: robots.ok,
      detail: robots.detail,
      url: `${origin}/robots.txt`,
    }
  }

  return {
    baseUrl: origin,
    llmsTxt,
    toolsJson,
    indexJson,
    jsonld,
    contentSignal,
    robotsAllowsAi: robotsAllowsAiCheck,
    filesLive,
    fileCount: 4,
  }
}

/** Main-domain discoverability checks used by the ARS scan (four checks × 25 pts). */
export async function detectDiscoverability(rootUrl: string): Promise<Discoverability> {
  let origin: string
  try {
    origin = new URL(rootUrl).origin
  } catch {
    origin = normalizeBaseUrl(rootUrl)
  }

  const [robotsRes, llmsRes, toolsRes, pageRes] = await Promise.all([
    fetchSurfaceUrl(`${origin}/robots.txt`),
    fetchSurfaceUrl(`${origin}/llms.txt`),
    fetchSurfaceUrl(`${origin}/tools.json`),
    fetchSurfaceUrl(rootUrl),
  ])

  const robots =
    robotsRes.status === 0
      ? { ok: true, detail: 'robots.txt unreachable — assumed open' }
      : robotsAllowsAi(robotsRes.body)
  const structuredData = detectStructuredData(pageRes.body)
  const llmsTxt: DiscoverabilityCheck =
    llmsRes.ok && llmsRes.contentType.includes('text/plain') && llmsRes.body.trim().length > 0
      ? { ok: true, detail: 'llms.txt published' }
      : { ok: false, detail: 'No llms.txt' }

  let toolsOk = false
  if (toolsRes.ok && toolsRes.body.trim()) {
    try {
      JSON.parse(toolsRes.body)
      toolsOk = true
    } catch {
      toolsOk = false
    }
  }
  const toolsJson: DiscoverabilityCheck = toolsOk
    ? { ok: true, detail: 'tools.json published' }
    : { ok: false, detail: 'No tools.json' }

  const checks = [robots, structuredData, llmsTxt, toolsJson]
  const score = checks.reduce((sum, c) => sum + (c.ok ? 25 : 0), 0)

  return { score, robotsAllowsAi: robots, structuredData, llmsTxt, toolsJson }
}
