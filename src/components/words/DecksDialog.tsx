import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import { addDeck, DECKS, fetchDecks, type DeckId, type DeckInfo } from '../../lib/decks'
import { useLibrary } from '../../stores/library'
import { Modal } from '../Modal'
import { Checkbox, IconChip, ProgressBar } from '../ui'

/** Picks a starter deck and copies its words into the user's list. */
export function DecksDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  /** How many words were added, and whether they still have to go to Notion. */
  onDone: (count: number, pushNeeded: boolean) => void
}) {
  const { t } = useTranslation()
  const { sources, load } = useLibrary()
  const hasNotion = sources.some((source) => source.kind === 'words')
  const [decks, setDecks] = useState<DeckInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<DeckId | null>(null)
  const [toNotion, setToNotion] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    fetchDecks()
      .then(setDecks)
      .catch(() => setError(t('errors.generic')))
  }, [open, t])

  async function add(deck: DeckId) {
    setBusy(deck)
    setError(null)
    try {
      const pushNeeded = hasNotion && toNotion
      const count = await addDeck(deck, pushNeeded)
      await load()
      onDone(count, pushNeeded && count > 0)
      onClose()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('words.decks.title')} wide>
      <p className="text-sm text-muted">{t('words.decks.text')}</p>

      {hasNotion && (
        <Checkbox className="mt-4" checked={toNotion} onChange={setToNotion}>
          <span className="font-medium">{t('words.decks.toNotion')}</span>
          <span className="block text-subtle">{t('words.decks.toNotionHint')}</span>
        </Checkbox>
      )}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {DECKS.map(({ id, emoji, tone }) => {
          const info = decks?.find((deck) => deck.deck === id)
          const left = info ? info.count - info.added : 0
          return (
            <li key={id} className="flex flex-col rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <IconChip tone={tone} className="text-xl">
                  <span aria-hidden="true">{emoji}</span>
                </IconChip>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold">{t(`words.decks.levels.${id}.name`)}</h3>
                  <p className="text-xs text-subtle">
                    {info ? t('words.decks.progress', { added: info.added, count: info.count }) : '…'}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">{t(`words.decks.levels.${id}.text`)}</p>
              {info && (
                <>
                  <p className="mt-2 line-clamp-1 text-sm text-fg/80">{info.sample.join(' · ')} …</p>
                  <ProgressBar value={info.added} max={info.count} className="mt-3" />
                </>
              )}
              <button
                type="button"
                className="btn btn-secondary mt-4 w-full"
                disabled={!info || left === 0 || busy !== null}
                onClick={() => void add(id)}
              >
                {busy === id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : info && left === 0 ? (
                  <Check className="size-4 text-success" />
                ) : null}
                {info && left === 0 ? t('words.decks.allAdded') : t('words.decks.add', { count: left || 40 })}
              </button>
            </li>
          )
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-4 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  )
}
