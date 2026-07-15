import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import {
  agentSurfaceHeaders,
  buildIndexJson,
  buildJsonLd,
  buildApiCatalog,
} from '@/lib/profile-surfaces'

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase credentials are not configured')
  return createClient(url, key)
}

const ALLOWED_FILES = ['llms.txt', 'tools.json', 'index.json', 'jsonld', 'api-catalog'] as const
type AllowedFile = (typeof ALLOWED_FILES)[number]

function isAllowedFile(name: string): name is AllowedFile {
  return (ALLOWED_FILES as readonly string[]).includes(name)
}

type LiveProfile = {
  llms_txt: string | null
  tools_json: unknown | null
  robots_txt_additions: string | null
  clients: { domain: string; business_name: string | null } | null
}

export const Route = createFileRoute('/sites/$clientId/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { clientId, filename } = params

        if (!isAllowedFile(filename)) {
          return new Response('Not found', { status: 404 })
        }

        const supabase = getSupabase()
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('llms_txt, tools_json, robots_txt_additions, clients(domain, business_name)')
          .eq('client_id', clientId)
          .eq('status', 'live')
          .single()

        if (error || !profile) {
          return new Response('Not found', { status: 404 })
        }

        const row = profile as LiveProfile
        const domain = row.clients?.domain ?? clientId
        const businessName = row.clients?.business_name ?? null
        const surfaceInput = {
          businessName,
          domain,
          llmsTxt: row.llms_txt,
          toolsJson: row.tools_json,
        }

        if (filename === 'llms.txt') {
          if (!row.llms_txt) {
            return new Response('Not found', { status: 404 })
          }
          return new Response(row.llms_txt, {
            status: 200,
            headers: agentSurfaceHeaders({
              'Content-Type': 'text/plain; charset=utf-8',
              'X-Robots-Tag': 'all',
            }),
          })
        }

        if (filename === 'tools.json') {
          if (!row.tools_json) {
            return new Response('Not found', { status: 404 })
          }
          return new Response(JSON.stringify(row.tools_json, null, 2), {
            status: 200,
            headers: agentSurfaceHeaders({
              'Content-Type': 'application/json; charset=utf-8',
            }),
          })
        }

        if (filename === 'index.json') {
          const body = buildIndexJson(surfaceInput)
          return new Response(JSON.stringify(body, null, 2), {
            status: 200,
            headers: agentSurfaceHeaders({
              'Content-Type': 'application/json; charset=utf-8',
            }),
          })
        }

        if (filename === 'jsonld') {
          const body = buildJsonLd(surfaceInput)
          return new Response(JSON.stringify(body, null, 2), {
            status: 200,
            headers: agentSurfaceHeaders({
              'Content-Type': 'application/ld+json; charset=utf-8',
            }),
          })
        }

        if (filename === 'api-catalog') {
          const body = buildApiCatalog(surfaceInput)
          return new Response(JSON.stringify(body, null, 2), {
            status: 200,
            headers: agentSurfaceHeaders({
              'Content-Type': 'application/linkset+json; charset=utf-8',
            }),
          })
        }

        return new Response('Not found', { status: 404 })
      },
    },
  },
})
