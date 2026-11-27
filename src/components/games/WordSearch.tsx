import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock } from '../icons'
import { Card } from '../ui'
import { GameBar } from './QuizGames'
import { useSound } from '../../lib/cosmetics'
import { cx } from '../../lib/cx'
import { buildWordSearch, lineBetween } from '../../lib/games'
import type { GameProps } from '../../pages/GamePage'

const COLOURS = ['bg-accent/30', 'bg-success/30', 'bg-coin/30', 'bg-fire/30', 'bg-accent-2/30', 'bg-xp/30', 'bg-danger/25']

/**
 * The English words hide in a square of letters; the clues are their translations. Tap the first
 * letter of a word, then its last. The time is the score.
 */
export function WordSearch({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const sound = useSound()
  const puzzle = useMemo(() => buildWordSearch(words.map((w) => ({ word: w.word, clue: w.translation })), 10, 7), [words])
  const started = useRef(Date.now())
  const [seconds, setSeconds] = useState(0)
  const [found, setFound] = useState<string[]>([])
  const [start, setStart] = useState<[number, number] | null>(null)
  const [wrong, setWrong] = useState<Set<string>>(new Set())
  const finished = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (finished.current || puzzle.words.length === 0 || found.length < puzzle.words.length) return
    finished.current = true
    sound('level')
    setTimeout(() => onFinish(Math.round((Date.now() - started.current) / 1000)), 700)
  }, [found, puzzle, onFinish, sound])

  // Which colour each found cell gets.
  const colourOf = new Map<string, string>()
  found.forEach((word, index) => {
    const hidden = puzzle.words.find((w) => w.word === word)
    hidden?.cells.forEach(([r, c]) => colourOf.set(`${r},${c}`, COLOURS[index % COLOURS.length]!))
  })

  function tap(cell: [number, number]) {
    if (!start) {
      setStart(cell)
      return
    }
    if (start[0] === cell[0] && start[1] === cell[1]) {
      setStart(null)
      return
    }
    setStart(null)
    check(start, cell)
  }

  function check(start: [number, number], cell: [number, number]) {
    const line = lineBetween(start, cell)
    const text = line?.map(([r, c]) => puzzle.grid[r]![c]).join('') ?? ''
    const reversed = [...text].reverse().join('')
    const hit = puzzle.words.find((w) => (w.word === text || w.word === reversed) && !found.includes(w.word))
    if (hit) {
      sound('correct')
      setFound([...found, hit.word])
    } else {
      sound('wrong')
      setWrong(new Set((line ?? [start, cell]).map(([r, c]) => `${r},${c}`)))
      setTimeout(() => setWrong(new Set()), 450)
    }
  }

  // A finger (or the mouse) drawn across the letters selects the whole line at once.
  const [drag, setDragState] = useState<{ from: [number, number]; to: [number, number] } | null>(null)
  // The latest line, read on release even if the screen hasn't caught up with the last move yet.
  const dragRef = useRef(drag)
  const setDrag = (next: typeof drag) => {
    dragRef.current = next
    setDragState(next)
  }
  const moved = useRef(false)
  const preview = new Set(drag ? (lineBetween(drag.from, drag.to) ?? []).map(([r, c]) => `${r},${c}`) : [])

  function cellAt(x: number, y: number): [number, number] | null {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')?.dataset.cell
    if (!cell) return null
    const [r, c] = cell.split(',').map(Number)
    return [r!, c!]
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not every pointer can be captured; moving still works over the grid.
    }
    moved.current = false
    setDrag({ from: cell, to: cell })
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    const cell = cellAt(event.clientX, event.clientY)
    if (!cell || (cell[0] === drag.to[0] && cell[1] === drag.to[1])) return
    moved.current = moved.current || cell[0] !== drag.from[0] || cell[1] !== drag.from[1]
    setDrag({ from: drag.from, to: cell })
  }

  function onPointerUp() {
    const drag = dragRef.current
    if (!drag) return
    const { from, to } = drag
    setDrag(null)
    if (moved.current && (from[0] !== to[0] || from[1] !== to[1])) {
      setStart(null)
      check(from, to)
    } else {
      tap(from)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-4" />
          {t('games.seconds', { count: seconds })}
        </span>
        <span>{t('games.search.found', { found: found.length, total: puzzle.words.length })}</span>
      </GameBar>
      <Card padding="p-2.5 sm:p-6" className="flex flex-col gap-5 lg:flex-row">
        <div
          className="mx-auto grid w-full max-w-md shrink-0 touch-none gap-px select-none sm:gap-0.5"
          style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          {puzzle.grid.map((row, r) =>
            row.map((letter, c) => {
              const id = `${r},${c}`
              const isStart = start?.[0] === r && start?.[1] === c
              return (
                <button
                  key={id}
                  type="button"
                  data-cell={id}
                  // Pointers are handled on the grid; this is the keyboard's Enter or Space.
                  onClick={(event) => event.detail === 0 && tap([r, c])}
                  className={cx(
                    'grid aspect-square place-items-center rounded-[4px] font-display text-sm font-bold transition-colors sm:text-base',
                    isStart || preview.has(id) ? 'bg-accent text-on-accent' : wrong.has(id) ? 'bg-danger/30' : (colourOf.get(id) ?? 'bg-surface hover:bg-accent/15'),
                  )}
                >
                  {letter}
                </button>
              )
            }),
          )}
        </div>
        <ul className="flex flex-1 flex-col gap-1.5">
          {puzzle.words.map((hidden) => {
            const done = found.includes(hidden.word)
            return (
              <li key={hidden.word} className={cx('flex items-center gap-2 text-sm', done ? 'text-muted' : 'text-fg')}>
                {done ? <Check className="size-4 shrink-0 text-success" /> : <span className="size-4 shrink-0" />}
                <span lang="uk" className={cx(done && 'line-through')}>
                  {hidden.clue}
                </span>
                <span className="ml-auto font-mono text-xs text-subtle">{done ? hidden.word : `${hidden.word.length}`}</span>
              </li>
            )
          })}
        </ul>
      </Card>
      <p className="text-center text-xs text-subtle">{t('games.search.how')}</p>
    </div>
  )
}
