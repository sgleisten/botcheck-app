import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getClientReportData } from '@/lib/admin.functions'

export const Route = createFileRoute('/print/client/$clientId')({
  loader: async ({ params }) => {
    try {
      return await getClientReportData({ data: { clientId: params.clientId } })
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

function ClientReportPrint() {
  const report = Route.useLoaderData()

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])

  const baselineBrand = report.brandChecks.find((b) => b.check_type === 'baseline')
  const postBrand = report.brandChecks.find((b) => b.check_type === 'post_delivery')
  const scoreDelta =
    report.baselineScore != null && report.postDeliveryScore != null
      ? report.postDeliveryScore - report.baselineScore
      : null

  return (
    <div className="print-report">
      <style>{`
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
      `}</style>

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
          AI Readiness Report
        </span>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 24, marginBottom: 4 }}>
        {report.businessName ?? report.domain}
      </h1>
      <p style={{ color: '#2a5d6799', margin: 0, fontSize: 14 }}>{report.domain}</p>

      {/* Score before/after */}
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
        </div>
        <div style={{ padding: 16, borderRadius: 10, background: '#89b49422', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3f7a52' }}>
            Change
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: scoreDelta != null && scoreDelta >= 0 ? '#3f7a52' : '#c0504d' }}>
            {scoreDelta != null ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}` : '—'}
          </div>
        </div>
      </div>

      {/* Brand visibility */}
      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>
        AI brand mentions
      </h2>
      <p style={{ fontSize: 13, color: '#2a5d6799', marginTop: 0 }}>
        When people ask relevant questions, do ChatGPT, Claude, Gemini, and other models mention your
        business?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid #2a5d6722', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#2a5d6799' }}>
            Before
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
            {baselineBrand ? `${baselineBrand.mention_count}/${baselineBrand.model_count}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#2a5d6799' }}>models mentioned you</div>
        </div>
        <div style={{ border: '1px solid #89b49455', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3f7a52' }}>
            After
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: '#3f7a52' }}>
            {postBrand ? `${postBrand.mention_count}/${postBrand.model_count}` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#2a5d6799' }}>models mentioned you</div>
        </div>
      </div>

      {/* What we deployed */}
      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>What we deployed</h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
        <li>AI-readable profile (llms.txt + tools.json)</li>
        <li>Cloudflare custom hostname{report.customHostname ? `: ${report.customHostname}` : ' (configured)'}</li>
        <li>Content-Signal headers + JSON-LD for AI crawlers</li>
        {report.hostingAccess && <li>Files deployed on your website</li>}
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
