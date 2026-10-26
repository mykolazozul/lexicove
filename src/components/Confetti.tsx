import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'

const COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--coin)', 'var(--fire)', 'var(--success)', '#f472b6']

/** A short burst of falling confetti over the whole screen. Skipped when motion is reduced. */
export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const reduce = useReducedMotion()
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 7,
        spin: (Math.random() - 0.5) * 900,
        drift: (Math.random() - 0.5) * 160,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.3,
      })),
    [pieces],
  )
  if (reduce || typeof document === 'undefined') return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {items.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute -top-4 block"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 0.55,
            background: piece.color,
            borderRadius: piece.round ? 9999 : 2,
          }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: window.innerHeight + 60, x: piece.drift, rotate: piece.spin, opacity: [1, 1, 1, 0] }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>,
    document.body,
  )
}
