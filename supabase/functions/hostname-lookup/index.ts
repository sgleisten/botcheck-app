import { createClient } from 'npm:@supabase/supabase-js@2'

// Minimal hostname -> client_id resolver for the Cloudflare Worker.
// The Worker holds NO Supabase credential; it calls this endpoint, which uses
// the service-role key server-side and returns only { client_id, status } or
// 404. Nothing else from the clients row (PII, billing) is ever serialized.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '')
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const host = url.searchParams.get('host')

  if (!host) {
    return new Response(JSON.stringify({ error: 'missing host' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, status')
    .eq('custom_hostname', normalizeHost(host))
    .maybeSingle()

  if (error) {
    // Fail loud: log so an outage is visible, don't masquerade as "not found".
    console.error(`[hostname-lookup] DB error for host=${host}:`, error.message)
    return new Response(JSON.stringify({ error: 'lookup failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!client) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ client_id: client.id, status: client.status }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Short edge cache is also applied Worker-side; this is a backstop.
      'Cache-Control': 'public, max-age=300',
    },
  })
})
