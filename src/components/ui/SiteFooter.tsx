import { Link } from '@tanstack/react-router'

export function SiteFooter() {
  return (
    <footer className="bg-[#1F4E5A] text-[#FBF3DC] border-t border-white/10">
      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <p className="font-bold">
          BotCheck — Making the web robot-friendly, one business at a time.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-bold">
          <Link to="/how-it-works" className="hover:text-[#E89B4A] transition">
            How It Works
          </Link>
          <Link to="/agencies" className="hover:text-[#E89B4A] transition">
            Agencies
          </Link>
          <Link to="/pricing" className="hover:text-[#E89B4A] transition">
            Pricing
          </Link>
          <a href="mailto:support@botcheck.io" className="hover:text-[#E89B4A] transition">
            Contact
          </a>
        </div>
        <p className="mt-4 text-sm text-[#FBF3DC]/60">© {new Date().getFullYear()} BotCheck</p>
      </div>
    </footer>
  )
}
