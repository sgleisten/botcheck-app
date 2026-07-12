/** Shared helpers for AI agent discovery surfaces (llms.txt, index.json, JSON-LD). */

export const CONTENT_SIGNAL = 'ai-input=yes, search=yes, ai-train=no'

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

export function agentSurfaceHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
    'Content-Signal': CONTENT_SIGNAL,
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
    'Append robots.txt AI crawler directives (copy from deploy panel)',
    'Add JSON-LD snippet to homepage <head> (copy from deploy panel)',
    'Verify files are publicly accessible (no auth, no redirect loops)',
  ]
}
