import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { getLoginContext, userLogin, userSignup } from '@/lib/auth.functions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirectTo: z.string().optional() }),
  loader: ({ location }) => {
    const redirectTo = (location.search as { redirectTo?: string }).redirectTo
    const clientId = clientIdFromRedirect(redirectTo)
    return getLoginContext({ data: { clientId } })
  },
  component: LoginPage,
})

function clientIdFromRedirect(redirectTo?: string): string | undefined {
  const match = redirectTo?.match(/^\/onboarding\/([0-9a-f-]{36})/i)
  return match?.[1]
}

type Mode = 'signup' | 'signin'

function LoginPage() {
  const router = useRouter()
  const { redirectTo } = Route.useSearch()
  const { defaultMode, email: suggestedEmail, clientMissing } = Route.useLoaderData()
  const clientId = clientIdFromRedirect(redirectTo)
  const isOnboarding = Boolean(clientId)

  const [mode, setMode] = useState<Mode>(defaultMode)
  const [email, setEmail] = useState(suggestedEmail ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const destination = redirectTo?.startsWith('/') ? redirectTo : '/'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        if (!clientId) {
          throw new Error('Missing setup link. Open the link from your checkout email.')
        }
        await userSignup({ data: { email, password, clientId } })
      } else {
        await userLogin({ data: { email, password } })
      }
      await router.invalidate()
      await router.navigate({ href: destination })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      if (message.includes('Please sign in') || message.includes('Sign in tab')) {
        setMode('signin')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-teal">
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="text-sm text-teal/60 mt-1">
            {mode === 'signup'
              ? 'Set a password to continue your AI presence setup'
              : 'to continue to your AI presence setup'}
          </p>
        </div>

        {clientMissing && (
          <p className="text-sm text-teal bg-orange/20 border-2 border-orange p-2">
            This setup link does not match a client record. Check the URL from your checkout
            confirmation email.
          </p>
        )}

        {isOnboarding && (
          <div className="flex border-2 border-teal p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-1.5 font-medium transition-colors ${
                mode === 'signup' ? 'bg-teal text-cream' : 'text-teal/70 hover:text-teal'
              }`}
            >
              First time
            </button>
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 py-1.5 font-medium transition-colors ${
                mode === 'signin' ? 'bg-teal text-cream' : 'text-teal/70 hover:text-teal'
              }`}
            >
              Sign in
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-coral bg-coral/10 border-2 border-coral p-2">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-teal/70" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
            {mode === 'signup' && (
              <p className="text-xs text-teal/50">Use the same email you entered at checkout.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-teal/70" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
            {mode === 'signup' && (
              <p className="text-xs text-teal/50">At least 8 characters.</p>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? mode === 'signup'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
