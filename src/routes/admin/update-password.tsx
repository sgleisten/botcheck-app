import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { adminCompletePasswordReset } from '@/lib/admin.functions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export const Route = createFileRoute('/admin/update-password')({
  component: AdminUpdatePassword,
})

type RecoveryTokens = { accessToken: string; refreshToken: string }

function parseRecoveryTokens(): RecoveryTokens | null {
  if (typeof window === 'undefined') return null

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hashParams = new URLSearchParams(hash)
  const accessFromHash = hashParams.get('access_token')
  const refreshFromHash = hashParams.get('refresh_token')
  if (accessFromHash && refreshFromHash) {
    return { accessToken: accessFromHash, refreshToken: refreshFromHash }
  }

  const query = new URLSearchParams(window.location.search)
  const accessFromQuery = query.get('access_token')
  const refreshFromQuery = query.get('refresh_token')
  if (accessFromQuery && refreshFromQuery) {
    return { accessToken: accessFromQuery, refreshToken: refreshFromQuery }
  }

  return null
}

function AdminUpdatePassword() {
  const router = useRouter()
  const [tokens, setTokens] = useState<RecoveryTokens | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setTokens(parseRecoveryTokens())
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tokens) return
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await adminCompletePasswordReset({
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          password,
        },
      })
      await router.navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-extrabold text-teal">Set new admin password</h1>

        {!tokens ? (
          <div className="space-y-3 text-sm text-teal/70">
            <p>This link is invalid or has expired.</p>
            <a href="/admin/login" className="text-teal underline font-medium">
              Back to admin login
            </a>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-sm text-coral bg-coral/10 border-2 border-coral p-2">{error}</p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-teal/70" htmlFor="password">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-teal/70" htmlFor="confirm">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input-field"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Saving…' : 'Update password & sign in'}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
