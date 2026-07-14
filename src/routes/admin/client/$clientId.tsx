import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  getClientDetail,
  updateProfile,
  approveProfile,
  runPostDeliveryScan,
  runBaselineScan,
  generateBrandPrompts,
  recordBrandVisibilityResult,
  deleteBrandVisibilityResult,
  saveReportSnapshot,
  deleteReportSnapshot,
  setBrandToolUrl,
  uploadBrandVisibilityCsv,
  fetchBrandVisibilityCsv,
  getBrandVisibilityExportContent,
  deleteBrandVisibilityExport,
} from '@/lib/admin.functions'
import { setupCustomHostname, refreshHostnameStatus } from '@/lib/hostname.functions'
import { Button } from '@/components/ui/Button'

export const Route = createFileRoute('/admin/client/$clientId')({
  loader: ({ params }) => getClientDetail({ data: { clientId: params.clientId } }),
  component: ClientWorkspace,
})

type Detail = Awaited<ReturnType<typeof getClientDetail>>

const BRAND_MODELS = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Llama', 'Mistral', 'Copilot']

function ensureHttps(domain: string) {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
}

function cleanDomain(domain: string) {
  return domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
}

function brandToolEmbedUrl(baseUrl: string, domain: string) {
  const root = baseUrl.replace(/\/+$/, '')
  const site = encodeURIComponent(cleanDomain(domain))
  return `${root}/?site=${site}`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-2 border-teal/20 rounded-lg bg-white/60 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-teal">{title}</h2>
        {subtitle && <p className="text-xs text-teal/60 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={!text?.trim()}
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
      className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5 disabled:opacity-40"
    >
      {done ? 'Copied!' : label}
    </button>
  )
}

function ScoreChip({
  label,
  value,
  href,
}: {
  label: string
  value: number | null
  href?: string | null
}) {
  const color =
    value == null ? 'text-teal/40' : value >= 70 ? 'text-green' : value >= 40 ? 'text-orange' : 'text-coral'
  const inner = (
    <>
      <div className="text-[10px] font-bold uppercase tracking-wide text-teal/60">{label}</div>
      <div className={`text-3xl font-black ${color}`}>{value ?? '—'}</div>
      {href && value != null && <div className="text-[10px] text-teal/50 mt-0.5">view full scan →</div>}
    </>
  )
  if (href && value != null) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block text-center px-4 py-3 bg-cream border border-teal/15 rounded-lg hover:border-teal/40 hover:bg-teal/5 transition"
      >
        {inner}
      </a>
    )
  }
  return (
    <div className="text-center px-4 py-3 bg-cream border border-teal/15 rounded-lg">{inner}</div>
  )
}

