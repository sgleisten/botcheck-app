import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

type UserSession = { userId?: string }

export function userSessionConfig() {
  return {
    password: process.env.SESSION_SECRET ?? 'dev-only-fallback-secret-needs-32c!!',
    name: 'user',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  }
}

export const userLogin = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: auth, error } = await supabaseAdmin.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error || !auth.user) throw new Error('Invalid credentials')
    const session = await useSession<UserSession>(userSessionConfig())
    await session.update({ userId: auth.user.id })
    return { ok: true }
  })

export const userLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<UserSession>(userSessionConfig())
  await session.clear()
})

export const requireUser = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await useSession<UserSession>(userSessionConfig())
  if (!session.data.userId) throw redirect({ to: '/login' })
  return { userId: session.data.userId as string }
})
