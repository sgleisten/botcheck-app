import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { RobotImage } from '@/components/ui/RobotImage'
import { submitAgencyLead } from '@/lib/agency.functions'

export const Route = createFileRoute('/agencies')({
  head: () => ({
    meta: [
      { title: 'BotCheck for Agencies — AI Presence Management' },
      {
        name: 'description',
        content:
          'Add AI presence management to your agency offering. Run BotCheck scans across your client roster and join our founding partner program.',
      },
      { property: 'og:title', content: 'BotCheck for Agencies — AI Presence Management' },
      {
        property: 'og:description',
        content: 'Your clients trust you with their websites. Now make sure AI agents trust them too.',
      },
    ],
  }),
  component: Agencies,
})

function Agencies() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', agency: '', clients: '', website: '' })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.agency.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await submitAgencyLead({ data: form })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF3DC]">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[#FBF3DC] border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-5xl px-6 pt-16 sm:pt-20 pb-16 text-center">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#2D6E7E]/70 mb-5">
            Built for agencies. Designed with you.
          </p>
          <h1 className="font-black tracking-tight text-[#1F4E5A] leading-[1.05] text-3xl sm:text-4xl md:text-5xl">
            Your clients trust you with their websites.{' '}
            <span className="font-serif italic text-[#E89B4A]">
              Now make sure AI agents trust them too.
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[#1F4E5A]/70">
            Add AI presence management to what you already offer — without adding to your support load.
          </p>
        </div>
      </section>

      {/* PROBLEM + OPPORTUNITY */}
      <section className="bg-[#FFFDF5] py-20 border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-5xl px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#FBF3DC] border-4 border-[#1F4E5A] p-8 shadow-[6px_6px_0_0_#1F4E5A]">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1F4E5A]">
              Your clients' sites might be invisible to AI — and you'd never know
            </h2>
            <p className="mt-4 text-[#1F4E5A] leading-relaxed">
              ChatGPT and other AI agents are quietly becoming a new channel for local discovery. If
              your clients' hours, pricing, or services are wrong (or missing) in the eyes of an AI
              agent, that's a support ticket waiting to happen — and right now, nobody's watching for
              it.
            </p>
          </div>
          <div className="bg-[#FBF3DC] border-4 border-[#1F4E5A] p-8 shadow-[6px_6px_0_0_#1F4E5A]">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1F4E5A]">
              Add "AI presence management" to what you already offer
            </h2>
            <p className="mt-4 text-[#1F4E5A] leading-relaxed">
              BotCheck gives you a way to show clients real, ongoing value between redesigns — without
              you having to learn a new technical skill or build anything yourself.
            </p>
          </div>
        </div>
      </section>

      {/* FOUNDING PARTNER */}
      <section className="bg-[#E89B4A] py-20 border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-4xl px-6">
          <div className="bg-[#FFFDF5] border-4 border-[#1F4E5A] p-8 sm:p-12 shadow-[8px_8px_0_0_#1F4E5A]">
            <span className="inline-block bg-[#1F4E5A] text-[#FBF3DC] text-xs font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-full">
              Early Access — Founding Agency Partners
            </span>
            <h2 className="mt-5 text-3xl sm:text-4xl font-black tracking-tight text-[#1F4E5A]">
              We're building the agency dashboard — with founding partners
            </h2>
            <p className="mt-4 text-[#1F4E5A] leading-relaxed text-base sm:text-lg">
              We're opening early access to a small group of agencies to help shape our multi-client
              dashboard: run BotCheck scans across your whole client roster, manage AI profiles from one
              place, and offer it under your own brand.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Early access pricing, locked in',
                'Direct input on what the dashboard needs to do',
                'White-label options as they roll out',
                'A BotCheck scan link you can send clients today, under your referral',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[#1F4E5A] font-medium">
                  <span className="mt-1 inline-flex shrink-0 w-5 h-5 items-center justify-center rounded-full bg-[#8FD89E] border-2 border-[#1F4E5A] text-xs font-black">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <a
                href="#apply"
                className="inline-block h-14 px-8 leading-[3.1rem] rounded-lg font-extrabold text-base tracking-tight border-4 bg-[#2D6E7E] text-[#FBF3DC] border-[#1F4E5A] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#1F4E5A] transition"
              >
                APPLY BELOW ↓
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS TODAY */}
      <section className="bg-[#FFFDF5] py-20 border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-4">
              <RobotImage
                src="/images/robot-hero.png"
                alt="Two robots working together"
                className="w-full max-w-sm mx-auto object-contain"
                fallback="🤝"
              />
            </div>
            <div className="lg:col-span-8">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1F4E5A]">
                Start simple, right now
              </h2>
              <ol className="mt-8 space-y-4">
                {[
                  'Run a free scan on any client\'s site',
                  'Share the results — it\'s an easy, visual way to start a conversation about AI-readiness',
                  'We onboard the client, you stay the trusted advisor',
                  '(Coming soon) See all your clients\' statuses in one dashboard',
                ].map((item, i) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="shrink-0 inline-flex w-10 h-10 items-center justify-center rounded-full bg-[#E89B4A] border-4 border-[#1F4E5A] font-black text-[#1F4E5A]">
                      {i + 1}
                    </span>
                    <p className="text-[#1F4E5A] text-base sm:text-lg leading-relaxed pt-1">{item}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* APPLY FORM */}
      <section id="apply" className="bg-[#2D6E7E] py-20">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#E89B4A] tracking-tight text-center">
            Want in on founding partner access?
          </h2>
          <div className="mt-10 bg-[#FFFDF5] border-4 border-[#1F4E5A] p-6 sm:p-8 shadow-[8px_8px_0_0_#1F4E5A]">
            {submitted ? (
              <div className="text-center py-8">
                <p className="text-2xl font-black text-[#1F4E5A]">Thanks!</p>
                <p className="mt-2 text-[#1F4E5A]">
                  We'll be in touch soon about founding partner access.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                {[
                  { key: 'name', label: 'Your Name', type: 'text', placeholder: 'Jane Smith' },
                  { key: 'agency', label: 'Agency Name', type: 'text', placeholder: 'Acme Studio' },
                  { key: 'clients', label: 'Number of Clients', type: 'text', placeholder: '12' },
                  { key: 'website', label: 'Website URL', type: 'url', placeholder: 'https://acme.com' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-sm font-bold text-[#1F4E5A] mb-1.5">{f.label}</label>
                    <input
                      type={f.type}
                      required={f.key === 'name' || f.key === 'agency'}
                      value={form[f.key as keyof typeof form]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      maxLength={200}
                      className="w-full h-12 px-4 rounded-lg text-base font-medium bg-[#FBF3DC] text-[#1F4E5A] border-4 border-[#1F4E5A] placeholder:text-[#7E9AA0] placeholder:font-normal focus:outline-none focus:border-[#E89B4A] transition"
                    />
                  </div>
                ))}
                {error && (
                  <p className="text-sm font-bold text-[#D85A4A]" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-14 px-6 rounded-lg font-extrabold text-base tracking-tight border-4 bg-[#E89B4A] text-[#1F4E5A] border-[#1F4E5A] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#1F4E5A] transition disabled:opacity-60"
                >
                  {submitting ? 'SENDING…' : 'APPLY FOR EARLY ACCESS →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
