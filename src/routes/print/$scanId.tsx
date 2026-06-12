import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getScanById } from '@/lib/scan.functions'
import { CATEGORY_QUESTIONS, type SiteScan } from '@/lib/site-scan'

export const Route = createFileRoute('/print/$scanId')({
  loader: async ({ params }) => {
    const scan = await getScanById({ data: { scanId: params.scanId } })
    if (!scan) throw notFound()
    // Email gate: the PDF report is only available once an email is captured.
    if (!scan.email) {
      throw redirect({ to: '/report/$scanId', params: { scanId: params.scanId } })
    }
    return scan
  },
  component: PrintReport,
})

function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return '#89b494'
  if (score >= 40) return '#e8a054'
  return '#c0504d'
}

function PrintReport() {
  const scan = Route.useLoaderData()

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])

  const domain = hostname(scan.url)
  const categories = scan.categories as SiteScan['categories']

  return (
    <div className="print-report">
      <style>{`
        @page { margin: 18mm 16mm; }
        @media print {
          .no-print { display: none !important; }
        }
        .print-report {
          font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
          color: #2a5d67;
          max-width: 760px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          background: #fff;
        }
        .print-report h1, .print-report h2, .print-report h3 {
          font-family: 'Nunito', ui-sans-serif, system-ui, sans-serif;
          letter-spacing: -0.02em;
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
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Save as PDF / Print
        </button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #2a5d67', paddingBottom: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 20 }}>BotCheck</span>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#2a5d6799' }}>
          Agent Readiness Report
        </span>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 24, marginBottom: 4 }}>{domain}</h1>
      <p style={{ color: '#2a5d6799', margin: 0, fontSize: 14 }}>
        Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* Score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24, padding: 20, borderRadius: 12, background: '#fdf8e1' }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor(scan.ars_score) }}>
          {scan.ars_score}
          <span style={{ fontSize: 20, color: '#2a5d6766' }}>/100</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Agent Readiness Score</div>
          <div style={{ fontSize: 13, color: '#2a5d6799' }}>How well AI agents can use this site for customers</div>
        </div>
      </div>

      {/* Categories */}
      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>Category breakdown</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {(Object.entries(categories) as [keyof typeof CATEGORY_QUESTIONS, SiteScan['categories'][keyof SiteScan['categories']]][]).map(
          ([key, cat]) => (
            <div key={key} style={{ border: '1px solid #2a5d6722', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{CATEGORY_QUESTIONS[key]}</span>
                <span style={{ fontWeight: 800, color: scoreColor((cat.score / 25) * 100) }}>{cat.score}/25</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#2a5d6799', lineHeight: 1.5 }}>{cat.finding}</p>
            </div>
          ),
        )}
      </div>

      {/* Top failures */}
      {scan.top_failures.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>
            Where the robots are getting lost
          </h2>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {scan.top_failures.map((issue, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 8, borderRadius: 8, background: '#c0504d11', border: '1px solid #c0504d33', fontSize: 14, lineHeight: 1.5 }}>
                <span style={{ color: '#c0504d', fontWeight: 700 }}>●</span>
                {issue}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Quick wins */}
      {scan.quick_wins.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>Quick fixes</h2>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {scan.quick_wins.map((win, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, padding: '10px 14px', marginBottom: 8, borderRadius: 8, background: '#89b49418', border: '1px solid #89b49455', fontSize: 14, lineHeight: 1.5 }}>
                <span style={{ color: '#3f7a52', fontWeight: 700 }}>✓</span>
                {win}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Before / after */}
      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 32, marginBottom: 12 }}>
        What AI tells your customers
      </h2>
      <div style={{ border: '1px solid #c0504d33', borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#c0504d', marginBottom: 6 }}>
          Today
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#2a5d67cc' }}>{scan.before_after.ai_now}</p>
      </div>
      <div style={{ border: '1px solid #89b49455', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3f7a52', marginBottom: 6 }}>
          With BotCheck
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{scan.before_after.ai_with_botcheck}</p>
      </div>

      {/* Footer CTA */}
      <div style={{ marginTop: 36, padding: 20, borderRadius: 12, background: '#2a5d67', color: '#fdf8e1', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#e8a054' }}>Want BotCheck to fix this for you?</div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#fdf8e1cc' }}>
          We build your AI profile, host it, and keep it current. Plans start at $299/mo.
          Visit botcheck.io/pricing to get started.
        </p>
      </div>
    </div>
  )
}
