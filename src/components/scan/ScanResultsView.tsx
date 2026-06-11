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
import { BeforeAfterDemo } from '@/components/ui/BeforeAfterDemo'

export type ScanResultData = {
  id: string
  url: string
  ars_score: number
  categories: SiteScan['categories']
  top_failures: string[]
  quick_wins: string[]
  before_after: {
    ai_now: string
    ai_with_botcheck: string
  }
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
  onCheckout: (e: React.FormEvent) => void
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

      {/* Step 6 — Before/after demo */}
      <Section tone="orange" className="!py-14">
        <BeforeAfterDemo
          domain={domain}
          aiNow={result.before_after.ai_now}
          aiWithBotcheck={result.before_after.ai_with_botcheck}
        />
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
            <p className="text-center text-sm text-teal/70 max-w-lg mx-auto">
              We sent a short summary to <strong>{email}</strong>. Here&apos;s your full report —
              failures, quick wins, and what to do next.
            </p>
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

          {/* Step 9 — Offer */}
          <Section tone="teal" className="!py-16" id="fix">
            <div className="max-w-xl mx-auto text-center">
              <p className="section-label text-cream/50 mb-3">Next step</p>
              <h2 className="text-3xl font-extrabold text-orange mb-3">We fix this for you</h2>
              <p className="text-cream/75 mb-8 leading-relaxed">
                $299/mo — we build your AI profile, host it, and update it every week as your site
                changes. No tech skills needed.
              </p>

              <form onSubmit={onCheckout} className="space-y-4">
                {checkoutError && (
                  <p className="rounded-md border border-coral/50 bg-coral/10 p-3 text-sm text-coral text-left">
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
                  Secure checkout via Stripe · Cancel anytime · {email}
                </p>
              </form>
            </div>
          </Section>
        </>
      )}

      <SiteFooter />
    </div>
  )
}
