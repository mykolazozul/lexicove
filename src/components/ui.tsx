import { useId, type ComponentProps, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../lib/cx'

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('glass rounded-card p-5 sm:p-6', className)} {...rest} />
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'coin' | 'fire'
  className?: string
}) {
  const tones = {
    neutral: 'bg-surface text-muted border-line',
    accent: 'bg-accent/12 text-accent border-accent/25',
    coin: 'bg-coin/12 text-coin border-coin/25',
    fire: 'bg-fire/12 text-fire border-fire/25',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function ProgressRing({
  value,
  max,
  size = 132,
  stroke = 12,
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const id = useId()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const share = max > 0 ? Math.min(1, value / max) : 0

  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
            <stop offset="1" style={{ stopColor: 'var(--accent-2)' }} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: 'var(--line)' }}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - share) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          // A round cap would still draw a dot at 0%.
          opacity={share > 0 ? 1 : 0}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const share = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-line', className)}>
      <motion.div
        className="bg-gradient-accent h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${share * 100}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size }
  if (url) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full object-cover ring-2 ring-line"
        style={style}
      />
    )
  }
  return (
    <span
      className="bg-gradient-accent grid shrink-0 place-items-center rounded-full font-display font-semibold text-on-accent"
      style={{ ...style, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: ReactNode }>
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border border-line bg-surface p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'relative rounded-[calc(var(--radius-md)-4px)] px-4 py-1.5 text-sm font-semibold transition-colors',
              active ? 'text-on-accent' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={id}
                className="bg-gradient-accent absolute inset-0 rounded-[inherit]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  )
}

/** Fades and lifts children in, one after another. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
