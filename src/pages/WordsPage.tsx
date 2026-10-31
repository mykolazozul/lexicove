import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, CloudOff, Download, History, Layers, Plus, Search, Upload } from 'lucide-react'
import { GuestNotice } from '../components/GuestNotice'
import { DecksDialog } from '../components/words/DecksDialog'
import { ImportDialog } from '../components/words/ImportDialog'
import { NotionPanel } from '../components/words/NotionPanel'
import { notionErrorText } from '../components/words/notionErrors'
import { SourcePicker } from '../components/words/SourcePicker'
import { ItemEditor } from '../components/words/WordEditor'
import { Badge, Card, Reveal, Segmented } from '../components/ui'
import { cx } from '../lib/cx'
import { downloadText, toCsv } from '../lib/csv'
import { NotionError, type AutoLinked } from '../lib/notion'
import { useViewer } from '../lib/viewer'
import { useLibrary, type Rule, type Word } from '../stores/library'

type Tab = 'words' | 'rules'
type Toast = { text: string; tone: 'ok' | 'error' } | null

export function WordsPage() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const { loaded, loading, error, words, rules, sources, load, sync } = useLibrary()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('words')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [editing, setEditing] = useState<Word | Rule | undefined>(undefined)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [decksOpen, setDecksOpen] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    if (!viewer.isGuest && !loaded) void load()
  }, [viewer.isGuest, loaded, load])

  // Coming back from Notion: say what was linked automatically, or open the table picker.
  useEffect(() => {
    if (params.get('connected') === '1') {
      setPickerOpen(true)
      setParams({}, { replace: true })
    }
    // Links from the Learn page and the first-visit tips open the starter decks.
    if (params.get('decks') === '1') {
      setDecksOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    const autoLinked = (location.state as { autoLinked?: AutoLinked[] } | null)?.autoLinked
    if (!autoLinked?.length) return
    const list = autoLinked.map((item) => `${item.title || t('notion.untitled')} (${item.pulled})`).join(', ')
    setToast({ text: t('notion.autoLinked', { list }), tone: 'ok' })
    void load()
    navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate, load, t])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const items: Array<Word | Rule> = tab === 'words' ? words : rules
  const groups = useMemo(
    () =>
      [...new Set(items.map((item) => ('category' in item ? item.category : item.topic)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [items],
  )
  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    return items.filter((item) => {
      const itemGroup = 'category' in item ? item.category : item.topic
      if (group && itemGroup !== group) return false
      if (!needle) return true
      const haystack = 'word' in item ? `${item.word} ${item.translation}` : `${item.rule} ${item.explanation}`
      return haystack.toLowerCase().includes(needle)
    })
  }, [items, group, deferredQuery])

  if (viewer.isGuest) return <GuestNotice title={t('words.guestTitle')} text={t('words.guestText')} />

  function message(text: string, tone: 'ok' | 'error' = 'ok') {
    setToast({ text, tone })
  }

  // Edits to synced rows go to Notion right away when the cooldown allows; otherwise on the next sync.
  async function afterSave(pushNeeded: boolean) {
    if (!pushNeeded) return
    try {
      await sync()
    } catch (err) {
      // "Synced a moment ago" is fine here: the edit stays queued for the next sync.
      if (!(err instanceof NotionError && err.code === 'too_soon')) message(notionErrorText(t, err), 'error')
    }
  }

  function exportCsv() {
    const rows =
      tab === 'words'
        ? [
            ['Word', 'Translation', 'Pronunciation', 'Examples', 'Explanation', 'Category', 'Added'],
            ...words.map((w) => [w.word, w.translation, w.pronunciation, w.examples, w.explanation, w.category, w.added_on ?? '']),
          ]
        : [
            ['Rule', 'Topic', 'Explanation', 'Examples', 'Added'],
            ...rules.map((r) => [r.rule, r.topic, r.explanation, r.examples, r.added_on ?? '']),
          ]
    downloadText(`lexicove-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows))
  }

  function openEditor(item?: Word | Rule) {
    setEditing(item)
    setEditorOpen(true)
  }

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <NotionPanel onAddSource={() => setPickerOpen(true)} onMessage={message} />
      </Reveal>

      <Reveal delay={0.05} className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t('nav.words')}
          value={tab}
          onChange={(next) => {
            setTab(next)
            setGroup(null)
          }}
          options={[
            { value: 'words', label: `${t('words.tabs.words')} · ${words.length}` },
            { value: 'rules', label: `${t('words.tabs.rules')} · ${rules.length}` },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          {tab === 'words' && (
            <button type="button" className="btn btn-ghost" onClick={() => setDecksOpen(true)}>
              <Layers className="size-4" />
              <span className="hidden sm:inline">{t('words.decks.button')}</span>
            </button>
          )}
          {tab === 'words' && (
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              <span className="hidden sm:inline">{t('words.csv.import')}</span>
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={items.length === 0}>
            <Download className="size-4" />
            <span className="hidden sm:inline">{t('words.csv.export')}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openEditor()}>
            <Plus className="size-4" />
            {t(tab === 'words' ? 'words.addWord' : 'words.addRule')}
          </button>
        </div>
      </Reveal>

      <Reveal delay={0.1} className="flex flex-col gap-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            className="input pl-10"
            placeholder={t(tab === 'words' ? 'words.search' : 'words.searchRules')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {groups.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <GroupChip active={group === null} onClick={() => setGroup(null)}>
              {t('words.allGroups')}
            </GroupChip>
            {groups.map((name) => (
              <GroupChip key={name} active={group === name} onClick={() => setGroup(group === name ? null : name)}>
                {name}
              </GroupChip>
            ))}
          </div>
        )}
      </Reveal>

      {error && <p className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {loading && !loaded ? (
        <ListSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState
          searching={Boolean(query || group)}
          hasSources={sources.length > 0}
          onAdd={() => openEditor()}
          onDecks={tab === 'words' ? () => setDecksOpen(true) : undefined}
        />
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          <ul className="divide-y divide-line">
            {visible.map((item) => (
              <li key={item.id}>
                <ItemRow item={item} onOpen={() => openEditor(item)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ItemEditor
        kind={tab}
        open={editorOpen}
        item={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={(pushNeeded) => void afterSave(pushNeeded)}
      />
      <SourcePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onLinked={(summary) => message(t('notion.linked', { count: summary.pulled }))}
      />
      <DecksDialog
        open={decksOpen}
        onClose={() => setDecksOpen(false)}
        onDone={(count, pushNeeded) => {
          message(count > 0 ? t('words.decks.done', { count }) : t('words.decks.nothingNew'))
          void afterSave(pushNeeded)
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(count) => {
          message(t('words.csv.done', { count }))
          void afterSave(sources.some((source) => source.kind === 'words'))
        }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={cx(
              'glass fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-card bg-elevated px-4 py-3 text-sm font-medium lg:bottom-8',
              toast.tone === 'error' ? 'text-danger' : 'text-fg',
            )}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ItemRow({ item, onOpen }: { item: Word | Rule; onOpen: () => void }) {
  const { t } = useTranslation()
  const isWord = 'word' in item
  const title = isWord ? item.word : item.rule
  const subtitle = isWord ? item.translation : item.explanation
  const group = isWord ? item.category : item.topic

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{title}</span>
          {isWord && item.pronunciation && <span className="truncate text-sm text-subtle">{item.pronunciation}</span>}
        </div>
        {subtitle && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {group && <Badge className="hidden max-w-48 truncate sm:inline-flex">{group}</Badge>}
      {item.needs_push ? (
        <History className="size-4 shrink-0 text-coin" aria-label={t('words.pending')} />
      ) : item.source_id === null ? (
        <CloudOff className="size-4 shrink-0 text-subtle" aria-label={t('words.local')} />
      ) : null}
    </button>
  )
}

function GroupChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'border-accent bg-accent/12 text-fg' : 'border-line text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({
  searching,
  hasSources,
  onAdd,
  onDecks,
}: {
  searching: boolean
  hasSources: boolean
  onAdd: () => void
  /** Offered for an empty word list without a Notion table: the quickest way to start. */
  onDecks?: () => void
}) {
  const { t } = useTranslation()
  if (!searching && !hasSources && onDecks) {
    return (
      <Card glow className="flex flex-col items-center gap-3 py-12 text-center">
        <Layers className="size-10 text-accent" strokeWidth={1.6} />
        <h3 className="font-display text-lg font-semibold">{t('words.decks.emptyTitle')}</h3>
        <p className="max-w-sm text-sm text-muted">{t('words.decks.emptyText')}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={onDecks}>
            <Layers className="size-4" />
            {t('words.decks.choose')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onAdd}>
            <Plus className="size-4" />
            {t('words.addWord')}
          </button>
        </div>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <BookOpen className="size-10 text-subtle" strokeWidth={1.6} />
      <h3 className="font-display text-lg font-semibold">{searching ? t('words.nothingFound') : t('words.empty.title')}</h3>
      {!searching && (
        <>
          <p className="max-w-sm text-sm text-muted">{hasSources ? t('words.empty.synced') : t('words.empty.text')}</p>
          <button type="button" className="btn btn-primary mt-2" onClick={onAdd}>
            <Plus className="size-4" />
            {t('words.addWord')}
          </button>
        </>
      )}
    </Card>
  )
}

function ListSkeleton() {
  return (
    <Card padding="p-0" className="overflow-hidden">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-none">
          <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-line" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-line/60" />
        </div>
      ))}
    </Card>
  )
}

