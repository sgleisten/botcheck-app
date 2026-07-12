import { Download } from 'lucide-react'
import {
  CATEGORY_QUESTIONS,
  scoreHeadline,
  type SiteScan,
} from '@/lib/site-scan'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { CategoryCard } from '@/components/ui/CategoryCard'
import { RobotImage } from '@/components/ui/RobotImage'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { BeforeAfterDemo, type BeforeAfterContent } from '@/components/ui/BeforeAfterDemo'
import { PricingTiers } from '@/components/ui/PricingTiers'
import type { Discoverability } from '@/lib/scan.functions'

export type ScanResultData = {
  id: string
  url: string
  ars_score: number
  site_readiness?: number
  categories: SiteScan['categories']
  discoverability?: Discoverability
  top_failures: string[]
  quick_wins: string[]
  before_after: BeforeAfterContent
}

const DISCOVERABILITY_LABELS: Record<keyof Omit<Discoverability, 'score'>, string> = {
  robotsAllowsAi: 'AI crawlers allowed',
  structuredData: 'Structured data (Schema.org)',
  llmsTxt: 'AI profile (llms.txt)',
  toolsJson: 'Agent actions (tools.json)',
}

type Props = {
  result: ScanResultData
  email: string
  setEmail: (v: string) => void
  reportUnlocked: boolean
  unlockLoading: boolean
  unlockError: string | null
  onUnlockReport: (e: React.FormEvent) => void
  checkoutLoading: boolean
  checkoutError: string | null
  onCheckout: () => void
}

export function ScanResultsView({
  result,
  email,
  setEmail,
  reportUnlocked,
  unlockLoading,
  unlockError,
  onUnlockReport,
  checkoutLoading,
  checkoutError,
  onCheckout,
}: Props) {
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

      {/* Step 4 — Score */}
      <Section tone="cream" className="!py-12 md:!py-16 text-center">
        <p className="section-label">BotCheck complete</p>
        <p className="text-sm text-teal/55 mt-2">{domain}</p>

        <div className="mt-8 flex justify-center">
          <ScoreRing score={result.ars_score} size={200} />
        </div>
        <p className="text-sm font-medium text-teal/60 mt-5">Agent Readiness Score</p>

        {result.discoverability && (
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <span className="text-teal/70">
              Site readiness{' '}
              <strong className="text-teal">{result.site_readiness ?? '—'}</strong>
              <span className="text-teal/40">/100</span>
            </span>
            <span className="text-teal/70">
              AI discoverability{' '}
              <strong className="text-teal">{result.discoverability.score}</strong>
              <span className="text-teal/40">/100</span>
            </span>
          </div>
        )}

        <h1 className="text-3xl md:text-4xl font-extrabold text-teal mt-6 max-w-2xl mx-auto leading-tight">
          {scoreHeadline(result.ars_score)}
        </h1>
      </Section>

      {/* Step 5 — Category findings */}
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

      {/* AI Discoverability checklist */}
      {result.discoverability && (
        <Section tone="cream" className="!py-8 !pt-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg font-extrabold text-teal">AI Discoverability</h2>
              <p className="text-sm text-teal/55">
                What AI engines can read about you — before BotCheck
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                Object.keys(DISCOVERABILITY_LABELS) as (keyof typeof DISCOVERABILITY_LABELS)[]
              ).map((key) => {
                const check = result.discoverability![key]
                return (
                  <div
                    key={key}
                    className="flex items-start gap-3 rounded-lg border border-teal/15 bg-white px-4 py-3"
                  >
                    <span
                      className={`shrink-0 mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-bold ${
                        check.ok ? 'bg-green/30 text-teal' : 'bg-coral/20 text-coral'
                      }`}
                    >
                      {check.ok ? '✓' : '✗'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-teal">
                        {DISCOVERABILITY_LABELS[key]}
                      </p>
                      <p className="text-xs text-teal/55 leading-snug">{check.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-teal/50 mt-3">
              BotCheck adds the missing pieces and keeps them current — raising this score.
            </p>
          </div>
        </Section>
      )}

      {/* Step 6 — Before/after demo */}
      <Section tone="orange" className="!py-14">
        <BeforeAfterDemo domain={domain} content={result.before_after} />
      </Section>

      {/* Step 7 — Email gate */}
      {!reportUnlocked && (
        <Section tone="teal" className="!py-16">
          <div className="max-w-xl mx-auto text-center">
            <p className="section-label text-cream/50 mb-3">See your full report</p>
            <h2 className="text-3xl font-extrabold text-orange mb-3">
              Get your findings + quick wins
            </h2>
            <p className="text-cream/75 mb-8 leading-relaxed">
              Enter your email — we&apos;ll send a short summary, and you&apos;ll unlock your full
              report here: top failures, quick wins, and what fixing this is worth. No credit card.
            </p>

            <form onSubmit={onUnlockReport} className="space-y-4 text-left">
              <div>
                <label htmlFor="report-email" className="block text-sm text-cream/70 mb-1.5">
                  Work email
                </label>
                <input
                  id="report-email"
                  type="email"
                  required
                  placeholder="you@yourbusiness.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field !border-cream/20"
                />
              </div>

              {unlockError && (
                <p className="rounded-md border border-coral/50 bg-coral/10 p-3 text-sm text-coral">
                  {unlockError}
                </p>
              )}

              <Button
                type="submit"
                variant="orange"
                size="lg"
                className="w-full"
                disabled={unlockLoading}
              >
                {unlockLoading ? 'Unlocking…' : 'Send my summary & unlock full report →'}
              </Button>

              <p className="text-center text-xs text-cream/45">Takes 10 seconds · No spam</p>
            </form>
          </div>
        </Section>
      )}

      {/* Step 8 — Full report (on page after unlock) */}
      {reportUnlocked && (
        <>
          <Section tone="cream" className="!py-8">
            <div className="max-w-lg mx-auto text-center">
              <p className="text-sm text-teal/70">
                We sent a short summary to <strong>{email}</strong>. Here&apos;s your full report —
                failures, quick wins, and what to do next.
              </p>
              <a
                href={`/print/${result.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-md border-2 border-teal/20 bg-white px-5 py-2.5 text-sm font-semibold text-teal hover:border-teal transition-colors"
              >
                <Download className="w-4 h-4" aria-hidden />
                Download PDF report
              </a>
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

          {/* Step 9 — Pricing options */}
          <Section tone="teal" className="!py-16" id="fix">
            <div className="max-w-2xl mx-auto text-center mb-10">
              <p className="section-label text-cream/50 mb-3">Fix this for me</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-orange mb-3">
                Let BotCheck handle it
              </h2>
              <p className="text-cream/75 leading-relaxed">
                Pick how hands-off you want to be. The Automated plan gets you live in days — no tech
                skills needed.
              </p>
            </div>
            <PricingTiers
              heading=""
              subheading=""
              onSelectAutomated={onCheckout}
              automatedLoading={checkoutLoading}
              checkoutError={checkoutError}
              automatedNote={`Secure checkout via Stripe · Cancel anytime · ${email}`}
            />
          </Section>
        </>
      )}

      <SiteFooter />
    </div>
  )
}
