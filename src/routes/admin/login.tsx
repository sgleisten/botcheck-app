import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { adminLogin } from '@/lib/admin.functions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export const Route = createFileRoute('/admin/login')({ component: AdminLogin })

function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await adminLogin({ data: { email, password } })
      await router.navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-extrabold text-teal">Admin</h1>

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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
