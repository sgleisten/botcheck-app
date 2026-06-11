import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { getDealByToken, createCheckoutForToken } from '@/lib/checkout.functions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { SiteHeader } from '@/components/ui/SiteHeader'

export const Route = createFileRoute('/checkout/$token')({
  loader: ({ params }) => getDealByToken({ data: { token: params.token } }),
  component: CustomCheckoutPage,
})

function CustomCheckoutPage() {
  const deal = Route.useLoaderData()
  const { token } = Route.useParams()

  const [email, setEmail] = useState(deal.contactEmail ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { url } = await createCheckoutForToken({
        data: { token, email: email || undefined },
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <SiteHeader />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md space-y-5">
          <div>
            <p className="section-label mb-2">Your custom offer</p>
            <h1 className="text-2xl font-extrabold text-teal">{deal.domain}</h1>
            {deal.businessName && (
              <p className="text-sm text-teal/60 mt-1">{deal.businessName}</p>
            )}
          </div>

          <div className="rounded-lg bg-teal/5 border border-teal/15 p-4">
            <p className="text-3xl font-extrabold font-display text-teal">{deal.priceLabel}</p>
            <p className="text-sm text-teal/60 mt-1">
              AI profile, hosting, and weekly updates
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-teal/70 mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@yourbusiness.com"
              />
            </div>

            {error && (
              <p className="text-sm text-coral bg-coral/10 border border-coral/30 rounded-md p-3">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Redirecting to checkout…' : 'Continue to secure checkout →'}
            </Button>

            <p className="text-center text-xs text-teal/45">
              Secure checkout via Stripe · Cancel anytime
            </p>
          </form>
        </Card>
      </main>

      <SiteFooter />
    </div>
  )
}
