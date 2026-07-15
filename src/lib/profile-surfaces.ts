/** Shared helpers for AI agent discovery surfaces (llms.txt, index.json, JSON-LD). */

export const CONTENT_SIGNAL = 'ai-input=yes, search=yes, ai-train=no'

/** robots.txt Content-Signal line (IsItAgentReady / contentsignals.org). */
export const ROBOTS_CONTENT_SIGNAL = 'Content-Signal: ai-train=no, search=yes, ai-input=yes'

export type ProfileSurfaceInput = {
  businessName: string | null
  domain: string
  llmsTxt: string | null
  toolsJson: unknown | null
}

export function buildIndexJson(input: ProfileSurfaceInput): object {
  const name = input.businessName?.trim() || input.domain
  const tools = Array.isArray(input.toolsJson) ? input.toolsJson : []
  return {
    name,
    domain: input.domain,
    description: input.llmsTxt?.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ?? name,
    version: '1.0',
    resources: [
      { type: 'llms.txt', path: '/llms.txt' },
      { type: 'tools.json', path: '/tools.json' },
      { type: 'jsonld', path: '/jsonld' },
      { type: 'api-catalog', path: '/.well-known/api-catalog' },
    ],
    tools,
  }
}

export function buildJsonLd(input: ProfileSurfaceInput): object {
  const name = input.businessName?.trim() || input.domain
  const description =
    input.llmsTxt?.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ??
    `AI-readable profile for ${name}`

  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name,
    url: `https://${input.domain.replace(/^https?:\/\//i, '')}`,
    description,
  }

  if (Array.isArray(input.toolsJson)) {
    const actions = input.toolsJson
      .filter((t): t is Record<string, unknown> => t != null && typeof t === 'object')
      .slice(0, 10)
      .map((t) => ({
        '@type': 'Action',
        name: typeof t.name === 'string' ? t.name : 'Service',
        description: typeof t.description === 'string' ? t.description : undefined,
        target: typeof t.url === 'string' ? t.url : undefined,
      }))
    if (actions.length > 0) {
      base.potentialAction = actions
    }
  }

  return base
}

/**
 * Minimal RFC 9727 api-catalog (linkset+json) pointing at BotCheck discovery surfaces.
 * Honest for SMBs without a public OpenAPI — anchors agent-readable profile files.
 */
export function buildApiCatalog(input: ProfileSurfaceInput): object {
  const clean = input.domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const origin = `https://${clean}`
  return {
    linkset: [
      {
        anchor: origin,
        'api-catalog': [{ href: `${origin}/.well-known/api-catalog` }],
        describedby: [
          { href: `${origin}/llms.txt`, type: 'text/plain' },
          { href: `${origin}/jsonld`, type: 'application/ld+json' },
        ],
        'service-desc': [{ href: `${origin}/tools.json`, type: 'application/json' }],
        'service-doc': [{ href: `${origin}/index.json`, type: 'application/json' }],
      },
    ],
  }
}

/** RFC 8288 Link header value for homepage / agent discovery. */
export function buildLinkHeaderValue(): string {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</llms.txt>; rel="describedby"; type="text/plain"',
    '</tools.json>; rel="service-desc"; type="application/json"',
    '</index.json>; rel="service-doc"; type="application/json"',
    '</jsonld>; rel="describedby"; type="application/ld+json"',
  ].join(', ')
}

/** Copy-paste snippet for Cloudflare Transform Rules or host config. */
export function buildLinkHeaderSnippet(domain: string): string {
  const clean = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return [
    `# Add this Link response header on the homepage of https://${clean}`,
    `# (Cloudflare Transform Rule → Modify Response Header, or your host's equivalent)`,
    `Link: ${buildLinkHeaderValue()}`,
  ].join('\n')
}

/**
 * Ensure robots.txt additions include Content-Signal and a sensible AI-bot allow block.
 * Safe to call on Claude-generated or manually edited snippets.
 */
export function ensureRobotsTxtAdditions(raw: string | null | undefined): string {
  let text = (raw ?? '').trim()
  if (!/content-signal\s*:/i.test(text)) {
    const block = [
      '# BotCheck — AI content preferences (contentsignals.org)',
      'User-agent: *',
      ROBOTS_CONTENT_SIGNAL,
    ].join('\n')
    text = text ? `${text}\n\n${block}` : block
  }
  return text
}

export function agentSurfaceHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
    'Content-Signal': CONTENT_SIGNAL,
    Link: buildLinkHeaderValue(),
    ...extra,
  }
}

export function profileFileUrl(appUrl: string, clientId: string, file: string): string {
  return `${appUrl.replace(/\/+$/, '')}/sites/${clientId}/${file}`
}

export function onSiteDeployChecklist(domain: string): string[] {
  const clean = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return [
    `Upload llms.txt to https://${clean}/llms.txt (site root)`,
    `Upload tools.json to https://${clean}/tools.json (site root)`,
    `Upload index.json to https://${clean}/index.json (site root)`,
    `Upload api-catalog to https://${clean}/.well-known/api-catalog`,
    'Append robots.txt AI crawler + Content-Signal lines (copy from workspace)',
    'Add JSON-LD snippet to homepage <head> (copy from workspace)',
    'Add Link response header on homepage (copy Link header snippet from workspace)',
    'Verify files are publicly accessible (no auth, no redirect loops)',
  ]
}
