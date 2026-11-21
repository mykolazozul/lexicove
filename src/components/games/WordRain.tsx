import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Heart } from '../icons'
import { Card } from '../ui'
import { GameBar } from './QuizGames'
import { useSound } from '../../lib/cosmetics'
import { cx } from '../../lib/cx'
import { checkTyped, normalize, shuffle } from '../../lib/study'
import type { GameWord } from '../../lib/games'
import type { GameProps } from '../../pages/GamePage'

type Drop = { id: number; word: GameWord; left: number; seconds: number }

const LIVES = 3
const MAX_DROPS = 5

/**
 * Translations fall from the top; type the English word before one lands. Three misses end it,
 * and the rain gets faster with every catch.
 */
export function WordRain({ words, onFinish }: GameProps) {
  const { t } = useTranslation()
  const sound = useSound()
  const [drops, setDrops] = useState<Drop[]>([])
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(LIVES)
  const [input, setInput] = useState('')
  const [missed, setMissed] = useState<GameWord | null>(null)
  const [shake, setShake] = useState(false)
  const scoreRef = useRef(0)
  const livesRef = useRef(LIVES)
  const dropsRef = useRef<Drop[]>([])
  const nextId = useRef(0)
  const deck = useRef<GameWord[]>([])
  const over = useRef(false)
  const field = useRef<HTMLInputElement>(null)

  dropsRef.current = drops

  // New drops, a little more often as the score grows.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const spawn = () => {
      if (over.current) return
      if (dropsRef.current.length < MAX_DROPS) {
        if (deck.current.length === 0) deck.current = shuffle(words)
        const word = deck.current.pop()!
        const drop: Drop = {
          id: nextId.current++,
          word,
          left: 4 + Math.random() * 56,
          seconds: Math.max(4.5, 9 - scoreRef.current * 0.2),
        }
        setDrops((list) => [...list, drop])
      }
      timer = setTimeout(spawn, Math.max(1100, 2600 - scoreRef.current * 60))
    }
    timer = setTimeout(spawn, 400)
    return () => clearTimeout(timer)
  }, [words])

  useEffect(() => field.current?.focus(), [])

  function catchDrop(drop: Drop) {
    sound('correct')
    scoreRef.current += 1
    setScore(scoreRef.current)
    setDrops((list) => list.filter((d) => d.id !== drop.id))
    setInput('')
  }

  function landed(drop: Drop) {
    if (over.current || !dropsRef.current.some((d) => d.id === drop.id)) return
    sound('wrong')
    setDrops((list) => list.filter((d) => d.id !== drop.id))
    setMissed(drop.word)
    livesRef.current -= 1
    setLives(livesRef.current)
    if (livesRef.current <= 0) {
      over.current = true
      setTimeout(() => onFinish(scoreRef.current), 900)
    }
  }

  function typed(value: string) {
    setInput(value)
    const exact = dropsRef.current.find((drop) => normalize(drop.word.word) === normalize(value))
    if (exact) catchDrop(exact)
  }

  function submit() {
    const close = dropsRef.current.find((drop) => checkTyped(input, drop.word.word) !== 'wrong')
    if (close) catchDrop(close)
    else {
      setShake(true)
      setTimeout(() => setShake(false), 300)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GameBar>
        <span>{t('games.points', { count: score })}</span>
        <span className="ml-auto inline-flex gap-1" aria-label={t('games.rain.lives', { count: lives })}>
          {Array.from({ length: LIVES }, (_, i) => (
            <Heart key={i} weight={i < lives ? 'fill' : 'regular'} className={cx('size-5', i < lives ? 'text-danger' : 'text-line')} />
          ))}
        </span>
      </GameBar>
      <Card padding="p-0" className="relative h-[22rem] overflow-hidden sm:h-[26rem]">
        {drops.map((drop) => (
          <motion.div
            key={drop.id}
            className="absolute max-w-[60%] rounded-full border border-accent/40 bg-elevated px-3 py-1.5 text-sm font-semibold shadow-[var(--shadow-card)]"
            style={{ left: `${drop.left}%` }}
            initial={{ top: '-12%' }}
            animate={{ top: '100%' }}
            transition={{ duration: drop.seconds, ease: 'linear' }}
            onAnimationComplete={() => landed(drop)}
            lang="uk"
          >
            {drop.word.translation.length > 32 ? `${drop.word.translation.slice(0, 31)}…` : drop.word.translation}
          </motion.div>
        ))}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-danger/40" />
      </Card>
      {missed && (
        <p className="text-center text-sm text-muted">
          {t('games.rain.missed')}: <strong lang="en">{missed.word}</strong> — <span lang="uk">{missed.translation}</span>
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          ref={field}
          className={cx('input h-12 text-center text-lg', shake && 'animate-[shake_0.3s]')}
          value={input}
          onChange={(event) => typed(event.target.value)}
          placeholder={t('games.rain.placeholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          lang="en"
          aria-label={t('games.rain.placeholder')}
        />
      </form>
    </div>
  )
}
