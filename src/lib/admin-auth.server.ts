import { useSession } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'

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

export async function assertAdmin() {
  const adminUserId = process.env.ADMIN_USER_ID
  const session = await useSession<AdminSession>(sessionConfig())
  if (!adminUserId || session.data.userId !== adminUserId) {
    throw redirect({ to: '/admin/login' })
  }
  return session.data.userId as string
}
