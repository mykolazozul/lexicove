import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from '../lib/cx'

// Every control here replaces a native one (checkbox, radio, select, details), so the whole app
// keeps one look in every browser.

/**
 * Glass card with a soft light that follows the cursor.
 * `glow` adds the accent-coloured hairline border for the most important cards on a page.
 * Padding is its own prop: a padding class passed in `className` would compete with the default
 * one, and Tailwind decides the winner by stylesheet order, not by the order of the classes.
 */
export function Card({
  className,
  glow = false,
  padding = 'p-5 sm:p-6',
  onPointerMove,
  ...rest
}: ComponentProps<'div'> & { glow?: boolean; padding?: string }) {
  return (
    <div
      className={cx('glass spotlight rounded-card', padding, glow && 'ring-gradient', className)}
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

/** A checkbox with its label; the whole row is the control. */
export function Checkbox({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx('group flex w-full cursor-pointer items-start gap-3 rounded-control text-left text-sm', className)}
    >
      <span
        className={cx(
          'mt-px grid size-5 shrink-0 place-items-center rounded-[7px] border-2 transition-colors',
          checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface group-hover:border-muted',
        )}
      >
        <motion.span initial={false} animate={{ scale: checked ? 1 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}>
          <Check className="size-3.5" strokeWidth={3.5} />
        </motion.span>
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

/** One-of-many choice shown as cards. */
export function RadioCards<T extends string>({
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
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = options.findIndex((option) => option.value === value)
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = options[(index + step + options.length) % options.length]
    if (next) onChange(next.value)
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2" onKeyDown={onKey}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex items-center gap-3 rounded-control border px-3 py-2.5 text-left text-sm transition-colors',
              active ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted hover:bg-surface hover:text-fg',
            )}
          >
            <span className={cx('grid size-4.5 shrink-0 place-items-center rounded-full border-2', active ? 'border-accent' : 'border-line')}>
              {active && <span className="size-2 rounded-full bg-accent" />}
            </span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A dropdown in the app's own style. The list opens in a portal, so it is never clipped by a
 * scrolling dialog, and it works with the keyboard like a native select.
 */
export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
  placeholder,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const current = options.find((option) => option.value === value)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const box = button.current.getBoundingClientRect()
    const height = Math.min(280, options.length * 40 + 8)
    const up = box.bottom + height + 8 > window.innerHeight && box.top > height + 8
    setPlace({ left: box.left, top: up ? box.top - height - 6 : box.bottom + 6, width: Math.max(box.width, 160), up })
  }, [open, options.length])

  // The list renders once its position is known; focus it then, so the arrow keys work at once.
  useEffect(() => {
    if (open && place) list.current?.focus()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target instanceof Node && (list.current?.contains(event.target) || button.current?.contains(event.target))) return
      setOpen(false)
    }
    const dismiss = () => setOpen(false)
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  function show() {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }

  function choose(index: number) {
    const option = options[index]
    setOpen(false)
    button.current?.focus()
    if (option && option.value !== value) onChange(option.value)
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'ArrowDown') setActive((i) => Math.min(options.length - 1, i + 1))
    else if (event.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(options.length - 1)
    else if (event.key === 'Enter' || event.key === ' ') choose(active)
    else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
      button.current?.focus()
    } else return
    event.preventDefault()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault()
            show()
          }
        }}
        className={cx('input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60', className)}
      >
        <span className={cx('truncate', !current && 'text-subtle')}>{current?.label ?? placeholder ?? '—'}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={onListKey}
            className="glass fixed z-[70] max-h-[280px] overflow-y-auto rounded-control bg-elevated p-1 outline-none"
            style={{ left: place.left, top: place.top, width: place.width }}
          >
            {options.map((option, index) => {
              const selected = option.value === value
              return (
                <li
                  key={String(option.value)}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={cx(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-[calc(var(--radius-md)-4px)] px-3 py-2 text-sm',
                    index === active ? 'bg-surface-hover text-fg' : 'text-muted',
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {selected && <Check className="size-4 shrink-0 text-accent" strokeWidth={3} />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </>
  )
}

/** A section that opens and closes, in place of a native details element. */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-muted transition-colors hover:text-fg">
        <ChevronDown className={cx('size-4 transition-transform', !open && '-rotate-90')} />
        {summary}
      </button>
      {open && <div className="mt-2">{children}</div>}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      // Quick on purpose: a page should feel ready, not still arriving.
      transition={{ duration: 0.28, delay: delay * 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
