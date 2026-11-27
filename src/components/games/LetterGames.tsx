import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownLeft, Delete, Eye, SkipForward } from '../icons'
import { Card } from '../ui'
import { GameBar } from './QuizGames'
import { useSound } from '../../lib/cosmetics'
import { cx } from '../../lib/cx'
import { scramble, wordleMarks, type GameWord, type Mark } from '../../lib/games'
import { shuffle } from '../../lib/study'
import type { GameProps } from '../../pages/GamePage'

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** Letters typed on the keyboard, Enter and Backspace, for as long as the game is on screen. */
function useTyping(onKey: (key: string) => void) {
  const handler = useRef(onKey)
  handler.current = onKey
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (/^[a-z]$/i.test(event.key)) handler.current(event.key.toUpperCase())
      else if (event.key === 'Enter') handler.current('ENTER')
      else if (event.key === 'Backspace') handler.current('BACK')
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}

/** The same keys on screen, coloured by what the player has learned about each letter. */
function Keyboard({
  states,
  onKey,
  withEnter = false,
  lockUsed = false,
}: {
  states: Map<string, Mark | 'used'>
  onKey: (key: string) => void
  withEnter?: boolean
  /** Letters already tried can't be pressed again (Balloons). */
  lockUsed?: boolean
}) {
  const { t } = useTranslation()
  const special = 'grid h-11 shrink-0 place-items-center rounded-md bg-elevated px-2.5 ring-1 ring-line hover:ring-accent'
  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {ROWS.map((row, index) => (
        <div key={row} className="flex w-full justify-center gap-1">
          {index === 2 && withEnter && (
            <button type="button" className={special} onClick={() => onKey('ENTER')} aria-label={t('games.enter')}>
              <CornerDownLeft className="size-4" />
            </button>
          )}
          {row.split('').map((letter) => {
            const state = states.get(letter)
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKey(letter)}
                disabled={lockUsed && state !== undefined}
                className={cx(
                  'h-11 min-w-0 flex-1 rounded-md text-sm font-bold transition-colors sm:max-w-11',
                  state === 'hit' ? 'bg-success text-bg' : state === 'near' ? 'bg-coin text-bg' : state === 'miss' || state === 'used' ? 'bg-surface text-subtle opacity-50' : 'bg-elevated ring-1 ring-line hover:ring-accent',
                )}
              >
                {letter}
              </button>
            )
          })}
          {index === 2 && withEnter && (
            <button type="button" className={special} onClick={() => onKey('BACK')} aria-label={t('games.erase')}>
              <Delete className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Hint({ word }: { word: GameWord }) {
  const { t } = useTranslation()
  return (
    <p className="text-center text-sm text-muted">
      {t('games.hint')}: <span lang="uk" className="font-semibold text-fg">{word.translation}</span>
      {word.category && <span className="text-subtle"> · {word.category}</span>}
    </p>
  )
}

// ---------- Anagrams ----------

const ANAGRAM_ROUNDS = 10

/** Ten scrambled words: 10 points each, up to 5 more for a quick answer. */
export function Anagrams({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const queue = useMemo(() => shuffle(words).slice(0, ANAGRAM_ROUNDS), [words])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const scoreRef = useRef(0)

  function done(points: number) {
    scoreRef.current += points
    setScore(scoreRef.current)
    if (index + 1 >= queue.length) onFinish(scoreRef.current)
    else setIndex(index + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span>{t('games.round', { n: index + 1, total: queue.length })}</span>
        <span>{t('games.points', { count: score })}</span>
      </GameBar>
      <AnagramRound key={index} word={queue[index]!} onDone={done} />
    </div>
  )
}

function AnagramRound({ word, onDone }: { word: GameWord; onDone: (points: number) => void }) {
  const { t } = useTranslation()
  const sound = useSound()
  const target = word.word.toUpperCase()
  const tiles = useMemo(() => scramble(target).split('').map((letter, id) => ({ letter, id })), [target])
  const [answer, setAnswer] = useState<number[]>([])
  const [state, setState] = useState<'play' | 'right' | 'wrong' | 'skipped'>('play')
  const started = useRef(Date.now())

  function check(next: number[]) {
    if (next.length < target.length) return
    const text = next.map((id) => tiles[id]!.letter).join('')
    if (text === target) {
      sound('correct')
      setState('right')
      const seconds = (Date.now() - started.current) / 1000
      setTimeout(() => onDone(10 + Math.max(0, Math.round(5 - seconds / 3))), 600)
    } else {
      sound('wrong')
      setState('wrong')
      setTimeout(() => {
        setAnswer([])
        setState('play')
      }, 500)
    }
  }

  function add(id: number) {
    if (state !== 'play' || answer.includes(id)) return
    const next = [...answer, id]
    setAnswer(next)
    check(next)
  }

  useTyping((key) => {
    if (state !== 'play') return
    if (key === 'BACK') setAnswer((a) => a.slice(0, -1))
    else if (key.length === 1) {
      const tile = tiles.find((tile) => tile.letter === key && !answer.includes(tile.id))
      if (tile) add(tile.id)
    }
  })

  function skip() {
    setState('skipped')
    setTimeout(() => onDone(0), 1100)
  }

  const shown = state === 'skipped' ? target.split('') : answer.map((id) => tiles[id]!.letter)

  return (
    <Card glow className="flex flex-col items-center gap-6 py-8">
      <Hint word={word} />
      <div className={cx('flex min-h-14 flex-wrap justify-center gap-1.5', state === 'wrong' && 'animate-[shake_0.3s]')}>
        {Array.from({ length: target.length }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => state === 'play' && setAnswer((a) => a.filter((_, index) => index !== i))}
            className={cx(
              'grid size-11 place-items-center rounded-md border-2 font-display text-xl font-bold',
              state === 'right' ? 'border-success bg-success/15' : state === 'skipped' ? 'border-coin bg-coin/10' : shown[i] ? 'border-accent bg-accent/10' : 'border-dashed border-line',
            )}
          >
            {shown[i] ?? ''}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={answer.includes(tile.id) || state !== 'play'}
            onClick={() => add(tile.id)}
            className="grid size-12 place-items-center rounded-control bg-elevated font-display text-xl font-bold ring-1 ring-line transition-all hover:ring-accent disabled:scale-90 disabled:opacity-25"
          >
            {tile.letter}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-ghost text-sm" disabled={state !== 'play'} onClick={skip}>
        <SkipForward className="size-4" />
        {t('games.skip')}
      </button>
    </Card>
  )
}

// ---------- Balloons ----------

const BALLOONS = 6
const BALLOON_COLOURS = ['var(--accent)', 'var(--accent-2)', 'var(--coin)', 'var(--fire)', 'var(--success)', 'var(--xp)']

/**
 * A parcel hangs on six balloons. Every wrong letter lets one fly away; guess the word first and
 * the parcel floats off to the next one. It goes on until a parcel stays on the ground.
 */
export function Balloons({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const queue = useMemo(() => shuffle(words), [words])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span>{t('games.balloons.solved', { count: score })}</span>
      </GameBar>
      <BalloonsRound
        key={index}
        word={queue[index % queue.length]!}
        onSolved={() => {
          setScore((s) => s + 1)
          setIndex((i) => i + 1)
        }}
        onLost={() => onFinish(score)}
      />
    </div>
  )
}

function BalloonsRound({ word, onSolved, onLost }: { word: GameWord; onSolved: () => void; onLost: () => void }) {
  const { t } = useTranslation()
  const sound = useSound()
  const target = word.word.toUpperCase()
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const misses = [...guessed].filter((letter) => !target.includes(letter)).length
  const solved = target.split('').every((letter) => guessed.has(letter))
  const lost = misses >= BALLOONS

  useEffect(() => {
    if (solved) {
      const timer = setTimeout(onSolved, 1100)
      return () => clearTimeout(timer)
    }
    if (lost) {
      const timer = setTimeout(onLost, 1800)
      return () => clearTimeout(timer)
    }
  }, [solved, lost, onSolved, onLost])

  function guess(letter: string) {
    if (letter.length !== 1 || guessed.has(letter) || solved || lost) return
    sound(target.includes(letter) ? 'correct' : 'wrong')
    setGuessed(new Set(guessed).add(letter))
  }

  useTyping(guess)

  const states = new Map<string, Mark | 'used'>([...guessed].map((letter) => [letter, target.includes(letter) ? 'hit' : 'miss']))

  return (
    <Card glow className="flex flex-col items-center gap-5">
      <BalloonBunch left={BALLOONS - misses} flying={solved} grounded={lost} />
      <div className="flex flex-wrap justify-center gap-1.5">
        {target.split('').map((letter, i) => (
          <span
            key={i}
            className={cx(
              'grid h-11 w-9 place-items-center border-b-2 font-display text-2xl font-bold',
              lost && !guessed.has(letter) ? 'border-accent text-accent' : solved ? 'border-success text-success' : 'border-line',
            )}
          >
            {guessed.has(letter) || lost ? letter : ''}
          </span>
        ))}
      </div>
      <Hint word={word} />
      <p className="text-sm text-muted" aria-live="polite">
        {solved ? t('games.balloons.away') : lost ? t('games.balloons.grounded') : t('games.balloons.left', { count: BALLOONS - misses })}
      </p>
      <div className="w-full max-w-lg">
        <Keyboard states={states} onKey={guess} lockUsed />
      </div>
    </Card>
  )
}

/** The parcel and its balloons; a balloon let go drifts up and fades, a solved word lifts it all. */
function BalloonBunch({ left, flying, grounded }: { left: number; flying: boolean; grounded: boolean }) {
  const spots = [
    { x: 30, y: 34 },
    { x: 52, y: 22 },
    { x: 76, y: 16 },
    { x: 100, y: 22 },
    { x: 122, y: 34 },
    { x: 76, y: 42 },
  ]
  return (
    <svg
      viewBox="0 0 152 150"
      className="h-40 w-44 overflow-visible"
      aria-hidden="true"
      style={{ transform: flying ? 'translateY(-36px)' : undefined, transition: 'transform 1s var(--ease-out)' }}
    >
      {spots.map((spot, i) => {
        const gone = i >= left
        return (
          <g
            key={i}
            style={{
              transform: gone ? `translate(${(i - 2.5) * 6}px, -90px)` : undefined,
              opacity: gone ? 0 : 1,
              transition: 'transform 1.2s var(--ease-out), opacity 1.2s var(--ease-out)',
            }}
          >
            <path
              d={`M${spot.x} ${spot.y + 15} Q${spot.x + (76 - spot.x) * 0.4} ${spot.y + 60} 76 ${grounded ? 128 : 104}`}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="1.2"
            />
            <ellipse cx={spot.x} cy={spot.y} rx="13" ry="15" fill={BALLOON_COLOURS[i]} />
            <ellipse cx={spot.x - 4} cy={spot.y - 5} rx="3" ry="4.5" fill="#fff" opacity="0.35" />
          </g>
        )
      })}
      <g style={{ transform: grounded ? 'translateY(24px)' : undefined, transition: 'transform 0.8s var(--ease-out)' }}>
        <rect x="62" y="104" width="28" height="22" rx="4" fill="var(--coin)" />
        <path d="M76 104 V126 M62 115 H90" stroke="var(--bg)" strokeWidth="2.5" />
      </g>
      <line x1="20" y1="149" x2="132" y2="149" stroke="var(--line)" strokeWidth="2" />
    </svg>
  )
}

// ---------- Wordle ----------

const TRIES = 6

/** Five letters, six tries, a new word after every win; the score is the words guessed in a row. */
export function Wordle({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const queue = useMemo(() => shuffle(words), [words])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span>{t('games.wordle.streak', { count: score })}</span>
      </GameBar>
      <WordleRound
        key={index}
        word={queue[index % queue.length]!}
        onWin={() => {
          setScore((s) => s + 1)
          setIndex((i) => i + 1)
        }}
        onLose={() => onFinish(score)}
      />
    </div>
  )
}

function WordleRound({ word, onWin, onLose }: { word: GameWord; onWin: () => void; onLose: () => void }) {
  const { t } = useTranslation()
  const sound = useSound()
  const answer = word.word.toUpperCase()
  const [rows, setRows] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [hint, setHint] = useState(false)
  const [shake, setShake] = useState(false)
  const won = rows.at(-1) === answer
  const lost = !won && rows.length >= TRIES

  useEffect(() => {
    if (won) {
      const timer = setTimeout(onWin, 1200)
      return () => clearTimeout(timer)
    }
    if (lost) {
      const timer = setTimeout(onLose, 2000)
      return () => clearTimeout(timer)
    }
  }, [won, lost, onWin, onLose])

  function press(key: string) {
    if (won || lost) return
    if (key === 'BACK') setCurrent((c) => c.slice(0, -1))
    else if (key === 'ENTER') {
      if (current.length !== answer.length) {
        setShake(true)
        setTimeout(() => setShake(false), 350)
        return
      }
      sound(current === answer ? 'correct' : 'wrong')
      setRows([...rows, current])
      setCurrent('')
    } else if (key.length === 1 && current.length < answer.length) setCurrent(current + key)
  }

  useTyping(press)

  // What each letter is known to be, the best mark it has had.
  const states = new Map<string, Mark | 'used'>()
  for (const row of rows) {
    wordleMarks(row, answer).forEach((mark, i) => {
      const letter = row[i]!
      const known = states.get(letter)
      if (known === 'hit' || (known === 'near' && mark === 'miss')) return
      states.set(letter, mark)
    })
  }

  return (
    <Card glow className="flex flex-col items-center gap-5">
      <div className="grid gap-1.5">
        {Array.from({ length: TRIES }, (_, r) => {
          const text = rows[r] ?? (r === rows.length ? current : '')
          const marks = rows[r] ? wordleMarks(rows[r]!, answer) : null
          return (
            <div key={r} className={cx('flex gap-1.5', r === rows.length && shake && 'animate-[shake_0.3s]')}>
              {Array.from({ length: answer.length }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    'grid size-12 place-items-center rounded-md border-2 font-display text-xl font-bold sm:size-14',
                    marks?.[i] === 'hit' ? 'border-success bg-success text-bg' : marks?.[i] === 'near' ? 'border-coin bg-coin text-bg' : marks ? 'border-line bg-surface text-subtle' : text[i] ? 'border-accent' : 'border-line',
                  )}
                >
                  {text[i] ?? ''}
                </span>
              ))}
            </div>
          )
        })}
      </div>
      {lost && (
        <p className="text-center">
          {t('games.wordle.answer')}: <strong lang="en">{answer}</strong> — <span lang="uk">{word.translation}</span>
        </p>
      )}
      {hint || lost ? (
        !lost && <Hint word={word} />
      ) : (
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setHint(true)}>
          <Eye className="size-4" />
          {t('games.showHint')}
        </button>
      )}
      <div className="w-full max-w-lg">
        <Keyboard states={states} onKey={press} withEnter />
      </div>
    </Card>
  )
}
