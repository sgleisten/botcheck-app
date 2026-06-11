import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  shadow?: boolean
  elevated?: boolean
}

export function Card({ shadow = true, elevated = false, className = '', children, ...props }: Props) {
  return (
    <div
      className={`bg-cream border-2 border-teal/15 rounded-lg p-6 ${shadow ? 'card-shadow' : ''} ${elevated ? 'card-elevated border-teal/10' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
