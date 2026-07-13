import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  getClientDeployData,
  runPostDeliveryScan,
  recordBrandCheck,
} from '@/lib/admin.functions'
import { setupCustomHostname, refreshHostnameStatus } from '@/lib/hostname.functions'
import { Button } from '@/components/ui/Button'

type DeployData = Awaited<ReturnType<typeof getClientDeployData>>

type Props = {
  clientId: string
  domain: string
  onClose: () => void
  onUpdated: () => void
}

function ScoreDelta({ baseline, post }: { baseline: number | null; post: number | null }) {
  if (baseline == null && post == null) {
    return <p className="text-sm text-teal/60">No scans recorded yet.</p>
  }
  if (post == null) {
    return (
      <p className="text-sm text-teal/80">
        Baseline: <strong>{baseline ?? '—'}</strong>/100 — run post-delivery scan after deploy.
      </p>
    )
  }
  const delta = baseline != null ? post - baseline : null
  return (
    <div className="flex flex-wrap items-baseline gap-3 text-sm">
      <span>
        Baseline: <strong>{baseline ?? '—'}</strong>
      </span>
      <span>→</span>
      <span>
        After: <strong className="text-green">{post}</strong>/100
      </span>
      {delta != null && (
        <span className={delta >= 0 ? 'text-green font-semibold' : 'text-coral font-semibold'}>
          ({delta >= 0 ? '+' : ''}
          {delta})
        </span>
      )}
    </div>
  )
}

