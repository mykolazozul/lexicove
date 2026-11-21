import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCheck, Clock, Lightbulb } from '../icons'
import { Card } from '../ui'
import { GameBar } from './QuizGames'
import { useSound } from '../../lib/cosmetics'
import { cx } from '../../lib/cx'
import { buildCrossword, type CrosswordEntry, type Direction } from '../../lib/games'
import type { GameProps } from '../../pages/GamePage'

const HINT_SECONDS = 15
const key = (row: number, col: number) => `${row},${col}`

function cellsOf(entry: CrosswordEntry): string[] {
  return Array.from({ length: entry.word.length }, (_, i) => (entry.dir === 'across' ? key(entry.row, entry.col + i) : key(entry.row + i, entry.col)))
}

/** Clues are the translations; fill in the English words. The time is the score, plus 15 seconds a hint. */
export function Crossword({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const sound = useSound()
  const puzzle = useMemo(() => buildCrossword(words.map((w) => ({ word: w.word, clue: w.translation })), 8), [words])
  const started = useRef(Date.now())
  const [seconds, setSeconds] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [active, setActive] = useState<{ cell: string; dir: Direction } | null>(() =>
    puzzle ? { cell: key(puzzle.entries[0]!.row, puzzle.entries[0]!.col), dir: puzzle.entries[0]!.dir } : null,
  )
  const [checked, setChecked] = useState(false)
  const [hints, setHints] = useState(0)
  const finished = useRef(false)
  const inputs = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 500)
    return () => clearInterval(timer)
  }, [])

  // Every square: its letter, which words pass through it and the clue number it starts.
  const cells = useMemo(() => {
    const map = new Map<string, { letter: string; entries: CrosswordEntry[]; number?: number }>()
    for (const entry of puzzle?.entries ?? []) {
      cellsOf(entry).forEach((cell, i) => {
        const item = map.get(cell) ?? { letter: entry.word[i]!, entries: [] }
        item.entries.push(entry)
        if (i === 0) item.number = entry.number
        map.set(cell, item)
      })
    }
    return map
  }, [puzzle])

  const solved = puzzle !== null && [...cells].every(([cell, item]) => values[cell] === item.letter)
  useEffect(() => {
    if (!solved || finished.current) return
    finished.current = true
    sound('level')
    setTimeout(() => onFinish(Math.round((Date.now() - started.current) / 1000) + hints * HINT_SECONDS), 700)
  }, [solved, hints, onFinish, sound])

  useEffect(() => {
    if (active) inputs.current.get(active.cell)?.focus()
  }, [active])

  if (!puzzle) return <Card className="py-10 text-center text-muted">{t('games.crossword.failed')}</Card>

  const entryAt = (cell: string, dir: Direction) => cells.get(cell)?.entries.find((e) => e.dir === dir)
  const current = active ? (entryAt(active.cell, active.dir) ?? cells.get(active.cell)?.entries[0]) : undefined
  const currentCells = new Set(current ? cellsOf(current) : [])

  function select(cell: string) {
    const item = cells.get(cell)
    if (!item) return
    if (active?.cell === cell && item.entries.length > 1) {
      setActive({ cell, dir: active.dir === 'across' ? 'down' : 'across' })
      return
    }
    const dir = active && item.entries.some((e) => e.dir === active.dir) ? active.dir : item.entries[0]!.dir
    setActive({ cell, dir })
  }

  function step(cell: string, by: number) {
    if (!current) return
    const list = cellsOf(current)
    const next = list[list.indexOf(cell) + by]
    if (next) setActive({ cell: next, dir: current.dir })
  }

  function type(cell: string, raw: string) {
    const letter = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(-1)
    setChecked(false)
    setValues((v) => ({ ...v, [cell]: letter }))
    if (letter) step(cell, 1)
  }

  function keyDown(cell: string, event: KeyboardEvent<HTMLInputElement>) {
    const [r, c] = cell.split(',').map(Number) as [number, number]
    const moves: Record<string, [number, number, Direction]> = {
      ArrowRight: [0, 1, 'across'],
      ArrowLeft: [0, -1, 'across'],
      ArrowDown: [1, 0, 'down'],
      ArrowUp: [-1, 0, 'down'],
    }
    if (event.key === 'Backspace' && !values[cell]) {
      event.preventDefault()
      step(cell, -1)
    } else if (moves[event.key]) {
      event.preventDefault()
      const [dr, dc, dir] = moves[event.key]!
      const next = key(r + dr, c + dc)
      if (cells.has(next)) setActive({ cell: next, dir: entryAt(next, dir) ? dir : cells.get(next)!.entries[0]!.dir })
    }
  }

  function hint() {
    if (!active) return
    const item = cells.get(active.cell)
    if (!item || values[active.cell] === item.letter) return
    setHints((n) => n + 1)
    setValues((v) => ({ ...v, [active.cell]: item.letter }))
    step(active.cell, 1)
  }

  const clues = (dir: Direction) =>
    puzzle.entries
      .filter((entry) => entry.dir === dir)
      .sort((a, b) => a.number - b.number)
      .map((entry) => (
        <li key={`${dir}-${entry.number}`}>
          <button
            type="button"
            onClick={() => setActive({ cell: key(entry.row, entry.col), dir })}
            className={cx(
              'w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
              current === entry ? 'bg-accent/15 text-fg' : 'text-muted hover:text-fg',
              cellsOf(entry).every((cell) => values[cell] === cells.get(cell)?.letter) && 'line-through opacity-60',
            )}
          >
            <span className="font-bold">{entry.number}.</span> <span lang="uk">{entry.clue}</span> ({entry.word.length})
          </button>
        </li>
      ))

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-4" />
          {t('games.seconds', { count: seconds + hints * HINT_SECONDS })}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={hint}>
            <Lightbulb className="size-4 text-coin" />
            {t('games.crossword.hint')}
          </button>
          <button type="button" className="btn btn-secondary h-9 px-3 text-sm" onClick={() => setChecked(true)}>
            <CheckCheck className="size-4" />
            {t('games.crossword.check')}
          </button>
        </span>
      </GameBar>

      <Card className="flex flex-col gap-5 lg:flex-row">
        <div className="mx-auto w-full max-w-md shrink-0">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))` }}>
            {Array.from({ length: puzzle.height * puzzle.width }, (_, i) => {
              const cell = key(Math.floor(i / puzzle.width), i % puzzle.width)
              const item = cells.get(cell)
              if (!item) return <span key={cell} className="aspect-square" />
              const wrong = checked && values[cell] && values[cell] !== item.letter
              return (
                <label key={cell} className="relative aspect-square">
                  {item.number && <span className="pointer-events-none absolute top-0 left-0.5 text-[0.55rem] leading-none font-bold text-subtle">{item.number}</span>}
                  <input
                    ref={(element) => {
                      if (element) inputs.current.set(cell, element)
                      else inputs.current.delete(cell)
                    }}
                    value={values[cell] ?? ''}
                    onChange={(event) => type(cell, event.target.value)}
                    onKeyDown={(event) => keyDown(cell, event)}
                    onClick={() => select(cell)}
                    onFocus={() => active?.cell !== cell && select(cell)}
                    maxLength={2}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-label={t('games.crossword.cell', { number: current?.number ?? '' })}
                    className={cx(
                      'size-full rounded-[3px] border text-center font-display text-sm font-bold uppercase caret-transparent outline-none sm:text-lg',
                      solved ? 'border-success bg-success/15' : wrong ? 'border-danger bg-danger/15 text-danger' : active?.cell === cell ? 'border-accent bg-accent/25' : currentCells.has(cell) ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface',
                    )}
                  />
                </label>
              )
            })}
          </div>
        </div>
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <h4 className="mb-1 text-sm font-semibold">{t('games.crossword.across')}</h4>
            <ol className="flex flex-col">{clues('across')}</ol>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">{t('games.crossword.down')}</h4>
            <ol className="flex flex-col">{clues('down')}</ol>
          </div>
        </div>
      </Card>
    </div>
  )
}
