import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Ban, Flame, MessageCircle, Shield, ShieldAlert, Trophy, UserCheck, UserMinus, UserPlus, VolumeX } from 'lucide-react'
import { Banner, DisplayName, TitleBadge, UserAvatar } from '../cosmetics'
import { Modal } from '../Modal'
import { Badge } from '../ui'
import { community, CommunityError, TIER_ICONS, TIERS, type ModUser, type PublicCard, type PublicProfile } from '../../lib/community'
import { cx } from '../../lib/cx'
import { levelFromXp } from '../../lib/progression'
import { useViewer } from '../../lib/viewer'
import { ROLE_RANK } from '../../lib/admin'
import { useLook } from '../../stores/economy'
import { toast } from '../../stores/toast'

export function errorText(t: (key: string, options?: Record<string, unknown>) => string, error: unknown): string {
  const code = error instanceof CommunityError ? error.code : 'unknown'
  return t(`community.errors.${code}`, { defaultValue: t('community.errors.unknown') })
}

/** A sanction reason for people: the automatic filter's own reasons are codes like auto:profanity. */
export function reasonText(t: (key: string) => string, reason: string): string {
  if (reason.startsWith('auto:')) return t('community.mod.autoReason')
  return reason || '—'
}

export function RoleBadge({ role }: { role: PublicCard['role'] }) {
  const { t } = useTranslation()
  if (ROLE_RANK[role] < ROLE_RANK.moderator) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/12 px-1.5 py-px text-[0.65rem] font-bold text-accent" title={t(`profile.roles.${role}`)}>
      <Shield className="size-3" strokeWidth={2.6} />
      {t(`community.roleShort.${role}`)}
    </span>
  )
}

export function PersonAvatar({ user, size = 36 }: { user: PublicCard; size?: number }) {
  const look = useLook(user.equipped)
  return <UserAvatar name={user.display_name} url={user.avatar_url} size={size} avatar={look.avatar} frame={look.frame} />
}

/** Name in its colour, staff badge and level. */
export function PersonName({ user }: { user: PublicCard }) {
  const look = useLook(user.equipped)
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <DisplayName name={user.display_name} color={look.nameColor} className="truncate font-semibold" />
      <RoleBadge role={user.role} />
      <span className="shrink-0 rounded-full bg-surface px-1.5 text-[0.65rem] font-bold text-muted tabular-nums">{levelFromXp(user.xp).level}</span>
    </span>
  )
}

