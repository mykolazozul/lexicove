import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookmarkPlus, Check, Eye, Loader2, Sparkles, Volume2 } from 'lucide-react'
import { canSpeak, speak } from '../../lib/speech'
import { makeCloze, sentencesOf } from '../../lib/study'
import { supabase } from '../../lib/supabase'
import { useViewer } from '../../lib/viewer'
import { useLibrary } from '../../stores/library'
import { Card, IconChip } from '../ui'

type DayWord = {
  source: 'mine' | 'deck'
  id: string | null
  word: string
  translation: string
  pronunciation: string
  example: string
  category: string
  day: string
}

/**
 * One word a day, picked on the server: from the user's own list (shaky words first), or from the
 * starter decks for guests and empty lists. The same word comes back in the 09:00 notification.
 */
export function WordOfDayCard() {
  const { t, i18n } = useTranslation()
  const viewer = useViewer()
  const saveWord = useLibrary((s) => s.saveWord)
  const [word, setWord] = useState<DayWord | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'busy' | 'done'>('idle')

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.rpc('word_of_the_day').then(({ data }) => {
      if (alive && data) setWord(data as DayWord)
    })
    return () => {
      alive = false
    }
  }, [viewer.isGuest])

  if (!word) return <Card className="h-full min-h-56 animate-pulse" />

  const example = sentencesOf(word.example)[0] ?? ''
  const cloze = example
    ? makeCloze({ id: '', word: word.word, translation: '', pronunciation: '', examples: example, explanation: '', category: '' })
    : null

  async function addToMine() {
    if (!word) return
    setSaving('busy')
    try {
      await saveWord({
        word: word.word,
        translation: word.translation,
        pronunciation: word.pronunciation,
        examples: word.example,
        explanation: '',
        category: word.category,
      })
      setSaving('done')
    } catch {
      setSaving('idle')
    }
  }

  return (
    <Card glow className="flex h-full flex-col overflow-hidden">
      <div className="bg-gradient-accent pointer-events-none absolute -top-20 -right-16 -z-10 size-56 rounded-full opacity-20 blur-3xl" />
      <div className="flex items-center gap-3">
        <IconChip tone="xp" className="size-9">
          <Sparkles className="size-[1.1rem]" />
        </IconChip>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold">{t('home.wordOfDay.title')}</h3>
          <p className="text-xs text-subtle">
            {new Date(`${word.day}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' })}
            {word.category && ` · ${word.category}`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <div className="min-w-0">
          <div lang="en" className="font-display text-3xl font-semibold tracking-tight break-words sm:text-4xl">
            {word.word}
          </div>
          {word.pronunciation && <div className="mt-1 text-sm text-subtle">{word.pronunciation}</div>}
        </div>
        {canSpeak && (
          <button
            type="button"
            className="btn btn-secondary mb-1 size-10 shrink-0 p-0"
            onClick={() => speak(word.word)}
            aria-label={t('home.wordOfDay.listen')}
          >
            <Volume2 className="size-4" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRevealed(true)}
        disabled={revealed}
        className="mt-4 rounded-control border border-dashed border-line px-4 py-3 text-left transition-colors enabled:hover:bg-surface"
        aria-live="polite"
      >
        {revealed ? (
          <span className="font-semibold">{word.translation}</span>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Eye className="size-4" />
            {t('home.wordOfDay.reveal')}
          </span>
        )}
      </button>

      {example && (
        <p lang="en" className="mt-3 flex-1 text-sm text-muted italic">
          {cloze ? (
            <>
              {cloze.before}
              <strong className="font-semibold text-fg not-italic">{cloze.answer}</strong>
              {cloze.after}
            </>
          ) : (
            example
          )}
          {canSpeak && (
            <button type="button" className="ml-2 inline-flex align-middle text-subtle hover:text-fg" onClick={() => speak(example)} aria-label={t('home.wordOfDay.listenExample')}>
              <Volume2 className="size-3.5" />
            </button>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {word.source === 'mine' ? (
          <Link to="/learn" className="btn btn-primary">
            {t('home.wordOfDay.practise')}
            <ArrowRight className="size-4" />
          </Link>
        ) : viewer.isGuest ? (
          <p className="text-xs text-subtle">{t('home.wordOfDay.fromDeck')}</p>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={saving !== 'idle'} onClick={() => void addToMine()}>
            {saving === 'busy' ? <Loader2 className="size-4 animate-spin" /> : saving === 'done' ? <Check className="size-4 text-success" /> : <BookmarkPlus className="size-4" />}
            {saving === 'done' ? t('home.wordOfDay.added') : t('home.wordOfDay.add')}
          </button>
        )}
      </div>
    </Card>
  )
}
