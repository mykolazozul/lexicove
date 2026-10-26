import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, CircleCheck, CircleX, Coins, RotateCcw, Sparkles, Timer, Trophy, X } from 'lucide-react'
import { MODES, NEW_PER_LESSON, SESSION_SIZE } from '../app/modes'
import { BuilderQuestion, ChoiceQuestion, Flashcard, SpeakQuestion, TypeQuestion, type QuestionResult } from '../components/learn/questions'
import { SpeakButtons } from '../components/learn/parts'
import { Confetti } from '../components/Confetti'
import { Card, ProgressBar } from '../components/ui'
import { cx } from '../lib/cx'
import { canRecognize, canSpeak } from '../lib/speech'
import { Rating, type Grade } from '../lib/srs'
import {
  buildQueue,
  inflectLike,
  makeBuilder,
  makeCloze,
  modesFor,
  pickDistractors,
  shuffle,
  type Builder,
  type Cloze,
  type Mode,
  type StudyWord,
  type WordMode,
} from '../lib/study'
import { useSound } from '../lib/cosmetics'
import { levelFromXp } from '../lib/progression'
import { useViewer } from '../lib/viewer'
import { useEconomy, useEquipped } from '../stores/economy'
import { useLibrary, type Rule } from '../stores/library'
import { useProfile } from '../stores/profile'
import { useStudy } from '../stores/study'

/** XP, Coins and achievements before the session, to show what it earned at the end. */
type Snapshot = { xp: number; coins: number; unlocked: Set<string> | null }

function snapshot(): Snapshot {
  const profile = useProfile.getState().profile
  const economy = useEconomy.getState()
  return {
    xp: profile?.xp ?? 0,
    coins: profile?.coins ?? 0,
    // Unknown until the achievements have loaded; then nothing counts as new.
    unlocked: economy.mineLoaded ? new Set(economy.unlocked.keys()) : null,
  }
}

type Step =
  | { id: string; mode: 'cards'; word: StudyWord; isNew: boolean }
  | { id: string; mode: 'choice'; word: StudyWord; direction: 'en-uk' | 'uk-en'; options: string[]; answer: string }
  | { id: string; mode: 'typing' | 'dictation'; word: StudyWord }
  | { id: string; mode: 'cloze'; word: StudyWord; cloze: Cloze; options: string[] }
  | { id: string; mode: 'builder'; word: StudyWord; builder: Builder }
  | { id: string; mode: 'listening'; word: StudyWord; options: string[] }
  | { id: string; mode: 'speaking'; word: StudyWord }
  | { id: string; mode: 'sorting'; word: StudyWord; options: string[] }
  | { id: string; mode: 'rules'; rule: Rule; options: string[]; answer: string }

type Outcome = { step: Step; correct: boolean; expected?: string }

const VALID_MODES = new Set<string>(MODES.map((m) => m.mode))

function clip(text: string, length = 150) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}

