import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AtSign, Check, Copy, MessageCircle, Pencil, UserPlus, X } from 'lucide-react'
import { Card, SectionTitle } from '../ui'
import { errorText, StreakFlame, UserCardModal, UserLine, WeekXp } from './People'
import { community, type FriendEntry } from '../../lib/community'
import { useProfile } from '../../stores/profile'
import { toast } from '../../stores/toast'

const USERNAME = /^[A-Za-z0-9_]{3,24}$/

export function FriendsView({ onMessage }: { onMessage: (userId: string) => void }) {
  const { t, i18n } = useTranslation()
  const [friends, setFriends] = useState<FriendEntry[] | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [card, setCard] = useState<string | null>(null)

  const load = useCallback(() => community.friends().then(setFriends).catch((error) => toast(errorText(t, error), 'error')), [t])
  useEffect(() => {
    void load()
  }, [load])

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    try {
      await action()
      if (done) toast(done, 'ok')
      await load()
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    const username = search.trim().replace(/^@/, '')
    if (!USERNAME.test(username)) {
      toast(t('community.errors.no_such_user'), 'error')
      return
    }
    await act(async () => {
      const result = await community.addFriend({ username })
      toast(t(result === 'accepted' ? 'friends.accepted' : result === 'already' ? 'friends.already' : 'friends.sent'), 'ok')
      setSearch('')
    })
  }

  const incoming = friends?.filter((f) => f.status === 'incoming') ?? []
  const outgoing = friends?.filter((f) => f.status === 'outgoing') ?? []
  const accepted = friends?.filter((f) => f.status === 'friend') ?? []

  return (
    <div className="flex flex-col gap-6">
      <UsernameCard />

      <Card>
        <h3 className="font-display font-semibold">{t('friends.addTitle')}</h3>
        <p className="mt-1 text-sm text-muted">{t('friends.addText')}</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <label className="relative flex-1">
            <AtSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
            <input className="input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('friends.placeholder')} autoComplete="off" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !search.trim()}>
            <UserPlus className="size-4" />
            <span className="hidden sm:inline">{t('friends.add')}</span>
          </button>
        </form>
      </Card>

      {incoming.length > 0 && (
        <section>
          <SectionTitle>{t('friends.incoming', { count: incoming.length })}</SectionTitle>
          <Card padding="p-0" className="divide-y divide-line overflow-hidden">
            {incoming.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <UserLine user={entry.user} onClick={() => setCard(entry.user.id)} subtitle={entry.user.username ? `@${entry.user.username}` : undefined} />
                <button type="button" className="btn btn-primary h-9 px-3" disabled={busy} onClick={() => act(() => community.respond(entry.id, true), t('friends.accepted'))}>
                  <Check className="size-4" />
                  <span className="hidden sm:inline">{t('friends.accept')}</span>
                </button>
                <button type="button" className="btn btn-ghost h-9 px-3" disabled={busy} onClick={() => act(() => community.respond(entry.id, false))} aria-label={t('friends.decline')}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>{t('friends.list', { count: accepted.length })}</SectionTitle>
        {friends === null ? (
          <div className="h-32 animate-pulse rounded-card bg-surface" />
        ) : accepted.length === 0 ? (
          <Card className="py-10 text-center text-sm text-muted">{t('friends.empty')}</Card>
        ) : (
          <Card padding="p-0" className="divide-y divide-line overflow-hidden">
            {accepted.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <UserLine
                  user={entry.user}
                  online={entry.online}
                  onClick={() => setCard(entry.user.id)}
                  subtitle={entry.online ? t('community.online') : entry.last_seen_at ? t('friends.seen', { date: new Date(entry.last_seen_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) }) : undefined}
                />
                <span className="hidden flex-col items-end gap-0.5 sm:flex">
                  <WeekXp value={entry.week_xp} />
                  <StreakFlame value={entry.streak} />
                </span>
                <button type="button" className="btn btn-secondary h-9 px-3" onClick={() => onMessage(entry.user.id)} aria-label={t('friends.message')}>
                  <MessageCircle className="size-4" />
                </button>
              </div>
            ))}
          </Card>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <SectionTitle>{t('friends.outgoing', { count: outgoing.length })}</SectionTitle>
          <Card padding="p-0" className="divide-y divide-line overflow-hidden">
            {outgoing.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <UserLine user={entry.user} onClick={() => setCard(entry.user.id)} subtitle={t('friends.waiting')} />
                <button type="button" className="btn btn-ghost h-9 px-3 text-sm" disabled={busy} onClick={() => act(() => community.removeFriend(entry.user.id))}>
                  {t('friends.cancel')}
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <UserCardModal
        userId={card}
        onClose={() => {
          setCard(null)
          void load()
        }}
        onMessage={onMessage}
      />
    </div>
  )
}

/** The @name friends search for. */
export function UsernameCard() {
  const { t } = useTranslation()
  const username = useProfile((s) => s.profile?.username ?? null)
  const setUsername = useProfile((s) => s.setUsername)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (username && !editing) {
    return (
      <Card padding="p-4" className="flex items-center gap-3">
        <AtSign className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">{t('friends.username.yours')}</div>
          <div className="truncate font-display font-semibold">@{username}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost h-9 px-3"
          aria-label={t('friends.username.copy')}
          onClick={() => {
            void navigator.clipboard?.writeText(`@${username}`)
            toast(t('friends.username.copied'), 'ok')
          }}
        >
          <Copy className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-ghost h-9 px-3"
          aria-label={t('friends.username.edit')}
          onClick={() => {
            setValue(username)
            setEditing(true)
          }}
        >
          <Pencil className="size-4" />
        </button>
      </Card>
    )
  }

  async function save() {
    const next = value.trim().replace(/^@/, '')
    if (!USERNAME.test(next)) {
      setError(t('friends.username.rules'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setUsername(next)
      setEditing(false)
      toast(t('friends.username.saved'), 'ok')
    } catch (err) {
      setError(t(err instanceof Error && err.message === 'taken' ? 'friends.username.taken' : 'friends.username.rules'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card glow={!username} padding="p-4 sm:p-5">
      <h3 className="font-display font-semibold">{t('friends.username.title')}</h3>
      <p className="mt-1 text-sm text-muted">{t('friends.username.text')}</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="relative flex-1">
          <AtSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input className="input pl-10" value={value} maxLength={25} onChange={(event) => setValue(event.target.value)} placeholder="nickname" autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t('friends.username.save')}
        </button>
        {username && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            {t('common.close')}
          </button>
        )}
      </form>
      <p className={error ? 'mt-2 text-xs text-danger' : 'mt-2 text-xs text-subtle'}>{error ?? t('friends.username.rules')}</p>
    </Card>
  )
}