function ClientWorkspace() {
  const router = useRouter()
  const data = Route.useLoaderData() as Detail
  const { clientId } = Route.useParams()

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Documents editing
  const [llmsTxt, setLlmsTxt] = useState(data.profile?.llmsTxt ?? '')
  const [toolsJson, setToolsJson] = useState(data.profile?.toolsJson ?? '')

  // Cloudflare
  const [hostname, setHostname] = useState(
    data.client.customHostname ?? `ai.${data.client.domain.replace(/^https?:\/\//i, '')}`,
  )

  // Brand visibility
  const [prompts, setPrompts] = useState<string[]>([])
  const [brandPhase, setBrandPhase] = useState<'baseline' | 'post_delivery'>('baseline')
  const [toolUrlInput, setToolUrlInput] = useState(data.brandToolUrl ?? '')

  async function run(key: string, fn: () => Promise<void | string>) {
    setBusy(key)
    setErr(null)
    setMsg(null)
    try {
      const result = await fn()
      if (typeof result === 'string') setMsg(result)
      await router.invalidate()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const cname = data.client.customHostname
    ? { name: data.client.customHostname.split('.')[0], target: data.fallbackOrigin }
    : { name: hostname.split('.')[0] || 'ai', target: data.fallbackOrigin }

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/admin" className="text-xs text-teal/60 hover:text-teal">
              ← Back to admin
            </Link>
            <h1 className="text-2xl font-extrabold text-teal mt-1">
              {data.client.businessName ?? data.client.domain}
            </h1>
            <p className="text-sm text-teal/70">
              <a
                href={ensureHttps(data.client.domain)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {data.client.domain}
              </a>{' '}
              · <span className="capitalize">{data.client.status.replace(/_/g, ' ')}</span>
              {data.client.contactEmail ? ` · ${data.client.contactEmail}` : ''}
            </p>
            <p className="text-xs text-teal/50 mt-1">Client since {fmtDate(data.client.createdAt)}</p>
          </div>
          <a
            href={data.urls.clientReport}
            target="_blank"
            rel="noreferrer"
            className="text-sm border-2 border-teal text-teal px-3 py-2 rounded font-semibold hover:bg-teal/5 shrink-0"
          >
            Composite PDF →
          </a>
        </div>

        {msg && <p className="text-sm text-teal bg-green/10 border-2 border-green/40 p-2 rounded">{msg}</p>}
        {err && <p className="text-sm text-coral bg-coral/10 border-2 border-coral p-2 rounded">{err}</p>}

        {/* Scores */}
        <Section title="Agent Readiness Score" subtitle="Measured before and after your work.">
          <div className="grid grid-cols-3 gap-3">
            <ScoreChip
              label="Baseline"
              value={data.scans.baseline?.score ?? null}
              href={data.scans.baseline ? `/report/${data.scans.baseline.id}` : null}
            />
            <ScoreChip
              label="Post-delivery"
              value={data.scans.post?.score ?? null}
              href={data.scans.post ? `/report/${data.scans.post.id}` : null}
            />
            <ScoreChip
              label="Change"
              value={
                data.scans.baseline?.score != null && data.scans.post?.score != null
                  ? data.scans.post.score - data.scans.baseline.score
                  : null
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy === 'rescan'}
              onClick={() =>
                run('rescan', async () => {
                  const r = await runBaselineScan({ data: { clientId } })
                  return `Baseline scan saved — ${r.arsScore}/100`
                })
              }
            >
              {busy === 'rescan' ? 'Scanning…' : 'Run baseline scan'}
            </Button>
            <Button
              type="button"
              disabled={busy === 'postscan'}
              onClick={() =>
                run('postscan', async () => {
                  const r = await runPostDeliveryScan({ data: { clientId } })
                  return `Post-delivery scan complete — ${r.arsScore}/100`
                })
              }
            >
              {busy === 'postscan' ? 'Scanning…' : 'Run post-delivery scan'}
            </Button>
          </div>
        </Section>

        {/* Pre-work findings */}
        <Section
          title="Pre-work findings (baseline)"
          subtitle={`From the baseline scan${
            data.scans.baseline?.createdAt ? ` on ${fmtDate(data.scans.baseline.createdAt)}` : ''
          }.`}
        >
          {data.scans.baseline ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-cream border border-teal/15 rounded p-3">
                  Site readiness: <strong>{data.scans.baseline.siteReadiness ?? '—'}</strong>/100
                </div>
                <div className="bg-cream border border-teal/15 rounded p-3">
                  AI discoverability: <strong>{data.scans.baseline.discoverabilityScore ?? '—'}</strong>/100
                </div>
              </div>
              {data.scans.baseline.categories.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.scans.baseline.categories.map((c) => (
                    <div key={c.key} className="text-xs bg-cream border border-teal/15 rounded p-2">
                      <span className="font-semibold capitalize">{c.label}</span>: {c.score ?? '—'}
                      {c.finding ? <p className="text-teal/70 mt-1">{c.finding}</p> : null}
                    </div>
                  ))}
                </div>
              )}
              {data.scans.baseline.topFailures.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-coral uppercase tracking-wide">Top failures</p>
                  <ul className="list-disc pl-5 text-sm text-teal/80 mt-1">
                    {data.scans.baseline.topFailures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.scans.baseline.quickWins.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-green uppercase tracking-wide">Quick wins</p>
                  <ul className="list-disc pl-5 text-sm text-teal/80 mt-1">
                    {data.scans.baseline.quickWins.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-teal/60">
              No baseline scan yet. Run “Re-run baseline scan” above.
            </p>
          )}
        </Section>

        {/* Documents */}
        <Section title="Generated documents" subtitle="The AI discovery files for this client.">
          {data.profile ? (
            <div className="space-y-4">
              <p className="text-xs text-teal/60">
                Profile status: <strong>{data.profile.status}</strong> (v{data.profile.version})
                {data.profile.generatedAt ? ` · generated ${fmtDate(data.profile.generatedAt)}` : ''}
              </p>

              <div>
                <label className="block text-xs font-bold text-teal/70 mb-1">llms.txt</label>
                <textarea
                  value={llmsTxt}
                  onChange={(e) => setLlmsTxt(e.target.value)}
                  rows={8}
                  className="input-field font-mono text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-teal/70 mb-1">tools.json</label>
                <textarea
                  value={toolsJson}
                  onChange={(e) => setToolsJson(e.target.value)}
                  rows={6}
                  className="input-field font-mono text-xs w-full"
                />
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  type="button"
                  disabled={busy === 'save'}
                  onClick={() =>
                    run('save', async () => {
                      await updateProfile({
                        data: { profileId: data.profile!.id, llmsTxt, toolsJson },
                      })
                      return 'Documents saved.'
                    })
                  }
                >
                  {busy === 'save' ? 'Saving…' : 'Save documents'}
                </Button>
                {data.profile.status !== 'live' && (
                  <Button
                    type="button"
                    disabled={busy === 'approve'}
                    onClick={() =>
                      run('approve', async () => {
                        await approveProfile({ data: { profileId: data.profile!.id } })
                        return 'Profile approved and live.'
                      })
                    }
                  >
                    {busy === 'approve' ? 'Approving…' : 'Approve & publish'}
                  </Button>
                )}
                <CopyButton text={data.profile.robotsTxtAdditions} label="Copy robots.txt additions" />
                <CopyButton text={data.jsonLdSnippet} label="Copy JSON-LD snippet" />
                <CopyButton text={data.indexJsonPreview} label="Copy index.json" />
              </div>

              {data.profile.status === 'live' && (
                <div className="text-xs font-mono text-teal/70 break-all space-y-1 border-t border-teal/10 pt-3">
                  <p className="font-sans font-semibold text-teal/60">Live hosted surfaces:</p>
                  <p>{data.urls.llmsTxt}</p>
                  <p>{data.urls.toolsJson}</p>
                  <p>{data.urls.indexJson}</p>
                  <p>{data.urls.jsonld}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-teal/60">
              No profile yet. Complete onboarding:{' '}
              <a href={data.urls.onboarding} target="_blank" rel="noreferrer" className="underline">
                {data.urls.onboarding}
              </a>
            </p>
          )}
        </Section>

        {/* Cloudflare / DNS */}
        <Section
          title="Cloudflare custom domain"
          subtitle="Serve the profile on the client's own subdomain (every client)."
        >
          {!data.cloudflareConfigured && (
            <p className="text-sm text-coral bg-coral/10 border-2 border-coral p-2 rounded">
              Cloudflare isn’t configured on this environment. Add CLOUDFLARE_API_TOKEN and
              CLOUDFLARE_ZONE_ID in Vercel → Settings → Environment Variables (Production), then
              redeploy.
            </p>
          )}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-teal/60 mb-1">Custom hostname</label>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="input-field font-mono text-sm w-full"
                placeholder="ai.example.com"
              />
            </div>
            <Button
              type="button"
              disabled={busy === 'hostname' || !data.cloudflareConfigured}
              onClick={() =>
                run('hostname', async () => {
                  await setupCustomHostname({ data: { clientId, hostname: hostname.trim() } })
                  return 'Hostname registered with Cloudflare.'
                })
              }
            >
              {busy === 'hostname' ? 'Registering…' : 'Register hostname'}
            </Button>
            {data.client.customHostname && (
              <button
                type="button"
                disabled={busy === 'hostcheck'}
                onClick={() =>
                  run('hostcheck', async () => {
                    await refreshHostnameStatus({ data: { clientId } })
                    return 'Status refreshed.'
                  })
                }
                className="text-sm border border-teal/30 px-3 py-2 rounded"
              >
                Check status
              </button>
            )}
          </div>

          <div className="text-sm space-y-2">
            <p className="text-teal/80">
              Client adds one CNAME at their DNS provider:
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="bg-cream border border-teal/15 rounded p-2">Type: CNAME</div>
              <div className="bg-cream border border-teal/15 rounded p-2">Name: {cname.name}</div>
              <div className="bg-cream border border-teal/15 rounded p-2">Target: {cname.target}</div>
            </div>
            {data.client.customHostname && (
              <p>
                Status:{' '}
                <span
                  className={
                    data.client.customHostnameStatus === 'active'
                      ? 'text-green font-semibold'
                      : 'text-orange font-semibold'
                  }
                >
                  {data.client.customHostnameStatus ?? 'pending'}
                </span>
                {data.client.customHostnameError ? (
                  <span className="text-coral"> — {data.client.customHostnameError}</span>
                ) : null}
              </p>
            )}
            <CopyButton text={data.urls.dnsSetup} label="Copy DNS setup link for client" />
          </div>
        </Section>

        {/* On-site (hosting access) */}
        {data.client.hostingAccess && data.profile && (
          <Section title="On their website (hosting access)" subtitle="Additive discovery on the root domain.">
            <ul className="text-xs text-teal/80 list-disc pl-5 space-y-1">
              {data.onSiteChecklist.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={data.profile.llmsTxt} label="Copy llms.txt" />
              <CopyButton text={data.profile.toolsJson} label="Copy tools.json" />
              <CopyButton text={data.profile.robotsTxtAdditions} label="Copy robots.txt additions" />
              <CopyButton text={data.jsonLdSnippet} label="Copy JSON-LD" />
            </div>
          </Section>
        )}

        {/* Brand visibility */}
        <Section
          title="Brand visibility across LLMs"
          subtitle="Whether AI assistants mention this business for relevant questions."
        >
          {/* Tool URL setting — paste your deployed worker URL once; it embeds everywhere. */}
          <div className="bg-cream border border-teal/15 rounded p-3 space-y-2">
            <label className="block text-xs font-bold text-teal/70">
              Your deployed brand-visibility tool URL
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={toolUrlInput}
                onChange={(e) => setToolUrlInput(e.target.value)}
                placeholder="https://ai-brand-visibility-template.your-account.workers.dev"
                className="input-field font-mono text-xs flex-1 min-w-[260px]"
              />
              <button
                type="button"
                disabled={busy === 'toolurl'}
                onClick={() =>
                  run('toolurl', async () => {
                    await setBrandToolUrl({ data: { url: toolUrlInput.trim() } })
                    return toolUrlInput.trim() ? 'Tool URL saved.' : 'Tool URL cleared.'
                  })
                }
                className="text-xs bg-teal text-cream px-3 py-2 rounded font-semibold hover:opacity-90"
              >
                {busy === 'toolurl' ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="text-[11px] text-teal/50">
              Don’t have it yet?{' '}
              <a href={data.brandToolDeployUrl} target="_blank" rel="noreferrer" className="underline">
                Deploy the ai-brand-visibility-template
              </a>{' '}
              (no API keys), then paste the resulting <code>*.workers.dev</code> URL here. Saved for all
              clients.
            </p>
          </div>

          {data.brandToolConfigured ? (
            <BrandToolPanel
              toolUrl={data.brandToolUrl}
              embedUrl={brandToolEmbedUrl(data.brandToolUrl, data.client.domain)}
              domain={data.client.domain}
            />
          ) : (
            <p className="text-xs text-teal/70">
              Save your tool URL above to embed it here. Then run the prompts below and record which
              models mentioned the business.
            </p>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              disabled={busy === 'prompts'}
              onClick={() =>
                run('prompts', async () => {
                  const r = await generateBrandPrompts({ data: { clientId } })
                  setPrompts(r.prompts)
                  return `Generated ${r.prompts.length} prompts.`
                })
              }
            >
              {busy === 'prompts' ? 'Generating…' : 'Generate prompts from profile'}
            </Button>
            {prompts.length > 0 && (
              <CopyButton text={prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')} label="Copy all prompts" />
            )}
            <select
              value={brandPhase}
              onChange={(e) => setBrandPhase(e.target.value as 'baseline' | 'post_delivery')}
              className="input-field text-sm"
            >
              <option value="baseline">Recording: Baseline</option>
              <option value="post_delivery">Recording: Post-delivery</option>
            </select>
          </div>

          {prompts.length > 0 && (
            <div className="space-y-2 border-t border-teal/10 pt-3">
              <p className="text-xs font-bold text-teal/70 uppercase">Suggested prompts — record a result</p>
              {prompts.map((p, i) => (
                <BrandPromptRow
                  key={i}
                  prompt={p}
                  phase={brandPhase}
                  clientId={clientId}
                  onRecorded={() => run('brand-record', async () => 'Result recorded.')}
                />
              ))}
            </div>
          )}

          <BrandCsvSection
            clientId={clientId}
            exports={data.brand.exports}
            phase={brandPhase}
            onPhaseChange={setBrandPhase}
            run={run}
            busy={busy}
          />

          <BrandResultsTable
            title={`Baseline results (${data.brand.baselineSummary.mentionCount}/${data.brand.baselineSummary.modelCount} models mentioned)`}
            rows={data.brand.baseline}
            onDelete={(id) =>
              run('brand-del', async () => {
                await deleteBrandVisibilityResult({ data: { id } })
                return 'Result removed.'
              })
            }
          />
          <BrandResultsTable
            title={`Post-delivery results (${data.brand.postSummary.mentionCount}/${data.brand.postSummary.modelCount} models mentioned)`}
            rows={data.brand.post}
            onDelete={(id) =>
              run('brand-del', async () => {
                await deleteBrandVisibilityResult({ data: { id } })
                return 'Result removed.'
              })
            }
          />
        </Section>

        {/* Reports / snapshots */}
        <Section
          title="Dated report snapshots"
          subtitle="Freeze a pre-work and post-work record you can save as a PDF."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy === 'snap-pre'}
              onClick={() =>
                run('snap-pre', async () => {
                  await saveReportSnapshot({ data: { clientId, phase: 'pre' } })
                  return 'Pre-work snapshot saved.'
                })
              }
            >
              {busy === 'snap-pre' ? 'Saving…' : 'Save PRE snapshot'}
            </Button>
            <Button
              type="button"
              disabled={busy === 'snap-post'}
              onClick={() =>
                run('snap-post', async () => {
                  await saveReportSnapshot({ data: { clientId, phase: 'post' } })
                  return 'Post-work snapshot saved.'
                })
              }
            >
              {busy === 'snap-post' ? 'Saving…' : 'Save POST snapshot'}
            </Button>
          </div>

          {data.snapshots.length > 0 ? (
            <ul className="divide-y divide-teal/10 border border-teal/15 rounded">
              {data.snapshots.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="uppercase text-xs font-bold text-teal/60">{s.phase}</span> ·{' '}
                    Score {s.ars_score ?? '—'} · {fmtDate(s.captured_at)}
                    {s.label ? ` · ${s.label}` : ''}
                  </span>
                  <span className="flex gap-2 shrink-0">
                    <a
                      href={`${data.urls.clientReport}?snapshot=${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5"
                    >
                      Open PDF →
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        run('snap-del', async () => {
                          await deleteReportSnapshot({ data: { id: s.id } })
                          return 'Snapshot deleted.'
                        })
                      }
                      className="text-xs text-coral hover:underline"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-teal/60">No snapshots yet.</p>
          )}
        </Section>
      </div>
    </div>
  )
}

function BrandToolPanel({
  toolUrl,
  embedUrl,
  domain,
}: {
  toolUrl: string
  embedUrl: string
  domain: string
}) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen])

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-teal/70">
        Automated multi-model testing for <strong>{cleanDomain(domain)}</strong> (GPT, Claude, Gemini,
        Llama, Mistral — no API keys).
      </p>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5"
        >
          Full screen
        </button>
        <a
          href={embedUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5"
        >
          Open in new tab →
        </a>
      </div>
    </div>
  )

  const frame = (
    <iframe
      src={embedUrl}
      title="AI brand visibility"
      className="w-full border-2 border-teal/20 rounded bg-white min-h-[85vh]"
      style={{ height: '85vh' }}
    />
  )

  return (
    <div className="space-y-2">
      {toolbar}
      {frame}
      <p className="text-[11px] text-teal/50">
        Use <strong>Full screen</strong> for easier scrolling. After a test completes, download the CSV
        from the tool and upload it below to save it on this client profile.
      </p>

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-cream">
          <div className="flex items-center justify-between gap-3 border-b border-teal/20 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-bold text-teal">Brand visibility tool</p>
              <p className="text-xs text-teal/60">{cleanDomain(domain)}</p>
            </div>
            <div className="flex gap-2">
              <a
                href={toolUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5"
              >
                Open tool home →
              </a>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                className="text-xs bg-teal text-cream px-3 py-1 rounded font-semibold hover:opacity-90"
              >
                Close (Esc)
              </button>
            </div>
          </div>
          <iframe
            src={embedUrl}
            title="AI brand visibility full screen"
            className="flex-1 w-full bg-white"
          />
        </div>
      )}
    </div>
  )
}

type BrandExportRow = Detail['brand']['exports'][number]

function BrandCsvSection({
  clientId,
  exports,
  phase,
  onPhaseChange,
  run,
  busy,
}: {
  clientId: string
  exports: BrandExportRow[]
  phase: 'baseline' | 'post_delivery'
  onPhaseChange: (phase: 'baseline' | 'post_delivery') => void
  run: (key: string, fn: () => Promise<void | string>) => Promise<void>
  busy: string | null
}) {
  const [resultId, setResultId] = useState('')
  const [label, setLabel] = useState('')
  const csvBusy = busy?.startsWith('csv') ?? false

  async function downloadExport(exportId: string) {
    const { filename, csvContent } = await getBrandVisibilityExportContent({ data: { exportId } })
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border-t border-teal/10 pt-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-teal/70 uppercase">Saved CSV reports</p>
        <p className="text-[11px] text-teal/50 mt-1">
          Download the CSV from the Cloudflare tool after a test, then upload it here. Rows are imported
          into the results tables below.
        </p>
      </div>

      <div className="bg-cream border border-teal/15 rounded p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs font-bold text-teal/70">Save as</label>
          <select
            value={phase}
            onChange={(e) => onPhaseChange(e.target.value as 'baseline' | 'post_delivery')}
            className="input-field text-sm"
          >
            <option value="baseline">Baseline</option>
            <option value="post_delivery">Post-delivery</option>
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label (e.g. March baseline)"
            className="input-field text-xs flex-1 min-w-[180px]"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs font-bold text-teal/70 shrink-0">Upload CSV</label>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={csvBusy}
            className="text-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const csvContent = await file.text()
              await run('csv-upload', async () => {
                const r = await uploadBrandVisibilityCsv({
                  data: {
                    clientId,
                    phase,
                    filename: file.name,
                    csvContent,
                    label: label || undefined,
                    importResults: true,
                  },
                })
                return `Saved ${file.name} (${r.rowCount} rows, ${r.mentionCount} models mentioned, ${r.importedCount} imported).`
              })
              e.target.value = ''
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs font-bold text-teal/70 shrink-0">Or fetch by result ID</label>
          <input
            value={resultId}
            onChange={(e) => setResultId(e.target.value)}
            placeholder="Paste test/result ID from Cloudflare tool URL"
            className="input-field font-mono text-xs flex-1 min-w-[200px]"
          />
          <button
            type="button"
            disabled={csvBusy || !resultId.trim()}
            onClick={() =>
              run('csv-fetch', async () => {
                const r = await fetchBrandVisibilityCsv({
                  data: {
                    clientId,
                    phase,
                    resultId: resultId.trim(),
                    label: label || undefined,
                    importResults: true,
                  },
                })
                setResultId('')
                return `Fetched and saved CSV (${r.rowCount} rows, ${r.mentionCount} models mentioned, ${r.importedCount} imported).`
              })
            }
            className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5 disabled:opacity-40"
          >
            Fetch from tool
          </button>
        </div>
      </div>

      {exports.length > 0 ? (
        <ul className="divide-y divide-teal/10 border border-teal/15 rounded">
          {exports.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="uppercase text-xs font-bold text-teal/60">
                  {ex.phase === 'baseline' ? 'Baseline' : 'Post'}
                </span>{' '}
                · {ex.filename} · {ex.mention_count} models mentioned · {ex.row_count} rows ·{' '}
                {fmtDate(ex.created_at)}
                {ex.label ? ` · ${ex.label}` : ''}
                {ex.source === 'cloudflare_fetch' && ex.cloudflare_result_id ? (
                  <span className="block text-[10px] text-teal/40 font-mono truncate">
                    ID: {ex.cloudflare_result_id}
                  </span>
                ) : null}
              </span>
              <span className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadExport(ex.id)}
                  className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run('csv-del', async () => {
                      await deleteBrandVisibilityExport({ data: { id: ex.id } })
                      return 'Export deleted.'
                    })
                  }
                  className="text-xs text-coral hover:underline"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-teal/60">No saved CSV reports yet.</p>
      )}
    </div>
  )
}

function BrandPromptRow({
  prompt,
  phase,
  clientId,
  onRecorded,
}: {
  prompt: string
  phase: 'baseline' | 'post_delivery'
  clientId: string
  onRecorded: () => void
}) {
  const [model, setModel] = useState(BRAND_MODELS[0])
  const [mentioned, setMentioned] = useState(false)
  const [saving, setSaving] = useState(false)

  return (
    <div className="bg-cream border border-teal/15 rounded p-2 space-y-2">
      <p className="text-sm text-teal/90">{prompt}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="input-field text-xs py-1"
        >
          {BRAND_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="text-xs flex items-center gap-1 text-teal/80">
          <input
            type="checkbox"
            checked={mentioned}
            onChange={(e) => setMentioned(e.target.checked)}
          />
          mentioned the business
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await recordBrandVisibilityResult({
                data: { clientId, phase, prompt, model, mentioned },
              })
              onRecorded()
            } finally {
              setSaving(false)
            }
          }}
          className="text-xs border border-teal/30 px-2 py-1 rounded hover:bg-teal/5"
        >
          {saving ? 'Saving…' : 'Record'}
        </button>
      </div>
    </div>
  )
}

function BrandResultsTable({
  title,
  rows,
  onDelete,
}: {
  title: string
  rows: Array<{
    id: string
    prompt: string
    model: string
    mentioned: boolean
    created_at: string
  }>
  onDelete: (id: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <div className="border-t border-teal/10 pt-3">
      <p className="text-xs font-bold text-teal/70 uppercase mb-2">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-start justify-between gap-2 text-xs bg-cream border border-teal/15 rounded p-2"
          >
            <span className="flex-1">
              <span className={r.mentioned ? 'text-green font-bold' : 'text-coral font-bold'}>
                {r.mentioned ? '✓' : '✗'}
              </span>{' '}
              <strong>{r.model}</strong> — {r.prompt}
              <span className="block text-teal/40">{fmtDate(r.created_at)}</span>
            </span>
            <button
              type="button"
              onClick={() => onDelete(r.id)}
              className="text-coral hover:underline shrink-0"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