function buildSteps(
  mode: Mode,
  words: StudyWord[],
  rules: Rule[],
  progress: ReturnType<typeof useStudy.getState>['progress'],
): Step[] {
  if (mode === 'rules') {
    const usable = rules.filter((rule) => rule.explanation.trim())
    if (usable.length < 4) return []
    return shuffle(usable)
      .slice(0, 10)
      .map((rule) => {
        const answer = clip(rule.explanation)
        const others = shuffle(usable.filter((r) => r.id !== rule.id))
          .map((r) => clip(r.explanation))
          .filter((text) => text !== answer)
          .slice(0, 3)
        return { id: rule.id, mode: 'rules', rule, answer, options: shuffle([answer, ...others]) }
      })
  }

  const categories = new Set(words.map((w) => w.category).filter(Boolean))
  const abilities = { speech: canSpeak, recognition: canRecognize, categories: categories.size }
  const eligible = mode === 'mix' ? words : words.filter((w) => modesFor(w, abilities).includes(mode))
  const queue = buildQueue(eligible, progress, {
    size: SESSION_SIZE,
    newLimit: mode === 'mix' ? NEW_PER_LESSON : SESSION_SIZE,
    practice: true,
  })

  return queue.flatMap(({ word, isNew }): Step[] => {
    let stepMode: WordMode
    if (mode !== 'mix') stepMode = mode
    else if (isNew) stepMode = 'cards'
    else {
      // Speaking needs a microphone, so mixed lessons leave it to its own mode.
      const options = modesFor(word, abilities).filter((m) => m !== 'speaking' && m !== 'cards')
      stepMode = options[Math.floor(Math.random() * options.length)] ?? 'cards'
    }

    const id = `${word.id}-${stepMode}`
    switch (stepMode) {
      case 'cards':
        return [{ id, mode: 'cards', word, isNew }]
      case 'choice': {
        const direction = Math.random() < 0.5 ? 'en-uk' : 'uk-en'
        const value = direction === 'en-uk' ? (w: StudyWord) => w.translation : (w: StudyWord) => w.word
        const answer = value(word)
        const distractors = pickDistractors(word, words, 3, value)
        if (distractors.length < 2) return [{ id, mode: 'cards', word, isNew }]
        return [{ id, mode: 'choice', word, direction, answer, options: shuffle([answer, ...distractors]) }]
      }
      case 'cloze': {
        const cloze = makeCloze(word)
        if (!cloze) return [{ id, mode: 'cards', word, isNew }]
        // Same shape as the answer: single words, with the same ending.
        const isPhrase = /\s/.test(word.word)
        const pool = words.filter((w) => /\s/.test(w.word) === isPhrase)
        const distractors = pickDistractors(word, pool, 3, (w) => inflectLike(cloze.answer, word.word, w.word))
        return [{ id, mode: 'cloze', word, cloze, options: shuffle([cloze.answer, ...distractors]) }]
      }
      case 'builder': {
        const builder = makeBuilder(word)
        return builder ? [{ id, mode: 'builder', word, builder }] : [{ id, mode: 'cards', word, isNew }]
      }
      case 'listening': {
        const distractors = pickDistractors(word, words, 3, (w) => w.word)
        return [{ id, mode: 'listening', word, options: shuffle([word.word, ...distractors]) }]
      }
      case 'sorting': {
        const others = shuffle([...categories].filter((c) => c !== word.category)).slice(0, 3)
        return [{ id, mode: 'sorting', word, options: shuffle([word.category, ...others]) }]
      }
      case 'typing':
      case 'dictation':
      case 'speaking':
        return [{ id, mode: stepMode, word }]
    }
  })
}