/** Avatar, name in its colour, level and staff badge. */
export function UserLine({
  user,
  size = 36,
  onClick,
  subtitle,
  online,
}: {
  user: PublicCard
  size?: number
  onClick?: () => void
  subtitle?: string
  online?: boolean
}) {
  const { t } = useTranslation()
  const content = (
    <>
      <span className="relative shrink-0">
        <PersonAvatar user={user} size={size} />
        {online !== undefined && (
          <span
            className={cx('absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-[var(--elevated)]', online ? 'bg-success' : 'bg-line')}
            aria-label={online ? t('community.online') : t('community.offline')}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <PersonName user={user} />
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
    </>
  )
  if (!onClick) return <span className="flex min-w-0 items-center gap-3">{content}</span>
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left transition-opacity hover:opacity-85">
      {content}
    </button>
  )
}

const MUTES = [10, 60, 1440] as const
const BANS = [1440, 10080] as const

/** Someone's public profile, with friend actions and, for moderators, their record and tools. */
export function UserCardModal({
  userId,
  onClose,
  onMessage,
}: {
  userId: string | null
  onClose: () => void
  onMessage?: (userId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const viewer = useViewer()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [record, setRecord] = useState<ModUser | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const isModerator = ROLE_RANK[viewer.role] >= ROLE_RANK.moderator
  const isAdmin = ROLE_RANK[viewer.role] >= ROLE_RANK.admin

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setProfile(await community.profile(userId))
      if (isModerator) setRecord(await community.modUser(userId).catch(() => null))
    } catch (error) {
      toast(errorText(t, error), 'error')
    }
  }, [userId, isModerator, t])

  useEffect(() => {
    setProfile(null)
    setRecord(null)
    setReason('')
    void load()
  }, [load])

  const look = useLook(profile?.user.equipped)

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

  const user = profile?.user
  const sanction = (kind: 'warning' | 'mute' | 'ban', minutes: number | null) =>
    act(() => community.modSanction(user!.id, kind, minutes, reason.trim()), t(`community.mod.done.${kind}`))

  return (
    <Modal open={userId !== null} onClose={onClose} title={user ? user.display_name : t('common.loading')} wide>
      {!profile || !user ? (
        <div className="h-48 animate-pulse rounded-card bg-surface" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-card border border-line">
            <Banner banner={look.banner} className="h-20" />
            <div className="relative z-10 -mt-9 flex items-end gap-3 px-4 pb-4">
              <span className="rounded-full bg-elevated p-1">
                <UserAvatar name={user.display_name} url={user.avatar_url} size={72} avatar={look.avatar} frame={look.frame} />
              </span>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DisplayName name={user.display_name} color={look.nameColor} className="font-display text-lg font-semibold" />
                  <RoleBadge role={user.role} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                  {user.username && <span>@{user.username}</span>}
                  <TitleBadge title={look.title} />
                </div>
              </div>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t('common.level', { level: levelFromXp(user.xp).level }), value: `${user.xp.toLocaleString()} XP` },
              { label: t(`league.tiers.${TIERS[profile.league_tier]}`), value: TIER_ICONS[profile.league_tier] },
              { label: t('community.card.streak'), value: `🔥 ${profile.streak}`, hint: t('community.card.best', { count: profile.best_streak }) },
              { label: t('community.card.achievements'), value: `🏅 ${profile.achievements}` },
            ].map((stat) => (
              <li key={stat.label} className="rounded-control border border-line bg-surface px-3 py-2.5" title={stat.hint}>
                <div className="font-display font-semibold tabular-nums">{stat.value}</div>
                <div className="truncate text-xs text-muted">{stat.label}</div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-subtle">
            {t('profile.memberSince', { date: new Date(profile.created_at).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) })}
          </p>

          {profile.me ? (
            <Link to="/profile" className="btn btn-secondary self-start" onClick={onClose}>
              {t('nav.profile')}
            </Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.friendship === null && (
                <button type="button" className="btn btn-primary" disabled={busy || viewer.isGuest} onClick={() => act(() => community.addFriend({ id: user.id }), t('friends.sent'))}>
                  <UserPlus className="size-4" />
                  {t('friends.add')}
                </button>
              )}
              {profile.friendship === 'incoming' && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => community.addFriend({ id: user.id }), t('friends.accepted'))}>
                  <UserCheck className="size-4" />
                  {t('friends.accept')}
                </button>
              )}
              {profile.friendship === 'outgoing' && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => community.removeFriend(user.id))}>
                  {t('friends.cancel')}
                </button>
              )}
              {profile.friendship === 'friend' && (
                <>
                  {onMessage && (
                    <button type="button" className="btn btn-primary" onClick={() => onMessage(user.id)}>
                      <MessageCircle className="size-4" />
                      {t('friends.message')}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act(() => community.removeFriend(user.id), t('friends.removed'))}>
                    <UserMinus className="size-4" />
                    {t('friends.remove')}
                  </button>
                </>
              )}
            </div>
          )}

          {isModerator && record && !profile.me && (
            <section className="flex flex-col gap-3 rounded-card border border-accent/25 bg-accent/5 p-4">
              <h3 className="flex items-center gap-2 font-display font-semibold">
                <ShieldAlert className="size-4 text-accent" />
                {t('community.mod.title')}
                {record.reports_against > 0 && <Badge tone="fire">{t('community.mod.reportsAgainst', { count: record.reports_against })}</Badge>}
              </h3>
              {record.can_moderate ? (
                <>
                  <input
                    className="input"
                    maxLength={300}
                    placeholder={t('community.mod.reason')}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary h-9 px-3 text-sm" disabled={busy} onClick={() => sanction('warning', null)}>
                      {t('community.mod.warn')}
                    </button>
                    {MUTES.map((minutes) => (
                      <button key={minutes} type="button" className="btn btn-secondary h-9 px-3 text-sm" disabled={busy} onClick={() => sanction('mute', minutes)}>
                        <VolumeX className="size-4" />
                        {t('community.mod.muteFor', { time: t(`community.durations.${minutes}`) })}
                      </button>
                    ))}
                    {BANS.map((minutes) => (
                      <button key={minutes} type="button" className="btn btn-ghost h-9 border border-danger/40 px-3 text-sm text-danger" disabled={busy} onClick={() => sanction('ban', minutes)}>
                        <Ban className="size-4" />
                        {t('community.mod.banFor', { time: t(`community.durations.${minutes}`) })}
                      </button>
                    ))}
                    {isAdmin && (
                      <button type="button" className="btn btn-ghost h-9 border border-danger/40 px-3 text-sm text-danger" disabled={busy} onClick={() => sanction('ban', null)}>
                        <Ban className="size-4" />
                        {t('community.mod.banForever')}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">{t('community.mod.cannot')}</p>
              )}
              {record.sanctions.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {record.sanctions.map((item) => {
                    const active = !item.revoked_at && (item.kind === 'warning' || !item.until || new Date(item.until) > new Date())
                    return (
                      <li key={item.id} className="flex items-center gap-2">
                        <Badge tone={item.kind === 'ban' ? 'fire' : item.kind === 'mute' ? 'coin' : 'neutral'}>{t(`community.mod.kinds.${item.kind}`)}</Badge>
                        <span className="min-w-0 flex-1 truncate text-muted">
                          {reasonText(t, item.reason)} · {new Date(item.created_at).toLocaleDateString(i18n.language)}
                          {item.until && ` → ${new Date(item.until).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}`}
                        </span>
                        {active && item.kind !== 'warning' && record.can_moderate && (
                          <button type="button" className="text-xs font-semibold text-accent" disabled={busy} onClick={() => act(() => community.modRevoke(item.id), t('community.mod.done.revoked'))}>
                            {t('community.mod.revoke')}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {record.messages.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">{t('community.mod.recent', { count: record.messages.length })}</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {record.messages.map((message) => (
                      <li key={message.id} className={cx('rounded-control bg-surface px-3 py-1.5', message.deleted && 'text-subtle line-through')}>
                        <span className="text-xs text-subtle">#{message.room} · </span>
                        {message.body || t('community.chat.deleted')}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}

export function StreakFlame({ value }: { value: number }) {
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', value > 0 ? 'text-fire' : 'text-subtle')}>
      <Flame className="size-3.5" />
      {value}
    </span>
  )
}

export function WeekXp({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
      <Trophy className="size-3.5 text-coin" />
      {value.toLocaleString()} XP
    </span>
  )
}
