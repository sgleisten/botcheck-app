import { Link } from '@tanstack/react-router'

export function SiteHeader() {
  return (
    <header className="border-b border-teal/10 bg-cream/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="font-display font-extrabold text-xl text-teal tracking-tight">
          BotCheck
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            to="/pricing"
            className="text-sm font-semibold text-teal/70 hover:text-teal transition-colors"
          >
            Pricing
          </Link>
          <p className="hidden md:block text-xs text-teal/50 font-medium tracking-wide uppercase">
            Agent Readiness for Small Business
          </p>
        </nav>
      </div>
    </header>
  )
}
