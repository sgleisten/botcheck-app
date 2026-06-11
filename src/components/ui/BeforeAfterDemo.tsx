type Props = {
  domain: string
  aiNow: string
  aiWithBotcheck: string
}

export function BeforeAfterDemo({ domain, aiNow, aiWithBotcheck }: Props) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <p className="section-label mb-2">The magic moment</p>
        <h2 className="text-2xl md:text-3xl font-extrabold text-teal">
          What AI tells your customers today
        </h2>
        <p className="mt-2 text-sm text-teal/60 max-w-xl mx-auto">
          When someone asks an AI assistant about {domain}, here&apos;s the difference.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-lg border-2 border-coral/40 bg-cream p-6 card-elevated">
          <p className="text-xs font-bold uppercase tracking-wide text-coral mb-3">
            Without BotCheck
          </p>
          <p className="text-sm text-teal leading-relaxed whitespace-pre-line">{aiNow}</p>
        </div>
        <div className="rounded-lg border-2 border-green/50 bg-cream p-6 card-elevated">
          <p className="text-xs font-bold uppercase tracking-wide text-green mb-3">
            With BotCheck
          </p>
          <p className="text-sm text-teal leading-relaxed whitespace-pre-line">
            {aiWithBotcheck}
          </p>
        </div>
      </div>
    </div>
  )
}
