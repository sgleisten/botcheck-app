import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'orange'

const variants: Record<Variant, string> = {
  primary: 'bg-teal text-cream hover:bg-teal-dark shadow-sm',
  secondary: 'bg-white text-teal border-2 border-teal/20 hover:border-teal',
  orange: 'bg-orange text-teal hover:brightness-105 shadow-sm',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'md' | 'lg'
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: Props) {
  const sizes = size === 'lg' ? 'px-6 py-3 text-base' : 'px-5 py-2.5 text-sm'
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all disabled:opacity-50 ${variants[variant]} ${sizes} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
