import { createFileRoute, Link } from '@tanstack/react-router'
import { Section } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { PricingTiers } from '@/components/ui/PricingTiers'

export const Route = createFileRoute('/pricing')({ component: PricingPage })

function PricingPage() {
  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <Section tone="cream" className="!py-14 md:!py-20 text-center">
        <p className="section-label mb-3">Plans</p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-teal leading-tight max-w-3xl mx-auto">
          Make your business <span className="highlight-orange">readable to AI</span>
        </h1>
        <p className="mt-4 text-lg text-teal/70 max-w-xl mx-auto leading-relaxed">
          Choose how hands-off you want to be. Every plan keeps AI agents sending customers to you.
        </p>
      </Section>

      <Section tone="cream" className="!pt-0 !pb-16">
        <PricingTiers heading="" subheading="" />
      </Section>

      <Section tone="teal" className="!py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-extrabold text-orange mb-3">Not sure where you stand?</h2>
          <p className="text-cream/75 mb-8 text-lg">
            Run a free Agent Readiness scan and see exactly what AI tells your customers today.
          </p>
          <Link to="/">
            <Button variant="orange" size="lg">
              Run my free BotCheck →
            </Button>
          </Link>
        </div>
      </Section>

      <SiteFooter />
    </div>
  )
}
