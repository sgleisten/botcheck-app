import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getAdminData,
  approveProfile,
  adminLogout,
  createClientDeal,
  markClientPaid,
  createManualClient,
  getClientProfile,
  updateProfile,
  updateClient,
  archiveClient,
  unarchiveClient,
  rerunScan,
} from '@/lib/admin.functions'
import { setupCustomHostname, refreshHostnameStatus } from '@/lib/hostname.functions'
import { ClientDeployPanel } from '@/components/admin/ClientDeployPanel'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export const Route = createFileRoute('/admin/')({
  loader: () => getAdminData({ data: {} }),
  component: AdminDashboard,
})

type SortDir = 'asc' | 'desc'

function sortRows<T>(
  rows: T[],
  key: string | null,
  dir: SortDir,
  accessor: (row: T, key: string) => string | number,
): T[] {
  if (!key) return rows
  const sorted = [...rows].sort((a, b) => {
    const av = accessor(a, key)
    const bv = accessor(b, key)
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'asc' ? sorted : sorted.reverse()
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: string
  activeKey: string | null
  dir: SortDir
  onSort: (key: string) => void
}) {
  const active = activeKey === sortKey
  return (
    <th
      className="px-4 py-2 text-left cursor-pointer select-none hover:text-orange"
      onClick={() => onSort(sortKey)}
    >
      {label} {active ? (dir === 'asc' ? '▲' : '▼') : ''}
    </th>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ensureHttps(domain: string) {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
}

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-gray-200 text-gray-700',
  onboarding: 'bg-yellow-200 text-yellow-900',
  pending_review: 'bg-orange/30 text-teal',
  active: 'bg-green/40 text-teal',
  live: 'bg-green/40 text-teal',
  past_due: 'bg-coral/25 text-coral',
  cancelled: 'bg-coral/25 text-coral',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-teal/10 text-teal/70'
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

type BillingTypeOption = 'custom_checkout' | 'invoice' | 'comped'
type PlanOption = 'starter' | 'agency'

type ProfilePanel = {
  clientId: string
  domain: string
  profileId: string | null
  status: string | null
  llmsTxt: string
  toolsJson: string
  loading: boolean
  saving: boolean
  error: string | null
  approving: boolean
}

function AdminDashboard() {
  const router = useRouter()
  const { pendingProfiles, clients, recentScans } = Route.useLoaderData()

  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  // ─── Create deal (existing) ───
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

  // ─── Add client (manual onboarding) ───
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [add, setAdd] = useState({
    domain: '',
    businessName: '',
    contactEmail: '',
    plan: 'starter' as PlanOption,
    notes: '',
    hostingAccess: false,
  })
  const [deployPanel, setDeployPanel] = useState<{ clientId: string; domain: string } | null>(null)

  const [markingPaid, setMarkingPaid] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<Record<string, string>>({})
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<ProfilePanel | null>(null)

  // ─── Show archived clients ───
  const [showArchived, setShowArchived] = useState(false)
  const [archivedClients, setArchivedClients] = useState<typeof clients | null>(null)
  const [loadingArchived, setLoadingArchived] = useState(false)

  async function refreshClients() {
    if (showArchived) {
      const result = await getAdminData({ data: { includeArchived: true } })
      setArchivedClients(result.clients)
    }
    await router.invalidate()
  }

  async function toggleShowArchived() {
    if (showArchived) {
      setShowArchived(false)
      return
    }
    setLoadingArchived(true)
    try {
      const result = await getAdminData({ data: { includeArchived: true } })
      setArchivedClients(result.clients)
      setShowArchived(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load archived clients')
    } finally {
      setLoadingArchived(false)
    }
  }

  const displayedClients = showArchived && archivedClients ? archivedClients : clients

  // ─── Sorting ───
  const [clientSort, setClientSort] = useState<{ key: string | null; dir: SortDir }>({
    key: null,
    dir: 'asc',
  })
  const [scanSort, setScanSort] = useState<{ key: string | null; dir: SortDir }>({
    key: null,
    dir: 'asc',
  })

  function toggleSort(
    current: { key: string | null; dir: SortDir },
    set: (v: { key: string | null; dir: SortDir }) => void,
    key: string,
  ) {
    if (current.key === key) {
      set({ key, dir: current.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      set({ key, dir: 'asc' })
    }
  }

  const sortedClients = sortRows(displayedClients, clientSort.key, clientSort.dir, (c, key) => {
    if (key === 'hasEmail') return c.contact_email ? 1 : 0
    if (key === 'created') return c.created_at
    if (key === 'status') return c.status
    return ''
  })

  const sortedScans = sortRows(recentScans, scanSort.key, scanSort.dir, (s, key) => {
    if (key === 'hasEmail') return s.email ? 1 : 0
    if (key === 'ars') return s.ars_score ?? -1
    if (key === 'created') return s.created_at
    return ''
  })

  // ─── Edit client ───
  type EditState = {
    clientId: string
    domain: string
    businessName: string
    contactEmail: string
    plan: PlanOption
    status: string
    notes: string
    saving: boolean
    error: string | null
  }
  const [edit, setEdit] = useState<EditState | null>(null)

  function openEdit(c: (typeof clients)[number]) {
    setEdit({
      clientId: c.id,
      domain: c.domain,
      businessName: c.business_name ?? '',
      contactEmail: c.contact_email ?? '',
      plan: (c.plan as PlanOption) ?? 'starter',
      status: c.status,
      notes: c.notes ?? '',
      saving: false,
      error: null,
    })
  }

  async function saveEdit() {
    if (!edit) return
    setEdit((p) => (p ? { ...p, saving: true, error: null } : p))
    try {
      await updateClient({
        data: {
          clientId: edit.clientId,
          domain: edit.domain,
          businessName: edit.businessName || undefined,
          contactEmail: edit.contactEmail,
          plan: edit.plan,
          status: edit.status as
            | 'pending_payment'
            | 'onboarding'
            | 'active'
            | 'past_due'
            | 'cancelled',
          notes: edit.notes || undefined,
        },
      })
      setEdit(null)
      await refreshClients()
    } catch (err) {
      setEdit((p) =>
        p ? { ...p, saving: false, error: err instanceof Error ? err.message : 'Save failed' } : p,
      )
    }
  }

  async function handleArchive(clientId: string) {
    if (!window.confirm('Archive this client? It will be hidden from the default list. Profiles and scan history are kept, and you can unarchive it any time.')) {
      return
    }
    setBusy(clientId, 'Archiving…')
    try {
      await archiveClient({ data: { clientId } })
      await refreshClients()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive')
    } finally {
      setBusy(clientId, null)
    }
  }

  async function handleUnarchive(clientId: string) {
    setBusy(clientId, 'Restoring…')
    try {
      await unarchiveClient({ data: { clientId } })
      await refreshClients()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unarchive')
    } finally {
      setBusy(clientId, null)
    }
  }

  async function handleRerunScan(url: string, clientId?: string) {
    const key = clientId ?? url
    setBusy(key, 'Scanning…')
    setRowMsg((m) => ({ ...m, [key]: '' }))
    try {
      const result = await rerunScan({ data: { url: ensureHttps(url), clientId } })
      setRowMsg((m) => ({ ...m, [key]: `Scan done — ARS ${result.ars_score}` }))
      await refreshClients()
    } catch (err) {
      setRowMsg((m) => ({ ...m, [key]: err instanceof Error ? err.message : 'Scan failed' }))
    } finally {
      setBusy(key, null)
    }
  }

  function setBusy(id: string, label: string | null) {
    setRowBusy((prev) => {
      const next = { ...prev }
      if (label) next[id] = label
      else delete next[id]
      return next
    })
  }

  async function handleApprove(profileId: string) {
    setApproving(profileId)
    setApproveError(null)
    try {
      await approveProfile({ data: { profileId } })
      setApproved((prev) => new Set([...prev, profileId]))
      await refreshClients()
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
      await refreshClients()
    } catch (err) {
      setDealError(err instanceof Error ? err.message : 'Failed to create deal')
    } finally {
      setDealLoading(false)
    }
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)
    try {
      const result = await createManualClient({
        data: {
          domain: add.domain,
          businessName: add.businessName,
          contactEmail: add.contactEmail,
          plan: add.plan,
          notes: add.notes || undefined,
          hostingAccess: add.hostingAccess,
          runBaselineScan: true,
        },
      })
      if (result.baselineScore != null) {
        alert(`Client created. Baseline score: ${result.baselineScore}/100`)
      }
      await router.navigate({ to: '/onboarding/$clientId', params: { clientId: result.clientId } })
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add client')
      setAddLoading(false)
    }
  }

  async function handleMarkPaid(clientId: string) {
    setMarkingPaid(clientId)
    try {
      const result = await markClientPaid({ data: { clientId } })
      await copyText(result.onboardingUrl, `paid-${clientId}`)
      await refreshClients()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark paid')
    } finally {
      setMarkingPaid(null)
    }
  }

  async function handleSetupHostname(clientId: string, currentHostname: string | null) {
    const suggested = currentHostname ?? 'ai.'
    const input = window.prompt(
      'Custom hostname for this client (e.g. ai.midstatehealth.net):',
      suggested,
    )
    if (!input || !input.trim()) return

    setBusy(clientId, 'Registering hostname…')
    setRowMsg((m) => ({ ...m, [clientId]: '' }))
    try {
      const result = await setupCustomHostname({ data: { clientId, hostname: input.trim() } })
      setRowMsg((m) => ({
        ...m,
        [clientId]:
          result.status === 'error'
            ? `Hostname error: ${result.error ?? 'unknown'}`
            : `Hostname ${result.hostname} → ${result.status}`,
      }))
      await refreshClients()
    } catch (err) {
      setRowMsg((m) => ({
        ...m,
        [clientId]: err instanceof Error ? err.message : 'Hostname setup failed',
      }))
    } finally {
      setBusy(clientId, null)
    }
  }

  async function handleRefreshHostname(clientId: string) {
    setBusy(clientId, 'Checking hostname…')
    setRowMsg((m) => ({ ...m, [clientId]: '' }))
    try {
      const result = await refreshHostnameStatus({ data: { clientId } })
      setRowMsg((m) => ({
        ...m,
        [clientId]:
          result.status === 'error'
            ? `Hostname error: ${result.error ?? 'unknown'}`
            : `Hostname ${result.status}`,
      }))
      await refreshClients()
    } catch (err) {
      setRowMsg((m) => ({
        ...m,
        [clientId]: err instanceof Error ? err.message : 'Hostname check failed',
      }))
    } finally {
      setBusy(clientId, null)
    }
  }

  async function openProfile(clientId: string, dom: string) {
    setPanel({
      clientId,
      domain: dom,
      profileId: null,
      status: null,
      llmsTxt: '',
      toolsJson: '',
      loading: true,
      saving: false,
      error: null,
      approving: false,
    })
    try {
      const p = await getClientProfile({ data: { clientId } })
      setPanel((prev) =>
        prev && prev.clientId === clientId
          ? {
              ...prev,
              loading: false,
              profileId: p?.id ?? null,
              status: p?.status ?? null,
              llmsTxt: p?.llmsTxt ?? '',
              toolsJson: p?.toolsJson ?? '',
              error: p ? null : 'No profile generated yet for this client.',
            }
          : prev,
      )
    } catch (err) {
      setPanel((prev) =>
        prev && prev.clientId === clientId
          ? { ...prev, loading: false, error: err instanceof Error ? err.message : 'Load failed' }
          : prev,
      )
    }
  }

  async function saveProfile() {
    if (!panel?.profileId) return
    setPanel((p) => (p ? { ...p, saving: true, error: null } : p))
    try {
      await updateProfile({
        data: { profileId: panel.profileId, llmsTxt: panel.llmsTxt, toolsJson: panel.toolsJson },
      })
      setPanel((p) => (p ? { ...p, saving: false } : p))
    } catch (err) {
      setPanel((p) =>
        p ? { ...p, saving: false, error: err instanceof Error ? err.message : 'Save failed' } : p,
      )
    }
  }

  async function approveFromPanel() {
    if (!panel?.profileId) return
    setPanel((p) => (p ? { ...p, approving: true, error: null } : p))
    try {
      // Save edits first, then approve.
      await updateProfile({
        data: { profileId: panel.profileId, llmsTxt: panel.llmsTxt, toolsJson: panel.toolsJson },
      })
      await approveProfile({ data: { profileId: panel.profileId } })
      setPanel(null)
      await refreshClients()
    } catch (err) {
      setPanel((p) =>
        p
          ? { ...p, approving: false, error: err instanceof Error ? err.message : 'Approve failed' }
          : p,
      )
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
        <div>
          <h1 className="text-2xl font-extrabold text-teal">Admin</h1>
          <p className="text-xs text-teal/60 mt-1">
            Service checklist:{' '}
            <a
              href="https://github.com/sgleisten/botcheck-app/blob/main/docs/agency-sop.md"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-teal"
            >
              docs/agency-sop.md
            </a>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setAddOpen((v) => !v)
              setDealOpen(false)
            }}
            className="bg-teal text-cream px-4 py-2 text-sm font-semibold rounded hover:opacity-90"
          >
            + Add Client
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-teal/60 hover:text-teal font-medium"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Add client (manual onboarding) */}
      {addOpen && (
        <Card className="space-y-4">
          <p className="text-sm text-teal/70">
            Create an agency client (no Stripe). Runs a baseline scan automatically, then opens
            onboarding to build their AI profile.
          </p>
          <form onSubmit={handleAddClient} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-teal/60 mb-1">Domain *</label>
              <input
                required
                value={add.domain}
                onChange={(e) => setAdd({ ...add, domain: e.target.value })}
                className="input-field"
                placeholder="example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-teal/60 mb-1">Business name *</label>
              <input
                required
                value={add.businessName}
                onChange={(e) => setAdd({ ...add, businessName: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs text-teal/60 mb-1">Contact email *</label>
              <input
                required
                type="email"
                value={add.contactEmail}
                onChange={(e) => setAdd({ ...add, contactEmail: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs text-teal/60 mb-1">Plan</label>
              <select
                value={add.plan}
                onChange={(e) => setAdd({ ...add, plan: e.target.value as PlanOption })}
                className="input-field"
              >
                <option value="starter">Starter</option>
                <option value="agency">Agency</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="hosting-access"
                type="checkbox"
                checked={add.hostingAccess}
                onChange={(e) => setAdd({ ...add, hostingAccess: e.target.checked })}
                className="rounded border-teal/40"
              />
              <label htmlFor="hosting-access" className="text-sm text-teal/80">
                We have hosting access — also deploy files on their actual site
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-teal/60 mb-1">Notes (optional)</label>
              <textarea
                value={add.notes}
                onChange={(e) => setAdd({ ...add, notes: e.target.value })}
                className="input-field min-h-[72px]"
                placeholder="Anything you want to remember about this client…"
              />
            </div>
            <div className="sm:col-span-2">
              {addError && <p className="text-sm text-coral mb-3">{addError}</p>}
              <Button type="submit" disabled={addLoading}>
                {addLoading ? 'Creating…' : 'Create & start onboarding →'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Create deal — collapsed by default for agency workflow */}
      <details className="group">
        <summary className="text-sm font-semibold uppercase tracking-wide text-teal/60 hover:text-teal mb-3 cursor-pointer list-none">
          + Create deal (Stripe / invoice — optional)
        </summary>
      <section className="mb-8">
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
                    <label className="block text-xs text-teal/60 mb-1">Monthly price (USD)</label>
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
                    <label className="block text-xs text-teal/60 mb-1">Or Stripe Price ID</label>
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
                {dealError && <p className="text-sm text-coral mb-3">{dealError}</p>}
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
              </div>
            )}
          </Card>
      </section>
      </details>

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
                    <td className="px-4 py-2 text-teal/70">{p.clients?.business_name ?? '—'}</td>
                    <td className="px-4 py-2 text-teal/60">{fmt(p.generated_at)}</td>
                    <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openProfile(p.client_id, p.clients?.domain ?? '')}
                        className="text-xs text-teal underline"
                      >
                        Review &amp; edit
                      </button>
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={approving === p.id}
                        className="bg-green text-cream px-3 py-1 text-xs font-semibold rounded hover:opacity-90 disabled:opacity-50"
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal/60">
            {showArchived ? 'Archived Clients' : 'Clients'} ({sortedClients.length})
          </h2>
          <button
            type="button"
            onClick={() => void toggleShowArchived()}
            disabled={loadingArchived}
            className="text-xs text-teal underline disabled:opacity-50"
          >
            {loadingArchived ? 'Loading…' : showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
        <div className="overflow-x-auto border-2 border-teal bg-cream card-shadow">
          <table className="w-full text-sm">
            <thead className="bg-teal text-cream text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Domain</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <SortHeader
                  label="Status"
                  sortKey="status"
                  activeKey={clientSort.key}
                  dir={clientSort.dir}
                  onSort={(key) => toggleSort(clientSort, setClientSort, key)}
                />
                <SortHeader
                  label="Has Email"
                  sortKey="hasEmail"
                  activeKey={clientSort.key}
                  dir={clientSort.dir}
                  onSort={(key) => toggleSort(clientSort, setClientSort, key)}
                />
                <SortHeader
                  label="Created"
                  sortKey="created"
                  activeKey={clientSort.key}
                  dir={clientSort.dir}
                  onSort={(key) => toggleSort(clientSort, setClientSort, key)}
                />
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal/20">
              {sortedClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-teal/50">
                    {showArchived ? 'No archived clients.' : 'No clients yet.'}
                  </td>
                </tr>
              ) : (
                sortedClients.map((c) => (
                  <tr key={c.id} className="hover:bg-orange/10 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-teal">{c.domain}</p>
                      <p className="text-xs text-teal/50">{c.contact_email ?? '—'}</p>
                      {c.dns_verified && (
                        <p className="text-xs text-green mt-0.5">✓ DNS verified</p>
                      )}
                      {c.custom_hostname && (
                        <p className="text-xs mt-0.5 text-teal/60">
                          <span className="font-mono">{c.custom_hostname}</span>{' '}
                          <span
                            className={
                              c.custom_hostname_status === 'active'
                                ? 'text-green font-semibold'
                                : c.custom_hostname_status === 'error'
                                  ? 'text-coral font-semibold'
                                  : 'text-teal/50'
                            }
                          >
                            {c.custom_hostname_status === 'active'
                              ? '✓ active'
                              : c.custom_hostname_status === 'error'
                                ? '✕ error'
                                : '… pending'}
                          </span>
                          {c.custom_hostname_status === 'error' && c.custom_hostname_error && (
                            <span className="block text-coral/80">{c.custom_hostname_error}</span>
                          )}
                        </p>
                      )}
                      {c.hosting_access && (
                        <p className="text-xs text-orange mt-0.5">+ on-site deploy</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-teal/80 whitespace-nowrap">
                      {'baselineScore' in c && c.baselineScore != null ? (
                        <span>
                          {c.baselineScore}
                          {'postDeliveryScore' in c && c.postDeliveryScore != null ? (
                            <span className="text-green font-semibold">
                              {' '}
                              → {c.postDeliveryScore}
                            </span>
                          ) : (
                            <span className="text-teal/40"> → —</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-teal/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-teal/70 capitalize">{c.plan ?? 'starter'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-teal/60">{c.contact_email ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-teal/60">{fmt(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDeployPanel({ clientId: c.id, domain: c.domain })}
                          className="text-xs bg-orange text-teal px-2 py-1 rounded font-semibold hover:opacity-90"
                        >
                          Deploy
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(`${window.location.origin}/onboarding/${c.id}`, `link-${c.id}`)
                          }
                          className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5"
                        >
                          {copied === `link-${c.id}` ? 'Copied!' : 'Copy Onboarding Link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRerunScan(c.domain, c.id)}
                          disabled={!!rowBusy[c.id]}
                          className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5 disabled:opacity-50"
                        >
                          Re-run Scan
                        </button>
                        <button
                          type="button"
                          onClick={() => openProfile(c.id, c.domain)}
                          className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5"
                        >
                          {c.profile ? 'View / Edit Profile' : 'Profile'}
                        </button>
                        {c.profile?.status === 'pending_review' && (
                          <button
                            type="button"
                            onClick={() => handleApprove(c.profile!.id)}
                            disabled={approving === c.profile.id}
                            className="text-xs bg-green text-cream px-2 py-1 rounded font-semibold disabled:opacity-50"
                          >
                            {approving === c.profile.id ? '…' : 'Approve'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSetupHostname(c.id, c.custom_hostname)}
                          disabled={!!rowBusy[c.id]}
                          className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5 disabled:opacity-50"
                        >
                          {c.custom_hostname ? 'Re-register Hostname' : 'Setup Hostname'}
                        </button>
                        {c.custom_hostname && (
                          <button
                            type="button"
                            onClick={() => handleRefreshHostname(c.id)}
                            disabled={!!rowBusy[c.id]}
                            className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5 disabled:opacity-50"
                          >
                            Check Hostname
                          </button>
                        )}
                        {c.checkout_token && c.status === 'pending_payment' && (
                          <button
                            type="button"
                            onClick={() =>
                              copyText(`${window.location.origin}/checkout/${c.checkout_token}`, c.id)
                            }
                            className="text-xs text-teal underline px-1"
                          >
                            {copied === c.id ? 'Copied!' : 'Checkout link'}
                          </button>
                        )}
                        {c.billing_type === 'invoice' && c.status === 'pending_payment' && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(c.id)}
                            disabled={markingPaid === c.id}
                            className="text-xs bg-green text-cream px-2 py-1 rounded font-semibold disabled:opacity-50"
                          >
                            {markingPaid === c.id ? '…' : 'Mark paid'}
                          </button>
                        )}
                        {showArchived ? (
                          <button
                            type="button"
                            onClick={() => handleUnarchive(c.id)}
                            disabled={!!rowBusy[c.id]}
                            className="text-xs border border-green text-green px-2 py-1 rounded hover:bg-green/5 disabled:opacity-50"
                          >
                            Unarchive
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleArchive(c.id)}
                            disabled={!!rowBusy[c.id]}
                            className="text-xs border border-coral text-coral px-2 py-1 rounded hover:bg-coral/5 disabled:opacity-50"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                      {(rowBusy[c.id] || rowMsg[c.id]) && (
                        <p className="text-xs text-teal/60 mt-1.5">
                          {rowBusy[c.id] ?? rowMsg[c.id]}
                        </p>
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
          Recent Scans ({sortedScans.length})
        </h2>
        <div className="overflow-x-auto border-2 border-teal bg-cream card-shadow">
          <table className="w-full text-sm">
            <thead className="bg-teal text-cream text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">URL</th>
                <SortHeader
                  label="ARS"
                  sortKey="ars"
                  activeKey={scanSort.key}
                  dir={scanSort.dir}
                  onSort={(key) => toggleSort(scanSort, setScanSort, key)}
                />
                <SortHeader
                  label="Has Email"
                  sortKey="hasEmail"
                  activeKey={scanSort.key}
                  dir={scanSort.dir}
                  onSort={(key) => toggleSort(scanSort, setScanSort, key)}
                />
                <SortHeader
                  label="Scanned"
                  sortKey="created"
                  activeKey={scanSort.key}
                  dir={scanSort.dir}
                  onSort={(key) => toggleSort(scanSort, setScanSort, key)}
                />
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal/20">
              {sortedScans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-teal/50">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                sortedScans.map((s) => (
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
                    <td className="px-4 py-2 text-teal/60">{s.email ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-2 text-teal/60">{fmt(s.created_at)}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => handleRerunScan(s.url, s.client_id ?? undefined)}
                        disabled={!!rowBusy[s.client_id ?? s.url]}
                        className="text-xs border border-teal/30 text-teal px-2 py-1 rounded hover:bg-teal/5 disabled:opacity-50"
                      >
                        Duplicate
                      </button>
                      {(rowBusy[s.client_id ?? s.url] || rowMsg[s.client_id ?? s.url]) && (
                        <p className="text-xs text-teal/60 mt-1">
                          {rowBusy[s.client_id ?? s.url] ?? rowMsg[s.client_id ?? s.url]}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Deploy panel */}
      {deployPanel && (
        <ClientDeployPanel
          clientId={deployPanel.clientId}
          domain={deployPanel.domain}
          onClose={() => setDeployPanel(null)}
          onUpdated={() => void refreshClients()}
        />
      )}

      {/* Profile view / edit panel */}
      {panel && (
        <div
          className="fixed inset-0 z-50 bg-teal-dark/40 flex items-start justify-center overflow-y-auto p-4"
          onClick={() => setPanel(null)}
        >
          <div
            className="bg-cream border-2 border-teal card-shadow w-full max-w-3xl my-8 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-teal">Profile — {panel.domain}</h3>
                {panel.status && (
                  <span className="text-xs text-teal/60">
                    Current status: <StatusBadge status={panel.status} />
                  </span>
                )}
              </div>
              <button
                onClick={() => setPanel(null)}
                className="text-sm text-teal/60 hover:text-teal"
              >
                Close
              </button>
            </div>

            {panel.loading ? (
              <p className="text-sm text-teal/60 py-8 text-center">Loading profile…</p>
            ) : !panel.profileId ? (
              <p className="text-sm text-teal/70 py-8 text-center">
                {panel.error ?? 'No profile generated yet.'} Run onboarding to generate one.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-teal/60 mb-1 uppercase tracking-wide">
                    llms.txt
                  </label>
                  <textarea
                    value={panel.llmsTxt}
                    onChange={(e) => setPanel((p) => (p ? { ...p, llmsTxt: e.target.value } : p))}
                    className="input-field font-mono text-xs min-h-[200px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-teal/60 mb-1 uppercase tracking-wide">
                    tools.json
                  </label>
                  <textarea
                    value={panel.toolsJson}
                    onChange={(e) => setPanel((p) => (p ? { ...p, toolsJson: e.target.value } : p))}
                    className="input-field font-mono text-xs min-h-[160px]"
                    placeholder="{ }"
                  />
                </div>
                {panel.error && <p className="text-sm text-coral">{panel.error}</p>}
                <div className="flex flex-wrap gap-3">
                  <Button onClick={saveProfile} disabled={panel.saving || panel.approving}>
                    {panel.saving ? 'Saving…' : 'Save changes'}
                  </Button>
                  {panel.status === 'pending_review' && (
                    <button
                      type="button"
                      onClick={approveFromPanel}
                      disabled={panel.approving || panel.saving}
                      className="bg-green text-cream px-4 py-2 text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50"
                    >
                      {panel.approving ? 'Approving…' : 'Save & Approve → live'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit client panel */}
      {edit && (
        <div
          className="fixed inset-0 z-50 bg-teal-dark/40 flex items-start justify-center overflow-y-auto p-4"
          onClick={() => setEdit(null)}
        >
          <div
            className="bg-cream border-2 border-teal card-shadow w-full max-w-2xl my-8 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-teal">Edit client</h3>
              <button
                onClick={() => setEdit(null)}
                className="text-sm text-teal/60 hover:text-teal"
              >
                Close
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-teal/60 mb-1">Domain</label>
                <input
                  value={edit.domain}
                  onChange={(e) => setEdit((p) => (p ? { ...p, domain: e.target.value } : p))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Business name</label>
                <input
                  value={edit.businessName}
                  onChange={(e) =>
                    setEdit((p) => (p ? { ...p, businessName: e.target.value } : p))
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Contact email</label>
                <input
                  type="email"
                  value={edit.contactEmail}
                  onChange={(e) =>
                    setEdit((p) => (p ? { ...p, contactEmail: e.target.value } : p))
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Plan</label>
                <select
                  value={edit.plan}
                  onChange={(e) =>
                    setEdit((p) => (p ? { ...p, plan: e.target.value as PlanOption } : p))
                  }
                  className="input-field"
                >
                  <option value="starter">Starter</option>
                  <option value="agency">Agency</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-teal/60 mb-1">Status</label>
                <select
                  value={edit.status}
                  onChange={(e) => setEdit((p) => (p ? { ...p, status: e.target.value } : p))}
                  className="input-field"
                >
                  <option value="pending_payment">Pending payment</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-teal/60 mb-1">Notes</label>
                <textarea
                  value={edit.notes}
                  onChange={(e) => setEdit((p) => (p ? { ...p, notes: e.target.value } : p))}
                  className="input-field min-h-[72px]"
                  placeholder="Anything you want to remember about this client…"
                />
              </div>
            </div>

            {edit.error && <p className="text-sm text-coral">{edit.error}</p>}
            <Button onClick={saveEdit} disabled={edit.saving}>
              {edit.saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
