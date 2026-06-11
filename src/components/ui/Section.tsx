import type { HTMLAttributes } from 'react'

type Tone = 'cream' | 'teal' | 'orange' | 'teal-dark'

const tones: Record<Tone, string> = {
  cream: 'bg-cream text-teal',
  teal: 'bg-teal text-cream',
  orange: 'bg-orange text-teal',
  'teal-dark': 'bg-teal-dark text-cream',
}

type Props = HTMLAttributes<HTMLElement> & {
  tone?: Tone
  as?: 'section' | 'div'
  wide?: boolean
}

export function Section({
  tone = 'cream',
  as = 'section',
  wide = false,
  className = '',
  children,
  ...props
}: Props) {
  const Tag = as
  return (
    <Tag className={`w-full ${tones[tone]} ${className}`} {...props}>
      <div className={`${wide ? 'max-w-5xl' : 'max-w-4xl'} mx-auto px-4 sm:px-6 py-12`}>
        {children}
      </div>
    </Tag>
  )
}
