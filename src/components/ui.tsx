import { useId, type ComponentProps, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../lib/cx'

/**
 * Glass card with a soft light that follows the cursor.
 * `glow` adds the accent-coloured hairline border for the most important cards on a page.
 */
export function Card({ className, glow = false, onPointerMove, ...rest }: ComponentProps<'div'> & { glow?: boolean }) {
  return (
    <div
      className={cx('glass spotlight rounded-card p-5 sm:p-6', glow && 'ring-gradient', className)}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`)
        event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`)
        onPointerMove?.(event)
      }}
      {...rest}
    />
  )
}

const CHIP_TONES = {
  accent: 'bg-accent/12 text-accent ring-accent/20',
  'accent-2': 'bg-accent-2/12 text-accent-2 ring-accent-2/20',
  coin: 'bg-coin/12 text-coin ring-coin/20',
  fire: 'bg-fire/12 text-fire ring-fire/20',
  xp: 'bg-xp/12 text-xp ring-xp/20',
  success: 'bg-success/12 text-success ring-success/20',
} as const

export type ChipTone = keyof typeof CHIP_TONES

/** A tinted square that holds an icon. */
export function IconChip({ tone, children, className }: { tone: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('grid size-10 shrink-0 place-items-center rounded-control ring-1', CHIP_TONES[tone], className)}>
      {children}
    </span>
  )
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
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        style={{ filter: 'drop-shadow(0 0 14px color-mix(in oklab, var(--accent) 35%, transparent))' }}
      >
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
    <div role="radiogroup" aria-label={label} className="segmented inline-flex rounded-control border border-line bg-surface p-1">
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
                className="segmented-pill bg-gradient-accent absolute inset-0 rounded-[inherit]"
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

/** An iOS-style on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200',
        checked ? 'bg-success' : 'bg-line',
      )}
    >
      <motion.span
        className="block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
      />
    </button>
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
