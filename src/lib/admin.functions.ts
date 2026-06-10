import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

type AdminSession = { userId?: string }

// SESSION_SECRET must be ≥32 chars. Set in .env — the fallback is dev-only.
function sessionConfig() {
  return {
    password: process.env.SESSION_SECRET ?? 'dev-only-fallback-secret-needs-32c!!',
    name: 'admin',
    maxAge: 60 * 60 * 8, // 8 h
  }
}

async function assertAdmin() {
  const adminUserId = process.env.ADMIN_USER_ID
  const session = await useSession<AdminSession>(sessionConfig())
  if (!adminUserId || session.data.userId !== adminUserId) {
    throw redirect({ to: '/admin/login' })
  }
  return session.data.userId as string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const adminLogin = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const adminUserId = process.env.ADMIN_USER_ID
    if (!adminUserId) throw new Error('ADMIN_USER_ID is not configured')

    const { data: auth, error } = await supabaseAdmin.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error || !auth.user) throw new Error('Invalid credentials')
    if (auth.user.id !== adminUserId) throw new Error('Not authorized')

    const session = await useSession<AdminSession>(sessionConfig())
    await session.update({ userId: auth.user.id })
    return { ok: true }
  })

export const adminLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig())
  await session.clear()
})

// ─── Dashboard data ────────────────────────────────────────────────────────────

export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertAdmin()

  const [profilesRes, clientsRes, scansRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, client_id, status, generated_at, created_at, clients(domain, business_name)')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('clients')
      .select('id, domain, business_name, status, created_at')
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('scans')
      .select('id, url, ars_score, email, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (clientsRes.error) throw new Error(clientsRes.error.message)
  if (scansRes.error) throw new Error(scansRes.error.message)

  return {
    pendingProfiles: profilesRes.data as unknown as Array<{
      id: string
      client_id: string
      status: string
      generated_at: string | null
      created_at: string
      clients: { domain: string; business_name: string | null } | null
    }>,
    clients: clientsRes.data as Array<{
      id: string
      domain: string
      business_name: string | null
      status: string
      created_at: string
    }>,
    recentScans: scansRes.data as Array<{
      id: string
      url: string
      ars_score: number | null
      email: string | null
      created_at: string
    }>,
  }
})

export const approveProfile = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const adminUserId = await assertAdmin()

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'live',
        approved_at: new Date().toISOString(),
        approved_by: adminUserId,
      })
      .eq('id', data.profileId)

    if (error) throw new Error(error.message)
    return { ok: true }
  })
