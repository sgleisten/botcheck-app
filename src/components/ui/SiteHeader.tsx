import { Link } from '@tanstack/react-router'

export function SiteHeader() {
  return (
    <header className="bg-[#2D6E7E] border-b-4 border-[#1F4E5A] sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-extrabold text-[#FBF3DC] text-2xl tracking-tight"
        >
          <img
            src="/images/robot-check.png"
            alt=""
            className="w-9 h-9 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <span>BotCheck</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-[#FBF3DC]">
          <Link
            to="/how-it-works"
            className="hover:text-[#E89B4A] transition"
            activeProps={{ className: 'text-[#E89B4A]' }}
          >
            How It Works
          </Link>
          <Link
            to="/agencies"
            className="hover:text-[#E89B4A] transition"
            activeProps={{ className: 'text-[#E89B4A]' }}
          >
            Agencies
          </Link>
          <Link
            to="/pricing"
            className="hover:text-[#E89B4A] transition"
            activeProps={{ className: 'text-[#E89B4A]' }}
          >
            Pricing
          </Link>
        </nav>
        <Link
          to="/"
          className="text-sm text-[#E89B4A] font-bold hover:underline whitespace-nowrap"
        >
          Run New Check →
        </Link>
      </div>
    </header>
  )
}
