import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  // Match /sites/[client-id]/llms.txt or /sites/[client-id]/tools.json
  const match = url.pathname.match(/^\/sites\/([^/]+)\/(llms\.txt|tools\.json)$/)
  if (!match) {
    return new Response('Not found', { status: 404 })
  }

  const [, clientId, filename] = match

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('llms_txt, tools_json')
    .eq('client_id', clientId)
    .eq('status', 'live')
    .single()

  if (error || !profile) {
    return new Response('Not found', { status: 404 })
  }

  if (filename === 'llms.txt') {
    if (!profile.llms_txt) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(profile.llms_txt, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'all',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  // tools.json
  if (!profile.tools_json) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(JSON.stringify(profile.tools_json), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})
