import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'
import { getClientReportData } from '@/lib/admin.functions'

export const Route = createFileRoute('/print/client/$clientId')({
  validateSearch: z.object({ snapshot: z.string().uuid().optional() }),
  loaderDeps: ({ search }) => ({ snapshot: search.snapshot }),
  loader: async ({ params, deps }) => {
    try {
      return await getClientReportData({
        data: { clientId: params.clientId, snapshotId: deps.snapshot },
      })
    } catch {
      throw notFound()
    }
  },
  component: ClientReportPrint,
})

function scoreColor(score: number): string {
  if (score >= 70) return '#89b494'
  if (score >= 40) return '#e8a054'
  return '#c0504d'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function PrintButton() {
  return (
    <div className="no-print" style={{ textAlign: 'center', marginBottom: 24 }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          background: '#e8a054',
          color: '#2a5d67',
          border: 'none',
          borderRadius: 8,
          padding: '12px 24px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Save as PDF / Print
      </button>
    </div>
  )
}

const reportStyles = `
  @page { margin: 18mm 16mm; }
  @media print { .no-print { display: none !important; } }
  .print-report {
    font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
    color: #2a5d67;
    max-width: 760px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    background: #fff;
  }
`

function Header({
  title,
  businessName,
  domain,
  dateLabel,
}: {
  title: string
  businessName: string | null
  domain: string
  dateLabel: string
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderBottom: '2px solid #2a5d67',
          paddingBottom: 12,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 20 }}>isitagentready.com</span>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2a5d6799' }}>
          {title}
        </span>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 24, marginBottom: 4 }}>
        {businessName ?? domain}
      </h1>
      <p style={{ color: '#2a5d6799', margin: 0, fontSize: 14 }}>{domain}</p>
      <p style={{ color: '#2a5d6799', margin: '4px 0 0', fontSize: 12 }}>{dateLabel}</p>
    </>
  )
}

function FindingsList({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color }}>{label}</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  )
}

function ClientReportPrint() {
  const report = Route.useLoaderData()

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])

  if (report.mode === 'snapshot') {
    return (
      <div className="print-report">
        <style>{reportStyles}</style>
        <PrintButton />
        <Header
          title={`${report.phase === 'pre' ? 'Pre-work' : 'Post-work'} AI Readiness Record`}
          businessName={report.businessName}
          domain={report.domain}
          dateLabel={`Captured ${fmtDate(report.capturedAt)}${report.label ? ` · ${report.label}` : ''}`}
        />

        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>
          Agent Readiness Score
        </h2>
        <div style={{ padding: 16, borderRadius: 10, background: '#fdf8e1', textAlign: 'center', width: 160 }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: report.score != null ? scoreColor(report.score) : '#2a5d6766',
            }}
          >
            {report.score ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: '#2a5d6799' }}>out of 100</div>
        </div>

        <FindingsList label="Top failures" items={report.topFailures} color="#c0504d" />
        <FindingsList label="Quick wins" items={report.quickWins} color="#3f7a52" />

        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 8 }}>
          AI brand visibility
        </h2>
        <p style={{ fontSize: 13, color: '#2a5d6799', marginTop: 0 }}>
          {report.brandMentionCount}/{report.brandModelCount} models mentioned the business.
        </p>
        {report.brandResults.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }}>
            {report.brandResults.map((r, i) => (
              <li key={i}>
                <strong>{r.mentioned ? '✓' : '✗'} {r.model}</strong> — {r.prompt}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Live composite (before/after)
  const scoreDelta =
    report.baselineScore != null && report.postDeliveryScore != null
      ? report.postDeliveryScore - report.baselineScore
      : null

  return (
    <div className="print-report">
      <style>{reportStyles}</style>
      <PrintButton />
      <Header
        title="AI Readiness Report"
        businessName={report.businessName}
        domain={report.domain}
        dateLabel={`Generated ${fmtDate(report.capturedAt)}`}
      />

      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>
        Agent Readiness Score
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 10, background: '#fdf8e1', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#2a5d6799' }}>
            Before
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: report.baselineScore != null ? scoreColor(report.baselineScore) : '#2a5d6766',
            }}
          >
            {report.baselineScore ?? '—'}
          </div>
          <div style={{ fontSize: 10, color: '#2a5d6799' }}>{fmtDate(report.baselineDate)}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 10, background: '#fdf8e1', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#2a5d6799' }}>
            After
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color:
                report.postDeliveryScore != null ? scoreColor(report.postDeliveryScore) : '#2a5d6766',
            }}
          >
            {report.postDeliveryScore ?? '—'}
          </div>
          <div style={{ fontSize: 10, color: '#2a5d6799' }}>{fmtDate(report.postDeliveryDate)}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 10, background: '#89b49422', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3f7a52' }}>
            Change
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: scoreDelta != null && scoreDelta >= 0 ? '#3f7a52' : '#c0504d',
            }}
          >
            {scoreDelta != null ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}` : '—'}
          </div>
        </div>
      </div>

      {report.baselineFindings && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 4 }}>
            What we found (before)
          </h2>
          <FindingsList label="Top failures" items={report.baselineFindings.topFailures} color="#c0504d" />
          <FindingsList label="Quick wins" items={report.baselineFindings.quickWins} color="#3f7a52" />
        </>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>
        AI brand mentions
      </h2>
      <p style={{ fontSize: 13, color: '#2a5d6799', marginTop: 0 }}>
        When people ask relevant questions, do ChatGPT, Claude, Gemini, and other models mention this
        business?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid #2a5d6722', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#2a5d6799' }}>
            Before
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
            {report.brand.baselineSummary.mentionCount}/{report.brand.baselineSummary.modelCount}
          </div>
          <div style={{ fontSize: 12, color: '#2a5d6799' }}>models mentioned you</div>
        </div>
        <div style={{ border: '1px solid #89b49455', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3f7a52' }}>
            After
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#3f7a52' }}>
            {report.brand.postSummary.mentionCount}/{report.brand.postSummary.modelCount}
          </div>
          <div style={{ fontSize: 12, color: '#2a5d6799' }}>models mentioned you</div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>What we deployed</h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
        <li>AI-readable profile (llms.txt + tools.json)</li>
        <li>
          Cloudflare custom hostname
          {report.customHostname ? `: ${report.customHostname}` : ' (configured)'}
        </li>
        {report.customHostname && (
          <li style={{ fontSize: 12, listStyle: 'none', marginLeft: -20, color: '#2a5d6799' }}>
            Live at{' '}
            <a href={`https://${report.customHostname.replace(/^https?:\/\//i, '')}/llms.txt`}>
              https://{report.customHostname.replace(/^https?:\/\//i, '')}/llms.txt
            </a>
          </li>
        )}
        <li>Content-Signal headers + JSON-LD for AI crawlers</li>
        {report.hostingAccess ? (
          <li>Files deployed on your website (root domain)</li>
        ) : (
          <li style={{ fontSize: 12, color: '#2a5d6799' }}>
            Main-site root files ({report.domain.replace(/^https?:\/\//i, '')}/llms.txt) are separate —
            add when hosting access is available for a higher scan score.
          </li>
        )}
      </ul>

      <div
        style={{
          marginTop: 40,
          padding: 16,
          borderRadius: 10,
          background: '#2a5d67',
          color: '#fdf8e1',
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        Monthly re-checks keep your AI presence current as your site changes.
      </div>
    </div>
  )
}
