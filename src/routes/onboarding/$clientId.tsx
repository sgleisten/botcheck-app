import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { getOnboardingData } from '@/lib/onboarding.server'
import { runOnboardingChat, generateProfile } from '@/lib/onboarding.functions'

export const Route = createFileRoute('/onboarding/$clientId')({
  loader: ({ params }) => getOnboardingData({ data: { clientId: params.clientId } }),
  component: OnboardingChat,
})

// Messages include an optional hidden flag for the seed message that bootstraps
// the conversation. Hidden messages are sent to the API for context but not shown.
type Message = {
  role: 'user' | 'assistant'
  content: string
  hidden?: boolean
}

type Phase = 'chat' | 'generating' | 'done'

function OnboardingChat() {
  const { client, crawlData } = Route.useLoaderData()
  const { clientId } = Route.useParams()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('chat')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendToAssistant = useCallback(
    async (allMessages: Message[]) => {
      setLoading(true)
      setError(null)
      try {
        const { message } = await runOnboardingChat({
          data: {
            clientId,
            // Strip the hidden flag before sending to the API
            messages: allMessages.map(({ role, content }) => ({ role, content })),
            crawlData,
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
            await generateProfile({ data: { clientId, crawlData, questionnaireAnswers: transcript } })
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
    [clientId, crawlData, navigate],
  )

  // Seed the conversation: send a hidden opener so Claude always starts first
  // and the Anthropic API's user-first constraint is satisfied.
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const seed: Message = {
      role: 'user',
      content: "Hi, I'm ready to set up my AI presence files.",
      hidden: true,
    }
    setMessages([seed])
    sendToAssistant([seed])
  }, [sendToAssistant])

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
  const isDisabled = loading || phase !== 'chat'

  return (
    <div className="flex flex-col h-screen bg-white max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b px-5 py-4 shrink-0">
        <p className="font-medium text-gray-900">{client.business_name ?? client.domain}</p>
        <p className="text-xs text-gray-400 mt-0.5">AI Presence Setup</p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {visible.length === 0 && loading && <TypingIndicator />}

        {visible.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Thinking indicator while waiting for a reply to a user message */}
        {visible.length > 0 && loading && phase === 'chat' && <TypingIndicator />}

        {/* Generating overlay */}
        {phase === 'generating' && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Generating your AI profile…
            </div>
          </div>
        )}

        {/* Completion message — shown briefly before redirect */}
        {phase === 'done' && (
          <div className="flex justify-start">
            <div className="bg-green-50 border border-green-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-green-800">
              Your profile is being reviewed. We'll email you when it's live.
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t px-5 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isDisabled}
            placeholder={phase === 'done' ? 'Setup complete' : 'Message…'}
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || isDisabled}
            className="shrink-0 rounded-full bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
