import { createFileRoute, Link } from '@tanstack/react-router'
import { Card } from '@/components/ui/Card'
import { SiteFooter } from '@/components/ui/SiteFooter'

export const Route = createFileRoute('/onboarding/status')({ component: OnboardingStatus })

function OnboardingStatus() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <Card className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 border-2 border-green bg-green/20 flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-7 h-7 text-green"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-extrabold text-teal">You&apos;re all set</h1>
            <p className="mt-2 text-teal/70 leading-relaxed">
              Your AI presence profile is being reviewed — usually within one business day.
              We&apos;ll email you when it&apos;s live.
            </p>
          </div>

          <p className="text-sm text-teal/50">
            Questions?{' '}
            <a href="mailto:support@botcheck.io" className="underline hover:text-teal">
              Contact support
            </a>
          </p>

          <Link to="/" className="inline-block text-sm text-teal font-semibold hover:underline">
            Back to home
          </Link>
        </Card>
      </div>
      <SiteFooter />
    </div>
  )
}
