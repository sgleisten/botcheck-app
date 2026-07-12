// BotCheck profile router — Cloudflare Worker.
//
// This Worker is attached to the botcheck.io zone via a zone-wide Workers
// Route (*/*) as the fallback origin for Cloudflare for SaaS custom
// hostnames. That route pattern is zone-wide by necessity — Cloudflare has
// no way to scope a route to "just the custom hostnames," since those are
// arbitrary third-party domains (ai.midstatehealth.net, ...) added
// dynamically. That means this Worker sees BOTH client custom-hostname
// traffic AND botcheck.io's own production traffic (homepage, checkout,
// admin — all served by Vercel). PRIMARY_HOSTNAMES below must be handled
// as a pure pass-through to Vercel, or every request to botcheck.io itself
// would 404 against SUPPORTED_FILES the moment the */* route is live.
//
// Flow for everything else (client subdomains):
//   client subdomain (ai.example.com) --CNAME--> Cloudflare
//     -> this Worker reads the Host header
//     -> resolves Host -> { client_id, status } via hostname-lookup
//     -> proxies to the canonical profile route (APP_URL/sites/{clientId}/{file})
//     -> returns the profile file as if served natively from the subdomain.
//
// The Worker holds NO Supabase credential. hostname-lookup is a public,
// narrowly-scoped endpoint returning only { client_id, status }.

export interface Env {
  SUPABASE_URL: string
  APP_URL: string
  // Vercel's stable deployment domain — NOT in the botcheck.io zone, so this
  // is a plain external fetch, not `resolveOverride` (which only works for
  // hosts inside the same zone as the incoming request).
  VERCEL_ORIGIN: string
  // Comma-separated hostnames that are BotCheck's own, not a client's.
  PRIMARY_HOSTNAMES: string
}

// The profile route only serves these two files today; mirror that here so the
// Worker 404s fast on anything else without a round-trip upstream.
const SUPPORTED_FILES = new Set(['llms.txt', 'tools.json'])

// Edge-cache the hostname -> client mapping so we don't hit Supabase on every
// request. Short TTL keeps re-registrations / churn from going stale for long.
const LOOKUP_TTL_SECONDS = 300

type Mapping = { client_id: string; status: string }

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const host = (req.headers.get('host') ?? url.hostname).trim().toLowerCase()

    const primaryHosts = new Set(
      env.PRIMARY_HOSTNAMES.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    )
    if (primaryHosts.has(host)) {
      return proxyToVercel(req, env)
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }

    const file = url.pathname.replace(/^\/+/, '')

    if (!SUPPORTED_FILES.has(file)) {
      return new Response('Not found', { status: 404 })
    }

    let mapping: Mapping | null
    try {
      mapping = await resolveClient(host, env, ctx)
    } catch (err) {
      // Fail loud (audit called out serve-profile's silent failures) — a 502
      // plus a log line means an outage is visible, not a mystery 404.
      console.error(`[worker] hostname-lookup failed for host=${host}:`, err)
      return new Response('Bad gateway', { status: 502 })
    }

    if (!mapping) {
      console.log(`[worker] unmapped host=${host} path=/${file}`)
      return new Response('Not found', { status: 404 })
    }

    // The app route is the source of truth for whether a profile is live; it
    // 404s if the client's profile isn't approved, so we just proxy through.
    const target = `${env.APP_URL}/sites/${mapping.client_id}/${file}`
    const upstream = await fetch(target, { method: 'GET' })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    })
  },
}

/**
 * Pass first-party requests straight through to Vercel's stable app domain.
 * Not `resolveOverride` — that only works within the same zone as the
 * incoming request, and VERCEL_ORIGIN isn't in the botcheck.io zone. This is
 * a plain external fetch, so the outbound Host header will likely be
 * VERCEL_ORIGIN rather than the original incoming host — untested here, not
 * assumed safe by design. That's fine for correctness: the app takes its
 * canonical URL from APP_URL, not from the incoming Host, for anything that
 * generates absolute URLs (see email.server.ts). Preserves method, headers,
 * and body, since POSTs (checkout, webhooks, admin login) need to work too.
 */
async function proxyToVercel(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  url.hostname = env.VERCEL_ORIGIN
  url.port = ''
  url.protocol = 'https:'

  return fetch(new Request(url, req))
}

async function resolveClient(host: string, env: Env, ctx: ExecutionContext): Promise<Mapping | null> {
  const cache = caches.default
  const cacheKey = new Request(`https://profile-router.internal/lookup/${encodeURIComponent(host)}`)

  const cached = await cache.match(cacheKey)
  if (cached) {
    // A cached 404 body is our negative-result marker.
    if (cached.status === 404) return null
    return (await cached.json()) as Mapping
  }

  const lookupUrl = `${env.SUPABASE_URL}/functions/v1/hostname-lookup?host=${encodeURIComponent(host)}`
  const res = await fetch(lookupUrl)

  if (res.status === 404) {
    // Cache the miss briefly so an unmapped/typo'd host doesn't hammer lookup.
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(null, {
          status: 404,
          headers: { 'Cache-Control': `max-age=${LOOKUP_TTL_SECONDS}` },
        }),
      ),
    )
    return null
  }

  if (!res.ok) {
    throw new Error(`hostname-lookup returned ${res.status}`)
  }

  const data = (await res.json()) as Mapping
  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${LOOKUP_TTL_SECONDS}`,
        },
      }),
    ),
  )
  return data
}
