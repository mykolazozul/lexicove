import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Snail, Volume2 } from 'lucide-react'
import { cx } from '../../lib/cx'
import { canSpeak, speak } from '../../lib/speech'

/** Speaker button; `slow` adds a second, slower one for listening practice. */
export function SpeakButtons({ text, slow = false, auto = false }: { text: string; slow?: boolean; auto?: boolean }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (auto) speak(text)
  }, [auto, text])
  if (!canSpeak) return null
  return (
    <span className="inline-flex gap-2">
      <button
        type="button"
        onClick={() => speak(text)}
        aria-label={t('learn.listen')}
        title={t('learn.listen')}
        className="grid size-11 place-items-center rounded-full bg-accent/12 text-accent transition-transform hover:scale-105 active:scale-95"
      >
        <Volume2 className="size-5" />
      </button>
      {slow && (
        <button
          type="button"
          onClick={() => speak(text, { rate: 0.6 })}
          aria-label={t('learn.listenSlow')}
          title={t('learn.listenSlow')}
          className="grid size-11 place-items-center rounded-full bg-surface text-muted transition-transform hover:scale-105 hover:text-fg active:scale-95"
        >
          <Snail className="size-5" />
        </button>
      )}
    </span>
  )
}

export function Prompt({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">{label}</span>
      <div className="font-display text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl">{children}</div>
      {extra}
    </div>
  )
}

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

/** One answer button of a multiple-choice question, with its keyboard number. */
export function OptionButton({
  index,
  state,
  onClick,
  children,
  disabled,
}: {
  index: number
  state: OptionState
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex min-h-14 w-full items-center gap-3 rounded-control border px-4 py-3 text-left font-medium transition-all',
        state === 'idle' && 'border-line bg-surface hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-hover',
        state === 'correct' && 'border-success bg-success/15 text-fg',
        state === 'wrong' && 'border-danger bg-danger/12 text-fg',
        state === 'dim' && 'border-line bg-surface opacity-50',
      )}
    >
      <span
        className={cx(
          'grid size-6 shrink-0 place-items-center rounded-md border text-xs font-bold',
          state === 'correct' ? 'border-success text-success' : state === 'wrong' ? 'border-danger text-danger' : 'border-line text-subtle',
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </button>
  )
}
