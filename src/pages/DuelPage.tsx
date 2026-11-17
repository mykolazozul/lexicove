import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Bot, Check, Clock, Coins, Loader2, RotateCcw, Swords, Trophy, X } from 'lucide-react'
import { Confetti } from '../components/Confetti'
import { errorText, PersonAvatar, PersonName } from '../components/community/People'
import { StakeLine } from '../components/community/StakeLine'
import { Card, ProgressBar } from '../components/ui'
import { useSound } from '../lib/cosmetics'
import { cx } from '../lib/cx'
import { botProgress, duels, QUESTIONS, type DuelSide, type DuelState } from '../lib/duels'
import { formatDateTime } from '../lib/time'
import { useProfile } from '../stores/profile'
import { toast } from '../stores/toast'

const BACK = '/community?tab=duels'

/** Re-renders on a timer, for countdowns. */
function useTick(ms: number, active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(timer)
  }, [ms, active])
}

export function DuelPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const [state, setState] = useState<DuelState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The server's clock minus ours, so countdowns match the server's deadlines.
  const offset = useRef(0)
  const refreshProfile = useProfile((s) => s.refresh)

  const load = useCallback(async () => {
    try {
      const next = await duels.state(id)
      offset.current = Date.parse(next.now) - Date.now()
      setState(next)
    } catch (err) {
      setError(errorText(t, err))
    }
  }, [id, t])

  useEffect(() => {
    void load()
    return duels.watch(id, () => void load())
  }, [id, load])

  // Coins and XP may have changed once it's over.
  const finished = state?.status === 'finished'
  useEffect(() => {
    if (finished) void refreshProfile()
  }, [finished, refreshProfile])

  const now = useCallback(() => Date.now() + offset.current, [])

  if (error) {
    return (
      <Card className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <Swords className="size-10 text-subtle" />
        <p className="text-muted">{error}</p>
        <Link to={BACK} className="btn btn-secondary">
          <ArrowLeft className="size-4" />
          {t('duels.back')}
        </Link>
      </Card>
    )
  }
  if (!state) {
    return (
      <div className="grid min-h-60 place-items-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link to={BACK} className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" />
        {t('duels.back')}
      </Link>
      <DuelBody state={state} now={now} reload={load} setState={setState} />
    </div>
  )
}

function DuelBody({
  state,
  now,
  reload,
  setState,
}: {
  state: DuelState
  now: () => number
  reload: () => Promise<void>
  setState: Dispatch<SetStateAction<DuelState | null>>
}) {
  const startsAt = state.starts_at ? Date.parse(state.starts_at) : null
  const endsAt = state.ends_at ? Date.parse(state.ends_at) : null
  const live = state.status === 'active'
  useTick(250, live || state.status === 'waiting')

  // The questions are handed out once the clock starts, and nothing in the duel changes at that
  // moment to announce it, so ask for them right when the countdown ends.
  const needQuestions = live && startsAt !== null && !state.questions
  useEffect(() => {
    if (!needQuestions || startsAt === null) return
    const timer = setTimeout(() => void reload(), Math.max(0, startsAt - now()) + 150)
    return () => clearTimeout(timer)
  }, [needQuestions, startsAt, state, now, reload])

  // Live updates carry the opponent's moves; reading now and then covers any that get lost, and
  // more often once the caller has answered everything and only waits for the result.
  const doneHere = live && state.me.answered >= QUESTIONS
  useEffect(() => {
    if (!live) return
    if (doneHere) void reload()
    const timer = setInterval(() => void reload(), doneHere ? 3000 : 6000)
    return () => clearInterval(timer)
  }, [live, doneHere, reload])

  // When time is up the server decides on the next read; ask a moment after the deadline.
  const overdue = live && endsAt !== null && now() > endsAt + 2500
  useEffect(() => {
    if (!overdue) return
    const timer = setInterval(() => void reload(), 3000)
    void reload()
    return () => clearInterval(timer)
  }, [overdue, reload])

  if (state.status === 'waiting') return <Waiting state={state} now={now} reload={reload} />
  if (state.status === 'cancelled' || state.status === 'declined' || state.status === 'expired') return <Closed status={state.status} />
  if (state.status === 'finished') return <Result state={state} />

  if (state.kind === 'tournament' && !startsAt) return <TournamentIntro state={state} reload={reload} />
  if (startsAt !== null && now() < startsAt) return <Countdown state={state} seconds={Math.ceil((startsAt - now()) / 1000)} />
  if (state.me.answered >= QUESTIONS || (endsAt !== null && now() > endsAt)) {
    return <WaitingForOpponent state={state} now={now} />
  }
  return <Questions state={state} now={now} setState={setState} />
}

