import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { runScan, saveEmail, createCheckoutSession } from '@/lib/scan.functions'
import { normalizeDomain } from '@/lib/site-scan'
import { RobotImage } from '@/components/ui/RobotImage'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { ScanResultsView } from '@/components/scan/ScanResultsView'

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    url: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => {
          if (!value) return true
          try {
            const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`
            new URL(normalized)
            return true
          } catch {
            return false
          }
        },
        { message: 'Invalid URL' },
      ),
  }),
  component: ScanPage,
})

function normalizeUrl(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`
}

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: Awaited<ReturnType<typeof runScan>> }
  | { status: 'error'; message: string }

function ScanPage() {
  const { url: urlFromSearch } = Route.useSearch()
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [reportUnlocked, setReportUnlocked] = useState(false)
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanState>({ status: 'idle' })

  async function runScanForUrl(targetUrl: string) {
    const normalized = normalizeUrl(targetUrl)
    setUrl(normalized)
    setScan({ status: 'scanning' })
    setCheckoutError(null)
    setUnlockError(null)
    setReportUnlocked(false)
    try {
      const result = await runScan({ data: { url: normalized } })
      setScan({ status: 'done', result })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setScan({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  useEffect(() => {
    if (!urlFromSearch) return
    void runScanForUrl(urlFromSearch)
  }, [urlFromSearch])

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    await runScanForUrl(url)
  }

  async function handleUnlockReport(e: React.FormEvent) {
    e.preventDefault()
    if (scan.status !== 'done') return
    setUnlockLoading(true)
    setUnlockError(null)
    try {
      await saveEmail({ data: { scanId: scan.result.id, email } })
      setReportUnlocked(true)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Could not save your email. Please try again.')
    } finally {
      setUnlockLoading(false)
    }
  }

  async function handleCheckout() {
    if (scan.status !== 'done' || !reportUnlocked) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const { url: checkoutUrl } = await createCheckoutSession({
        data: { scanId: scan.result.id, email, domain: normalizeDomain(scan.result.url) },
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
        reportUnlocked={reportUnlocked}
        unlockLoading={unlockLoading}
        unlockError={unlockError}
        onUnlockReport={handleUnlockReport}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        onCheckout={handleCheckout}
      />
    )
  }

  const scanForm = (variant: 'light' | 'dark') => {
    const isDark = variant === 'dark'
    return (
      <div className="w-full max-w-2xl mx-auto">
        <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourbusiness.com"
            aria-label="Website URL"
            className={`flex-1 h-14 px-5 rounded-lg text-base font-medium placeholder:font-normal focus:outline-none transition bg-[#FFFDF5] text-[#1F4E5A] border-4 placeholder:text-[#7E9AA0] ${
              isDark ? 'border-[#E89B4A]' : 'border-[#1F4E5A]'
            }`}
          />
          <button
            type="submit"
            disabled={scan.status === 'scanning'}
            className={`h-14 px-6 rounded-lg font-extrabold text-base tracking-tight transition whitespace-nowrap border-4 disabled:opacity-60 ${
              isDark
                ? 'bg-[#E89B4A] text-[#1F4E5A] border-[#E89B4A] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#E89B4A]'
                : 'bg-[#2D6E7E] text-[#FBF3DC] border-[#1F4E5A] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#1F4E5A]'
            }`}
          >
            {scan.status === 'scanning' ? 'SCANNING…' : 'RUN MY BOTCHECK →'}
          </button>
        </form>
        {scan.status === 'scanning' && (
          <p className={`mt-3 text-sm font-medium ${isDark ? 'text-[#FBF3DC]/80' : 'text-[#5A7A82]'}`}>
            Scanning your site and key pages — usually 15–30 seconds…
          </p>
        )}
        {scan.status === 'error' && (
          <p className="mt-3 text-sm font-bold text-[#D85A4A]" role="alert">
            {scan.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF3DC]">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[#FBF3DC] border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-6xl px-6 pt-16 sm:pt-24 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-8 text-left">
              <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#2D6E7E]/70 mb-5">
                The robots are coming…
              </p>
              <h1 className="font-black tracking-tight text-[#1F4E5A] leading-[1.02] text-4xl sm:text-5xl md:text-6xl">
                <span className="block">Will they be able to</span>
                <span className="block font-serif italic text-[#E89B4A] mt-1">find your business?</span>
              </h1>
              <div className="mt-7 space-y-4 max-w-xl">
                <p className="text-base sm:text-lg text-[#1F4E5A]/80 leading-relaxed">
                  AI agents are already visiting your website — booking appointments, comparing prices,
                  contacting businesses.
                </p>
                <p className="text-base sm:text-lg text-[#1F4E5A]/70 italic leading-relaxed">
                  Most of them get lost. See how yours scores in 60 seconds.
                </p>
              </div>

              <div className="mt-8">{scanForm('light')}</div>
              <p className="mt-4 text-sm text-[#5A7A82] font-medium">
                Free. No signup. Results in 60 seconds.
              </p>
            </div>

            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <RobotImage
                src="/images/robot-hero.png"
                alt="A friendly robot waving"
                className="w-56 sm:w-64 lg:w-full max-w-xs object-contain drop-shadow-[6px_6px_0_rgba(31,78,90,0.15)]"
                fallback="🤖"
              />
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE BREAK */}
      <section className="bg-[#1F4E5A] py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-lg sm:text-xl italic text-[#FFFDF5] leading-relaxed">
            "Welp, that happened faster than I predicted... Thought it would be end of 2027, then early
            2027, but agentic traffic's growing so fast that bots have now passed human traffic online
            for the first time in the Internet's history."
          </p>
          <p className="mt-3 text-sm font-bold text-[#FFFDF5]/70">— Cloudflare CEO Matthew Prince</p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-[#FFFDF5] py-20 border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-4xl sm:text-5xl font-black text-center text-[#1F4E5A] tracking-tight">
            Here's what's happening
          </h2>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                img: '/images/robot-visiting.png',
                alt: 'A crowd of friendly robots',
                fallback: '🌐',
                title: 'Robots visit your site',
                body: 'AI agents are sent by real customers to find your hours, book appointments, compare your prices.',
              },
              {
                img: '/images/robot-maze.png',
                alt: 'A confused robot in front of a maze',
                fallback: '🌀',
                title: 'Most get lost',
                body: 'The average small business site fails AI agents 70% of the time. They leave. Your competitor gets the customer.',
              },
              {
                img: '/images/robot-check.png',
                alt: 'A happy robot with a green checkmark',
                fallback: '✅',
                title: 'BotCheck fixes it',
                body: 'We scan your site, show you exactly what\'s failing, and make it agent-ready. No tech skills needed.',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="bg-[#FBF3DC] border-4 border-[#1F4E5A] p-6 shadow-[6px_6px_0_0_#1F4E5A]"
              >
                <div className="bg-[#FFFDF5] border-2 border-[#1F4E5A] rounded-lg p-2 mb-4">
                  <RobotImage
                    src={c.img}
                    alt={c.alt}
                    className="w-full h-44 object-contain"
                    fallback={c.fallback}
                  />
                </div>
                <h3 className="text-xl font-black tracking-tight text-[#1F4E5A]">{c.title}</h3>
                <p className="mt-3 text-[#1F4E5A] leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="border-b-4 border-[#1F4E5A] py-16 bg-[#E89B4A]">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-2xl sm:text-3xl font-black text-[#1F4E5A] tracking-tight max-w-3xl mx-auto">
            Join smart business owners who aren't getting left behind by the robot revolution
          </p>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              '70% of AI agents fail on typical small business sites',
              '5 min setup. No developer needed.',
              'Before BotCheck: AI guesses. After BotCheck: AI knows.',
            ].map((s) => (
              <div
                key={s}
                className="bg-[#2D6E7E] text-[#FBF3DC] p-6 border-4 border-[#1F4E5A] font-bold text-lg flex items-center justify-center"
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECOND CTA */}
      <section className="bg-[#2D6E7E] py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-black text-[#E89B4A] tracking-tight">
            Help the robots find your business
          </h2>
          <p className="mt-4 text-lg text-[#FBF3DC]">
            Run your free BotCheck right now. See your score in 60 seconds.
          </p>
          <div className="mt-10">{scanForm('dark')}</div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