export function SessionPage() {
  const { mode: rawMode } = useParams()
  const mode = (VALID_MODES.has(rawMode ?? '') ? rawMode : null) as Mode | null
  const { t } = useTranslation()
  const navigate = useNavigate()
  const viewer = useViewer()
  const { loaded, load, words, rules } = useLibrary()
  const { progress, progressLoaded, loadProgress, answer } = useStudy()

  const [steps, setSteps] = useState<Step[] | null>(null)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<QuestionResult | null>(null)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const questionStartedAt = useRef(Date.now())
  const pending = useRef<Array<Promise<unknown>>>([])
  const before = useRef<Snapshot>(snapshot())
  const sound = useSound()
  const { cardBack } = useEquipped()

  useEffect(() => {
    if (!viewer.isGuest && !loaded) void load()
    if (!viewer.isGuest && !progressLoaded) void loadProgress().catch(() => {})
  }, [viewer.isGuest, loaded, load, progressLoaded, loadProgress])

  const start = useCallback(() => {
    if (!mode) return
    setSteps(buildSteps(mode, words, rules, useStudy.getState().progress))
    setIndex(0)
    setResult(null)
    setOutcomes([])
    startedAt.current = Date.now()
    questionStartedAt.current = Date.now()
    pending.current = []
    before.current = snapshot()
  }, [mode, words, rules])

  // Build the session once words and progress are in.
  useEffect(() => {
    if (steps === null && loaded && progressLoaded) start()
  }, [steps, loaded, progressLoaded, start])

  const step = steps?.[index]

  const record = useCallback(
    (current: Step, grade: Grade, correct: boolean, expected?: string) => {
      setOutcomes((list) => [...list, { step: current, correct, expected }])
      sound(correct ? 'correct' : 'wrong')
      const saving = answer({
        wordId: current.mode === 'rules' ? undefined : current.word.id,
        ruleId: current.mode === 'rules' ? current.rule.id : undefined,
        mode: current.mode,
        grade,
        correct,
        durationMs: Date.now() - questionStartedAt.current,
      }).catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
      pending.current.push(saving)
    },
    [answer, sound],
  )

  const next = useCallback(() => {
    setResult(null)
    setIndex((i) => i + 1)
    questionStartedAt.current = Date.now()
  }, [])

  function onResult(value: QuestionResult) {
    if (!step) return
    setResult(value)
    record(step, value.grade, value.correct, value.expected)
  }

  function onRate(grade: Grade) {
    if (!step) return
    record(step, grade, grade !== Rating.Again)
    next()
  }

  // Enter moves on once an answer is shown.
  useEffect(() => {
    if (!result) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        next()
      }
    }
    // Let the Enter that submitted the answer finish first.
    const timer = setTimeout(() => window.addEventListener('keydown', onKey), 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [result, next])

  if (!mode) return <Navigate to="/learn" replace />
  if (viewer.isGuest) return <Navigate to="/learn" replace />

  if (!steps) {
    return <Card className="mx-auto max-w-2xl text-center text-muted">{t('common.loading')}</Card>
  }

  if (steps.length === 0) {
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 py-10 text-center">
        <h2 className="font-display text-lg font-semibold">{t('learn.nothingToStudy')}</h2>
        <p className="text-sm text-muted">{t(mode === 'rules' ? 'learn.needRules' : 'learn.nothingToStudyText')}</p>
        <Link to={mode === 'rules' ? '/words' : '/learn'} className="btn btn-primary mt-2">
          {t(mode === 'rules' ? 'nav.words' : 'nav.learn')}
        </Link>
      </Card>
    )
  }

  if (!step) {
    return (
      <Summary
        outcomes={outcomes}
        seconds={Math.round((Date.now() - startedAt.current) / 1000)}
        pending={pending.current}
        before={before.current}
        onAgain={start}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/learn')}
          aria-label={t('common.close')}
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg"
        >
          <X className="size-5" />
        </button>
        <ProgressBar value={index} max={steps.length} className="h-2.5 flex-1" />
        <span className="w-14 text-right text-sm text-muted tabular-nums">
          {index + 1} / {steps.length}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${step.id}-${index}`}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card glow padding="p-6 sm:p-10" className={cardBack ? `card-back-${cardBack.data.style}` : undefined}>
            <StepView step={step} progress={progress} onResult={onResult} onRate={onRate} onSkip={next} />
          </Card>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>{result && <Feedback step={step} result={result} onNext={next} />}</AnimatePresence>

      {saveError && <p className="text-center text-xs text-danger">{t('learn.saveError', { message: saveError })}</p>}
    </div>
  )
}

function StepView({
  step,
  progress,
  onResult,
  onRate,
  onSkip,
}: {
  step: Step
  progress: ReturnType<typeof useStudy.getState>['progress']
  onResult: (result: QuestionResult) => void
  onRate: (grade: Grade) => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  switch (step.mode) {
    case 'cards':
      return <Flashcard word={step.word} isNew={step.isNew} progress={progress.get(step.word.id)} onRate={onRate} />
    case 'choice':
      return step.direction === 'en-uk' ? (
        <ChoiceQuestion
          label={t('learn.prompts.chooseTranslation')}
          prompt={step.word.word}
          extra={<SpeakButtons text={step.word.word} />}
          options={step.options}
          answer={step.answer}
          onResult={onResult}
        />
      ) : (
        <ChoiceQuestion
          label={t('learn.prompts.chooseWord')}
          prompt={step.word.translation}
          options={step.options}
          answer={step.answer}
          onResult={onResult}
        />
      )
    case 'typing':
      return (
        <TypeQuestion
          label={t('learn.prompts.typing')}
          prompt={step.word.translation}
          extra={step.word.category ? <span className="text-sm text-subtle">{step.word.category}</span> : undefined}
          target={step.word.word}
          onResult={onResult}
        />
      )
    case 'dictation':
      return (
        <TypeQuestion
          label={t('learn.prompts.dictation')}
          prompt={<span className="text-2xl text-muted">🎧</span>}
          extra={<SpeakButtons text={step.word.word} slow auto />}
          target={step.word.word}
          onResult={onResult}
        />
      )
    case 'cloze':
      return (
        <ChoiceQuestion
          label={t('learn.prompts.cloze')}
          prompt={
            <span className="text-2xl leading-snug font-medium sm:text-3xl">
              {step.cloze.before}
              <span className="mx-1 inline-block min-w-16 border-b-2 border-accent align-baseline">&nbsp;</span>
              {step.cloze.after}
            </span>
          }
          extra={step.word.translation ? <span className="text-sm text-muted">{step.word.translation}</span> : undefined}
          options={step.options}
          answer={step.cloze.answer}
          onResult={onResult}
        />
      )
    case 'builder':
      return <BuilderQuestion builder={step.builder} translation={step.word.translation || step.word.word} onResult={onResult} />
    case 'listening':
      return (
        <ChoiceQuestion
          label={t('learn.prompts.listening')}
          prompt={<span className="text-2xl text-muted">🎧</span>}
          extra={<SpeakButtons text={step.word.word} slow auto />}
          options={step.options}
          answer={step.word.word}
          onResult={onResult}
        />
      )
    case 'speaking':
      return <SpeakQuestion word={step.word} onResult={onResult} onSkip={onSkip} />
    case 'sorting':
      return (
        <ChoiceQuestion
          label={t('learn.prompts.sorting')}
          prompt={step.word.word}
          extra={step.word.translation ? <span className="text-muted">{step.word.translation}</span> : undefined}
          options={step.options}
          answer={step.word.category}
          onResult={onResult}
        />
      )
    case 'rules':
      return (
        <ChoiceQuestion
          label={t('learn.prompts.rules')}
          prompt={<span className="text-2xl sm:text-3xl">{step.rule.rule}</span>}
          extra={step.rule.topic ? <span className="text-sm text-subtle">{step.rule.topic}</span> : undefined}
          options={step.options}
          answer={step.answer}
          onResult={onResult}
        />
      )
  }
}

function Feedback({ step, result, onNext }: { step: Step; result: QuestionResult; onNext: () => void }) {
  const { t } = useTranslation()
  const close = result.note === 'close'
  const word = step.mode === 'rules' ? null : step.word
  const showExpected = !result.correct || close

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cx(
        'glass flex flex-col gap-3 rounded-card border-2 p-5 sm:flex-row sm:items-center',
        result.correct && !close ? 'border-success/50' : close ? 'border-coin/50' : 'border-danger/50',
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {result.correct ? (
          <CircleCheck className={cx('size-6 shrink-0', close ? 'text-coin' : 'text-success')} />
        ) : (
          <CircleX className="size-6 shrink-0 text-danger" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">{result.correct ? (close ? t('learn.feedback.close') : t('learn.feedback.correct')) : t('learn.feedback.wrong')}</p>
          {showExpected && result.expected && (
            <p className="mt-0.5 text-sm break-words text-muted">{t('learn.feedback.answer', { answer: result.expected })}</p>
          )}
          {word && (
            <p className="mt-1 text-sm break-words text-subtle">
              <span className="font-medium text-fg">{word.word}</span>
              {word.translation && ` — ${word.translation}`}
            </p>
          )}
        </div>
      </div>
      <button type="button" className="btn btn-primary shrink-0" onClick={onNext} autoFocus>
        {t('learn.next')}
        <ArrowRight className="size-4" />
      </button>
    </motion.div>
  )
}

type Rewards = { xp: number; coins: number; level: number | null; achievements: string[] }

/** Waits for the last answers to be saved, then asks the server what they earned. */
function useRewards(pending: Array<Promise<unknown>>, before: Snapshot): Rewards | null {
  const [rewards, setRewards] = useState<Rewards | null>(null)
  const sound = useSound()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.allSettled(pending)
      await Promise.all([useProfile.getState().refresh(), useEconomy.getState().loadMine(), useStudy.getState().refreshSummary()])
      if (cancelled) return
      const profile = useProfile.getState().profile
      const xp = profile?.xp ?? before.xp
      const levelBefore = levelFromXp(before.xp).level
      const levelAfter = levelFromXp(xp).level
      const known = before.unlocked
      const achievements = known ? [...useEconomy.getState().unlocked.keys()].filter((id) => !known.has(id)) : []
      const result = {
        xp: Math.max(0, xp - before.xp),
        coins: Math.max(0, (profile?.coins ?? before.coins) - before.coins),
        level: levelAfter > levelBefore ? levelAfter : null,
        achievements,
      }
      setRewards(result)
      if (result.level || achievements.length) sound('level')
      else if (result.coins) sound('coin')
    })()
    return () => {
      cancelled = true
    }
  }, [pending, before, sound])

  return rewards
}

function Summary({
  outcomes,
  seconds,
  pending,
  before,
  onAgain,
}: {
  outcomes: Outcome[]
  seconds: number
  pending: Array<Promise<unknown>>
  before: Snapshot
  onAgain: () => void
}) {
  const { t } = useTranslation()
  const rewards = useRewards(pending, before)
  const achievements = useEconomy((s) => s.achievements)
  const correct = outcomes.filter((o) => o.correct).length
  const share = outcomes.length ? Math.round((correct / outcomes.length) * 100) : 0
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {rewards && (rewards.level || rewards.achievements.length > 0) && <Confetti />}
      <Card glow padding="p-6 sm:p-10" className="flex flex-col items-center gap-4 text-center">
        <Trophy className="size-12 text-coin" strokeWidth={1.6} />
        <h2 className="font-display text-2xl font-semibold">{t('learn.summary.title')}</h2>
        <div className="font-display text-6xl font-semibold">{share}%</div>
        <div className="flex flex-wrap justify-center gap-4 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4 text-success" />
            {t('learn.summary.correct', { correct, total: outcomes.length })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-4" />
            {minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : t('learn.summary.seconds', { n: rest })}
          </span>
        </div>

        <div className="flex min-h-12 flex-wrap justify-center gap-2">
          {rewards ? (
            <>
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 rounded-full border border-xp/30 bg-xp/12 px-4 py-2 font-display font-semibold text-xp tabular-nums">
                <Sparkles className="size-4" />+{rewards.xp} XP
              </motion.span>
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="inline-flex items-center gap-1.5 rounded-full border border-coin/30 bg-coin/12 px-4 py-2 font-display font-semibold text-coin tabular-nums">
                <Coins className="size-4" />+{rewards.coins}
              </motion.span>
            </>
          ) : (
            <span className="h-10 w-48 animate-pulse rounded-full bg-surface" />
          )}
        </div>

        <AnimatePresence>
          {rewards?.level && (
            <motion.div
              initial={{ y: 12, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.25 }}
              className="bg-gradient-accent w-full rounded-card px-5 py-4 text-on-accent shadow-[var(--shadow-accent)]"
            >
              <div className="font-display text-xl font-semibold">{t('learn.summary.levelUp', { level: rewards.level })}</div>
              <div className="text-sm opacity-85">{t('learn.summary.levelUpBonus')}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {rewards && rewards.achievements.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            {rewards.achievements.map((id, index) => {
              const achievement = achievements.find((item) => item.id === id)
              return (
                <motion.div
                  key={id}
                  initial={{ x: -16, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.35 + index * 0.1 }}
                  className={cx('glass flex items-center gap-3 rounded-control px-4 py-3 text-left', achievement && `rarity-${achievement.rarity}`)}
                >
                  <span className="text-2xl">{achievement?.icon ?? '🏅'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-muted uppercase">{t('learn.summary.achievement')}</span>
                    <span className="block truncate font-semibold">{t(`achievements.items.${id}.title`)}</span>
                  </span>
                  {achievement && achievement.reward > 0 && <span className="text-sm font-semibold text-coin">+{achievement.reward} 🪙</span>}
                </motion.div>
              )
            })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            <RotateCcw className="size-4" />
            {t('learn.summary.again')}
          </button>
          <Link to="/learn" className="btn btn-secondary">
            {t('learn.summary.back')}
          </Link>
        </div>
      </Card>

      <Card padding="p-0" className="overflow-hidden">
        <ul className="divide-y divide-line">
          {outcomes.map((outcome, i) => {
            const title = outcome.step.mode === 'rules' ? outcome.step.rule.rule : outcome.step.word.word
            const subtitle = outcome.step.mode === 'rules' ? outcome.step.rule.topic : outcome.step.word.translation
            return (
              <li key={`${outcome.step.id}-${i}`} className="flex items-center gap-3 px-5 py-3">
                {outcome.correct ? <CircleCheck className="size-5 shrink-0 text-success" /> : <CircleX className="size-5 shrink-0 text-danger" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{title}</div>
                  {subtitle && <div className="truncate text-sm text-muted">{subtitle}</div>}
                </div>
                <span className="shrink-0 text-xs text-subtle">{t(`learn.modes.${outcome.step.mode}.title`)}</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
