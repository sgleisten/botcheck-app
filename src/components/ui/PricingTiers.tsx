import { Link } from '@tanstack/react-router'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const CONTACT_EMAIL = 'support@botcheck.io'

type Props = {
  /** When provided, the Automated tier triggers checkout in-place (report context). */
  onSelectAutomated?: () => void
  automatedLoading?: boolean
  checkoutError?: string | null
  /** Shown under the automated CTA (e.g. the captured email). */
  automatedNote?: string
  /** Heading + subcopy are optional so this can be embedded or standalone. */
  heading?: string
  subheading?: string
}

type Tier = {
  id: 'automated' | 'handson' | 'enterprise'
  name: string
  price: string
  cadence?: string
  tagline: string
  features: string[]
  highlight?: boolean
  badge?: string
}

const TIERS: Tier[] = [
  {
    id: 'automated',
    name: 'Automated',
    price: '$299',
    cadence: '/mo',
    tagline: 'Set it and forget it. We do everything for you.',
    highlight: true,
    badge: 'Most popular',
    features: [
      'AI profile built from your site automatically',
      'Hosted llms.txt & tools.json for AI agents',
      'Weekly re-scans keep everything current',
      'Drift alerts when your site changes',
      'Live in days, no tech skills needed',
    ],
  },
  {
    id: 'handson',
    name: 'Hands-On',
    price: '$799',
    cadence: '/mo',
    tagline: 'Everything automated, plus a dedicated specialist.',
    features: [
      'Everything in Automated',
      'Dedicated profile specialist',
      'Custom copy & positioning review',
      'Priority support and monthly check-ins',
      'Hands-on setup of bookings & integrations',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    tagline: 'Multi-location, agencies, and custom integrations.',
    features: [
      'Multiple locations or brands',
      'Agency & reseller options',
      'Custom integrations and SLAs',
      'Bulk onboarding & reporting',
      'Dedicated account team',
    ],
  },
]

function contactHref(tier: string): string {
  const subject = encodeURIComponent(`BotCheck ${tier} plan`)
  return `mailto:${CONTACT_EMAIL}?subject=${subject}`
}

export function PricingTiers({
  onSelectAutomated,
  automatedLoading = false,
  checkoutError,
  automatedNote,
  heading = 'Pick how hands-off you want to be',
  subheading = 'Every plan keeps your business readable to AI agents. Start automated, upgrade anytime.',
}: Props) {
  return (
    <div className="max-w-5xl mx-auto">
      {heading && (
        <div className="text-center mb-10">
          <p className="section-label mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-teal">{heading}</h2>
          {subheading && (
            <p className="mt-3 text-base text-teal/65 max-w-2xl mx-auto leading-relaxed">
              {subheading}
            </p>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5 lg:gap-6 items-stretch">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`relative flex flex-col rounded-2xl border-2 p-6 bg-white ${
              tier.highlight
                ? 'border-orange shadow-[0_20px_50px_-20px_rgba(232,160,84,0.7)] md:-translate-y-2'
                : 'border-teal/15 card-elevated'
            }`}
          >
            {tier.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-orange px-3 py-1 text-xs font-bold text-teal whitespace-nowrap">
                <Sparkles className="w-3 h-3" aria-hidden />
                {tier.badge}
              </span>
            )}

            <h3 className="text-lg font-extrabold text-teal">{tier.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-teal">{tier.price}</span>
              {tier.cadence && <span className="text-sm text-teal/55">{tier.cadence}</span>}
            </div>
            <p className="mt-2 text-sm text-teal/65 leading-relaxed min-h-[2.5rem]">{tier.tagline}</p>

            <ul className="mt-5 space-y-2.5 flex-1">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-2.5 text-sm text-teal/80 leading-snug">
                  <Check className="w-4 h-4 shrink-0 text-green mt-0.5" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {tier.id === 'automated' ? (
                onSelectAutomated ? (
                  <Button
                    type="button"
                    variant="orange"
                    size="lg"
                    className="w-full"
                    disabled={automatedLoading}
                    onClick={onSelectAutomated}
                  >
                    {automatedLoading ? 'Redirecting to checkout…' : 'Get started — $299/mo →'}
                  </Button>
                ) : (
                  <Link to="/">
                    <Button type="button" variant="orange" size="lg" className="w-full">
                      Run a free scan to start →
                    </Button>
                  </Link>
                )
              ) : (
                <a href={contactHref(tier.name)} className="block">
                  <Button
                    type="button"
                    variant={tier.highlight ? 'orange' : 'secondary'}
                    size="lg"
                    className="w-full"
                  >
                    {tier.id === 'enterprise' ? 'Contact sales' : 'Talk to us'}
                  </Button>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {checkoutError && (
        <p className="mt-6 mx-auto max-w-md rounded-md border border-coral/50 bg-coral/10 p-3 text-sm text-coral text-center">
          {checkoutError}
        </p>
      )}
      {automatedNote && (
        <p className="mt-5 text-center text-xs text-teal/50">{automatedNote}</p>
      )}
    </div>
  )
}
