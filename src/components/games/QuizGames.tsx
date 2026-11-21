import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock, X } from '../icons'
import { Card } from '../ui'
import { useSound } from '../../lib/cosmetics'
import { cx } from '../../lib/cx'
import { normalize, pickDistractors, shuffle } from '../../lib/study'
import type { GameWord } from '../../lib/games'
import type { GameProps } from '../../pages/GamePage'

/** Seconds since the game started, ticking. */
function useStopwatch() {
  const started = useRef(Date.now())
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250)
    return () => clearInterval(timer)
  }, [])
  return { seconds, elapsed: () => (Date.now() - started.current) / 1000 }
}

/** Seconds left of a fixed time; calls onDone once when it runs out. */
function useCountdown(total: number, onDone: () => void) {
  const ends = useRef(Date.now() + total * 1000)
  const [left, setLeft] = useState(total)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const timer = setInterval(() => {
      const next = Math.max(0, Math.ceil((ends.current - Date.now()) / 1000))
      setLeft(next)
      if (next === 0) {
        clearInterval(timer)
        done.current()
      }
    }, 200)
    return () => clearInterval(timer)
  }, [])
  return left
}

/** Words with different translations, so no two answers look the same. */
function distinctByTranslation(words: readonly GameWord[], count: number): GameWord[] {
  const seen = new Set<string>()
  const picked: GameWord[] = []
  for (const word of shuffle(words)) {
    const key = normalize(word.translation)
    if (seen.has(key) || seen.has(normalize(word.word))) continue
    seen.add(key)
    seen.add(normalize(word.word))
    picked.push(word)
    if (picked.length === count) break
  }
  return picked
}

export function GameBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-muted tabular-nums">{children}</div>
}

// ---------- Match the pairs ----------

const PAIR_ROUNDS = 3
const PAIRS_PER_ROUND = 6

