import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getAdminData,
  approveProfile,
  adminLogout,
  createClientDeal,
  markClientPaid,
} from '@/lib/admin.functions'
import { formatMonthlyPrice } from '@/lib/billing'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export const Route = createFileRoute('/admin/')({
  loader: () => getAdminData(),
  component: AdminDashboard,
})

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type BillingTypeOption = 'custom_checkout' | 'invoice' | 'comped'

function AdminDashboard() {
  const router = useRouter()
  const { pendingProfiles, clients, recentScans } = Route.useLoaderData()

  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  const [dealOpen, setDealOpen] = useState(false)
  const [dealLoading, setDealLoading] = useState(false)
  const [dealError, setDealError] = useState<string | null>(null)
  const [dealResult, setDealResult] = useState<{
    checkoutUrl: string | null
    onboardingUrl: string
    billingType: string
  } | null>(null)

  const [domain, setDomain] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [billingType, setBillingType] = useState<BillingTypeOption>('custom_checkout')
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [stripePriceId, setStripePriceId] = useState('')

  const [markingPaid, setMarkingPaid] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleApprove(profileId: string) {
    setApproving(profileId)
    setApproveError(null)
    try {
      await approveProfile({ data: { profileId } })
      setApproved((prev) => new Set([...prev, profileId]))
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setApproving(null)
    }
  }

  async function handleLogout() {
    await adminLogout()
    await router.navigate({ to: '/admin/login' })
  }

  async function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault()
    setDealLoading(true)
    setDealError(null)
    setDealResult(null)
    try {
      const result = await createClientDeal({
        data: {
          domain,
          contactEmail,
          businessName: businessName || undefined,
          billingType,
          monthlyPriceDollars: monthlyPrice ? Number(monthlyPrice) : undefined,
          stripePriceId: stripePriceId || undefined,
        },
      })
      setDealResult(result)
      await router.invalidate()
    } catch (err) {
      setDealError(err instanceof Error ? err.message : 'Failed to create deal')
    } finally {
      setDealLoading(false)
    }
  }

  async function handleMarkPaid(clientId: string) {
    setMarkingPaid(clientId)
    try {
      const result = await markClientPaid({ data: { clientId } })
      await copyText(result.onboardingUrl, `paid-${clientId}`)
      await router.invalidate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark paid')
    } finally {
      setMarkingPaid(null)
    }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const pendingVisible = pendingProfiles.filter((p) => !approved.has(p.id))

  return (
    <div className="min-h-screen bg-cream p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b-2 border-teal pb-4">
        <h1 className="text-2xl font-extrabold text-teal">Admin</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-teal/60 hover:text-teal font-medium"
        >
          Sign out
        </button>
      </div>

      {/* Create deal */}
      <section>
        <button
          type="button"
          onClick={() => setDealOpen((v) => !v)}
          className="text-sm font-semibold uppercase tracking-wide text-teal/60 hover:text-teal mb-3"
        >
          {dealOpen ? '− Create deal' : '+ Create deal'}
        </button>

        {dealOpen && (
          <Card className="space-y-4">
            <p className="text-sm text-teal/70">
              Create a client with custom pricing, invoice billing, or comped access. Copy the
              checkout or onboarding link to send to the prospect.
            </p>

            <form onSubmit={handleCreateDeal} className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-teal/60 mb-1">Domain</label>
                <input
                  required
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="input-field"
                  placeholder="example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Contact email</label>
                <input
                  required
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Business name (optional)</label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Billing type</label>
                <select
                  value={billingType}
                  onChange={(e) => setBillingType(e.target.value as BillingTypeOption)}
                  className="input-field"
                >
                  <option value="custom_checkout">Custom checkout link</option>
                  <option value="invoice">Invoice / net terms</option>
                  <option value="comped">Comped (no payment)</option>
                </select>
              </div>

              {billingType === 'custom_checkout' && (
                <>
                  <div>
                    <label className="block text-xs text-teal/60 mb-1">
                      Monthly price (USD)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={monthlyPrice}
                      onChange={(e) => setMonthlyPrice(e.target.value)}
                      className="input-field"
                      placeholder="199"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-teal/60 mb-1">
                      Or Stripe Price ID
                    </label>
                    <input
                      value={stripePriceId}
                      onChange={(e) => setStripePriceId(e.target.value)}
                      className="input-field"
                      placeholder="price_..."
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                {dealError && (
                  <p className="text-sm text-coral mb-3">{dealError}</p>
                )}
                <Button type="submit" disabled={dealLoading}>
                  {dealLoading ? 'Creating…' : 'Create deal'}
                </Button>
              </div>
            </form>

            {dealResult && (
              <div className="border-t border-teal/15 pt-4 space-y-2 text-sm">
                <p className="font-semibold text-teal">Deal created</p>
                {dealResult.checkoutUrl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-teal/60">Checkout:</span>
                    <code className="text-xs bg-teal/5 px-2 py-1 break-all">
                      {dealResult.checkoutUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText(dealResult.checkoutUrl!, 'checkout')}
                      className="text-xs text-teal underline"
                    >
                      {copied === 'checkout' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-teal/60">Onboarding:</span>
                  <code className="text-xs bg-teal/5 px-2 py-1 break-all">
                    {dealResult.onboardingUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(dealResult.onboardingUrl, 'onboarding')}
                    className="text-xs text-teal underline"
                  >
                    {copied === 'onboarding' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {dealResult.billingType === 'comped' && (
                  <p className="text-teal/60 text-xs">
                    Comped client — send the onboarding link directly.
                  </p>
                )}
                {dealResult.billingType === 'invoice' && (
                  <p className="text-teal/60 text-xs">
                    Invoice client — use Mark paid after payment is confirmed.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}
      </section>

      {/* Pending profiles */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal/60 mb-2">
          Pending Review ({pendingVisible.length})
        </h2>

        {approveError && <p className="text-sm text-coral mb-2">{approveError}</p>}

        {pendingVisible.length === 0 ? (
          <p className="text-sm text-teal/50">Nothing pending.</p>
        ) : (
          <div className="overflow-x-auto border-2 border-teal bg-cream card-shadow">
            <table className="w-full text-sm">
              <thead className="bg-teal text-cream text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Domain</th>
                  <th className="px-4 py-2 text-left">Business</th>
                  <th className="px-4 py-2 text-left">Generated</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal/20">
                {pendingVisible.map((p) => (
                  <tr key={p.id} className="hover:bg-orange/10">
                    <td className="px-4 py-2 font-medium text-teal">
                      {p.clients?.domain ?? p.client_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 text-teal/70">
                      {p.clients?.business_name ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-teal/60">{fmt(p.generated_at)}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={approving === p.id}
                        className="bg-green text-cream px-3 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {approving === p.id ? 'Approving…' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Clients */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal/60 mb-2">
          Clients ({clients.length})
        </h2>
        <div className="overflow-x-auto border-2 border-teal bg-cream card-shadow">
          <table className="w-full text-sm">
            <thead className="bg-teal text-cream text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Domain</th>
                <th className="px-4 py-2 text-left">Billing</th>
                <th className="px-4 py-2 text-left">Price</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal/20">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-teal/50">
                    No clients yet.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="hover:bg-orange/10">
                    <td className="px-4 py-2">
                      <p className="font-medium text-teal">{c.domain}</p>
                      <p className="text-xs text-teal/50">{c.contact_email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-2 text-teal/70 capitalize">
                      {c.billing_type?.replace('_', ' ') ?? 'standard'}
                    </td>
                    <td className="px-4 py-2 text-teal/70">
                      {formatMonthlyPrice(c.quoted_monthly_cents)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium ${
                          c.status === 'active'
                            ? 'bg-green/30 text-teal'
                            : c.status === 'onboarding'
                              ? 'bg-orange/30 text-teal'
                              : 'bg-teal/10 text-teal/70'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      {c.checkout_token && c.status === 'pending_payment' && (
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              `${window.location.origin}/checkout/${c.checkout_token}`,
                              c.id,
                            )
                          }
                          className="text-xs text-teal underline"
                        >
                          {copied === c.id ? 'Copied!' : 'Checkout link'}
                        </button>
                      )}
                      {c.billing_type === 'invoice' && c.status === 'pending_payment' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(c.id)}
                          disabled={markingPaid === c.id}
                          className="text-xs bg-green text-cream px-2 py-0.5 font-semibold disabled:opacity-50"
                        >
                          {markingPaid === c.id ? '…' : 'Mark paid'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent scans */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal/60 mb-2">
          Recent Scans ({recentScans.length})
        </h2>
        <div className="overflow-x-auto border-2 border-teal bg-cream card-shadow">
          <table className="w-full text-sm">
            <thead className="bg-teal text-cream text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">URL</th>
                <th className="px-4 py-2 text-left">ARS</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Scanned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal/20">
              {recentScans.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-teal/50">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                recentScans.map((s) => (
                  <tr key={s.id} className="hover:bg-orange/10">
                    <td className="px-4 py-2 max-w-xs truncate text-teal/80">{s.url}</td>
                    <td className="px-4 py-2 font-semibold">
                      {s.ars_score != null ? (
                        <span
                          className={
                            s.ars_score >= 80
                              ? 'text-green'
                              : s.ars_score >= 50
                                ? 'text-orange'
                                : 'text-coral'
                          }
                        >
                          {s.ars_score}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-teal/60">{s.email ?? '—'}</td>
                    <td className="px-4 py-2 text-teal/60">{fmt(s.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
