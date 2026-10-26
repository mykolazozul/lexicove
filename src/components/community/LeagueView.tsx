import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Clock, Coins } from 'lucide-react'
import { Card, Segmented } from '../ui'
import { errorText, UserCardModal, UserLine, WeekXp } from './People'
import { community, TIER_COLORS, TIER_ICONS, TIERS, type FriendEntry, type League } from '../../lib/community'
import { cx } from '../../lib/cx'
import { toast } from '../../stores/toast'

function timeLeft(until: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const minutes = Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return days > 0 ? t('quests.daysHours', { days, hours }) : `${hours}:${String(minutes % 60).padStart(2, '0')}`
}

/** This week's group, the friends' table and how last week ended. */
export function LeagueView({ onMessage }: { onMessage: (userId: string) => void }) {
  const { t } = useTranslation()
  const [league, setLeague] = useState<League | null>(null)
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [view, setView] = useState<'group' | 'friends'>('group')
  const [card, setCard] = useState<string | null>(null)

  useEffect(() => {
    community.league().then(setLeague).catch((error) => toast(errorText(t, error), 'error'))
    community.friends().then(setFriends).catch(() => {})
  }, [t])

  const friendsTable = useMemo(() => {
    if (!league) return []
    const rows = friends.filter((f) => f.status === 'friend').map((f) => ({ user: f.user, xp: f.week_xp, me: false }))
    const meRow = league.members.find((m) => m.me)
    if (meRow) rows.push({ user: meRow.user, xp: league.xp, me: true })
    return rows.sort((a, b) => b.xp - a.xp)
  }, [friends, league])

  if (!league) return <div className="h-72 animate-pulse rounded-card bg-surface" />

  const tier = TIERS[league.tier] ?? 'bronze'
  const color = TIER_COLORS[league.tier] ?? TIER_COLORS[0]
  const size = league.members.length

  return (
    <div className="flex flex-col gap-4">
      <Card glow className="overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-12 -z-10 size-64 rounded-full opacity-30 blur-3xl" style={{ background: color }} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-16 shrink-0 place-items-center rounded-card text-4xl" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}>
            {TIER_ICONS[league.tier]}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold">{t('league.title', { tier: t(`league.tiers.${tier}`) })}</h3>
            <p className="mt-1 text-sm text-muted">
              {league.joined ? t('league.subtitle', { promote: league.promote }) : t('league.notJoined')}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <WeekXp value={league.xp} />
            <span className="inline-flex items-center gap-1 text-xs text-subtle">
              <Clock className="size-3.5" />
              {t('league.endsIn', { time: timeLeft(league.ends_at, t) })}
            </span>
          </div>
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Coins className="size-3.5 text-coin" />
            {t('league.prizes', { first: 50 + 25 * league.tier, second: 30 + 15 * league.tier, third: 20 + 10 * league.tier })}
          </span>
        </p>
      </Card>

      {league.last && <LastWeek last={league.last} />}

      <Segmented
        label={t('league.views.label')}
        value={view}
        onChange={setView}
        options={[
          { value: 'group', label: t('league.views.group') },
          { value: 'friends', label: t('league.views.friends') },
        ]}
      />

      {view === 'group' ? (
        league.members.length === 0 ? (
          <Card className="py-10 text-center text-muted">{t('league.empty')}</Card>
        ) : (
          <Card padding="p-0" className="overflow-hidden">
            <ol>
              {league.members.map((member) => {
                const promoted = member.rank <= league.promote
                const demoted = member.rank > size - league.demote
                return (
                  <li key={member.user.id}>
                    {member.rank === league.promote + 1 && league.promote > 0 && <ZoneLine tone="up" />}
                    {member.rank === size - league.demote + 1 && league.demote > 0 && <ZoneLine tone="down" />}
                    <div className={cx('flex items-center gap-3 px-4 py-2.5', member.me && 'bg-accent/10')}>
                      <span
                        className={cx(
                          'w-7 shrink-0 text-center font-display font-semibold tabular-nums',
                          promoted ? 'text-success' : demoted ? 'text-danger' : 'text-muted',
                        )}
                      >
                        {member.rank <= 3 ? ['🥇', '🥈', '🥉'][member.rank - 1] : member.rank}
                      </span>
                      <UserLine user={member.user} size={32} onClick={() => setCard(member.user.id)} />
                      <WeekXp value={member.xp} />
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>
        )
      ) : friendsTable.length <= 1 ? (
        <Card className="py-10 text-center text-muted">{t('league.noFriends')}</Card>
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          <ol>
            {friendsTable.map((row, index) => (
              <li key={row.user.id} className={cx('flex items-center gap-3 px-4 py-2.5', row.me && 'bg-accent/10')}>
                <span className="w-7 shrink-0 text-center font-display font-semibold text-muted tabular-nums">{index + 1}</span>
                <UserLine user={row.user} size={32} onClick={() => setCard(row.user.id)} />
                <WeekXp value={row.xp} />
              </li>
            ))}
          </ol>
        </Card>
      )}

      <UserCardModal userId={card} onClose={() => setCard(null)} onMessage={onMessage} />
    </div>
  )
}

function ZoneLine({ tone }: { tone: 'up' | 'down' }) {
  const { t } = useTranslation()
  return (
    <div className={cx('flex items-center gap-2 px-4 py-1 text-[0.7rem] font-semibold tracking-wide uppercase', tone === 'up' ? 'text-success' : 'text-danger')}>
      {tone === 'up' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      {t(tone === 'up' ? 'league.promoteZone' : 'league.demoteZone')}
      <span className={cx('h-px flex-1', tone === 'up' ? 'bg-success/40' : 'bg-danger/40')} />
    </div>
  )
}

function LastWeek({ last }: { last: NonNullable<League['last']> }) {
  const { t } = useTranslation()
  const tier = TIERS[last.tier] ?? 'bronze'
  const next = TIERS[Math.min(6, Math.max(0, last.tier + (last.outcome === 'promoted' ? 1 : last.outcome === 'demoted' ? -1 : 0)))] ?? tier
  return (
    <Card padding="p-4" className={cx('flex items-center gap-3', last.outcome === 'promoted' && 'ring-gradient')}>
      <span className="text-3xl">{last.outcome === 'promoted' ? '🚀' : last.outcome === 'demoted' ? '📉' : '🛡️'}</span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">{t('league.last.title', { rank: last.rank, tier: t(`league.tiers.${tier}`) })}</div>
        <div className="text-muted">{t(`league.last.${last.outcome}`, { tier: t(`league.tiers.${next}`) })}</div>
      </div>
      {last.reward > 0 && <span className="shrink-0 font-display font-semibold text-coin">+{last.reward} 🪙</span>}
    </Card>
  )
}
