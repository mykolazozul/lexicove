import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Cards, Check, Copy, Eye, EyeOff, Heart, Loader2, Pencil, Search, Share, Trash2 } from '../icons'
import { confirmDialog } from '../Confirm'
import { Modal } from '../Modal'
import { Card, Checkbox, Reveal, Segmented, Select } from '../ui'
import { PersonAvatar, PersonName } from './People'
import {
  communityDecks,
  DECK_LEVELS,
  DeckRpcError,
  PUBLISH_LIMITS,
  publishProblem,
  type CommunityDeck,
  type CommunityDeckFull,
  type DeckLevel,
  type DeckSort,
} from '../../lib/communityDecks'
import { cx } from '../../lib/cx'
import { useViewer } from '../../lib/viewer'
import { useLibrary } from '../../stores/library'
import { toast } from '../../stores/toast'

const PAGE = 30

function errorText(t: (key: string, options?: Record<string, unknown>) => string, error: unknown) {
  const code = error instanceof DeckRpcError ? error.code : 'unknown'
  return t(`decks.errors.${code}`, { defaultValue: t('errors.generic') })
}

/** Word lists people share: the most liked, the newest and your own; open one to copy it. */
export function DecksView() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const [sort, setSort] = useState<DeckSort>('top')
  const [level, setLevel] = useState<DeckLevel | 'all'>('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [decks, setDecks] = useState<CommunityDeck[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Search after a short pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const list = await communityDecks.list(sort, level === 'all' ? null : level, search)
      setDecks(list)
      setMore(list.length === PAGE)
    } catch {
      setFailed(true)
      setDecks([])
    }
  }, [sort, level, search])

  useEffect(() => {
    setDecks(null)
    void load()
  }, [load])

  async function loadMore() {
    if (!decks) return
    setLoadingMore(true)
    try {
      const next = await communityDecks.list(sort, level === 'all' ? null : level, search, decks.length)
      setDecks([...decks, ...next])
      setMore(next.length === PAGE)
    } catch {
      toast(t('errors.generic'), 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  function changed(deck: CommunityDeck | null, id: string) {
    setDecks((list) => (list ?? []).flatMap((item) => (item.id !== id ? [item] : deck ? [deck] : [])))
  }

  const sorts = [
    { value: 'top' as const, label: t('decks.sort.top') },
    { value: 'new' as const, label: t('decks.sort.new') },
    ...(viewer.isGuest ? [] : [{ value: 'mine' as const, label: t('decks.sort.mine') }]),
  ]

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">{t('decks.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('decks.text')}</p>
          </div>
          {viewer.isGuest ? (
            <Link to="/welcome" className="btn btn-secondary shrink-0">
              {t('decks.signInToShare')}
            </Link>
          ) : (
            <button type="button" className="btn btn-primary shrink-0" onClick={() => setPublishing(true)}>
              <Share className="size-4" />
              {t('decks.share')}
            </button>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.03} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented label={t('decks.sort.label')} value={sort} onChange={setSort} options={sorts} />
        <Select
          label={t('decks.level')}
          value={level}
          onChange={setLevel}
          className="sm:w-44"
          options={[
            { value: 'all' as const, label: t('decks.levels.all') },
            ...DECK_LEVELS.map((value) => ({ value, label: t(`decks.levels.${value}`) })),
          ]}
        />
        <label className="relative flex-1">
          <span className="sr-only">{t('decks.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input className="input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('decks.search')} maxLength={60} />
        </label>
      </Reveal>

      {decks === null ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      ) : failed ? (
        <Card className="py-10 text-center text-sm text-muted">{t('errors.generic')}</Card>
      ) : decks.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Cards className="size-9 text-accent" />
          <p className="font-semibold">{t(sort === 'mine' ? 'decks.emptyMine' : search ? 'decks.emptySearch' : 'decks.empty')}</p>
          {!viewer.isGuest && (
            <button type="button" className="btn btn-secondary" onClick={() => setPublishing(true)}>
              {t('decks.shareFirst')}
            </button>
          )}
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {decks.map((deck) => (
              <li key={deck.id}>
                <DeckTile deck={deck} onOpen={() => setOpenId(deck.id)} />
              </li>
            ))}
          </ul>
          {more && (
            <button type="button" className="btn btn-secondary self-center" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              {t('decks.more')}
            </button>
          )}
        </>
      )}

      <DeckModal id={openId} onClose={() => setOpenId(null)} onChanged={changed} />
      <PublishDeckModal
        open={publishing}
        onClose={() => setPublishing(false)}
        onPublished={(id) => {
          setPublishing(false)
          setSort('mine')
          setOpenId(id)
          void load()
        }}
      />
    </div>
  )
}

function DeckTile({ deck, onOpen }: { deck: CommunityDeck; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col gap-3 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-accent/50"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display font-semibold break-words">{deck.title}</h3>
          {deck.owner && <p className="mt-0.5 truncate text-xs text-subtle">{t('decks.by', { name: deck.owner.display_name })}</p>}
        </div>
        <LevelChip level={deck.level} />
      </div>
      {deck.description && <p className="line-clamp-2 text-sm text-muted break-words">{deck.description}</p>}
      <p lang="en" className="line-clamp-1 text-sm text-fg/80">
        {deck.sample.join(' · ')}
        {deck.word_count > deck.sample.length ? ' …' : ''}
      </p>
      <div className="mt-auto flex items-center gap-4 text-xs font-semibold text-muted tabular-nums">
        <span>{t('decks.words', { count: deck.word_count })}</span>
        <span className={cx('inline-flex items-center gap-1', deck.liked && 'text-danger')}>
          <Heart className="size-3.5" weight={deck.liked ? 'fill' : 'regular'} />
          {deck.likes}
        </span>
        <span className="inline-flex items-center gap-1">
          <Copy className="size-3.5" />
          {deck.copies}
        </span>
        {deck.hidden && (
          <span className="inline-flex items-center gap-1 text-danger">
            <EyeOff className="size-3.5" />
            {t('decks.hiddenShort')}
          </span>
        )}
      </div>
    </button>
  )
}

function LevelChip({ level }: { level: DeckLevel }) {
  const { t } = useTranslation()
  return (
    <span className="shrink-0 rounded-full border border-line bg-elevated px-2 py-0.5 text-xs font-bold text-muted">
      {t(`decks.levelsShort.${level}`)}
    </span>
  )
}

/** One deck: its words, like, copy; the owner edits or deletes it, staff can hide it. */
function DeckModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: (deck: CommunityDeck | null, id: string) => void }) {
  const { t } = useTranslation()
  const viewer = useViewer()
  const { sources, load: loadLibrary } = useLibrary()
  const hasNotion = sources.some((source) => source.kind === 'words')
  const [deck, setDeck] = useState<CommunityDeckFull | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<'like' | 'copy' | 'delete' | 'hide' | null>(null)
  const [toNotion, setToNotion] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!id) return
    setDeck(null)
    setFailed(null)
    communityDecks
      .get(id)
      .then(setDeck)
      .catch((error: unknown) => setFailed(errorText(t, error)))
  }, [id, t])

  function update(next: CommunityDeckFull) {
    setDeck(next)
    onChanged(next, next.id)
  }

  async function like() {
    if (!deck) return
    setBusy('like')
    try {
      const likes = await communityDecks.like(deck.id, !deck.liked)
      update({ ...deck, liked: !deck.liked, likes })
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    if (!deck) return
    setBusy('copy')
    try {
      const added = await communityDecks.copy(deck.id, hasNotion && toNotion)
      await loadLibrary()
      update({ ...deck, copied: true, copies: deck.copied ? deck.copies : deck.copies + 1 })
      toast(added > 0 ? t('decks.copied', { count: added }) : t('decks.copiedNone'), 'ok', '📚')
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!deck) return
    const ok = await confirmDialog({ title: t('decks.deleteTitle'), text: t('decks.deleteText'), confirm: t('decks.delete'), tone: 'danger' })
    if (!ok) return
    setBusy('delete')
    try {
      await communityDecks.remove(deck.id)
      onChanged(null, deck.id)
      toast(t('decks.deleted'))
      onClose()
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function hide() {
    if (!deck) return
    setBusy('hide')
    try {
      await communityDecks.hide(deck.id, !deck.hidden)
      update({ ...deck, hidden: !deck.hidden })
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Modal
        open={id !== null && !editing}
        onClose={onClose}
        wide
        title={deck?.title ?? t('decks.title')}
        footer={
          deck && (
            <div className="flex flex-wrap items-center gap-2">
              {viewer.isGuest ? (
                <Link to="/welcome" className="btn btn-primary">
                  {t('decks.signInToCopy')}
                </Link>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void copy()}>
                    {busy === 'copy' ? <Loader2 className="size-4 animate-spin" /> : deck.copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {deck.copied ? t('decks.copyAgain') : t('decks.copy', { count: deck.word_count })}
                  </button>
                  {!deck.mine && (
                    <button
                      type="button"
                      className={cx('btn btn-secondary', deck.liked && 'text-danger')}
                      aria-pressed={deck.liked}
                      disabled={busy !== null}
                      onClick={() => void like()}
                    >
                      <Heart className="size-4" weight={deck.liked ? 'fill' : 'regular'} />
                      {deck.likes}
                    </button>
                  )}
                </>
              )}
              {deck.mine && (
                <>
                  <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => setEditing(true)}>
                    <Pencil className="size-4" />
                    {t('decks.edit')}
                  </button>
                  <button type="button" className="btn btn-ghost text-danger" disabled={busy !== null} onClick={() => void remove()}>
                    <Trash2 className="size-4" />
                    {t('decks.delete')}
                  </button>
                </>
              )}
              {deck.can_moderate && (
                <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => void hide()}>
                  {deck.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  {deck.hidden ? t('decks.show') : t('decks.hide')}
                </button>
              )}
            </div>
          )
        }
      >
        {failed ? (
          <p className="text-sm text-muted">{failed}</p>
        ) : !deck ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {deck.owner && (
                <span className="flex min-w-0 items-center gap-2">
                  <PersonAvatar user={deck.owner} size={28} />
                  <PersonName user={deck.owner} />
                </span>
              )}
              <LevelChip level={deck.level} />
              <span className="text-xs font-semibold text-muted tabular-nums">
                {t('decks.words', { count: deck.word_count })} · {t('decks.likes', { count: deck.likes })} · {t('decks.copies', { count: deck.copies })}
              </span>
            </div>
            {deck.hidden && (
              <p className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{t('decks.hiddenText')}</p>
            )}
            {deck.description && <p className="text-sm whitespace-pre-line text-muted break-words">{deck.description}</p>}
            {!viewer.isGuest && hasNotion && (
              <Checkbox checked={toNotion} onChange={setToNotion}>
                <span className="font-medium">{t('words.decks.toNotion')}</span>
                <span className="block text-subtle">{t('words.decks.toNotionHint')}</span>
              </Checkbox>
            )}
            <ul className="divide-y divide-line rounded-control border border-line">
              {deck.words.map((word, index) => (
                <li key={index} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                  <span lang="en" className="min-w-0 flex-1 font-semibold break-words">
                    {word.word}
                    {word.pronunciation && <span className="ml-2 text-xs font-normal text-subtle">{word.pronunciation}</span>}
                  </span>
                  <span lang="uk" className="min-w-0 flex-1 text-right text-muted break-words">
                    {word.translation}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
      {deck && (
        <PublishDeckModal
          open={editing}
          editing={deck}
          onClose={() => setEditing(false)}
          onPublished={() => {
            setEditing(false)
            void communityDecks.get(deck.id).then(update)
          }}
        />
      )}
    </>
  )
}

/** Shares some of your words as a deck, or renames one you shared (`editing`). */
export function PublishDeckModal({
  open,
  onClose,
  onPublished,
  editing,
}: {
  open: boolean
  onClose: () => void
  onPublished: (id: string) => void
  editing?: CommunityDeckFull
}) {
  const { t } = useTranslation()
  const { words, loaded, load } = useLibrary()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [level, setLevel] = useState<DeckLevel>('mixed')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setLevel(editing?.level ?? 'mixed')
    setPicked(new Set())
    setFilter('')
    setTried(false)
    if (!editing && !loaded) void load()
  }, [open, editing, loaded, load])

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const list = needle
      ? words.filter((word) => `${word.word} ${word.translation} ${word.category}`.toLowerCase().includes(needle))
      : words
    return list.slice(0, 500)
  }, [words, filter])

  const problem = publishProblem(title, description, editing ? PUBLISH_LIMITS.wordsMin : picked.size)

  function toggle(id: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function submit() {
    setTried(true)
    if (problem) return
    setBusy(true)
    try {
      if (editing) {
        await communityDecks.update(editing.id, title, description, level)
        toast(t('decks.saved'))
        onPublished(editing.id)
      } else {
        const id = await communityDecks.publish(title, description, level, [...picked])
        toast(t('decks.published'), 'reward', '🎉')
        onPublished(id)
      }
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? t('decks.editTitle') : t('decks.shareTitle')}
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {editing ? t('decks.save') : t('decks.publish', { count: picked.size })}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {tried && problem && (
            <p role="alert" className="text-sm text-danger">
              {t(`decks.problems.${problem}`, { min: PUBLISH_LIMITS.wordsMin, max: PUBLISH_LIMITS.wordsMax })}
            </p>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t('decks.fields.title')}</span>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={PUBLISH_LIMITS.titleMax} placeholder={t('decks.fields.titleHint')} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t('decks.fields.description')}</span>
          <textarea
            className="input min-h-20 py-2.5"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={PUBLISH_LIMITS.descriptionMax}
            placeholder={t('decks.fields.descriptionHint')}
          />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t('decks.level')}</span>
          <Select label={t('decks.level')} value={level} onChange={setLevel} options={DECK_LEVELS.map((value) => ({ value, label: t(`decks.levels.${value}`) }))} />
        </div>

        {!editing && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t('decks.fields.words', { count: picked.size })}</span>
              <span className="ml-auto flex gap-1">
                <button type="button" className="btn btn-ghost h-8 px-2.5 text-xs" onClick={() => setPicked(new Set([...picked, ...shown.map((word) => word.id)]))}>
                  {t('decks.pickShown')}
                </button>
                <button type="button" className="btn btn-ghost h-8 px-2.5 text-xs" disabled={picked.size === 0} onClick={() => setPicked(new Set())}>
                  {t('decks.pickNone')}
                </button>
              </span>
            </div>
            <label className="relative">
              <span className="sr-only">{t('decks.filter')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
              <input className="input pl-10" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('decks.filter')} />
            </label>
            {!loaded ? (
              <div className="grid place-items-center py-6">
                <Loader2 className="size-5 animate-spin text-accent" />
              </div>
            ) : words.length === 0 ? (
              <p className="text-sm text-muted">{t('decks.noWords')}</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto rounded-control border border-line p-1">
                {shown.map((word) => (
                  <li key={word.id}>
                    <Checkbox className="px-2 py-1.5 hover:bg-surface" checked={picked.has(word.id)} onChange={(on) => toggle(word.id, on)}>
                      <span lang="en" className="font-semibold">
                        {word.word}
                      </span>
                      <span lang="uk" className="ml-2 text-muted">
                        {word.translation}
                      </span>
                    </Checkbox>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
