import { useState } from 'react'
import { cx } from '../../lib/cx'

// Admin charts. One measure per chart, a single accent hue for magnitude, thin marks with
// 4px rounded data ends and 2px gaps, recessive hairline axes, a tooltip on every mark and a
// screen-reader table with the same numbers.

export type Point = { label: string; value: number; hint?: string }

/** Numbers in the app's language (1 284 in Ukrainian, 1,284 in English). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(document.documentElement.lang || undefined).format(value)
}

function compact(value: number): string {
  return new Intl.NumberFormat(document.documentElement.lang || undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Round up to a clean axis maximum: 1, 2, 5 x 10^n. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((s) => s * power >= value) ?? 10
  return step * power
}

function SrTable({ caption, points }: { caption: string; points: Point[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {points.map((point) => (
          <tr key={point.label}>
            <th scope="row">{point.hint ?? point.label}</th>
            <td>{point.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Vertical columns over time (e.g. 30 days). Only the first, middle and last dates are labelled. */
export function ColumnChart({ points, caption, height = 168 }: { points: Point[]; caption: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  // Short series (buckets) get every label; long ones (days) only the first, middle and last.
  const labelled =
    points.length <= 8
      ? new Set(points.map((_, index) => index))
      : new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  const focus = active === null ? null : points[active]

  return (
    <figure className="relative">
      <div className="flex gap-3">
        <div className="flex flex-col justify-between pb-6 text-right text-[0.7rem] text-subtle tabular-nums" style={{ height }}>
          <span>{compact(max)}</span>
          <span>{compact(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-line" />
          <div className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: (height - 24) / 2 }} />
          <div className="flex items-end gap-[2px] border-b border-line" style={{ height: height - 24 }} onMouseLeave={() => setActive(null)}>
            {points.map((point, index) => (
              <button
                key={point.label}
                type="button"
                className="group flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${point.hint ?? point.label}: ${point.value}`}
              >
                <span
                  className={cx(
                    'block w-full max-w-6 rounded-t-[4px] transition-opacity',
                    active !== null && active !== index ? 'opacity-45' : 'opacity-100',
                  )}
                  style={{
                    height: `${(point.value / max) * 100}%`,
                    minHeight: point.value > 0 ? 3 : 0,
                    background: 'var(--accent)',
                  }}
                />
              </button>
            ))}
          </div>
          <div className="relative mt-1.5 h-4 text-[0.7rem] text-subtle">
            {points.map((point, index) =>
              labelled.has(index) ? (
                <span
                  key={point.label}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{
                    left: `${((index + 0.5) / points.length) * 100}%`,
                    transform:
                      points.length > 8 && index === 0
                        ? 'translateX(0)'
                        : points.length > 8 && index === points.length - 1
                          ? 'translateX(-100%)'
                          : undefined,
                  }}
                >
                  {point.label}
                </span>
              ) : null,
            )}
          </div>
          {focus && active !== null && (
            <div
              className="glass pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full rounded-control bg-elevated px-3 py-2 text-xs whitespace-nowrap"
              style={{ left: `${((active + 0.5) / points.length) * 100}%` }}
            >
              <div className="text-muted">{focus.hint ?? focus.label}</div>
              <div className="font-semibold text-fg tabular-nums">{formatNumber(focus.value)}</div>
            </div>
          )}
        </div>
      </div>
      <SrTable caption={caption} points={points} />
    </figure>
  )
}

/** Horizontal bars for categories, longest first. Values sit at the bar tips. */
export function BarList({
  items,
  caption,
  total,
  format = formatNumber,
}: {
  items: Point[]
  caption: string
  /** When given, the share of this total is shown next to the value. */
  total?: number
  format?: (value: number) => string
}) {
  const max = Math.max(1, ...items.map((item) => item.value))
  if (items.length === 0) return <p className="text-sm text-subtle">—</p>

  return (
    <figure>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.label} title={`${item.label}: ${format(item.value)}`} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-muted">{item.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {format(item.value)}
                {total ? (
                  <span className="ml-1.5 font-normal text-subtle">{Math.round((item.value / Math.max(total, 1)) * 100)}%</span>
                ) : null}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-r-[4px] bg-line/60">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 3 : 0, background: 'var(--accent)' }}
              />
            </div>
          </li>
        ))}
      </ul>
      <SrTable caption={caption} points={items} />
    </figure>
  )
}

/** Weekday x hour grid. One hue, five quantised steps from faint to full. */
export function Heatmap({
  cells,
  dayLabels,
  caption,
  lowLabel,
  highLabel,
}: {
  cells: Array<{ dow: number; hour: number; count: number }>
  /** Monday first. */
  dayLabels: string[]
  caption: string
  lowLabel: string
  highLabel: string
}) {
  const grid = new Map(cells.map((cell) => [`${cell.dow}:${cell.hour}`, cell.count]))
  const max = Math.max(0, ...cells.map((cell) => cell.count))
  const step = (count: number) => (count === 0 || max === 0 ? 0 : Math.min(5, Math.ceil((count / max) * 5)))
  const fill = (level: number) =>
    level === 0 ? 'var(--line)' : `color-mix(in oklab, var(--accent) ${[0, 22, 40, 58, 78, 100][level]}%, var(--surface))`

  return (
    <figure>
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid min-w-full grid-cols-[2rem_repeat(24,minmax(12px,1fr))] gap-[2px] text-[0.65rem] text-subtle">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center">
              {hour % 6 === 0 ? hour : ''}
            </span>
          ))}
          {dayLabels.map((day, index) => (
            <div key={day} className="contents">
              <span className="pr-1 leading-[14px]">{day}</span>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = grid.get(`${index + 1}:${hour}`) ?? 0
                return (
                  <span
                    key={hour}
                    title={`${day} ${String(hour).padStart(2, '0')}:00 — ${count}`}
                    className="aspect-square min-h-3 rounded-[3px]"
                    style={{ background: fill(step(count)) }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
        {lowLabel}
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <span key={level} className="size-3 rounded-[3px]" style={{ background: fill(level) }} />
        ))}
        {highLabel}
      </figcaption>
      <SrTable
        caption={caption}
        points={cells.map((cell) => ({
          label: `${cell.dow}:${cell.hour}`,
          hint: `${dayLabels[cell.dow - 1]} ${cell.hour}:00`,
          value: cell.count,
        }))}
      />
    </figure>
  )
}

/** Usage against a limit. The fill turns amber past 70% and red past 90%. */
export function Meter({ label, value, limit, format }: { label: string; value: number; limit: number; format: (v: number) => string }) {
  const share = Math.min(1, value / limit)
  const color = share > 0.9 ? 'var(--danger)' : share > 0.7 ? 'var(--coin)' : 'var(--accent)'
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{format(value)}</span>
          <span className="text-subtle"> / {format(limit)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line/60" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(share * 100, value > 0 ? 1 : 0)}%`, background: color }} />
      </div>
    </div>
  )
}
