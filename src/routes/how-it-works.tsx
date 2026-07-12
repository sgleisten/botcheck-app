import { createFileRoute, Link } from '@tanstack/react-router'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { RobotImage } from '@/components/ui/RobotImage'

export const Route = createFileRoute('/how-it-works')({
  head: () => ({
    meta: [
      { title: 'How BotCheck Works — Five Steps to AI-Ready' },
      {
        name: 'description',
        content:
          'How BotCheck makes your business visible to AI agents: scan, fill the gaps, build your AI profile, host it, and monitor weekly.',
      },
      { property: 'og:title', content: 'How BotCheck Works — Five Steps to AI-Ready' },
      {
        property: 'og:description',
        content:
          'Five things happen behind the scenes so AI agents always have the right answers about your business.',
      },
    ],
  }),
  component: HowItWorks,
})

const STEPS = [
  {
    img: '/images/robot-visiting.png',
    fallback: '🔍',
    alt: 'A robot studying your website',
    title: 'We scan your site like a robot would',
    body:
      'BotCheck crawls your website the same way ChatGPT, Gemini, and other AI agents do — checking your hours, services, pricing, location, and booking info. Takes about 60 seconds. This is your free Agent Readiness Score.',
  },
  {
    img: '/images/robot-maze.png',
    fallback: '💬',
    alt: 'A robot asking a few quick questions',
    title: 'A quick chat fills in the gaps',
    body:
      "Most sites are missing info that's obvious to humans but invisible to robots (your real hours vs. your 'seasonal' hours, what 'the Hydra Facial' actually includes, whether you take walk-ins). We pre-fill everything we can from your scan, then ask you a few quick questions to fill in the rest.",
  },
  {
    img: '/images/robot-check.png',
    fallback: '📋',
    alt: 'A robot building a business profile',
    title: 'We build your AI business profile',
    body:
      'This is the file AI agents actually read — a clean, structured summary of your business that lives alongside your website. Think of it as a spec sheet for robots: accurate, current, and written so they can\'t misunderstand it.',
  },
  {
    img: '/images/robot-hero.png',
    fallback: '🎉',
    alt: 'Celebrating robots',
    title: 'We host it, you keep your site',
    body:
      'One small DNS update points AI agents to your profile. Your website stays exactly as it is — same builder, same design, same login. BotCheck runs quietly in the background.',
  },
  {
    img: '/images/robot-visiting.png',
    fallback: '📅',
    alt: 'A robot checking a calendar',
    title: 'We check it every week, forever',
    body:
      'Change your hours? Add a service? Raise your prices? BotCheck notices when your live site drifts from your AI profile and flags it — so robots (and the customers they\'re talking to) never get outdated info.',
  },
]

function HowItWorks() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FBF3DC]">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[#FBF3DC] border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-4xl px-6 pt-16 sm:pt-20 pb-16 text-center">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#2D6E7E]/70 mb-5">
            How BotCheck works
          </p>
          <h1 className="font-black tracking-tight text-[#1F4E5A] leading-[1.05] text-3xl sm:text-4xl md:text-5xl">
            Five things happen behind the scenes so{' '}
            <span className="font-serif italic text-[#E89B4A]">
              AI agents always have the right answers
            </span>{' '}
            about your business.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[#1F4E5A]/70 italic">
            No code, no maintenance, no "wait, who updates that?"
          </p>
        </div>
      </section>

      {/* STEPS */}
      <section className="bg-[#FFFDF5] py-20 border-b-4 border-[#1F4E5A]">
        <div className="mx-auto max-w-5xl px-6 space-y-16">
          {STEPS.map((s, i) => {
            const reverse = i % 2 === 1
            return (
              <div
                key={s.title}
                className={`grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center ${
                  reverse ? 'md:[&>div:first-child]:order-2' : ''
                }`}
              >
                <div className="bg-[#FBF3DC] border-4 border-[#1F4E5A] p-4 shadow-[6px_6px_0_0_#1F4E5A]">
                  <RobotImage
                    src={s.img}
                    alt={s.alt}
                    className="w-full h-56 sm:h-64 object-contain"
                    fallback={s.fallback}
                  />
                </div>
                <div>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#E89B4A] border-4 border-[#1F4E5A] font-black text-xl text-[#1F4E5A] mb-4">
                    {i + 1}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1F4E5A]">
                    {s.title}
                  </h2>
                  <p className="mt-4 text-[#1F4E5A] leading-relaxed text-base sm:text-lg">{s.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="bg-[#2D6E7E] py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#E89B4A] tracking-tight">
            That's it. Five steps, most of which we do for you.
          </h2>
          <div className="mt-10">
            <Link
              to="/"
              className="inline-block h-14 px-8 leading-[3.1rem] rounded-lg font-extrabold text-base tracking-tight border-4 bg-[#E89B4A] text-[#1F4E5A] border-[#E89B4A] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#1F4E5A] transition"
            >
              RUN MY BOTCHECK →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
