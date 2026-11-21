import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, Eye, Loader2, Volume2, X } from '../components/icons'
import { hideCard } from '../lib/desktop'
import { canSpeak, speak } from '../lib/speech'
import { Rating } from '../lib/srs'
import { buildQueue, type QueueItem } from '../lib/study'
import { useAuth } from '../stores/auth'
import { useLibrary } from '../stores/library'
import { useStudy } from '../stores/study'

/**
 * The small window of the desktop app (src-tauri/src/lib.rs): a word card that pops up every
 * so often above other windows, and the quick add for a word highlighted anywhere.
 */
export function DesktopPage({ mode }: { mode: 'card' | 'add' }) {
  const { t } = useTranslation()
  const ready = useAuth((s) => s.ready)
  const session = useAuth((s) => s.session)

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header data-tauri-drag-region className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs font-semibold text-muted">
        <span data-tauri-drag-region className="flex-1">
          Lexicove · {t(mode === 'card' ? 'desktop.cardTitle' : 'desktop.addTitle')}
        </span>
        <button type="button" onClick={() => void hideCard()} aria-label={t('common.close')} className="grid size-6 place-items-center rounded-md hover:bg-surface hover:text-fg">
          <X className="size-4" />
        </button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col p-4">
        {!ready ? (
          <Center>
            <Loader2 className="size-6 animate-spin text-accent" />
          </Center>
        ) : !session ? (
          <Center>
            <p className="text-sm text-muted">{t('desktop.signIn')}</p>
          </Center>
        ) : mode === 'card' ? (
          <WordCard />
        ) : (
          <QuickAdd />
        )}
      </main>
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid flex-1 place-items-center text-center">{children}</div>
}

/** One due (or new) word: think of the translation, reveal it, say whether you knew it. */
function WordCard() {
  const { t } = useTranslation()
  const { loaded, load, words } = useLibrary()
  const { progress, progressLoaded, loadProgress, answer } = useStudy()
  const [round, setRound] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)
  const shown = useRef(Date.now())

  useEffect(() => {
    if (!loaded) void load()
    if (!progressLoaded) void loadProgress().catch(() => {})
  }, [loaded, load, progressLoaded, loadProgress])

  const item: QueueItem | undefined = useMemo(
    () => (loaded && progressLoaded ? buildQueue(words, progress, { size: 1, newLimit: 1, practice: true })[0] : undefined),
    // Not on every progress change (that would swap the word right after an answer), only per round.
    [loaded, progressLoaded, round, words],
  )

  if (!loaded || !progressLoaded) {
    return (
      <Center>
        <Loader2 className="size-6 animate-spin text-accent" />
      </Center>
    )
  }
  if (!item) {
    return (
      <Center>
        <p className="text-sm text-muted">{t('desktop.noWords')}</p>
      </Center>
    )
  }

  async function grade(knew: boolean) {
    if (!item) return
    await answer({
      wordId: item.word.id,
      mode: 'cards',
      grade: knew ? Rating.Good : Rating.Again,
      correct: knew,
      durationMs: Date.now() - shown.current,
    }).catch(() => {})
    setDone(true)
  }

  if (done) {
    return (
      <Center>
        <div className="flex flex-col items-center gap-3">
          <Check className="size-8 text-success" />
          <p className="text-sm text-muted">{t('desktop.saved')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary h-9 px-3 text-sm"
              onClick={() => {
                setDone(false)
                setRevealed(false)
                shown.current = Date.now()
                setRound((n) => n + 1)
              }}
            >
              {t('desktop.another')}
            </button>
            <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={() => void hideCard()}>
              {t('desktop.later')}
            </button>
          </div>
        </div>
      </Center>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <div className="flex items-center gap-2">
          <span lang="en" className="font-display text-2xl font-semibold break-words">
            {item.word.word}
          </span>
          {canSpeak && (
            <button type="button" className="text-subtle hover:text-fg" onClick={() => speak(item.word.word)} aria-label={t('home.wordOfDay.listen')}>
              <Volume2 className="size-4" />
            </button>
          )}
        </div>
        {item.word.pronunciation && <span className="text-xs text-subtle">{item.word.pronunciation}</span>}
        {revealed && (
          <p lang="uk" className="mt-2 font-semibold">
            {item.word.translation}
          </p>
        )}
      </div>
      {revealed ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary h-10 text-sm" onClick={() => void grade(false)}>
            {t('desktop.forgot')}
          </button>
          <button type="button" className="btn btn-primary h-10 text-sm" onClick={() => void grade(true)}>
            {t('desktop.knew')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary h-10 text-sm" onClick={() => setRevealed(true)}>
          <Eye className="size-4" />
          {t('desktop.reveal')}
        </button>
      )}
    </div>
  )
}

/** The highlighted word, with a translation to type; it goes to Notion too when a table is linked. */
function QuickAdd() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { loaded, load, saveWord, sources, sync } = useLibrary()
  const [word, setWord] = useState(() => new URLSearchParams(search).get('word')?.trim().slice(0, 200) ?? '')
  const [translation, setTranslation] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!word.trim() || state === 'busy') return
    setState('busy')
    try {
      await saveWord({ word: word.trim(), translation: translation.trim(), pronunciation: '', examples: '', explanation: '', category: '' })
      if (sources.some((source) => source.kind === 'words')) await sync().catch(() => {})
      setState('done')
      setTimeout(() => void hideCard(), 1200)
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <Center>
        <div className="flex flex-col items-center gap-2">
          <Check className="size-8 text-success" />
          <p className="text-sm text-muted">{t('desktop.added', { word })}</p>
        </div>
      </Center>
    )
  }

  return (
    <form onSubmit={save} className="flex flex-1 flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{t('words.fields.word')}</span>
        <input className="input h-10" lang="en" value={word} onChange={(e) => setWord(e.target.value)} required maxLength={200} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{t('words.fields.translation')}</span>
        <input className="input h-10" lang="uk" value={translation} onChange={(e) => setTranslation(e.target.value)} autoFocus maxLength={1000} />
      </label>
      {state === 'error' && <p className="text-xs text-danger">{t('errors.generic')}</p>}
      <button type="submit" className="btn btn-primary mt-auto h-10 text-sm" disabled={state === 'busy' || !word.trim()}>
        {state === 'busy' && <Loader2 className="size-4 animate-spin" />}
        {t('desktop.save')}
      </button>
    </form>
  )
}