// ---------- Before the start ----------

function Waiting({ state, now, reload }: { state: DuelState; now: () => number; reload: () => Promise<void> }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const left = Math.max(0, Math.ceil((Date.parse(state.created_at) + 120_000 - now()) / 1000))
  const mine = state.side === 'a'

  async function act(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    try {
      await action()
      after?.()
      await reload()
    } catch (err) {
      toast(errorText(t, err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card glow className="flex flex-col items-center gap-4 py-10 text-center">
      {state.opponent.user && <PersonAvatar user={state.opponent.user} size={64} />}
      <h2 className="font-display text-2xl font-semibold">
        {mine ? t('duels.waiting.title', { name: state.opponent.user?.display_name ?? '' }) : t('duels.invite.title', { name: state.opponent.user?.display_name ?? '' })}
      </h2>
      <StakeLine stake={state.stake} level={state.level} />
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Clock className="size-4" />
        {t('duels.waiting.expires', { seconds: left })}
      </p>
      {mine ? (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act(() => duels.cancel(state.id), () => navigate(BACK))}>
          {t('duels.waiting.cancel')}
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => duels.respond(state.id, true))}>
            <Swords className="size-4" />
            {t('duels.invite.accept')}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act(() => duels.respond(state.id, false), () => navigate(BACK))}>
            {t('duels.invite.decline')}
          </button>
        </div>
      )}
    </Card>
  )
}

function Closed({ status }: { status: 'cancelled' | 'declined' | 'expired' }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col items-center gap-4 py-10 text-center">
      <X className="size-10 text-subtle" />
      <h2 className="font-display text-xl font-semibold">{t(`duels.closed.${status}`)}</h2>
      <Link to={BACK} className="btn btn-secondary">
        {t('duels.back')}
      </Link>
    </Card>
  )
}

function TournamentIntro({ state, reload }: { state: DuelState; reload: () => Promise<void> }) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  return (
    <Card glow className="flex flex-col items-center gap-4 py-10 text-center">
      <Trophy className="size-12 text-coin" />
      <h2 className="font-display text-2xl font-semibold">{t('duels.tournament.matchTitle')}</h2>
      {state.opponent.user && (
        <div className="flex items-center gap-3">
          <PersonAvatar user={state.opponent.user} size={40} />
          <PersonName user={state.opponent.user} />
        </div>
      )}
      <p className="max-w-sm text-muted">
        {t('duels.tournament.matchText', { date: state.round_ends_at ? formatDateTime(state.round_ends_at, i18n.language) : '' })}
      </p>
      {state.opponent.started && <p className="text-sm text-accent">{t('duels.tournament.opponentPlayed')}</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await duels.begin(state.id)
            await reload()
          } catch (err) {
            toast(errorText(t, err), 'error')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Swords className="size-4" />}
        {t('duels.tournament.start')}
      </button>
    </Card>
  )
}

function Countdown({ state, seconds }: { state: DuelState; seconds: number }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <Versus state={state} me={state.me} opponent={state.opponent} />
      <Card glow className="flex flex-col items-center gap-2 py-14 text-center">
        <p className="text-sm font-semibold tracking-[0.18em] text-subtle uppercase">{t('duels.getReady')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={seconds}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="text-gradient font-display text-7xl font-bold tabular-nums"
          >
            {Math.max(1, seconds)}
          </motion.span>
        </AnimatePresence>
      </Card>
    </div>
  )
}

// ---------- Playing ----------

