import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { adminLogin, adminRequestPasswordReset } from '@/lib/admin.functions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export const Route = createFileRoute('/admin/login')({ component: AdminLogin })

function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      await adminLogin({ data: { email, password } })
      await router.navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter your admin email above, then click forgot password.')
      return
    }
    setResetLoading(true)
    setError(null)
    setInfo(null)
    try {
      const result = await adminRequestPasswordReset({ data: { email: email.trim() } })
      setInfo(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-extrabold text-teal">Admin</h1>

        <p className="text-xs text-teal/60">
          Admin passwords are managed through Supabase Auth — not stored in this app. Use the email
          tied to your <code className="bg-teal/5 px-1">ADMIN_USER_ID</code> account.
        </p>

        {error && (
          <p className="text-sm text-coral bg-coral/10 border-2 border-coral p-2">{error}</p>
        )}
        {info && (
          <p className="text-sm text-teal bg-green/10 border-2 border-green/40 p-2">{info}</p>
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
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-teal/70" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <form onSubmit={(e) => void handleForgotPassword(e)} className="border-t border-teal/15 pt-4">
          <button
            type="submit"
            disabled={resetLoading}
            className="text-sm text-teal underline hover:text-teal/80 disabled:opacity-50"
          >
            {resetLoading ? 'Sending reset link…' : 'Forgot password? Send reset link'}
          </button>
        </form>
      </Card>
    </div>
  )
}