export function ClientDeployPanel({ clientId, domain, onClose, onUpdated }: Props) {
  const [data, setData] = useState<DeployData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [hostnameInput, setHostnameInput] = useState('')
  const [brandForm, setBrandForm] = useState<{
    mentionCount: string
    checkType: 'baseline' | 'post_delivery'
  }>({ mentionCount: '0', checkType: 'baseline' })
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await getClientDeployData({ data: { clientId } })
      setData(result)
      setHostnameInput(result.client.customHostname ?? `ai.${result.client.domain.replace(/^https?:\/\//i, '')}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deploy data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [clientId])

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handlePostScan() {
    setBusy('post-scan')
    try {
      const result = await runPostDeliveryScan({ data: { clientId } })
      await load()
      onUpdated()
      alert(`Post-delivery scan complete — score: ${result.arsScore}/100`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleSetupHostname() {
    if (!hostnameInput.trim()) return
    setBusy('hostname')
    try {
      await setupCustomHostname({ data: { clientId, hostname: hostnameInput.trim() } })
      await load()
      onUpdated()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hostname setup failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRefreshHostname() {
    setBusy('hostname-check')
    try {
      await refreshHostnameStatus({ data: { clientId } })
      await load()
      onUpdated()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hostname check failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleBrandCheck(e: React.FormEvent) {
    e.preventDefault()
    setBusy('brand')
    try {
      await recordBrandCheck({
        data: {
          clientId,
          checkType: brandForm.checkType,
          mentionCount: Number(brandForm.mentionCount),
          modelCount: 5,
        },
      })
      setBrandForm({ mentionCount: '0', checkType: 'post_delivery' })
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to record brand check')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-teal-dark/40 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream border-2 border-teal card-shadow w-full max-w-3xl my-8 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-teal">Deploy — {domain}</h3>
            <p className="text-xs text-teal/60 mt-1">
              Cloudflare for every client{data?.client.hostingAccess ? ' + on-site files' : ''}.{' '}
              <a
                href="https://github.com/sgleisten/botcheck-app/blob/main/docs/agency-sop.md"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Full SOP
              </a>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-teal/60 hover:text-teal">
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-teal/60 py-8 text-center">Loading…</p>
        ) : error ? (
          <p className="text-sm text-coral">{error}</p>
        ) : data ? (
          <>
            {/* Score proof */}
            <section className="border border-teal/20 rounded-lg p-4 space-y-3 bg-white/50">
              <h4 className="text-xs font-bold uppercase tracking-wide text-teal/70">
                isitagentready.com score
              </h4>
              <ScoreDelta baseline={data.scores.baseline} post={data.scores.postDelivery} />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handlePostScan()}
                  disabled={busy === 'post-scan'}
                >
                  {busy === 'post-scan' ? 'Scanning…' : 'Run post-delivery scan'}
                </Button>
                <Link
                  to="/print/client/$clientId"
                  params={{ clientId }}
                  target="_blank"
                  className="text-sm border border-teal/30 text-teal px-3 py-2 rounded hover:bg-teal/5"
                >
                  Client report (PDF) →
                </Link>
              </div>
            </section>

            {/* Cloudflare — always */}
            <section className="border border-teal/20 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-teal/70">
                1. Cloudflare (every client)
              </h4>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-teal/60 mb-1">Custom hostname</label>
                  <input
                    value={hostnameInput}
                    onChange={(e) => setHostnameInput(e.target.value)}
                    className="input-field font-mono text-sm"
                    placeholder="ai.example.com"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSetupHostname()}
                  disabled={busy === 'hostname'}
                >
                  {busy === 'hostname' ? 'Registering…' : 'Register hostname'}
                </Button>
                {data.client.customHostname && (
                  <button
                    type="button"
                    onClick={() => void handleRefreshHostname()}
                    disabled={busy === 'hostname-check'}
                    className="text-sm border border-teal/30 px-3 py-2 rounded"
                  >
                    Check status
                  </button>
                )}
              </div>
              <p className="text-xs text-teal/60">
                Client CNAME: <code className="bg-teal/5 px-1">{hostnameInput.split('.')[0] || 'ai'}</code>{' '}
                → <code className="bg-teal/5 px-1">{data.fallbackOrigin}</code>
              </p>
              {data.client.customHostname && (
                <p className="text-xs">
                  Status:{' '}
                  <span
                    className={
                      data.client.customHostnameStatus === 'active'
                        ? 'text-green font-semibold'
                        : 'text-orange'
                    }
                  >
                    {data.client.customHostnameStatus ?? 'pending'}
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyText(data.urls.dnsSetup, 'dns')}
                  className="text-xs text-teal underline"
                >
                  {copied === 'dns' ? 'Copied!' : 'Copy DNS setup link for client'}
                </button>
              </div>
              {data.profile?.status === 'live' && (
                <div className="space-y-1 text-xs font-mono text-teal/70 break-all">
                  <p>Live surfaces (via Cloudflare or hosted URL):</p>
                  <p>{data.urls.llmsTxt}</p>
                  <p>{data.urls.toolsJson}</p>
                  <p>{data.urls.indexJson}</p>
                  <p>{data.urls.jsonld}</p>
                </div>
              )}
            </section>

            {/* On-site — when hosting access */}
            {data.client.hostingAccess && data.profile && (
              <section className="border border-orange/30 rounded-lg p-4 space-y-3 bg-orange/5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-teal/70">
                  2. On their site (hosting access)
                </h4>
                <ul className="text-xs text-teal/80 space-y-1 list-disc pl-4">
                  {data.onSiteChecklist.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
                <div className="grid gap-2">
                  {[
                    ['llms.txt', data.profile.llmsTxt],
                    ['tools.json', data.profile.toolsJson],
                    ['robots.txt additions', data.profile.robotsTxtAdditions],
                    ['JSON-LD snippet', data.jsonLdSnippet],
                  ].map(([label, content]) => (
                    <div key={label as string} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(content as string, label as string)}
                        className="text-xs border border-teal/30 px-2 py-1 rounded shrink-0"
                        disabled={!(content as string)?.trim()}
                      >
                        {copied === label ? 'Copied!' : `Copy ${label}`}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Brand visibility */}
            <section className="border border-teal/20 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-teal/70">
                Brand visibility (ChatGPT, Claude, etc.)
              </h4>
              <p className="text-xs text-teal/60">
                Run prompts in Cloudflare ai-brand-visibility-template, then record how many of 5
                models mentioned the brand.
              </p>
              {data.brandChecks.length > 0 && (
                <ul className="text-xs space-y-1">
                  {data.brandChecks.map((bc) => (
                    <li key={bc.id} className="text-teal/80">
                      {bc.check_type.replace(/_/g, ' ')}: {bc.mention_count}/{bc.model_count} models
                      mentioned — {new Date(bc.created_at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={(e) => void handleBrandCheck(e)} className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-teal/60 mb-1">Check type</label>
                  <select
                    value={brandForm.checkType}
                    onChange={(e) =>
                      setBrandForm((f) => ({
                        ...f,
                        checkType: e.target.value as 'baseline' | 'post_delivery',
                      }))
                    }
                    className="input-field text-sm"
                  >
                    <option value="baseline">Baseline</option>
                    <option value="post_delivery">Post-delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-teal/60 mb-1">Models mentioning brand (0–5)</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={brandForm.mentionCount}
                    onChange={(e) => setBrandForm((f) => ({ ...f, mentionCount: e.target.value }))}
                    className="input-field text-sm w-20"
                  />
                </div>
                <Button type="submit" disabled={busy === 'brand'}>
                  {busy === 'brand' ? 'Saving…' : 'Record'}
                </Button>
              </form>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
