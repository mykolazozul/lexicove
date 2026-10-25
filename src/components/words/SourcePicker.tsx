import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import { FIELDS, READABLE_TYPES, type Kind } from '../../../supabase/functions/notion/mapping'
import { cx } from '../../lib/cx'
import { notionCall, NotionError, type NotionSourceOption, type SyncSummary } from '../../lib/notion'
import { useLibrary } from '../../stores/library'
import { Field, Modal } from '../Modal'
import { Segmented } from '../ui'
import { notionErrorText } from './notionErrors'

/** Lists the Notion tables the integration can see, then links one with a column mapping. */
export function SourcePicker({
  open,
  onClose,
  onLinked,
}: {
  open: boolean
  onClose: () => void
  onLinked: (summary: SyncSummary) => void
}) {
  const { t } = useTranslation()
  const load = useLibrary((s) => s.load)
  const linkedIds = new Set(useLibrary((s) => s.sources).map((source) => source.data_source_id))

  const [options, setOptions] = useState<NotionSourceOption[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('words')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setOptions(null)
    setSelectedId(null)
    setError(null)
    notionCall<{ sources: NotionSourceOption[] }>('list_sources')
      .then(({ sources }) => setOptions(sources))
      .catch((err) => {
        setOptions([])
        setError(notionErrorText(t, err))
      })
  }, [open, t])

  const selected = options?.find((option) => option.id === selectedId) ?? null

  function choose(option: NotionSourceOption) {
    setSelectedId(option.id)
    setKind(option.kind)
    setMapping(option.suggested[option.kind])
  }

  function changeKind(next: Kind) {
    setKind(next)
    if (selected) setMapping(selected.suggested[next])
  }

  async function submit() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const summary = await notionCall<SyncSummary>('add_source', { data_source_id: selected.id, kind, mapping })
      await load()
      onLinked(summary)
      onClose()
    } catch (err) {
      setError(err instanceof NotionError ? notionErrorText(t, err) : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const readable = selected?.properties.filter((property) => READABLE_TYPES.has(property.type)) ?? []
  const titleField = kind === 'words' ? 'word' : 'rule'

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('notion.picker.title')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('words.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!selected || !mapping[titleField] || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t('notion.picker.submit')}
          </button>
        </>
      }
    >
      {options === null && (
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t('notion.picker.loading')}
        </p>
      )}
      {options?.length === 0 && !error && <p className="text-muted">{t('notion.picker.empty')}</p>}

      {options && options.length > 0 && (
        <ul className="flex flex-col gap-2">
          {options.map((option) => {
            const active = option.id === selectedId
            const linked = linkedIds.has(option.id)
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => choose(option)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-control border px-4 py-3 text-left transition-colors',
                    active ? 'border-accent bg-accent/8' : 'border-line hover:bg-surface',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{option.title || t('notion.untitled')}</span>
                    <span className="block text-xs text-muted">
                      {t(`notion.kinds.${option.kind}`)} · {t('notion.picker.columns', { count: option.properties.length })}
                      {linked && ` · ${t('notion.picker.alreadyLinked')}`}
                    </span>
                  </span>
                  {active && <Check className="size-5 shrink-0 text-accent" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && (
        <div className="mt-6 flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium">{t('notion.picker.kind')}</p>
            <Segmented
              label={t('notion.picker.kind')}
              value={kind}
              onChange={changeKind}
              options={[
                { value: 'words', label: t('notion.kinds.words') },
                { value: 'rules', label: t('notion.kinds.rules') },
              ]}
            />
          </div>
          <p className="text-sm font-medium">{t('notion.picker.mapping')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS[kind].map((field) => (
              <Field key={field} label={t(`words.fields.${field}`)}>
                <select
                  className="input"
                  value={mapping[field] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                >
                  <option value="">{t('notion.picker.none')}</option>
                  {readable.map((property) => (
                    <option key={property.name} value={property.name}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  )
}
