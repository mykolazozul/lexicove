import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Trash2 } from 'lucide-react'
import { useLibrary, type Rule, type Word } from '../../stores/library'
import { Field, Modal } from '../Modal'

type Kind = 'words' | 'rules'

const EMPTY_WORD = { word: '', translation: '', pronunciation: '', examples: '', explanation: '', category: '' }
const EMPTY_RULE = { rule: '', topic: '', explanation: '', examples: '' }

/** Add or edit one word or rule. `item` undefined means "new". */
export function ItemEditor({
  kind,
  open,
  item,
  onClose,
  onSaved,
}: {
  kind: Kind
  open: boolean
  item?: Word | Rule
  onClose: () => void
  onSaved: (pushNeeded: boolean) => void
}) {
  const { t } = useTranslation()
  const { saveWord, deleteWord, saveRule, deleteRule, words, rules, sources } = useLibrary()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const base = kind === 'words' ? EMPTY_WORD : EMPTY_RULE
    const next: Record<string, string> = {}
    for (const key of Object.keys(base)) next[key] = item ? String((item as Record<string, unknown>)[key] ?? '') : ''
    setValues(next)
    setError(null)
  }, [open, item, kind])

  const fields = kind === 'words' ? Object.keys(EMPTY_WORD) : Object.keys(EMPTY_RULE)
  const longFields = new Set(['examples', 'explanation'])
  const titleField = kind === 'words' ? 'word' : 'rule'
  const groupField = kind === 'words' ? 'category' : 'topic'
  const groups = [...new Set((kind === 'words' ? words.map((w) => w.category) : rules.map((r) => r.topic)).filter(Boolean))]
  const linked = item ? item.source_id !== null : sources.some((source) => source.kind === kind)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!values[titleField]?.trim()) return
    setBusy('save')
    setError(null)
    try {
      const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]))
      if (kind === 'words') await saveWord(trimmed as typeof EMPTY_WORD, item as Word | undefined)
      else await saveRule(trimmed as typeof EMPTY_RULE, item as Rule | undefined)
      onSaved(linked)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  async function onDelete() {
    if (!item) return
    const name = kind === 'words' ? (item as Word).word : (item as Rule).rule
    const question = item.source_id ? t('words.confirmDelete', { name }) : t('words.confirmDeleteLocal', { name })
    if (!window.confirm(question)) return
    setBusy('delete')
    try {
      if (kind === 'words') await deleteWord(item as Word)
      else await deleteRule(item as Rule)
      onSaved(item.source_id !== null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  const title = item
    ? t(kind === 'words' ? 'words.editWord' : 'words.editRule')
    : t(kind === 'words' ? 'words.addWord' : 'words.addRule')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {item && (
            <button type="button" className="btn btn-ghost mr-auto text-danger" onClick={onDelete} disabled={busy !== null}>
              {busy === 'delete' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t('words.delete')}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('words.cancel')}
          </button>
          <button type="submit" form="item-editor" className="btn btn-primary" disabled={busy !== null}>
            {busy === 'save' && <Loader2 className="size-4 animate-spin" />}
            {t('words.save')}
          </button>
        </>
      }
    >
      <form id="item-editor" onSubmit={onSubmit} className="flex flex-col gap-4">
        {fields.map((field) => (
          <Field key={field} label={t(`words.fields.${field}`)}>
            {longFields.has(field) ? (
              <textarea
                className="input min-h-24 py-2.5"
                value={values[field] ?? ''}
                onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                maxLength={field === 'explanation' && kind === 'rules' ? 8000 : 4000}
              />
            ) : (
              <input
                className="input"
                value={values[field] ?? ''}
                onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                required={field === titleField}
                autoFocus={field === titleField && !item}
                list={field === groupField ? `${kind}-groups` : undefined}
                maxLength={field === titleField ? (kind === 'words' ? 200 : 300) : field === 'translation' ? 1000 : 200}
              />
            )}
          </Field>
        ))}
        <datalist id={`${kind}-groups`}>
          {groups.map((group) => (
            <option key={group} value={group} />
          ))}
        </datalist>
        {linked && <p className="text-sm text-muted">{t('words.syncedHint')}</p>}
        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
