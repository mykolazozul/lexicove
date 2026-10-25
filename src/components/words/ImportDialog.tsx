import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileUp, Loader2 } from 'lucide-react'
import { suggestMapping, type WordField } from '../../../supabase/functions/notion/mapping'
import { parseCsv } from '../../lib/csv'
import { useLibrary, type WordInput } from '../../stores/library'
import { Modal } from '../Modal'

const IMPORT_FIELDS: WordField[] = ['word', 'translation', 'pronunciation', 'examples', 'explanation', 'category', 'added']

type Parsed = { rows: WordInput[]; columns: Partial<Record<WordField, string>> }

/** Reads a CSV with a header row and picks columns by name, the same way Notion tables are matched. */
function readWords(text: string): Parsed | null {
  const [header, ...body] = parseCsv(text)
  if (!header) return null
  // Treat the first column as the title, like a Notion table, so an unnamed first column still works.
  const types = Object.fromEntries(header.map((name, index) => [name, index === 0 ? 'title' : 'rich_text']))
  const mapping = suggestMapping('words', types)
  if (!mapping.word) return null

  const index = (field: WordField) => (mapping[field] ? header.indexOf(mapping[field]!) : -1)
  const cell = (cells: string[], field: WordField, limit: number) => {
    const i = index(field)
    return i >= 0 ? (cells[i] ?? '').trim().slice(0, limit) : ''
  }

  const rows = body
    .map((cells): WordInput => {
      const added = cell(cells, 'added', 10)
      return {
        word: cell(cells, 'word', 200),
        translation: cell(cells, 'translation', 1000),
        pronunciation: cell(cells, 'pronunciation', 200),
        examples: cell(cells, 'examples', 4000),
        explanation: cell(cells, 'explanation', 4000),
        category: cell(cells, 'category', 100),
        added_on: /^\d{4}-\d{2}-\d{2}$/.test(added) ? added : null,
      }
    })
    .filter((row) => row.word)

  return { rows: rows.slice(0, 5000), columns: mapping }
}

export function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (count: number) => void }) {
  const { t } = useTranslation()
  const { importWords, sources } = useLibrary()
  const hasNotion = sources.some((source) => source.kind === 'words')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [toNotion, setToNotion] = useState(true)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File | undefined) {
    setParsed(null)
    setFileError(null)
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFileError(t('words.csv.tooBig'))
      return
    }
    const result = readWords(await file.text())
    if (!result || result.rows.length === 0) setFileError(t('words.csv.noWordColumn'))
    else setParsed(result)
  }

  async function onImport() {
    if (!parsed) return
    setBusy(true)
    try {
      const count = await importWords(parsed.rows, hasNotion && toNotion)
      onDone(count)
      setParsed(null)
      onClose()
    } catch (err) {
      setFileError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('words.csv.importTitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('words.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!parsed || busy} onClick={onImport}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t('words.csv.run')}
          </button>
        </>
      }
    >
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-line p-6 text-center transition-colors hover:bg-surface">
        <FileUp className="size-7 text-accent" />
        <span className="font-semibold">{t('words.csv.pick')}</span>
        <span className="text-xs text-subtle">{t('words.csv.pickHint')}</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {parsed && (
        <div className="mt-4 rounded-control border border-line bg-surface p-4 text-sm">
          <p className="font-semibold">{t('words.csv.detected', { count: parsed.rows.length })}</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted">
            {IMPORT_FIELDS.filter((field) => parsed.columns[field]).map((field) => (
              <li key={field}>
                {t(`words.fields.${field}`)} ← <span className="text-fg">{parsed.columns[field]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed && hasNotion && (
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={toNotion} onChange={(e) => setToNotion(e.target.checked)} />
          <span>
            <span className="font-medium">{t('words.csv.toNotion')}</span>
            <span className="block text-subtle">{t('words.csv.toNotionHint')}</span>
          </span>
        </label>
      )}

      {fileError && (
        <p role="alert" className="mt-4 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {fileError}
        </p>
      )}
    </Modal>
  )
}
