import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { runScan, saveEmail, createCheckoutSession } from '@/lib/scan.functions'

export const Route = createFileRoute('/')({ component: ScanPage })

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: Awaited<ReturnType<typeof runScan>> }
  | { status: 'error'; message: string }

function ScanPage() {
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [scan, setScan] = useState<ScanState>({ status: 'idle' })

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    setScan({ status: 'scanning' })
    try {
      const result = await runScan({ data: { url: normalized } })
      setScan({ status: 'done', result })
    } catch (err) {
      setScan({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    if (scan.status !== 'done') return
    await saveEmail({ data: { scanId: scan.result.id, email } })
    setEmailSaved(true)
  }

  async function handleCheckout() {
    if (scan.status !== 'done') return
    setCheckoutLoading(true)
    try {
      const { url } = await createCheckoutSession({
        data: { scanId: scan.result.id, email, domain: scan.result.url },
      })
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      setCheckoutLoading(false)
    }
  }

  const scoreColor = (score: number) =>
    score >= 20 ? 'text-green-600' : score >= 12 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-3xl font-bold text-gray-900">Agent Readiness Score</h1>
        <p className="mt-2 text-gray-500">
          See how well your website works with AI agents. Enter your URL to get a free scan.
        </p>

        <form onSubmit={handleScan} className="mt-8 flex gap-2">
          <input
            type="text"
            required
            inputMode="url"
            placeholder="https://yourbusiness.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={scan.status === 'scanning'}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {scan.status === 'scanning' ? 'Scanning…' : 'Scan'}
          </button>
        </form>

        {scan.status === 'error' && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{scan.message}</p>
        )}

        {scan.status === 'done' && (
          <div className="mt-8 space-y-6">
            {/* Overall score */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Agent Readiness Score</p>
              <p className={`text-5xl font-bold mt-1 ${scoreColor(scan.result.ars_score)}`}>
                {scan.result.ars_score}
                <span className="text-2xl text-gray-400">/100</span>
              </p>
              <p className="mt-1 text-sm text-gray-400 truncate">{scan.result.url}</p>
            </div>

            {/* Categories */}
            <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
              <h2 className="font-semibold text-gray-800">Category Breakdown</h2>
              {Object.entries(scan.result.categories).map(([key, cat]) => (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize text-gray-700">{key}</span>
                    <span className={`font-semibold ${scoreColor(cat.score)}`}>
                      {cat.score}/25
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${cat.score >= 20 ? 'bg-green-500' : cat.score >= 12 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${(cat.score / 25) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{cat.finding}</p>
                </div>
              ))}
            </div>

            {/* Failures & wins */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-red-700 mb-2">Top Issues</h2>
                <ul className="space-y-1">
                  {scan.result.top_failures.map((f, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-red-400 shrink-0">✗</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-green-700 mb-2">Quick Wins</h2>
                <ul className="space-y-1">
                  {scan.result.quick_wins.map((w, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-green-500 shrink-0">✓</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Email capture */}
            {!emailSaved ? (
              <form
                onSubmit={handleEmail}
                className="rounded-xl border bg-blue-50 p-5 shadow-sm"
              >
                <p className="text-sm font-medium text-blue-900 mb-3">
                  Get your full report + fix guide by email
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Send
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
                <p className="text-sm text-green-700 font-medium">✓ Report on its way — check your inbox!</p>
                <div className="border-t pt-4">
                  <p className="font-semibold text-gray-900 text-lg">We fix this for you.</p>
                  <p className="text-gray-500 text-sm mt-1">$299/mo — we build your AI profile, host it, and update it every week as your site changes.</p>
                  <button
                    onClick={handleCheckout}
                    disabled={checkoutLoading}
                    className="mt-4 w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {checkoutLoading ? 'Redirecting…' : 'Fix this for me — $299/mo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
