import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { ArrowDown, CornerUpLeft, Flag, ImagePlus, Lock, MessageCircle, Send, ShieldAlert, SmilePlus, Timer, Trash2, X } from 'lucide-react'
import { Modal } from '../Modal'
import { Card, Checkbox, RadioCards } from '../ui'
import { errorText, PersonAvatar, PersonName, reasonText, UserCardModal, UserLine } from './People'
import {
  community,
  CommunityError,
  dmPartner,
  dmRoom,
  REACTIONS,
  REPORT_REASONS,
  tokenize,
  type ChatMessage,
  type ChatRoom,
  type ChatStatus,
  type FriendEntry,
  type PublicCard,
} from '../../lib/community'
import { cx } from '../../lib/cx'
import { supabase } from '../../lib/supabase'
import { formatDateTime, formatTime } from '../../lib/time'
import { useViewer } from '../../lib/viewer'
import { ROLE_RANK } from '../../lib/admin'
import { useProfile } from '../../stores/profile'
import { toast } from '../../stores/toast'

const MAX_LENGTH = 500

export function ChatView({ initialRoom }: { initialRoom?: string | null }) {
  const { t } = useTranslation()
  const viewer = useViewer()
  const me = useProfile((s) => s.profile?.id) ?? ''
  const isModerator = ROLE_RANK[viewer.role] >= ROLE_RANK.moderator

  const [status, setStatus] = useState<ChatStatus | null>(null)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [room, setRoom] = useState(initialRoom ?? 'general')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [cards, setCards] = useState<Map<string, PublicCard>>(new Map())
  const [mine, setMine] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [userCard, setUserCard] = useState<string | null>(null)
  const [reporting, setReporting] = useState<ChatMessage | null>(null)

  useEffect(() => {
    if (initialRoom) setRoom(initialRoom)
  }, [initialRoom])

  const refreshStatus = useCallback(() => community.status().then(setStatus).catch(() => {}), [])

  useEffect(() => {
    void refreshStatus()
    community.rooms().then(setRooms).catch(() => {})
    community.friends().then(setFriends).catch(() => {})
  }, [refreshStatus])

  const cardsRef = useRef(cards)
  cardsRef.current = cards

  const learnCards = useCallback(async (list: ChatMessage[]) => {
    const missing = [...new Set(list.map((m) => m.user_id))].filter((id) => !cardsRef.current.has(id))
    if (missing.length === 0) return
    const found = await community.cards(missing).catch(() => [])
    setCards((current) => {
      const next = new Map(current)
      for (const card of found) next.set(card.id, card)
      return next
    })
  }, [])

  // Load the room, then follow it live.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMessages([])
    void (async () => {
      try {
        const list = await community.messages(room)
        if (cancelled) return
        setMessages(list)
        setHasMore(list.length === 50)
        await learnCards(list)
        const reactions = await community.myReactions(list.map((m) => m.id))
        if (!cancelled) setMine(new Set(reactions.map((r) => `${r.message_id}:${r.emoji}`)))
      } catch (error) {
        if (!cancelled) toast(errorText(t, error), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    if (!supabase) return () => {
      cancelled = true
    }
    const channel = supabase
      .channel(`chat:${room}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` }, (payload) => {
        const message = payload.new as ChatMessage
        setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]))
        void learnCards([message])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` }, (payload) => {
        const message = payload.new as ChatMessage
        setMessages((list) => list.map((m) => (m.id === message.id ? message : m)))
      })
      .subscribe()
    return () => {
      cancelled = true
      void supabase?.removeChannel(channel)
    }
  }, [room, learnCards, t])

  async function loadEarlier() {
    const first = messages[0]
    if (!first) return
    const older = await community.messages(room, first.id).catch(() => [])
    setHasMore(older.length === 50)
    setMessages((list) => [...older, ...list])
    await learnCards(older)
  }

  function openDm(userId: string) {
    setUserCard(null)
    setRoom(dmRoom(me, userId))
  }

  const partner = dmPartner(room, me)
  const partnerCard = partner ? (friends.find((f) => f.user.id === partner)?.user ?? cards.get(partner)) : undefined
  const currentRoom = rooms.find((r) => r.id === room)
  const dmFriends = friends.filter((f) => f.status === 'friend')

  if (status && !status.rules_accepted) return <RulesGate onAccepted={refreshStatus} />

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
      <RoomList
        rooms={rooms}
        friends={dmFriends}
        room={room}
        me={me}
        onSelect={setRoom}
      />

      <Card padding="p-0" className="flex h-[calc(100dvh-17rem)] min-h-[24rem] flex-col overflow-hidden lg:h-[calc(100dvh-12rem)]">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          {partnerCard ? (
            <UserLine user={partnerCard} size={32} onClick={() => setUserCard(partnerCard.id)} subtitle={t('community.chat.dmHint')} />
          ) : (
            <>
              <span className="text-2xl" aria-hidden="true">{currentRoom?.icon ?? '💬'}</span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display font-semibold">{t(`community.rooms.${room}.title`, { defaultValue: room })}</h3>
                <p className="truncate text-xs text-muted">{t(`community.rooms.${room}.text`, { defaultValue: '' })}</p>
              </div>
              {currentRoom && currentRoom.slow_mode_seconds > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-1 text-xs text-muted" title={t('community.chat.slowMode')}>
                  <Timer className="size-3.5" />
                  {currentRoom.slow_mode_seconds} {t('community.chat.secondsShort')}
                </span>
              )}
              {currentRoom?.closed && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger/12 px-2 py-1 text-xs text-danger">
                  <Lock className="size-3.5" />
                  {t('community.chat.closed')}
                </span>
              )}
            </>
          )}
        </header>

        <MessageList
          messages={messages}
          cards={cards}
          mine={mine}
          me={me}
          loading={loading}
          hasMore={hasMore}
          isModerator={isModerator}
          onEarlier={loadEarlier}
          onUser={setUserCard}
          onReport={setReporting}
          onToggleMine={setMine}
        />

        <Composer
          room={room}
          status={status}
          closed={Boolean(currentRoom?.closed) && !isModerator}
          onStatus={refreshStatus}
          messages={messages}
          cards={cards}
          me={me}
          canPostImages={viewer.role === 'owner'}
        />
      </Card>

      <UserCardModal userId={userCard} onClose={() => setUserCard(null)} onMessage={openDm} />
      <ReportModal message={reporting} onClose={() => setReporting(null)} />
    </div>
  )
}

function RoomList({
  rooms,
  friends,
  room,
  me,
  onSelect,
}: {
  rooms: ChatRoom[]
  friends: FriendEntry[]
  room: string
  me: string
  onSelect: (room: string) => void
}) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('community.chat.rooms')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
      {rooms.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          aria-current={room === item.id}
          className={cx(
            'flex shrink-0 items-center gap-2 rounded-control border px-3 py-2 text-sm font-medium transition-colors lg:border-transparent',
            room === item.id ? 'border-accent bg-accent/12 text-fg lg:border-accent/40' : 'border-line text-muted hover:bg-surface hover:text-fg',
          )}
        >
          <span aria-hidden="true">{item.icon}</span>
          <span className="truncate">{t(`community.rooms.${item.id}.title`, { defaultValue: item.id })}</span>
          {item.closed && <Lock className="ml-auto size-3.5 text-subtle" />}
        </button>
      ))}
      {friends.length > 0 && (
        <>
          <h4 className="hidden px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-subtle uppercase lg:block">{t('community.chat.direct')}</h4>
          {friends.map((friend) => {
            const id = dmRoom(me, friend.user.id)
            return (
              <button
                key={friend.id}
                type="button"
                onClick={() => onSelect(id)}
                aria-current={room === id}
                className={cx(
                  'flex shrink-0 items-center gap-2 rounded-control border px-2 py-1.5 transition-colors lg:border-transparent',
                  room === id ? 'border-accent bg-accent/12 lg:border-accent/40' : 'border-line hover:bg-surface',
                )}
              >
                <UserLine user={friend.user} size={26} online={friend.online} />
              </button>
            )
          })}
        </>
      )}
    </nav>
  )
}

function dayLabel(date: Date, locale: string, t: (key: string) => string): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return t('community.chat.today')
  if (date.toDateString() === yesterday.toDateString()) return t('community.chat.yesterday')
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

function MessageList({
  messages,
  cards,
  mine,
  me,
  loading,
  hasMore,
  isModerator,
  onEarlier,
  onUser,
  onReport,
  onToggleMine,
}: {
  messages: ChatMessage[]
  cards: Map<string, PublicCard>
  mine: Set<string>
  me: string
  loading: boolean
  hasMore: boolean
  isModerator: boolean
  onEarlier: () => Promise<void>
  onUser: (id: string) => void
  onReport: (message: ChatMessage) => void
  onToggleMine: (update: (set: Set<string>) => Set<string>) => void
}) {
  const { t, i18n } = useTranslation()
  const scroller = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const previousCount = useRef(0)
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])

  // Stay at the bottom as messages arrive, unless the reader scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const added = messages.length - previousCount.current
    const firstLoad = previousCount.current === 0
    previousCount.current = messages.length
    if (firstLoad || atBottom) el.scrollTop = el.scrollHeight
    else if (added > 0 && messages[messages.length - 1]?.user_id !== me) setUnseen((n) => n + added)
  }, [messages, atBottom, me])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(bottom)
    if (bottom) setUnseen(0)
  }

  async function toggle(message: ChatMessage, emoji: string) {
    const key = `${message.id}:${emoji}`
    const on = !mine.has(key)
    onToggleMine((set) => {
      const next = new Set(set)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
    try {
      await community.react(message.id, emoji, on)
    } catch (error) {
      onToggleMine((set) => {
        const next = new Set(set)
        if (on) next.delete(key)
        else next.add(key)
        return next
      })
      toast(errorText(t, error), 'error')
    }
  }

  async function remove(message: ChatMessage) {
    try {
      if (message.user_id === me) await community.deleteOwn(message.id)
      else await community.modDelete(message.id)
    } catch (error) {
      toast(errorText(t, error), 'error')
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-2 py-3 sm:px-3" role="log" aria-live="polite">
        {hasMore && (
          <div className="mb-2 flex justify-center">
            <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => void onEarlier()}>
              {t('community.chat.earlier')}
            </button>
          </div>
        )}
        {loading && messages.length === 0 ? (
          <div className="flex flex-col gap-3 px-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <div className="size-9 animate-pulse rounded-full bg-surface" />
                <div className="h-10 flex-1 animate-pulse rounded-control bg-surface" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
            <div>
              <MessageCircle className="mx-auto mb-2 size-8 text-subtle" strokeWidth={1.6} />
              {t('community.chat.empty')}
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1]
            const date = new Date(message.created_at)
            const newDay = !previous || new Date(previous.created_at).toDateString() !== date.toDateString()
            // Consecutive messages from one person within five minutes share one header.
            const grouped =
              !newDay && previous && previous.user_id === message.user_id && date.getTime() - new Date(previous.created_at).getTime() < 5 * 60_000 && !message.reply_to
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3 text-xs text-subtle">
                    <span className="h-px flex-1 bg-line" />
                    {dayLabel(date, i18n.language, t)}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <MessageRow
                  message={message}
                  author={cards.get(message.user_id)}
                  reply={message.reply_to ? byId.get(message.reply_to) : undefined}
                  replyAuthor={message.reply_to ? cards.get(byId.get(message.reply_to)?.user_id ?? '') : undefined}
                  grouped={Boolean(grouped)}
                  own={message.user_id === me}
                  mine={mine}
                  canDelete={message.user_id === me || isModerator}
                  onUser={onUser}
                  onReport={onReport}
                  onReact={toggle}
                  onDelete={remove}
                />
              </Fragment>
            )
          })
        )}
      </div>
      <AnimatePresence>
        {unseen > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={() => {
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
              setUnseen(0)
            }}
            className="btn btn-primary absolute bottom-3 left-1/2 h-8 -translate-x-1/2 px-3 text-xs"
          >
            <ArrowDown className="size-3.5" />
            {t('community.chat.newMessages', { count: unseen })}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function Body({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((part, index) =>
        part.kind === 'link' ? (
          <a key={index} href={part.value} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-accent underline underline-offset-2">
            {part.value}
          </a>
        ) : part.kind === 'mention' ? (
          <span key={index} className="rounded bg-accent/12 px-0.5 font-semibold text-accent">
            {part.value}
          </span>
        ) : (
          <Fragment key={index}>{part.value}</Fragment>
        ),
      )}
    </>
  )
}

function MessageRow({
  message,
  author,
  reply,
  replyAuthor,
  grouped,
  own,
  mine,
  canDelete,
  onUser,
  onReport,
  onReact,
  onDelete,
}: {
  message: ChatMessage
  author?: PublicCard
  reply?: ChatMessage
  replyAuthor?: PublicCard
  grouped: boolean
  own: boolean
  mine: Set<string>
  canDelete: boolean
  onUser: (id: string) => void
  onReport: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onDelete: (message: ChatMessage) => void
}) {
  const { t, i18n } = useTranslation()
  const [picking, setPicking] = useState(false)
  const [viewing, setViewing] = useState(false)
  const setReply = useChatDraft((s) => s.setReply)
  const deleted = message.deleted_at !== null
  const time = formatTime(message.created_at, i18n.language)
  const reactions = Object.entries(message.reactions ?? {}).filter(([, count]) => count > 0)

  return (
    // tabIndex: on touch screens a tap focuses the row, which shows its actions.
    <div
      tabIndex={0}
      className={cx('group relative rounded-control px-2 py-1 outline-none hover:bg-surface/70 focus-within:bg-surface/70', grouped ? 'mt-0' : 'mt-2', message.hidden && 'opacity-60')}
    >
      {reply && (
        <div className="mb-1 ml-12 flex min-w-0 items-center gap-1.5 text-xs text-subtle">
          <CornerUpLeft className="size-3 shrink-0" />
          <span className="font-semibold">{replyAuthor?.display_name ?? '…'}</span>
          <span className="truncate">{reply.deleted_at ? t('community.chat.deleted') : reply.body || `📷 ${t('community.chat.photo')}`}</span>
        </div>
      )}
      <div className="flex gap-3">
        <div className="w-9 shrink-0">
          {!grouped && author && (
            <button type="button" onClick={() => onUser(author.id)} aria-label={author.display_name}>
              <PersonAvatar user={author} />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              {author ? (
                <button type="button" onClick={() => onUser(author.id)} className="min-w-0">
                  <PersonName user={author} />
                </button>
              ) : (
                <span className="h-4 w-24 animate-pulse rounded bg-surface" />
              )}
              <time className="shrink-0 text-[0.7rem] text-subtle" dateTime={message.created_at}>
                {time}
              </time>
            </div>
          )}
          {(deleted || message.body) && (
            <p className={cx('text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap', deleted && 'text-subtle italic')}>
              {deleted ? t('community.chat.deleted') : <Body text={message.body} />}
            </p>
          )}
          {message.image_url && !deleted && (
            <button type="button" className="mt-1.5 block overflow-hidden rounded-control border border-line" onClick={() => setViewing(true)} aria-label={t('community.chat.openPhoto')}>
              <img src={message.image_url} alt="" loading="lazy" className="max-h-72 w-auto max-w-full object-contain" />
            </button>
          )}
          {viewing && message.image_url && (
            <Modal open onClose={() => setViewing(false)} title={t('community.chat.photo')} wide>
              <img src={message.image_url} alt="" className="mx-auto max-h-[70dvh] w-auto rounded-control" />
            </Modal>
          )}
          {message.hidden && !deleted && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-coin">
              <ShieldAlert className="size-3.5" />
              {t('community.chat.hidden')}
            </p>
          )}
          {reactions.length > 0 && !deleted && (
            <div className="mt-1 flex flex-wrap gap-1">
              {reactions.map(([emoji, count]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(message, emoji)}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors',
                    mine.has(`${message.id}:${emoji}`) ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {emoji} {count}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!deleted && (
        <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-full border border-line bg-elevated p-0.5 shadow-[var(--shadow-card)] group-focus-within:flex group-hover:flex">
          <IconAction label={t('community.chat.reply')} onClick={() => setReply(message)}>
            <CornerUpLeft className="size-4" />
          </IconAction>
          <IconAction label={t('community.chat.react')} onClick={() => setPicking((open) => !open)}>
            <SmilePlus className="size-4" />
          </IconAction>
          {!own && (
            <IconAction label={t('community.chat.report')} onClick={() => onReport(message)}>
              <Flag className="size-4" />
            </IconAction>
          )}
          {canDelete && (
            <IconAction label={t('community.chat.delete')} onClick={() => onDelete(message)} danger>
              <Trash2 className="size-4" />
            </IconAction>
          )}
        </div>
      )}
      {picking && (
        <div className="absolute top-6 right-2 z-20 flex gap-1 rounded-full border border-line bg-elevated p-1 shadow-[var(--shadow-card)]">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="grid size-8 place-items-center rounded-full text-lg transition-transform hover:scale-125"
              onClick={() => {
                setPicking(false)
                onReact(message, emoji)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IconAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx('grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface', danger ? 'hover:text-danger' : 'hover:text-fg')}
    >
      {children}
    </button>
  )
}

// The reply target is shared between message rows and the composer.
const useChatDraft = create<{ reply: ChatMessage | null; setReply: (message: ChatMessage | null) => void }>()((set) => ({
  reply: null,
  setReply: (reply) => set({ reply }),
}))

function Composer({
  room,
  status,
  closed,
  onStatus,
  messages,
  cards,
  me,
  canPostImages,
}: {
  room: string
  status: ChatStatus | null
  closed: boolean
  onStatus: () => void
  messages: ChatMessage[]
  cards: Map<string, PublicCard>
  me: string
  canPostImages: boolean
}) {
  const { t, i18n } = useTranslation()
  const reply = useChatDraft((s) => s.reply)
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  // The preview is a local object URL; let it go when the photo changes or the composer closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.preview)
  }, [photo])
  const setReply = useChatDraft((s) => s.setReply)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setReply(null)
    setError(null)
  }, [room, setReply])

  useEffect(() => {
    if (reply) area.current?.focus()
  }, [reply])

  // The text area grows with its content up to six lines.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const restriction = status?.restriction
  if (restriction) {
    const until = restriction.until ? formatDateTime(restriction.until, i18n.language) : null
    return (
      <div className="border-t border-line bg-danger/8 px-4 py-3 text-sm text-danger">
        {t(restriction.kind === 'ban' ? 'community.chat.banned' : 'community.chat.muted', { until: until ?? t('community.chat.forever') })}
      </div>
    )
  }
  if (closed) {
    return <div className="border-t border-line px-4 py-3 text-sm text-muted">{t('community.chat.closedText')}</div>
  }

  async function send() {
    const body = text.trim()
    if ((!body && !photo) || sending) return
    setSending(true)
    setError(null)
    try {
      const image = photo ? await community.uploadImage(photo.file, me) : null
      await community.send(room, body, reply?.id, image)
      setText('')
      setReply(null)
      setPhoto(null)
    } catch (err) {
      const code = err instanceof CommunityError ? err.code : 'unknown'
      setError(
        code === 'slow_mode'
          ? t('community.errors.slow_mode', { seconds: (err as CommunityError).detail })
          : errorText(t, err),
      )
      if (code === 'muted' || code === 'banned') onStatus()
    } finally {
      setSending(false)
    }
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
    if (event.key === 'Escape') setReply(null)
  }

  const replyAuthor = reply ? cards.get(reply.user_id) : undefined
  const warning = status?.warnings[0]

  return (
    <div className="border-t border-line px-3 py-3 sm:px-4">
      {warning && (
        <p className="mb-2 rounded-control border border-coin/30 bg-coin/10 px-3 py-2 text-xs text-coin">
          {t('community.chat.warning', { reason: reasonText(t, warning.reason) })}
        </p>
      )}
      {reply && messages.some((m) => m.id === reply.id) && (
        <div className="mb-2 flex items-center gap-2 rounded-control bg-surface px-3 py-1.5 text-xs text-muted">
          <CornerUpLeft className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t('community.chat.replyingTo', { name: replyAuthor?.display_name ?? '…' })}: {reply.body}
          </span>
          <button type="button" onClick={() => setReply(null)} aria-label={t('common.close')}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {photo && (
        <div className="mb-2 flex items-center gap-3 rounded-control border border-line bg-surface p-2">
          <img src={photo.preview} alt="" className="size-14 rounded-[10px] object-cover" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{photo.file.name}</span>
          <button type="button" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-fg" onClick={() => setPhoto(null)} aria-label={t('community.chat.removePhoto')}>
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {canPostImages && (
          <>
            <button
              type="button"
              className="btn btn-secondary size-11 shrink-0 px-0"
              onClick={() => picker.current?.click()}
              aria-label={t('community.chat.addPhoto')}
              title={t('community.chat.addPhoto')}
            >
              <ImagePlus className="size-4" />
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const chosen = event.target.files?.[0]
                event.target.value = ''
                if (chosen) setPhoto({ file: chosen, preview: URL.createObjectURL(chosen) })
              }}
            />
          </>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKey}
          placeholder={t('community.chat.placeholder')}
          aria-label={t('community.chat.placeholder')}
          className="input min-h-11 flex-1 resize-none py-2.5 leading-snug"
        />
        <button type="button" className="btn btn-primary size-11 shrink-0 px-0" onClick={() => void send()} disabled={sending || (!text.trim() && !photo)} aria-label={t('community.chat.send')}>
          <Send className="size-4" />
        </button>
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[0.7rem] text-subtle">
        {/* The keyboard hint only makes sense with a keyboard. */}
        <span className={cx(error ? 'text-danger' : 'hidden sm:inline')}>{error ?? (status && !status.links_allowed ? t('community.chat.noLinksYet') : t('community.chat.hint'))}</span>
        {text.length > MAX_LENGTH - 100 && <span className="tabular-nums">{text.length}/{MAX_LENGTH}</span>}
      </div>
    </div>
  )
}

function RulesGate({ onAccepted }: { onAccepted: () => void }) {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const rules = t('community.rulesGate.items', { returnObjects: true }) as string[]

  return (
    <Card glow className="mx-auto max-w-2xl">
      <h3 className="font-display text-xl font-semibold">{t('community.rulesGate.title')}</h3>
      <p className="mt-2 text-muted">{t('community.rulesGate.text')}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {rules.map((rule) => (
          <li key={rule} className="flex gap-3 rounded-control border border-line bg-surface px-4 py-2.5 text-sm">
            <span className="text-accent">•</span>
            {rule}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <Link to="/rules" className="text-accent underline-offset-4 hover:underline">
          {t('community.rulesGate.full')}
        </Link>
      </p>
      <Checkbox className="mt-5" checked={agreed} onChange={setAgreed}>
        {t('community.rulesGate.agree')}
      </Checkbox>
      <button
        type="button"
        className="btn btn-primary mt-5"
        disabled={!agreed || busy}
        onClick={async () => {
          setBusy(true)
          try {
            await community.acceptRules()
            onAccepted()
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('community.rulesGate.enter')}
      </button>
    </Card>
  )
}

function ReportModal({ message, onClose }: { message: ChatMessage | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>('spam')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setReason('spam')
    setNote('')
  }, [message])

  return (
    <Modal
      open={message !== null}
      onClose={onClose}
      title={t('community.report.title')}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              if (!message) return
              setBusy(true)
              try {
                await community.report(message.id, reason, note.trim())
                toast(t('community.report.sent'), 'ok')
                onClose()
              } catch (error) {
                toast(errorText(t, error), 'error')
              } finally {
                setBusy(false)
              }
            }}
          >
            <Flag className="size-4" />
            {t('community.report.send')}
          </button>
        </>
      }
    >
      {message && (
        <div className="flex flex-col gap-4">
          <blockquote className="rounded-control border border-line bg-surface px-4 py-3 text-sm break-words whitespace-pre-wrap text-muted">{message.body}</blockquote>
          <div>
            <p className="mb-2 text-sm font-medium">{t('community.report.why')}</p>
            <RadioCards
              label={t('community.report.why')}
              value={reason}
              onChange={setReason}
              options={REPORT_REASONS.map((value) => ({ value, label: t(`community.report.reasons.${value}`) }))}
            />
          </div>
          <textarea className="input min-h-20 py-2" maxLength={300} placeholder={t('community.report.note')} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      )}
    </Modal>
  )
}
