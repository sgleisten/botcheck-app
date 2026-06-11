import { useState } from 'react'

type Props = {
  src: string
  alt: string
  className?: string
  fallback?: string
}

export function RobotImage({ src, alt, className = '', fallback = '🤖' }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center text-6xl bg-cream border-2 border-teal card-shadow ${className}`}
        aria-hidden
      >
        {fallback}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