function Questions({ state, now, setState }: { state: DuelState; now: () => number; setState: Dispatch<SetStateAction<DuelState | null>> }) {
  const { t } = useTranslation()
  const sound = useSound()
  const [picked, setPicked] = useState<{ idx: number; choice: number; answer: number | null } | null>(null)
  // While an answer is shown, stay on its question even if the server already moved on.
  const idx = picked?.idx ?? state.me.answered
  const question = state.questions?.[idx]
  const startsAt = Date.parse(state.starts_at!)
  const endsAt = Date.parse(state.ends_at!)

  const choose = useCallback(
    async (choice: number) => {
      if (picked || !question) return
      setPicked({ idx, choice, answer: null })
      try {
        const result = await duels.answer(state.id, idx, choice)
        sound(result.correct ? 'correct' : 'wrong')
        setPicked({ idx, choice, answer: result.answer })
        // A beat to see the right answer, then on to the next question.
        setTimeout(() => {
          setPicked(null)
          setState((prev) =>
            !prev || prev.me.answered > idx
              ? prev
              : {
                  ...prev,
                  me: { ...prev.me, answered: idx + 1, correct: prev.me.correct + (result.correct ? 1 : 0) },
                  questions: prev.questions?.map((q) => (q.idx === idx ? { ...q, answer: result.answer } : q)) ?? null,
                  my_answers: [...prev.my_answers, { idx, choice, correct: result.correct }],
                },
          )
        }, 650)
      } catch (err) {
        setPicked(null)
        toast(errorText(t, err), 'error')
      }
    },
    [picked, question, state.id, idx, sound, setState, t],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key)
      if (n >= 1 && n <= 4) void choose(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose])

  if (!question) {
    return (
      <div className="grid min-h-60 place-items-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    )
  }
  const left = Math.max(0, endsAt - now())
  const opponent = opponentNow(state, now())

  return (
    <div className="flex flex-col gap-5">
      <Versus state={state} me={state.me} opponent={opponent} />
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-muted tabular-nums">{t('duels.question', { n: idx + 1, total: QUESTIONS })}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className={cx('h-full rounded-full transition-[width] duration-300', left < 20_000 ? 'bg-danger' : 'bg-gradient-accent')}
            style={{ width: `${(left / (endsAt - startsAt)) * 100}%` }}
          />
        </div>
        <span className={cx('w-12 text-right text-sm font-semibold tabular-nums', left < 20_000 ? 'text-danger' : 'text-muted')}>
          {Math.ceil(left / 1000)}s
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={idx} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          <Card glow className="flex flex-col gap-5">
            <div className="text-center">
              <p className="text-xs font-semibold tracking-[0.16em] text-subtle uppercase">{t(`duels.direction.${question.direction}`)}</p>
              <p lang={question.direction === 'en_uk' ? 'en' : 'uk'} className="mt-3 font-display text-3xl font-semibold tracking-tight break-words sm:text-4xl">
                {question.prompt}
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {question.options.map((option, i) => {
                const isPicked = picked?.choice === i
                const isRight = picked?.answer === i
                const isWrong = isPicked && picked?.answer !== null && picked?.answer !== i
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={picked !== null}
                    onClick={() => void choose(i)}
                    className={cx(
                      'flex min-h-14 items-center gap-3 rounded-control border px-4 py-3 text-left font-semibold transition-colors',
                      isRight ? 'border-success bg-success/15 text-fg' : isWrong ? 'border-danger bg-danger/15 text-fg' : isPicked ? 'border-accent bg-accent/12' : 'border-line bg-surface hover:border-accent/60',
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-xs text-subtle">{i + 1}</span>
                    <span lang={question.direction === 'en_uk' ? 'uk' : 'en'} className="min-w-0 flex-1 break-words">
                      {option}
                    </span>
                    {isRight && <Check className="size-4 text-success" />}
                    {isWrong && <X className="size-4 text-danger" />}
                  </button>
                )
              })}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** The opponent as of now: live counts for people, the scripted run for the bot. */
function opponentNow(state: DuelState, now: number): DuelSide {
  if (state.kind !== 'bot' || !state.starts_at) return state.opponent
  const progress = botProgress(state.bot_plan, now - Date.parse(state.starts_at))
  return { ...state.opponent, ...progress }
}

function WaitingForOpponent({ state, now }: { state: DuelState; now: () => number }) {
  const { t, i18n } = useTranslation()
  const opponent = opponentNow(state, now())
  return (
    <div className="flex flex-col gap-5">
      <Versus state={state} me={state.me} opponent={opponent} />
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="size-8 animate-spin text-accent" />
        <h2 className="font-display text-xl font-semibold">{t('duels.yourScore', { correct: state.me.correct, total: QUESTIONS })}</h2>
        <p className="max-w-sm text-muted">
          {state.kind === 'tournament'
            ? t('duels.tournament.waiting', { date: state.round_ends_at ? formatDateTime(state.round_ends_at, i18n.language) : '' })
            : t('duels.waitingOpponent')}
        </p>
        {state.kind === 'tournament' && (
          <Link to={BACK} className="btn btn-secondary mt-2">
            {t('duels.back')}
          </Link>
        )}
      </Card>
    </div>
  )
}

// ---------- After ----------

function Result({ state }: { state: DuelState }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const outcome = state.outcome ?? 'draw'
  const pot = state.kind === 'friendly' && state.stake > 0 ? (outcome === 'win' ? state.stake * 2 : outcome === 'draw' ? state.stake : 0) : 0

  async function rematch() {
    setBusy(true)
    try {
      const next = await duels.rematch(state.id)
      navigate(`/duel/${next}`)
    } catch (err) {
      toast(errorText(t, err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {outcome === 'win' && <Confetti />}
      <Card glow className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          {outcome === 'win' ? '🏆' : outcome === 'draw' ? '🤝' : '💪'}
        </span>
        <h2 className="font-display text-3xl font-semibold">{t(`duels.outcome.${outcome}`)}</h2>
        <p className="text-muted">{t(`duels.outcomeText.${outcome}`)}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {state.rating_change !== null && (
            <span className={cx('rounded-full px-3 py-1 text-sm font-semibold', state.rating_change >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
              {t('duels.ratingChange', { change: `${state.rating_change >= 0 ? '+' : ''}${state.rating_change}` })}
            </span>
          )}
          {pot > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-coin/15 px-3 py-1 text-sm font-semibold text-coin">
              <Coins className="size-4" />+{pot}
            </span>
          )}
        </div>
      </Card>

      <Versus state={state} me={state.me} opponent={state.opponent} showTime />

      {state.questions && (
        <Card padding="p-0" className="divide-y divide-line overflow-hidden">
          {state.questions.map((q) => {
            const mine = state.my_answers.find((a) => a.idx === q.idx)
            return (
              <div key={q.idx} className="flex items-center gap-3 px-4 py-3 text-sm">
                {mine?.correct ? <Check className="size-4 shrink-0 text-success" /> : <X className="size-4 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{q.prompt}</span>
                  <span className="text-muted"> → {q.answer !== null ? q.options[q.answer] : '—'}</span>
                  {mine && !mine.correct && mine.choice >= 0 && <span className="block text-xs text-danger line-through">{q.options[mine.choice]}</span>}
                </span>
              </div>
            )
          })}
        </Card>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {state.kind !== 'tournament' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void rematch()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            {t('duels.rematch')}
          </button>
        )}
        <Link to={BACK} className="btn btn-secondary">
          {t('duels.back')}
        </Link>
      </div>
    </div>
  )
}

// ---------- Pieces ----------

function Versus({ state, me, opponent, showTime = false }: { state: DuelState; me: DuelSide; opponent: DuelSide; showTime?: boolean }) {
  const { t } = useTranslation()
  return (
    <Card className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <PlayerSide side={me} label={t('duels.you')} showTime={showTime} />
      <span className="grid size-10 place-items-center rounded-full bg-accent/12 text-accent">
        <Swords className="size-5" />
      </span>
      <PlayerSide side={opponent} label={state.kind === 'bot' ? t('duels.bot') : undefined} bot={state.kind === 'bot'} align="end" showTime={showTime} />
    </Card>
  )
}

function PlayerSide({
  side,
  label,
  bot = false,
  align = 'start',
  showTime,
}: {
  side: DuelSide
  label?: string
  bot?: boolean
  align?: 'start' | 'end'
  showTime: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className={cx('flex min-w-0 flex-col gap-2', align === 'end' && 'items-end text-right')}>
      <div className={cx('flex min-w-0 items-center gap-2', align === 'end' && 'flex-row-reverse')}>
        {bot ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-2/15 text-accent-2">
            <Bot className="size-5" />
          </span>
        ) : side.user ? (
          <PersonAvatar user={side.user} size={36} />
        ) : null}
        <div className="min-w-0">
          {label ? <span className="block truncate font-semibold">{label}</span> : side.user && <PersonName user={side.user} />}
          {side.rating !== null && !bot && <span className="block text-xs text-subtle">{t('duels.rating', { rating: side.rating })}</span>}
        </div>
      </div>
      <div className="w-full">
        <ProgressBar value={side.answered} max={QUESTIONS} />
        <p className="mt-1 text-xs text-muted tabular-nums">
          {t('duels.progress', { correct: side.correct, answered: side.answered })}
          {showTime && side.answered > 0 && ` · ${(side.time_ms / 1000).toFixed(1)}s`}
        </p>
      </div>
    </div>
  )
}
