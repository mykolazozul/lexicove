import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Layers } from 'lucide-react'
import { cx } from '../lib/cx'
import { useViewer } from '../lib/viewer'
import { useSettings } from '../stores/settings'
import { Modal } from './Modal'

const SLIDES = [
  { key: 'welcome', emoji: '👋' },
  { key: 'words', emoji: '📚' },
  { key: 'daily', emoji: '🔥' },
  { key: 'compete', emoji: '⚔️' },
] as const

/** Four short tips on the first visit; skipped or finished, they don't come back on this device. */
export function Onboarding() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const viewer = useViewer()
  const onboarded = useSettings((s) => s.onboarded)
  const setOnboarded = useSettings((s) => s.setOnboarded)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)

  const last = index === SLIDES.length - 1
  const slide = SLIDES[index]!

  function go(next: number) {
    setDirection(next > index ? 1 : -1)
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)))
  }

  useEffect(() => {
    if (onboarded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(index + 1)
      if (event.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (onboarded) return null

  return (
    <Modal
      open
      onClose={() => setOnboarded(true)}
      title={<span className="text-sm font-semibold text-subtle">{t('onboarding.step', { step: index + 1, total: SLIDES.length })}</span>}
      footer={
        <>
          <div className="mr-auto flex gap-1.5" aria-hidden="true">
            {SLIDES.map((item, i) => (
              <span key={item.key} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-accent' : 'w-1.5 bg-line')} />
            ))}
          </div>
          {index > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => go(index - 1)}>
              <ArrowLeft className="size-4" />
              {t('onboarding.back')}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setOnboarded(true)}>
              {t('onboarding.skip')}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => (last ? setOnboarded(true) : go(index + 1))}>
            {last ? t('onboarding.start') : t('onboarding.next')}
            {!last && <ArrowRight className="size-4" />}
          </button>
        </>
      }
    >
      <div className="relative min-h-64 overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={slide.key}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center py-4 text-center"
          >
            <span className="bg-gradient-accent grid size-20 place-items-center rounded-full text-4xl shadow-lg shadow-accent/20" aria-hidden="true">
              {slide.emoji}
            </span>
            <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">{t(`onboarding.slides.${slide.key}.title`)}</h3>
            <p className="mt-3 max-w-md text-muted">{t(`onboarding.slides.${slide.key}.text`)}</p>
            {slide.key === 'words' && !viewer.isGuest && (
              <button
                type="button"
                className="btn btn-secondary mt-5"
                onClick={() => {
                  setOnboarded(true)
                  navigate('/words?decks=1')
                }}
              >
                <Layers className="size-4" />
                {t('words.decks.choose')}
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
  )
}
