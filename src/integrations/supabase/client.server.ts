import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

let adminClient: SupabaseClient | undefined
let authClient: SupabaseClient | undefined

function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    )
  }
  return adminClient
}

function getSupabaseAuthClient(): SupabaseClient {
  if (!authClient) {
    authClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'))
  }
  return authClient
}

function clientProxy(getClient: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = getClient()
      const value = Reflect.get(client, prop, client)
      return typeof value === 'function' ? value.bind(client) : value
    },
  })
}

/** Server-side Supabase client with service role — lazy init so SSR does not crash without env. */
export const supabaseAdmin = clientProxy(getSupabaseAdminClient)

/** For password sign-in only — do not use service role for auth.login */
export const supabaseAuth = clientProxy(getSupabaseAuthClient)
