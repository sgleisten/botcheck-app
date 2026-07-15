import { useSession } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

// Server-only admin session helpers. Kept in a .server.ts module so they can be
// shared by admin.functions.ts and hostname.functions.ts without exporting a
// raw server-only function from a client-reachable module (which the TanStack
// import-protection plugin rejects at build time).

export type AdminSession = { userId?: string }

// SESSION_SECRET must be ≥32 chars. Set in .env — the fallback is dev-only.
export function sessionConfig() {
  const isDev = process.env.NODE_ENV === 'development'
  return {
    password: process.env.SESSION_SECRET ?? 'dev-only-fallback-secret-needs-32c!!',
    name: 'admin',
    maxAge: 60 * 60 * 8, // 8 h
    cookie: {
      httpOnly: true,
      secure: !isDev,
      sameSite: 'lax' as const,
      path: '/',
    },
  }
}

export function superAdminUserId(): string | null {
  return process.env.ADMIN_USER_ID?.trim() || null
}

export function isSuperAdminUser(userId: string): boolean {
  const superId = superAdminUserId()
  return Boolean(superId && superId === userId)
}

/** Super admin (ADMIN_USER_ID) or a row in admin_users. */
export async function isAdminUser(userId: string): Promise<boolean> {
  if (isSuperAdminUser(userId)) return true

  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[admin] admin_users lookup failed:', error.message)
    return false
  }
  return Boolean(data)
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  const superId = superAdminUserId()
  if (superId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(superId)
    if (!error && data.user?.email?.toLowerCase() === normalized) return true
    const fallback = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    if (fallback === normalized) return true
  }

  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .ilike('email', normalized)
    .maybeSingle()

  if (error) {
    console.error('[admin] admin_users email lookup failed:', error.message)
    return false
  }
  return Boolean(data)
}

export async function assertAdmin() {
  const session = await useSession<AdminSession>(sessionConfig())
  const userId = session.data.userId
  if (!userId || !(await isAdminUser(userId))) {
    throw redirect({ to: '/admin/login' })
  }
  return userId
}

/** Only the env-configured super admin may manage other admins. */
export async function assertSuperAdmin() {
  const userId = await assertAdmin()
  if (!isSuperAdminUser(userId)) {
    throw new Error('Super admin only')
  }
  return userId
}
