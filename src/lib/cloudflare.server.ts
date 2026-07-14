// Cloudflare for SaaS — Custom Hostnames API client.
// Registers a client's own subdomain (e.g. ai.midstatehealth.net) so Cloudflare
// issues + renews a valid cert on their domain and routes traffic to our
// fallback origin (the Worker). See docs/DEPLOY.md for the dashboard-side setup.

const CF_API = 'https://api.cloudflare.com/client/v4'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is not configured. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in Vercel → Settings → Environment Variables (Production), then redeploy. They already exist in local .env for dev.`,
    )
  }
  return value
}

type CfCustomHostname = {
  id: string
  hostname: string
  status: string // pending | pending_validation | active | blocked | moved | deleted ...
  ssl?: {
    status?: string // pending_validation | pending_issuance | active | ...
    validation_errors?: { message?: string }[]
  }
  verification_errors?: string[]
}

type CfResponse<T> = {
  success: boolean
  result: T
  errors?: { code: number; message: string }[]
}

/** Normalized state we persist and show in the UI. */
export type HostnameStatus = 'pending' | 'active' | 'error'

export type HostnameResult = {
  cfHostnameId: string
  status: HostnameStatus
  error: string | null
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfResponse<T>> {
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const json = (await res.json()) as CfResponse<T>
  if (!res.ok || !json.success) {
    const detail = json.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`
    throw new Error(`Cloudflare API error: ${detail}`)
  }
  return json
}

/**
 * Reduce Cloudflare's many hostname + ssl states into pending | active | error.
 * `active` requires BOTH the hostname and its cert to be active — a hostname can
 * be "active" while the cert is still issuing, which is not yet servable.
 */
function normalizeStatus(h: CfCustomHostname): HostnameResult {
  const validationError =
    h.ssl?.validation_errors?.map((e) => e.message).filter(Boolean).join('; ') ||
    h.verification_errors?.filter(Boolean).join('; ') ||
    null

  const terminalError = ['blocked', 'moved', 'deleted'].includes(h.status)

  let status: HostnameStatus
  if (h.status === 'active' && h.ssl?.status === 'active') {
    status = 'active'
  } else if (terminalError) {
    status = 'error'
  } else {
    status = 'pending'
  }

  return {
    cfHostnameId: h.id,
    status,
    // Surface validation detail even while pending, so a stuck cert shows why.
    error: status === 'error' ? (validationError ?? `Hostname ${h.status}`) : validationError,
  }
}

/**
 * Register a new custom hostname. Uses HTTP domain-control validation: once the
 * client's routing CNAME points at our fallback origin, Cloudflare validates and
 * issues the cert automatically — the client adds no second record.
 */
export async function createCustomHostname(hostname: string): Promise<HostnameResult> {
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  const json = await cfFetch<CfCustomHostname>(`/zones/${zoneId}/custom_hostnames`, {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: {
        method: 'http',
        type: 'dv',
        settings: { min_tls_version: '1.2' },
      },
    }),
  })
  return normalizeStatus(json.result)
}

/** Poll Cloudflare for the current verification + cert state of a hostname. */
export async function getCustomHostnameStatus(cfHostnameId: string): Promise<HostnameResult> {
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  const json = await cfFetch<CfCustomHostname>(
    `/zones/${zoneId}/custom_hostnames/${cfHostnameId}`,
    { method: 'GET' },
  )
  return normalizeStatus(json.result)
}

/** Remove a custom hostname (e.g. client churned or admin is re-registering). */
export async function deleteCustomHostname(cfHostnameId: string): Promise<void> {
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  await cfFetch<{ id: string }>(`/zones/${zoneId}/custom_hostnames/${cfHostnameId}`, {
    method: 'DELETE',
  })
}
