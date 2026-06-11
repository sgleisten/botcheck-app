import { categoryBarColor, categoryDotColor } from '@/lib/site-scan'

type Props = {
  question: string
  score: number
  finding: string
}

export function CategoryCard({ question, score, finding }: Props) {
  return (
    <div className="bg-cream border-2 border-teal/15 rounded-lg card-elevated p-5 relative">
      <span
        className={`absolute top-4 right-4 w-3 h-3 rounded-full ${categoryDotColor(score)}`}
      />
      <p className="text-sm font-semibold text-teal pr-6">{question}</p>
      <p className="text-3xl font-extrabold font-display text-teal mt-2">
        {score}
        <span className="text-lg font-normal text-teal/50"> / 25</span>
      </p>
      <div className="w-full bg-teal/10 h-2 mt-3">
        <div
          className={`h-2 ${categoryBarColor(score)} transition-all`}
          style={{ width: `${(score / 25) * 100}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-teal/80 leading-relaxed">{finding}</p>
    </div>
  )
}
