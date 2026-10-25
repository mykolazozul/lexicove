import { useId } from 'react'
import { cx } from '../lib/cx'

/** The app icon: an "L" above a wave (the cove), with a coin-sun. Mirrors public/logo.svg. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill={`url(#${id})`} />
      <circle cx="352" cy="166" r="42" fill="#FCD34D" />
      <path
        d="M176 118 V306 Q176 362 232 362 H352"
        fill="none"
        stroke="#fff"
        strokeWidth="60"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M136 432 Q166 410 196 432 T256 432 T316 432 T376 432"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.6"
        strokeWidth="22"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** `compact` hides the wordmark on the narrowest phones, where the top bar is tight. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-8 drop-shadow-[0_6px_16px_rgb(139_92_246/0.45)]" />
      <span
        className={cx(
          'font-display text-[1.05rem] font-semibold tracking-tight',
          compact && 'hidden min-[400px]:inline',
        )}
      >
        Lexicove
      </span>
    </span>
  )
}
