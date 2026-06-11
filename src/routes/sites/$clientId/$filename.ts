import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase credentials are not configured')
  return createClient(url, key)
}

const ALLOWED_FILES = ['llms.txt', 'tools.json'] as const
type AllowedFile = (typeof ALLOWED_FILES)[number]

function isAllowedFile(name: string): name is AllowedFile {
  return (ALLOWED_FILES as readonly string[]).includes(name)
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
          .select('llms_txt, tools_json')
          .eq('client_id', clientId)
          .eq('status', 'live')
          .single()

        if (error || !profile) {
          return new Response('Not found', { status: 404 })
        }

        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        }

        if (filename === 'llms.txt') {
          if (!profile.llms_txt) {
            return new Response('Not found', { status: 404 })
          }
          return new Response(profile.llms_txt, {
            status: 200,
            headers: {
              ...headers,
              'Content-Type': 'text/plain',
              'X-Robots-Tag': 'all',
            },
          })
        }

        if (!profile.tools_json) {
          return new Response('Not found', { status: 404 })
        }
        return new Response(JSON.stringify(profile.tools_json), {
          status: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        })
      },
    },
  },
})
