import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { runScan, saveEmail, createCheckoutSession } from '@/lib/scan.functions'
import { normalizeDomain } from '@/lib/site-scan'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Section } from '@/components/ui/Section'
import { RobotImage } from '@/components/ui/RobotImage'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { ScanResultsView } from '@/components/scan/ScanResultsView'

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    url: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => {
          if (!value) return true
          try {
            const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`
            new URL(normalized)
            return true
          } catch {
            return false
          }
        },
        { message: 'Invalid URL' },
      ),
  }),
  component: ScanPage,
})

function normalizeUrl(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`
}

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: Awaited<ReturnType<typeof runScan>> }
  | { status: 'error'; message: string }

function ScanPage() {
  const { url: urlFromSearch } = Route.useSearch()
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [reportUnlocked, setReportUnlocked] = useState(false)
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanState>({ status: 'idle' })

  async function runScanForUrl(targetUrl: string) {
    const normalized = normalizeUrl(targetUrl)
    setUrl(normalized)
    setScan({ status: 'scanning' })
    setCheckoutError(null)
    setUnlockError(null)
    setReportUnlocked(false)
    try {
      const result = await runScan({ data: { url: normalized } })
      setScan({ status: 'done', result })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setScan({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  useEffect(() => {
    if (!urlFromSearch) return
    void runScanForUrl(urlFromSearch)
  }, [urlFromSearch])

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    await runScanForUrl(url)
  }

  async function handleUnlockReport(e: React.FormEvent) {
    e.preventDefault()
    if (scan.status !== 'done') return
    setUnlockLoading(true)
    setUnlockError(null)
    try {
      await saveEmail({ data: { scanId: scan.result.id, email } })
      setReportUnlocked(true)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Could not save your email. Please try again.')
    } finally {
      setUnlockLoading(false)
    }
  }

  async function handleCheckout() {
    if (scan.status !== 'done' || !reportUnlocked) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const { url: checkoutUrl } = await createCheckoutSession({
        data: { scanId: scan.result.id, email, domain: normalizeDomain(scan.result.url) },
      })
      window.location.href = checkoutUrl
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed. Please try again.')
      setCheckoutLoading(false)
    }
  }

  if (scan.status === 'done') {
    return (
      <ScanResultsView
        result={scan.result}
        email={email}
        setEmail={setEmail}
        reportUnlocked={reportUnlocked}
        unlockLoading={unlockLoading}
        unlockError={unlockError}
        onUnlockReport={handleUnlockReport}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        onCheckout={handleCheckout}
      />
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <Section tone="cream" className="!py-16 md:!py-24">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="section-label mb-4">The robots are coming</p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-teal leading-[1.05]">
              Will they be able to{' '}
              <span className="highlight-orange">find your business?</span>
            </h1>
            <p className="mt-5 text-lg text-teal/70 leading-relaxed max-w-lg">
              Get your free Agent Readiness Score. See how well AI agents can book, price, and
              navigate your site — in about 60 seconds.
            </p>

            <form onSubmit={handleScan} className="mt-8 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  inputMode="url"
                  placeholder="https://yourbusiness.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input-field flex-1"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={scan.status === 'scanning'}
                  className="shrink-0 whitespace-nowrap"
                >
                  {scan.status === 'scanning' ? 'Scanning…' : 'Run my BotCheck →'}
                </Button>
              </div>
              {scan.status === 'scanning' && (
                <p className="text-sm text-teal/60">
                  Scanning your site and key pages — usually 15–30 seconds…
                </p>
              )}
              {scan.status === 'error' && (
                <p className="rounded-md border-2 border-coral bg-coral/10 p-3 text-sm text-coral">
                  {scan.message}
                </p>
              )}
              <p className="text-xs text-teal/45">Free. No signup. Results in 60 seconds.</p>
            </form>
          </div>

          <RobotImage
            src="/images/robot-hero.png"
            alt="Friendly waving with speech bubble"
            className="w-full max-w-md mx-auto object-contain drop-shadow-sm"
            fallback="🤖"
          />
        </div>
      </Section>

      <div className="bg-teal text-cream text-center py-4 px-6 text-sm md:text-base font-medium">
        AI agents made 4.2 trillion web visits last month. How many got lost on your site?
      </div>

      <Section tone="cream" className="!py-16">
        <div className="text-center mb-12">
          <p className="section-label mb-3">What&apos;s happening</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-teal">
            Robots are shopping for your customers
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {[
            {
              img: '/images/robot-visiting.png',
              title: 'AI agents visit your site',
              body: 'ChatGPT, Gemini, and others send bots to learn about your business on behalf of customers.',
              fallback: '🌐',
            },
            {
              img: '/images/robot-maze.png',
              title: 'Most sites confuse them',
              body: 'Broken forms, hidden pricing, and visual-only navigation send robots — and customers — elsewhere.',
              fallback: '🌀',
            },
            {
              img: '/images/robot-check.png',
              title: 'BotCheck fixes the path',
              body: 'We score your site, build AI-readable profiles, and keep them updated as you change.',
              fallback: '✅',
            },
          ].map((item) => (
            <Card key={item.title} elevated className="text-center !shadow-none">
              <RobotImage
                src={item.img}
                alt=""
                className="w-full h-40 mx-auto mb-5 object-contain"
                fallback={item.fallback}
              />
              <h3 className="font-bold text-teal text-lg mb-2">{item.title}</h3>
              <p className="text-sm text-teal/65 leading-relaxed">{item.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="orange" className="!py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-teal">
            Smart owners aren&apos;t getting left behind
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            '90%+ success rate after BotCheck',
            'Weekly updates as your site changes',
            'Live in days, not months',
          ].map((stat) => (
            <div
              key={stat}
              className="rounded-lg bg-teal text-cream text-center p-5 text-sm font-semibold leading-snug"
            >
              {stat}
            </div>
          ))}
        </div>
      </Section>

      <Section tone="teal" className="!py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold text-orange mb-4">
            Help the robots find your business
          </h2>
          <p className="text-cream/75 mb-8 text-lg">Free check. No signup. Results in 60 seconds.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleScan(e)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto"
          >
            <input
              type="text"
              required
              placeholder="yourbusiness.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="input-field flex-1 !border-cream/20"
            />
            <Button type="submit" variant="orange" size="lg" className="shrink-0">
              Run my BotCheck →
            </Button>
          </form>
        </div>
      </Section>

      <SiteFooter />
    </div>
  )
}
