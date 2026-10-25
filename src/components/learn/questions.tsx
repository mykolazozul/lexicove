import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Eye, Lightbulb, Loader2, Mic, RotateCcw } from 'lucide-react'
import { cx } from '../../lib/cx'
import { listen, SpeechError } from '../../lib/speech'
import { formatInterval, previewDue, Rating, type Grade, type ProgressRow } from '../../lib/srs'
import { checkTyped, gradeFor, normalize, similarity, type Builder, type StudyWord } from '../../lib/study'
import { Badge } from '../ui'
import { OptionButton, Prompt, SpeakButtons, type OptionState } from './parts'

export type QuestionResult = { correct: boolean; grade: Grade; expected?: string; note?: string }

/** Number keys and Space/Enter for the active question; ignored while typing in a field. */
function useKeys(handler: (key: string) => void, active = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      ref.current(event.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

// ---------- flashcards ----------

const GRADES: Array<{ grade: Grade; key: 'again' | 'hard' | 'good' | 'easy'; className: string }> = [
  { grade: Rating.Again, key: 'again', className: 'border-danger/40 hover:bg-danger/12 text-danger' },
  { grade: Rating.Hard, key: 'hard', className: 'border-coin/40 hover:bg-coin/12 text-coin' },
  { grade: Rating.Good, key: 'good', className: 'border-success/40 hover:bg-success/12 text-success' },
  { grade: Rating.Easy, key: 'easy', className: 'border-accent/40 hover:bg-accent/12 text-accent' },
]

export function Flashcard({
  word,
  isNew,
  progress,
  onRate,
}: {
  word: StudyWord
  isNew: boolean
  progress: ProgressRow | undefined
  onRate: (grade: Grade) => void
}) {
  const { t, i18n } = useTranslation()
  const [flipped, setFlipped] = useState(false)
  const now = useMemo(() => new Date(), [])
  const preview = useMemo(() => previewDue(progress, now), [progress, now])

  useKeys((key) => {
    if (!flipped && (key === ' ' || key === 'Enter')) setFlipped(true)
    else if (flipped && ['1', '2', '3', '4'].includes(key)) onRate(GRADES[Number(key) - 1]!.grade)
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {isNew && <Badge tone="accent">{t('learn.newWord')}</Badge>}
        <div className="font-display text-4xl leading-tight font-semibold tracking-tight break-words sm:text-5xl">{word.word}</div>
        {word.pronunciation && <div className="text-muted">{word.pronunciation}</div>}
        <SpeakButtons text={word.word} auto />
      </div>

      <AnimatePresence mode="wait">
        {flipped ? (
          <motion.div
            key="back"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4 border-t border-line pt-6 text-center"
          >
            <div className="text-2xl font-semibold">{word.translation || '—'}</div>
            {word.category && <div className="mx-auto"><Badge>{word.category}</Badge></div>}
            {word.examples && <p className="whitespace-pre-line text-muted italic">{word.examples}</p>}
            {word.explanation && <p className="whitespace-pre-line text-sm text-subtle">{word.explanation}</p>}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map(({ grade, key, className }, index) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onRate(grade)}
                  className={cx('flex flex-col items-center gap-0.5 rounded-control border bg-surface px-3 py-2.5 transition-colors', className)}
                >
                  <span className="font-semibold">{t(`learn.grades.${key}`)}</span>
                  <span className="text-xs text-muted">
                    {formatInterval(now, preview[grade], i18n.language)} · {index + 1}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="front" exit={{ opacity: 0 }} className="flex justify-center">
            <button type="button" className="btn btn-primary" onClick={() => setFlipped(true)}>
              <Eye className="size-4" />
              {t('learn.show')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- multiple choice (choice, cloze, listening, sorting, rules) ----------

export function ChoiceQuestion({
  label,
  prompt,
  extra,
  options,
  answer,
  onResult,
}: {
  label: string
  prompt: ReactNode
  extra?: ReactNode
  options: string[]
  answer: string
  onResult: (result: QuestionResult) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)

  function choose(index: number) {
    if (picked !== null) return
    setPicked(index)
    const correct = options[index] === answer
    onResult({ correct, grade: gradeFor({ correct }), expected: answer })
  }

  useKeys((key) => {
    const index = Number(key) - 1
    if (index >= 0 && index < options.length) choose(index)
  }, picked === null)

  const stateOf = (option: string, index: number): OptionState => {
    if (picked === null) return 'idle'
    if (option === answer) return 'correct'
    if (index === picked) return 'wrong'
    return 'dim'
  }

  return (
    <div className="flex flex-col gap-8">
      <Prompt label={label} extra={extra}>
        {prompt}
      </Prompt>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option, index) => (
          <OptionButton key={option} index={index} state={stateOf(option, index)} onClick={() => choose(index)} disabled={picked !== null}>
            {option}
          </OptionButton>
        ))}
      </div>
    </div>
  )
}

// ---------- typing (typing, dictation) ----------

export function TypeQuestion({
  label,
  prompt,
  extra,
  target,
  onResult,
}: {
  label: string
  prompt: ReactNode
  extra?: ReactNode
  target: string
  onResult: (result: QuestionResult) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [hint, setHint] = useState(0)
  const [result, setResult] = useState<'exact' | 'close' | 'wrong' | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (result || !value.trim()) return
    const checked = checkTyped(value, target)
    setResult(checked)
    const correct = checked !== 'wrong'
    onResult({
      correct,
      grade: gradeFor({ correct, close: checked === 'close', hinted: hint > 0 }),
      expected: target,
      note: checked === 'close' ? 'close' : undefined,
    })
  }

  function revealLetter() {
    const next = Math.min(target.length, hint + 1)
    setHint(next)
    setValue(target.slice(0, next))
    input.current?.focus()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Prompt label={label} extra={extra}>
        {prompt}
      </Prompt>
      <div className="flex flex-col gap-3">
        <input
          ref={input}
          className={cx(
            'input h-14 text-center text-xl',
            result === 'exact' && 'border-success',
            result === 'close' && 'border-coin',
            result === 'wrong' && 'border-danger',
          )}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={result !== null}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          lang="en"
          placeholder={t('learn.typeHere')}
          aria-label={t('learn.typeHere')}
        />
        {result === null && (
          <div className="flex justify-center gap-2">
            <button type="button" className="btn btn-ghost" onClick={revealLetter} disabled={hint >= target.length}>
              <Lightbulb className="size-4" />
              {t('learn.hint')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
              {t('learn.check')}
            </button>
          </div>
        )}
      </div>
    </form>
  )
}

// ---------- sentence builder ----------

export function BuilderQuestion({
  builder,
  translation,
  onResult,
}: {
  builder: Builder
  translation: string
  onResult: (result: QuestionResult) => void
}) {
  const { t } = useTranslation()
  const [chosen, setChosen] = useState<number[]>([])
  const [checked, setChecked] = useState<boolean | null>(null)

  const complete = chosen.length === builder.shuffled.length

  function check() {
    const answer = chosen.map((i) => builder.shuffled[i]).join(' ')
    const correct = normalize(answer) === normalize(builder.sentence)
    setChecked(correct)
    onResult({ correct, grade: gradeFor({ correct }), expected: builder.sentence })
  }

  return (
    <div className="flex flex-col gap-8">
      <Prompt label={t('learn.prompts.builder')}>
        <span className="text-2xl sm:text-3xl">{translation}</span>
      </Prompt>
      <div
        className={cx(
          'flex min-h-16 flex-wrap justify-center gap-2 rounded-card border border-dashed p-3',
          checked === true ? 'border-success' : checked === false ? 'border-danger' : 'border-line',
        )}
      >
        {chosen.length === 0 && <span className="self-center text-sm text-subtle">{t('learn.builderHint')}</span>}
        {chosen.map((index) => (
          <button
            key={index}
            type="button"
            disabled={checked !== null}
            onClick={() => setChosen(chosen.filter((i) => i !== index))}
            className="rounded-control border border-accent/40 bg-accent/12 px-3 py-2 font-medium"
          >
            {builder.shuffled[index]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {builder.shuffled.map((token, index) =>
          chosen.includes(index) ? (
            <span key={index} className="rounded-control border border-line px-3 py-2 opacity-0">
              {token}
            </span>
          ) : (
            <button
              key={index}
              type="button"
              disabled={checked !== null}
              onClick={() => setChosen([...chosen, index])}
              className="rounded-control border border-line bg-surface px-3 py-2 font-medium transition-transform hover:-translate-y-0.5"
            >
              {token}
            </button>
          ),
        )}
      </div>
      {checked === null && (
        <div className="flex justify-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setChosen([])} disabled={chosen.length === 0}>
            <RotateCcw className="size-4" />
            {t('learn.reset')}
          </button>
          <button type="button" className="btn btn-primary" onClick={check} disabled={!complete}>
            {t('learn.check')}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- pronunciation ----------

export function SpeakQuestion({
  word,
  onResult,
  onSkip,
}: {
  word: StudyWord
  onResult: (result: QuestionResult) => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'listening' | 'done' | 'no-speech' | 'not-allowed' | 'error'>('idle')
  const [heard, setHeard] = useState<{ text: string; score: number } | null>(null)
  const stop = useRef<() => void>(() => {})

  useEffect(() => () => stop.current(), [])

  async function record() {
    setState('listening')
    const session = listen()
    stop.current = session.stop
    try {
      const guesses = await session.result
      const best = guesses
        .map((text) => ({ text, score: similarity(text, word.word) }))
        .sort((a, b) => b.score - a.score)[0] ?? { text: '', score: 0 }
      setHeard(best)
      setState('done')
      const correct = best.score >= 0.65
      onResult({
        correct,
        grade: best.score >= 0.85 ? Rating.Good : correct ? Rating.Hard : Rating.Again,
        expected: word.word,
        note: `heard:${best.text}:${Math.round(best.score * 100)}`,
      })
    } catch (error) {
      setState(error instanceof SpeechError && (error.code === 'not-allowed' || error.code === 'no-speech') ? error.code : 'error')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Prompt label={t('learn.prompts.speaking')} extra={<SpeakButtons text={word.word} slow />}>
        {word.word}
        {word.translation && <div className="mt-2 text-lg font-normal text-muted">{word.translation}</div>}
      </Prompt>
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={record}
          disabled={state === 'listening' || state === 'done'}
          aria-label={t('learn.record')}
          className={cx(
            'grid size-20 place-items-center rounded-full text-on-accent shadow-[var(--shadow-accent)] transition-transform',
            state === 'listening' ? 'bg-danger animate-pulse' : 'bg-gradient-accent hover:scale-105 active:scale-95',
          )}
        >
          {state === 'listening' ? <Loader2 className="size-8 animate-spin" /> : <Mic className="size-8" />}
        </button>
        <p className="text-sm text-muted">
          {state === 'idle' && t('learn.speak.tap')}
          {state === 'listening' && t('learn.speak.listening')}
          {state === 'no-speech' && t('learn.speak.noSpeech')}
          {state === 'not-allowed' && t('learn.speak.notAllowed')}
          {state === 'error' && t('learn.speak.error')}
          {state === 'done' && heard && t('learn.speak.heard', { text: heard.text || '…', score: Math.round(heard.score * 100) })}
        </p>
        {(state === 'not-allowed' || state === 'error') && (
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            {t('learn.skip')}
          </button>
        )}
      </div>
    </div>
  )
}
