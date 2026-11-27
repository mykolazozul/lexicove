import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, Play, RotateCcw, Trophy } from '../components/icons'
import { Confetti } from '../components/Confetti'
import { Card } from '../components/ui'
import { formatScore, gameMeta, loadDeckWords, playable, useGames, type GameId, type GameMeta, type GameWord } from '../lib/games'
import { importFresh } from '../lib/reload'
import { useViewer } from '../lib/viewer'
import { useLibrary } from '../stores/library'

export type GameProps = { words: GameWord[]; onFinish: (score: number) => void }

// Each game loads on its own, so opening one doesn't download all nine.
const GAME_COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  pairs: lazy(importFresh(() => import('../components/games/QuizGames').then((m) => ({ default: m.MatchPairs })))),
  speed: lazy(importFresh(() => import('../components/games/QuizGames').then((m) => ({ default: m.SpeedRound })))),
  truefalse: lazy(importFresh(() => import('../components/games/QuizGames').then((m) => ({ default: m.TrueOrFalse })))),
  anagrams: lazy(importFresh(() => import('../components/games/LetterGames').then((m) => ({ default: m.Anagrams })))),
  balloons: lazy(importFresh(() => import('../components/games/LetterGames').then((m) => ({ default: m.Balloons })))),
  wordle: lazy(importFresh(() => import('../components/games/LetterGames').then((m) => ({ default: m.Wordle })))),
  rain: lazy(importFresh(() => import('../components/games/WordRain').then((m) => ({ default: m.WordRain })))),
  crossword: lazy(importFresh(() => import('../components/games/Crossword').then((m) => ({ default: m.Crossword })))),
  search: lazy(importFresh(() => import('../components/games/WordSearch').then((m) => ({ default: m.WordSearch })))),
}

export function GamePage() {
  const { id = '' } = useParams()
  const meta = gameMeta(id)
  // The old letter-guessing game became Balloons; old links still land on it.
  if (id === 'hangman') return <Navigate to="/games/balloons" replace />
  if (!meta) return <Navigate to="/games" replace />
  return <GameShell key={meta.id} meta={meta} />
}

/** The player's own words when there are enough for this game, otherwise a starter deck. */
function useGameWords(meta: GameMeta): { words: GameWord[] | null; fromDeck: boolean } {
  const viewer = useViewer()
  const { loaded, load, words: library } = useLibrary()
  const { source, level } = useGames()
  const [deck, setDeck] = useState<GameWord[] | null>(null)

  useEffect(() => {
    if (!viewer.isGuest && !loaded) void load()
  }, [viewer.isGuest, loaded, load])

  const mine = !viewer.isGuest && source === 'mine' ? playable(meta, library) : []
  const useMine = mine.length >= meta.needs
  const waitingForLibrary = !viewer.isGuest && source === 'mine' && !loaded

  useEffect(() => {
    if (useMine || waitingForLibrary) return
    loadDeckWords(level)
      .then((words) => setDeck(playable(meta, words)))
      .catch(() => setDeck([]))
  }, [useMine, waitingForLibrary, level, meta])

  if (useMine) return { words: mine, fromDeck: false }
  if (waitingForLibrary) return { words: null, fromDeck: false }
  return { words: deck, fromDeck: true }
}

function GameShell({ meta }: { meta: GameMeta }) {
  const { t } = useTranslation()
  const { words, fromDeck } = useGameWords(meta)
  const best = useGames((s) => s.best[meta.id])
  const record = useGames((s) => s.record)
  const [phase, setPhase] = useState<'intro' | 'play' | 'over'>('intro')
  const [round, setRound] = useState(0)
  const [result, setResult] = useState<{ score: number; newBest: boolean } | null>(null)
  const Game = GAME_COMPONENTS[meta.id]

  function start() {
    setResult(null)
    setRound((n) => n + 1)
    setPhase('play')
  }

  function finish(score: number) {
    setResult({ score, newBest: record(meta.id, score) })
    setPhase('over')
  }

  const enough = words !== null && words.length >= meta.needs

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link to="/games" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" />
          {t('games.all')}
        </Link>
        <span className="ml-auto text-sm font-semibold">
          {meta.emoji} {t(`games.items.${meta.id}.name`)}
        </span>
      </div>

      {phase === 'intro' && (
        <Card glow className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="bg-gradient-accent grid size-20 place-items-center rounded-full text-4xl shadow-[var(--shadow-accent)]" aria-hidden="true">
            {meta.emoji}
          </span>
          <h2 className="font-display text-2xl font-semibold">{t(`games.items.${meta.id}.name`)}</h2>
          <p className="max-w-md text-muted">{t(`games.items.${meta.id}.rules`)}</p>
          {best !== undefined && (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-coin">
              <Trophy className="size-4" />
              {t('games.best', { score: formatScore(meta, best, t) })}
            </p>
          )}
          {words === null ? (
            <Loader2 className="size-6 animate-spin text-accent" />
          ) : enough ? (
            <>
              <button type="button" className="btn btn-primary h-12 px-6" onClick={start}>
                <Play className="size-5" />
                {t('games.start')}
              </button>
              <p className="text-xs text-subtle">{fromDeck ? t('games.fromDeck', { count: words.length }) : t('games.fromMine', { count: words.length })}</p>
            </>
          ) : (
            <p className="max-w-sm text-sm text-muted">{t('games.notEnough')}</p>
          )}
        </Card>
      )}

      {phase === 'play' && words && (
        <Suspense
          fallback={
            <div className="grid min-h-60 place-items-center">
              <Loader2 className="size-8 animate-spin text-accent" />
            </div>
          }
        >
          <Game key={round} words={words} onFinish={finish} />
        </Suspense>
      )}

      {phase === 'over' && result && (
        <Card glow className="flex flex-col items-center gap-4 py-10 text-center">
          {result.newBest && <Confetti />}
          <span className="text-5xl" aria-hidden="true">
            {result.newBest ? '🏆' : '🎯'}
          </span>
          <h2 className="font-display text-3xl font-semibold">{formatScore(meta, result.score, t)}</h2>
          <p className="text-muted">
            {result.newBest ? t('games.newBest') : best !== undefined ? t('games.best', { score: formatScore(meta, best, t) }) : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={start}>
              <RotateCcw className="size-4" />
              {t('games.again')}
            </button>
            <Link to="/games" className="btn btn-secondary">
              {t('games.all')}
            </Link>
          </div>
        </Card>
      )}
    </div>
  )
}
