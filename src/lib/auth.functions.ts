import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

type UserSession = { userId?: string }

export function userSessionConfig() {
  const isDev = process.env.NODE_ENV === 'development'
  return {
    password: process.env.SESSION_SECRET ?? 'dev-only-fallback-secret-needs-32c!!',
    name: 'user',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    cookie: {
      httpOnly: true,
      secure: !isDev,
      sameSite: 'lax' as const,
      path: '/',
    },
  }
}

async function setUserSession(userId: string) {
  const session = await useSession<UserSession>(userSessionConfig())
  await session.update({ userId })
}

async function assertClientSignupAllowed(clientId: string, email: string) {
  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .select('contact_email, user_id')
    .eq('id', clientId)
    .single()

  if (error || !client) throw new Error('This setup link is invalid or expired.')
  if (client.user_id) {
    throw new Error('This account has already been set up. Use the Sign in tab.')
  }

  const emailMatches =
    client.contact_email &&
    client.contact_email.toLowerCase() === email.toLowerCase()

  if (!emailMatches) {
    const isDev = process.env.NODE_ENV === 'development'
    if (!isDev || client.contact_email) {
      throw new Error('Use the email address from your checkout receipt.')
    }
  }

  return client
}

export const getLoginContext = createServerFn({ method: 'GET' })
  .validator((input: unknown) =>
    z.object({ clientId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    if (!data.clientId) {
      return { defaultMode: 'signin' as const, email: undefined, clientMissing: false }
    }

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('contact_email, user_id')
      .eq('id', data.clientId)
      .maybeSingle()

    if (error || !client) {
      return { defaultMode: 'signup' as const, email: undefined, clientMissing: true }
    }

    return {
      defaultMode: client.user_id ? ('signin' as const) : ('signup' as const),
      email: client.contact_email ?? undefined,
      clientMissing: false,
    }
  })

export const userLogin = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: auth, error } = await supabaseAdmin.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error || !auth.user) throw new Error('Invalid email or password.')
    await setUserSession(auth.user.id)
    return { ok: true }
  })

export const userSignup = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        clientId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await assertClientSignupAllowed(data.clientId, data.email)

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      })

    if (createError) {
      if (createError.message.toLowerCase().includes('already')) {
        throw new Error('An account already exists for this email. Please sign in.')
      }
      throw new Error(createError.message)
    }
    if (!created.user) throw new Error('Could not create account.')

    const { error: linkError } = await supabaseAdmin
      .from('clients')
      .update({ user_id: created.user.id })
      .eq('id', data.clientId)
      .is('user_id', null)

    if (linkError) throw new Error('Account created but setup link could not be claimed.')

    await setUserSession(created.user.id)
    return { ok: true }
  })

export const userLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<UserSession>(userSessionConfig())
  await session.clear()
})

/** Redirect to login, preserving a safe relative return path in redirectTo. */
export function redirectToLogin(returnPath?: string): never {
  if (returnPath?.startsWith('/')) {
    throw redirect({
      href: `/login?redirectTo=${encodeURIComponent(returnPath)}`,
    })
  }
  throw redirect({ to: '/login' })
}

export const requireUser = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await useSession<UserSession>(userSessionConfig())
  if (!session.data.userId) redirectToLogin()
  return { userId: session.data.userId as string }
})
