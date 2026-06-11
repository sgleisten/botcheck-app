import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { runScan, saveEmail, createCheckoutSession } from '@/lib/scan.functions'
import {
  CATEGORY_QUESTIONS,
  scoreHeadline,
  type SiteScan,
} from '@/lib/site-scan'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Section } from '@/components/ui/Section'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { CategoryCard } from '@/components/ui/CategoryCard'
import { RobotImage } from '@/components/ui/RobotImage'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { SiteHeader } from '@/components/ui/SiteHeader'

export const Route = createFileRoute('/')({ component: ScanPage })

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: Awaited<ReturnType<typeof runScan>> }
  | { status: 'error'; message: string }

function ScanPage() {
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanState>({ status: 'idle' })

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    setScan({ status: 'scanning' })
    setCheckoutError(null)
    try {
      const result = await runScan({ data: { url: normalized } })
      setScan({ status: 'done', result })
    } catch (err) {
      setScan({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault()
    if (scan.status !== 'done') return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      await saveEmail({ data: { scanId: scan.result.id, email } })
      const { url: checkoutUrl } = await createCheckoutSession({
        data: { scanId: scan.result.id, email, domain: scan.result.url },
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

function ScanResultsView({
  result,
  email,
  setEmail,
  checkoutLoading,
  checkoutError,
  onCheckout,
}: {
  result: Awaited<ReturnType<typeof runScan>>
  email: string
  setEmail: (v: string) => void
  checkoutLoading: boolean
  checkoutError: string | null
  onCheckout: (e: React.FormEvent) => void
}) {
  const { categories } = result
  const domain = (() => {
    try {
      return new URL(result.url).hostname
    } catch {
      return result.url
    }
  })()

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <Section tone="cream" className="!py-12 md:!py-16 text-center">
        <p className="section-label">BotCheck complete</p>
        <p className="text-sm text-teal/55 mt-2">{domain}</p>

        <div className="mt-8 flex justify-center">
          <ScoreRing score={result.ars_score} size={200} />
        </div>
        <p className="text-sm font-medium text-teal/60 mt-5">Agent Readiness Score</p>

        <h1 className="text-3xl md:text-4xl font-extrabold text-teal mt-6 max-w-2xl mx-auto leading-tight">
          {scoreHeadline(result.ars_score)}
        </h1>
      </Section>

      <Section tone="cream" className="!py-8 !pt-0">
        <div className="grid sm:grid-cols-2 gap-5">
          {(
            Object.entries(categories) as [
              keyof typeof CATEGORY_QUESTIONS,
              SiteScan['categories'][keyof SiteScan['categories']],
            ][]
          ).map(([key, cat]) => (
            <CategoryCard
              key={key}
              question={CATEGORY_QUESTIONS[key]}
              score={cat.score}
              finding={cat.finding}
            />
          ))}
        </div>
      </Section>

      <Section tone="teal" className="!py-14">
        <div className="flex items-center gap-3 mb-8">
          <RobotImage
            src="/images/robot-maze.png"
            alt=""
            className="w-12 h-12 object-contain"
            fallback="🤖"
          />
          <h2 className="text-2xl font-extrabold text-cream">Where the robots are getting lost</h2>
        </div>
        <ul className="space-y-3 max-w-3xl">
          {result.top_failures.map((issue, i) => (
            <li
              key={i}
              className="rounded-lg bg-cream/95 border border-coral/30 text-teal px-5 py-4 text-sm leading-relaxed flex gap-3"
            >
              <span className="text-coral shrink-0 font-bold mt-0.5">●</span>
              {issue}
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="orange" className="!py-14">
        <div className="flex items-center gap-3 mb-8">
          <RobotImage
            src="/images/robot-check.png"
            alt=""
            className="w-12 h-12 object-contain"
            fallback="✅"
          />
          <h2 className="text-2xl font-extrabold text-teal">Quick fixes to help the robots</h2>
        </div>
        <ul className="space-y-3 max-w-3xl">
          {result.quick_wins.map((win, i) => (
            <li
              key={i}
              className="rounded-lg bg-cream border border-teal/15 card-elevated px-5 py-4 text-sm text-teal leading-relaxed flex gap-3"
            >
              <span className="text-green shrink-0 font-bold">✓</span>
              {win}
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="teal" className="!py-16">
        <div className="max-w-xl mx-auto text-center">
          <p className="section-label text-cream/50 mb-3">Next step</p>
          <h2 className="text-3xl font-extrabold text-orange mb-3">We fix this for you</h2>
          <p className="text-cream/75 mb-8 leading-relaxed">
            $299/mo — we build your AI profile, host it, and update it every week as your site
            changes. No tech skills needed.
          </p>

          <form onSubmit={onCheckout} className="space-y-4 text-left">
            <div>
              <label htmlFor="checkout-email" className="block text-sm text-cream/70 mb-1.5">
                Work email
              </label>
              <input
                id="checkout-email"
                type="email"
                required
                placeholder="you@yourbusiness.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field !border-cream/20"
              />
            </div>

            {checkoutError && (
              <p className="rounded-md border border-coral/50 bg-coral/10 p-3 text-sm text-coral">
                {checkoutError}
              </p>
            )}

            <Button
              type="submit"
              variant="orange"
              size="lg"
              className="w-full"
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Redirecting to checkout…' : 'Fix this for me — $299/mo →'}
            </Button>

            <p className="text-center text-xs text-cream/45">
              Secure checkout via Stripe · Cancel anytime
            </p>
          </form>
        </div>
      </Section>

      <SiteFooter />
    </div>
  )
}
