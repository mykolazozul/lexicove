import { cx } from '../lib/cx'

/** The app icon: an "L" whose foot curls up like a wave in a cove. Mirrors public/logo.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="116" fill="#8B5CF6" />
      <path
        d="M196 146 V300 Q196 356 252 356 H284 Q326 356 334 314"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="56"
        strokeLinecap="round"
        strokeLinejoin="round"
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
          'font-display text-base font-semibold tracking-tight',
          compact && 'hidden min-[400px]:inline',
        )}
      >
        Lexicove
      </span>
    </span>
  )
}
