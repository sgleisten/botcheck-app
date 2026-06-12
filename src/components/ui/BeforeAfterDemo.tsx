import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'

export type BeforeAfterContent = {
  user_question?: string
  ai_now: string
  ai_with_botcheck: string
  stakes?: string
  pain_signals?: string[]
  win_signals?: string[]
}

type Props = {
  domain: string
  content: BeforeAfterContent
}

type View = 'before' | 'after'
type Phase = 'thinking' | 'typing' | 'done'

function defaultQuestion(domain: string): string {
  return `What are your prices and how do I book at ${domain}?`
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="AI is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot inline-block w-2 h-2 rounded-full bg-teal/40"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  )
}

function SignalPills({
  items,
  variant,
}: {
  items: string[]
  variant: 'pain' | 'win'
}) {
  if (items.length === 0) return null

  return (
    <ul className="mt-4 flex flex-wrap gap-2 animate-fade-up">
      {items.map((item) => (
        <li
          key={item}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            variant === 'pain'
              ? 'bg-coral/12 text-coral border border-coral/25'
              : 'bg-green/15 text-teal border border-green/40'
          }`}
        >
          {variant === 'pain' ? (
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="w-3 h-3 shrink-0 text-green" aria-hidden />
          )}
          {item}
        </li>
      ))}
    </ul>
  )
}

export function BeforeAfterDemo({ domain, content }: Props) {
  const question = content.user_question?.trim() || defaultQuestion(domain)
  const stakes =
    content.stakes?.trim() ||
    'Every confused AI answer is a customer who quietly booked somewhere else.'
  const painSignals = content.pain_signals?.filter(Boolean) ?? []
  const winSignals = content.win_signals?.filter(Boolean) ?? []

  const [view, setView] = useState<View>('before')
  const [mounted, setMounted] = useState(false)
  const [phase, setPhase] = useState<Phase>('done')
  const [typed, setTyped] = useState('')
  const seenAfter = useRef(false)

  const fullText = view === 'before' ? content.ai_now : content.ai_with_botcheck

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    let typeTimer: ReturnType<typeof setInterval>
    setTyped('')
    setPhase('thinking')

    const thinkTimer = setTimeout(() => {
      setPhase('typing')
      let i = 0
      typeTimer = setInterval(() => {
        i += 2
        setTyped(fullText.slice(0, i))
        if (i >= fullText.length) {
          clearInterval(typeTimer)
          setPhase('done')
        }
      }, 16)
    }, 600)

    return () => {
      clearTimeout(thinkTimer)
      clearInterval(typeTimer)
    }
  }, [view, mounted, fullText])

  const shownText = mounted ? typed : fullText
  const isAfter = view === 'after'
  const showSignals = phase === 'done'

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8 animate-fade-up">
        <p className="section-label mb-3">The magic moment</p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-teal-dark leading-tight max-w-2xl mx-auto">
          Your customers are asking AI about{' '}
          <span className="bg-teal-dark text-cream px-2 py-0.5 rounded-md whitespace-nowrap">
            {domain}
          </span>{' '}
          right now
        </h2>
        <p className="mt-4 text-base text-teal-dark/80 max-w-xl mx-auto leading-relaxed font-medium">
          They ask ChatGPT, Claude, and Siri before they ever visit your site. Flip the switch and
          watch what changes.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex justify-center mb-6 animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div
          className="relative flex w-[300px] rounded-full border-2 border-teal/15 bg-cream p-1 card-elevated"
          role="tablist"
          aria-label="Compare AI answers"
        >
          <span
            className={`absolute top-1 bottom-1 left-1 right-1 w-[calc(50%-0.25rem)] rounded-full transition-transform duration-300 ease-out ${
              isAfter ? 'translate-x-full bg-green' : 'translate-x-0 bg-coral'
            }`}
            aria-hidden
          />
          <button
            type="button"
            role="tab"
            aria-selected={!isAfter}
            onClick={() => setView('before')}
            className={`relative z-10 flex-1 text-center whitespace-nowrap px-3 py-2 text-sm font-bold rounded-full transition-colors ${
              !isAfter ? 'text-cream' : 'text-teal/60'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isAfter}
            onClick={() => {
              seenAfter.current = true
              setView('after')
            }}
            className={`relative z-10 flex-1 text-center whitespace-nowrap px-3 py-2 text-sm font-bold rounded-full transition-colors ${
              isAfter ? 'text-cream' : 'text-teal/60'
            }`}
          >
            With BotCheck
          </button>
        </div>
      </div>

      {/* Chat device */}
      <div
        className={`rounded-3xl overflow-hidden border-2 transition-all duration-500 animate-fade-up ${
          isAfter
            ? 'border-green/50 shadow-[0_20px_60px_-20px_rgba(137,180,148,0.6)]'
            : 'border-teal/10 shadow-[0_20px_60px_-25px_rgba(31,61,68,0.4)]'
        }`}
        style={{ animationDelay: '0.2s' }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-teal-dark">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange" aria-hidden />
            <span className="text-sm font-bold text-cream">AI Assistant</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              isAfter ? 'bg-green/25 text-cream' : 'bg-coral/25 text-cream'
            }`}
          >
            {isAfter ? (
              <>
                <ShieldCheck className="w-3 h-3" aria-hidden /> Verified
              </>
            ) : (
              <>
                <ShieldAlert className="w-3 h-3" aria-hidden /> Guessing
              </>
            )}
          </span>
        </div>

        {/* Conversation */}
        <div className="bg-cream px-5 py-6 md:px-7 md:py-7">
          {/* User question */}
          <div className="flex justify-end mb-5">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal px-4 py-3 text-sm md:text-base text-cream leading-relaxed shadow-sm">
              {question}
            </div>
          </div>

          {/* AI answer */}
          <div className="flex items-start gap-3">
            <div
              className={`shrink-0 mt-0.5 w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors ${
                isAfter ? 'bg-green/20 border-2 border-green/40' : 'bg-coral/15 border-2 border-coral/30'
              }`}
              aria-hidden
            >
              {isAfter ? '🤖' : '😵'}
            </div>

            <div
              key={view}
              className={`flex-1 rounded-2xl rounded-tl-md px-4 py-4 text-sm md:text-base leading-relaxed animate-pop-in ${
                isAfter
                  ? 'bg-white text-teal border-2 border-green/40'
                  : 'bg-white/70 text-teal/75 border border-coral/25'
              }`}
            >
              {phase === 'thinking' ? (
                <TypingDots />
              ) : (
                <p className="whitespace-pre-line">
                  {shownText}
                  {phase === 'typing' && (
                    <span className="animate-blink inline-block w-[2px] h-[1.1em] align-middle bg-teal/60 ml-0.5" />
                  )}
                </p>
              )}

              {showSignals && (
                <SignalPills items={isAfter ? winSignals : painSignals} variant={isAfter ? 'win' : 'pain'} />
              )}
            </div>
          </div>

          {/* Outcome line */}
          <div
            className={`mt-6 pt-4 border-t text-sm font-semibold flex items-center gap-2 transition-colors ${
              isAfter ? 'border-green/25 text-green' : 'border-coral/20 text-coral/80'
            }`}
          >
            {isAfter ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                The customer gets exactly what they need — and books with you.
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
                The customer gives up — or books with a competitor instead.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nudge / CTA under chat */}
      {!isAfter ? (
        <div className="mt-6 text-center animate-fade-up">
          <button
            type="button"
            onClick={() => {
              seenAfter.current = true
              setView('after')
            }}
            className="inline-flex items-center gap-2 text-base font-bold text-teal hover:text-orange transition-colors group"
          >
            Watch BotCheck fix this
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl bg-teal px-6 py-6 text-center animate-pop-in">
          <p className="text-lg md:text-xl font-extrabold text-orange leading-snug max-w-xl mx-auto">
            {stakes}
          </p>
          <p className="mt-2 text-sm text-cream/75 max-w-lg mx-auto">
            BotCheck builds the profile AI actually reads, hosts it, and keeps it accurate every
            week — so every AI answer sends customers to you.
          </p>
        </div>
      )}
    </div>
  )
}
