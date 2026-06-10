import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/status')({ component: OnboardingStatus })

function OnboardingStatus() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center px-6 space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-7 h-7 text-green-600"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-gray-900">You're all set</h1>
          <p className="mt-2 text-gray-500">
            Your AI presence profile is being reviewed. We'll email you when it's live — usually
            within one business day.
          </p>
        </div>

        <p className="text-sm text-gray-400">
          Questions?{' '}
          <a href="mailto:support@botcheck.io" className="underline hover:text-gray-600">
            Contact support
          </a>
        </p>

        <Link to="/" className="inline-block text-sm text-blue-600 hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  )
}
