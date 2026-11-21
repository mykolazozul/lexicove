import { cx } from '../lib/cx'

/** The app icon: a cove holding a word like a small boat. Mirrors public/logo.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="116" fill="#8B5CF6" />
      <path d="M140 214 A116 116 0 0 0 372 214" fill="none" stroke="#FFFFFF" strokeWidth="52" strokeLinecap="round" />
      <circle cx="256" cy="200" r="36" fill="#FFFFFF" />
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