/** Three boards of six words and their translations; the time is the score, plus three seconds a slip. */
export function MatchPairs({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const sound = useSound()
  const { seconds, elapsed } = useStopwatch()
  const [round, setRound] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  // A new board each round.
  const board = useMemo(() => {
    const pairs = distinctByTranslation(words, PAIRS_PER_ROUND)
    return { round, pairs, left: shuffle(pairs), right: shuffle(pairs) }
  }, [round, words])
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<{ left?: string; right?: string }>({})
  const [wrong, setWrong] = useState<{ left: string; right: string } | null>(null)

  function pick(side: 'left' | 'right', id: string) {
    const next = { ...picked, [side]: picked[side] === id ? undefined : id }
    if (!next.left || !next.right) {
      setPicked(next)
      return
    }
    setPicked({})
    if (next.left !== next.right) {
      sound('wrong')
      setMistakes((n) => n + 1)
      setWrong({ left: next.left, right: next.right })
      setTimeout(() => setWrong(null), 450)
      return
    }
    sound('correct')
    const done = new Set(matched).add(next.left)
    setMatched(done)
    if (done.size < board.pairs.length) return
    if (round + 1 >= PAIR_ROUNDS) {
      onFinish(Math.round(elapsed()) + mistakes * 3)
      return
    }
    setTimeout(() => {
      setMatched(new Set())
      setRound((n) => n + 1)
    }, 350)
  }

  const tile = (side: 'left' | 'right', word: GameWord) => {
    const done = matched.has(word.id)
    const active = picked[side] === word.id
    const bad = wrong?.[side] === word.id
    return (
      <button
        key={word.id}
        type="button"
        disabled={done}
        onClick={() => pick(side, word.id)}
        lang={side === 'left' ? 'en' : 'uk'}
        className={cx(
          'min-h-14 rounded-control border px-3 py-2 text-sm font-semibold break-words transition-all',
          done ? 'scale-95 border-success/40 bg-success/10 text-success opacity-40' : bad ? 'animate-[shake_0.3s] border-danger bg-danger/15' : active ? 'border-accent bg-accent/15' : 'border-line bg-surface hover:border-accent/60',
        )}
      >
        {side === 'left' ? word.word : word.translation}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span>{t('games.round', { n: round + 1, total: PAIR_ROUNDS })}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-4" />
          {t('games.seconds', { count: seconds })}
        </span>
        {mistakes > 0 && <span className="text-danger">{t('games.mistakes', { count: mistakes })}</span>}
      </GameBar>
      <Card className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2.5">{board.left.map((word) => tile('left', word))}</div>
        <div className="flex flex-col gap-2.5">{board.right.map((word) => tile('right', word))}</div>
      </Card>
    </div>
  )
}

// ---------- Speed round ----------

const SPEED_SECONDS = 60

/** As many translations as you can pick in a minute. */
export function SpeedRound({ words, onFinish }: GameProps) {
  const sound = useSound()
  const [score, setScore] = useState(0)
  const scoreRef = useRef(0)
  const left = useCountdown(SPEED_SECONDS, () => onFinish(scoreRef.current))
  const deck = useRef<GameWord[]>([])
  const next = useCallback(() => {
    if (deck.current.length === 0) deck.current = shuffle(words)
    const word = deck.current.pop()!
    const options = shuffle([word.translation, ...pickDistractors(word, words, 3, (w) => w.translation)])
    return { word, options, answer: options.indexOf(word.translation) }
  }, [words])
  const [question, setQuestion] = useState(next)
  const [picked, setPicked] = useState<number | null>(null)

  function choose(i: number) {
    if (picked !== null || left === 0) return
    setPicked(i)
    const right = i === question.answer
    sound(right ? 'correct' : 'wrong')
    if (right) {
      scoreRef.current += 1
      setScore(scoreRef.current)
    }
    setTimeout(() => {
      setPicked(null)
      setQuestion(next())
    }, right ? 250 : 700)
  }

  useKeys(['1', '2', '3', '4'], (index) => choose(index))

  return (
    <div className="flex flex-col gap-4">
      <TimerBar left={left} total={SPEED_SECONDS} score={score} />
      <Card glow className="flex flex-col gap-5">
        <p lang="en" className="text-center font-display text-3xl font-semibold break-words sm:text-4xl">
          {question.word.word}
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {question.options.map((option, i) => (
            <button
              key={`${question.word.id}-${i}`}
              type="button"
              disabled={picked !== null}
              onClick={() => choose(i)}
              lang="uk"
              className={cx(
                'flex min-h-14 items-center gap-3 rounded-control border px-4 py-3 text-left font-semibold transition-colors',
                picked !== null && i === question.answer
                  ? 'border-success bg-success/15'
                  : picked === i
                    ? 'border-danger bg-danger/15'
                    : 'border-line bg-surface hover:border-accent/60',
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-xs text-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words">{option}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ---------- True or false ----------

const TRUE_FALSE_SECONDS = 60

/** A word and a translation: right or wrong? A wrong call costs a point. */
export function TrueOrFalse({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const sound = useSound()
  const [score, setScore] = useState(0)
  const scoreRef = useRef(0)
  const left = useCountdown(TRUE_FALSE_SECONDS, () => onFinish(Math.max(0, scoreRef.current)))
  const next = useCallback(() => {
    const word = words[Math.floor(Math.random() * words.length)]!
    const honest = Math.random() < 0.5
    const shown = honest ? word.translation : (pickDistractors(word, words, 1, (w) => w.translation)[0] ?? word.translation)
    return { word, shown, truth: normalize(shown) === normalize(word.translation) }
  }, [words])
  const [card, setCard] = useState(next)
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null)

  function answer(saysTrue: boolean) {
    if (verdict || left === 0) return
    const right = saysTrue === card.truth
    sound(right ? 'correct' : 'wrong')
    scoreRef.current += right ? 1 : -1
    setScore(scoreRef.current)
    setVerdict(right ? 'right' : 'wrong')
    setTimeout(() => {
      setVerdict(null)
      setCard(next())
    }, right ? 250 : 800)
  }

  useKeys(['ArrowLeft', 'ArrowRight'], (index) => answer(index === 1))

  return (
    <div className="flex flex-col gap-4">
      <TimerBar left={left} total={TRUE_FALSE_SECONDS} score={score} />
      <Card
        glow
        className={cx(
          'flex flex-col items-center gap-3 py-10 text-center transition-colors',
          verdict === 'right' && 'bg-success/10',
          verdict === 'wrong' && 'bg-danger/10',
        )}
      >
        <p lang="en" className="font-display text-3xl font-semibold break-words sm:text-4xl">
          {card.word.word}
        </p>
        <p className="text-sm text-subtle">=</p>
        <p lang="uk" className="text-xl font-semibold break-words">
          {card.shown}
        </p>
        {verdict === 'wrong' && !card.truth && <p className="text-sm text-muted">{t('games.truefalse.actually', { translation: card.word.translation })}</p>}
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-secondary h-14 text-base" onClick={() => answer(false)}>
          <X className="size-5 text-danger" />
          {t('games.truefalse.false')}
        </button>
        <button type="button" className="btn btn-secondary h-14 text-base" onClick={() => answer(true)}>
          <Check className="size-5 text-success" />
          {t('games.truefalse.true')}
        </button>
      </div>
    </div>
  )
}

// ---------- Shared bits ----------

function TimerBar({ left, total, score }: { left: number; total: number; score: number }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold tabular-nums">{t('games.points', { count: score })}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
        <div className={cx('h-full rounded-full transition-[width] duration-300', left <= 10 ? 'bg-danger' : 'bg-gradient-accent')} style={{ width: `${(left / total) * 100}%` }} />
      </div>
      <span className={cx('w-10 text-right text-sm font-semibold tabular-nums', left <= 10 ? 'text-danger' : 'text-muted')}>{left}s</span>
    </div>
  )
}

/** Calls back with the index of the key pressed. */
export function useKeys(keys: string[], onKey: (index: number) => void) {
  const handler = useRef(onKey)
  handler.current = onKey
  const list = keys.join('|')
  useEffect(() => {
    const names = list.split('|')
    const listener = (event: KeyboardEvent) => {
      const index = names.indexOf(event.key)
      if (index >= 0) handler.current(index)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [list])
}
