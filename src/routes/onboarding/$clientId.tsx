import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { getOnboardingData, runOnboardingChat, generateProfile } from '@/lib/onboarding.functions'
import { CATEGORY_LABELS, scoreColor, type SiteScan } from '@/lib/site-scan'
import { ScoreRing } from '@/components/ui/ScoreRing'

export const Route = createFileRoute('/onboarding/$clientId')({
  loader: ({ params }) => getOnboardingData({ data: { clientId: params.clientId } }),
  component: OnboardingChat,
})

type Message = {
  role: 'user' | 'assistant'
  content: string
  hidden?: boolean
}

type Phase = 'chat' | 'generating' | 'done'

function OnboardingChat() {
  const { client, siteScan } = Route.useLoaderData()
  const { clientId } = Route.useParams()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('chat')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [findingsOpen, setFindingsOpen] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendToAssistant = useCallback(
    async (allMessages: Message[]) => {
      if (!siteScan) {
        setError('We could not find your website scan. Go back to botcheck.io and run a free scan first.')
        return
      }

      setLoading(true)
      setError(null)
      try {
        const { message } = await runOnboardingChat({
          data: {
            clientId,
            messages: allMessages.map(({ role, content }) => ({ role, content })),
            siteScan,
          },
        })

        const isReady = message.includes('READY_TO_GENERATE')
        const displayText = message.replace(/READY_TO_GENERATE/g, '').trim()

        const assistantMsg: Message = { role: 'assistant', content: displayText }
        setMessages((prev) => [...prev, assistantMsg])

        if (isReady) {
          setPhase('generating')
          const transcript = [...allMessages, assistantMsg]
            .filter((m) => !m.hidden)
            .map((m) => `${m.role === 'user' ? 'Owner' : 'Assistant'}: ${m.content}`)
            .join('\n\n')

          try {
            await generateProfile({ data: { clientId, siteScan, questionnaireAnswers: transcript } })
            setPhase('done')
            setTimeout(() => navigate({ to: '/onboarding/status' }), 2500)
          } catch (genErr) {
            setPhase('chat')
            setError(genErr instanceof Error ? genErr.message : 'Generation failed')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
    },
    [clientId, siteScan, navigate],
  )

  useEffect(() => {
    if (initialized.current || !siteScan) return
    initialized.current = true

    const seed: Message = {
      role: 'user',
      content: "Hi, I'm ready to set up my AI presence based on my website scan.",
      hidden: true,
    }
    setMessages([seed])
    sendToAssistant([seed])
  }, [sendToAssistant, siteScan])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading || phase !== 'chat') return

    const userMsg: Message = { role: 'user', content: input.trim() }
    setInput('')
    const next = [...messages, userMsg]
    setMessages(next)
    await sendToAssistant(next)
  }

  const visible = messages.filter((m) => !m.hidden)
  const isDisabled = loading || phase !== 'chat' || !siteScan

  return (
    <div className="flex flex-col h-screen bg-cream">
      {/* Header */}
      <div className="border-b-2 border-teal bg-teal px-5 py-4 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-cream">{client.business_name ?? client.domain}</p>
            <p className="text-xs text-cream/60 mt-0.5">AI Presence Setup</p>
          </div>
          {siteScan && (
            <div className="shrink-0 scale-75 origin-right">
              <ScoreRing score={siteScan.arsScore} size={72} />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-4 space-y-4">
          {!siteScan ? (
            <div className="border-2 border-orange bg-orange/20 p-4 text-sm text-teal">
              We don&apos;t have scan results for this site yet. Run a free scan at{' '}
              <a href="/" className="underline font-medium">botcheck.io</a> first, then return here
              after checkout.
            </div>
          ) : (
            <ScanFindingsPanel
              siteScan={siteScan}
              open={findingsOpen}
              onToggle={() => setFindingsOpen((v) => !v)}
            />
          )}

          {/* Messages */}
          <div className="space-y-4">
            {visible.length === 0 && loading && <TypingIndicator />}

            {visible.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-teal text-cream card-shadow'
                      : 'bg-cream border-2 border-teal text-teal card-shadow'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {visible.length > 0 && loading && phase === 'chat' && <TypingIndicator />}

            {phase === 'generating' && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 bg-cream border-2 border-teal px-4 py-3 text-sm text-teal card-shadow">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Building your AI profile…
                </div>
              </div>
            )}

            {phase === 'done' && (
              <div className="flex justify-start">
                <div className="bg-green/20 border-2 border-green px-4 py-3 text-sm text-teal">
                  Your profile is being reviewed. We&apos;ll email you when it&apos;s live.
                </div>
              </div>
            )}

            {error && (
              <p className="text-center text-xs text-coral">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="border-t-2 border-teal bg-cream px-5 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isDisabled}
            placeholder={
              !siteScan
                ? 'Scan required before setup'
                : phase === 'done'
                  ? 'Setup complete'
                  : 'Confirm or correct what we found…'
            }
            className="input-field flex-1 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isDisabled}
            className="shrink-0 bg-teal p-2.5 text-cream hover:bg-teal-dark disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

function ScanFindingsPanel({
  siteScan,
  open,
  onToggle,
}: {
  siteScan: SiteScan
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-2 border-teal bg-cream card-shadow overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange/10 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-teal">What we found on your website</p>
          <p className="text-xs text-teal/60 mt-0.5 truncate">{siteScan.url}</p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-teal/50 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-teal/50 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t-2 border-teal px-4 py-3 space-y-3">
          {(Object.entries(siteScan.categories) as [keyof typeof CATEGORY_LABELS, SiteScan['categories'][keyof SiteScan['categories']]][]).map(
            ([key, cat]) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-medium text-teal">{CATEGORY_LABELS[key]}</span>
                  <span className={`font-semibold ${scoreColor(cat.score * 4)}`}>{cat.score}/25</span>
                </div>
                <p className="text-xs text-teal/70 leading-relaxed">{cat.finding}</p>
              </div>
            ),
          )}

          {siteScan.topIssues.length > 0 && (
            <div className="pt-2 border-t border-teal/20">
              <p className="text-xs font-medium text-coral mb-1">Top issues</p>
              <ul className="space-y-1">
                {siteScan.topIssues.slice(0, 3).map((issue, i) => (
                  <li key={i} className="text-xs text-teal/70 flex gap-1.5">
                    <span className="text-coral shrink-0">✗</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-cream border-2 border-teal px-4 py-3 flex gap-1 items-center card-shadow">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-2 h-2 bg-teal/40 rounded-full animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
