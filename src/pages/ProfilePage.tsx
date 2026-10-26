import { useEffect } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Brush, CalendarDays, Coins, Flame, ListChecks, Target, Trophy, UserPlus } from 'lucide-react'
import { ActivityCalendar, BarList, ColumnChart, formatNumber } from '../components/charts'
import { Banner, DisplayName, TitleBadge, UserAvatar } from '../components/cosmetics'
import { Badge, Card, ProgressBar, Reveal, SectionTitle } from '../components/ui'
import { cx } from '../lib/cx'
import { useViewer } from '../lib/viewer'
import { useEconomy, useEquipped, type Achievement, type UserStats } from '../stores/economy'
import { useLibrary } from '../stores/library'
import { useStudy } from '../stores/study'

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const viewer = useViewer()
  const equipped = useEquipped()
  const { stats, achievements, unlocked, loadMine } = useEconomy()
  const { summary, insights, loadInsights } = useStudy()

  useEffect(() => {
    if (viewer.isGuest) return
    void loadMine()
    void loadInsights()
  }, [viewer.isGuest, loadMine, loadInsights])

  const accuracy = summary && summary.accuracy_30d.total > 0 ? Math.round((summary.accuracy_30d.correct / summary.accuracy_30d.total) * 100) : null
  const tiles = [
    { icon: Flame, tone: 'text-fire', label: t('profile.stats.bestStreak'), value: t('common.days', { count: Math.max(stats?.best_streak ?? 0, viewer.streak) }) },
    { icon: Trophy, tone: 'text-success', label: t('profile.stats.learned'), value: formatNumber(summary?.learned ?? 0) },
    { icon: ListChecks, tone: 'text-accent', label: t('profile.stats.answers'), value: formatNumber(stats?.answers_total ?? 0) },
    { icon: Target, tone: 'text-accent-2', label: t('profile.stats.accuracy'), value: accuracy === null ? '—' : `${accuracy}%` },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card padding="p-0" className="overflow-hidden">
          <Banner banner={equipped.banner} className="relative h-28 sm:h-36">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_120%,rgb(255_255_255/0.3),transparent_55%)]" />
          </Banner>
          <div className="px-5 pb-6 sm:px-8">
            {/* relative z-10: the banner above is positioned and would otherwise paint over the avatar */}
            <div className="relative z-10 -mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
              <div className="w-fit rounded-full bg-elevated p-1.5 shadow-[var(--shadow-card)]">
                <UserAvatar name={viewer.name} url={viewer.avatarUrl} size={100} avatar={equipped.avatar} frame={equipped.frame} />
              </div>
              <div className="flex-1 sm:pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-semibold">
                    <DisplayName name={viewer.name} color={equipped.nameColor} />
                  </h2>
                  <TitleBadge title={equipped.title} />
                  {viewer.isGuest && <Badge>{t('common.guest')}</Badge>}
                  {viewer.role !== 'user' && <Badge tone="accent">{t(`profile.roles.${viewer.role}`)}</Badge>}
                </div>
                {viewer.memberSince && (
                  <p className="mt-1 text-sm text-muted">
                    {t('profile.memberSince', {
                      date: new Date(viewer.memberSince).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }),
                    })}
                  </p>
                )}
              </div>
              {!viewer.isGuest && (
                <Link to="/shop" className="btn btn-secondary self-start sm:self-end">
                  <Brush className="size-4" />
                  {t('profile.customize')}
                </Link>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-display font-semibold">{t('common.level', { level: viewer.level })}</span>
                <span className="text-sm text-muted tabular-nums">
                  {t('profile.levelProgress', { current: viewer.intoLevel, needed: viewer.needed, next: viewer.level + 1 })}
                </span>
              </div>
              <ProgressBar value={viewer.intoLevel} max={viewer.needed} className="h-2.5" />
            </div>
          </div>
        </Card>
      </Reveal>

      {viewer.isGuest && (
        <Reveal delay={0.05}>
          <Card className="flex flex-col gap-4 border-accent/30 sm:flex-row sm:items-center">
            <UserPlus className="size-8 shrink-0 text-accent" />
            <div className="flex-1">
              <h3 className="font-display font-semibold">{t('profile.guestTitle')}</h3>
              <p className="mt-1 text-sm text-muted">{t('profile.guestText')}</p>
            </div>
            <Link to="/welcome" className="btn btn-primary">
              {t('profile.createAccount')}
            </Link>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.08}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(({ icon: Icon, tone, label, value }) => (
            <Card key={label} padding="p-4 sm:p-5">
              <Icon className={`size-5 ${tone}`} />
              <div className="mt-3 font-display text-xl font-semibold tabular-nums">{value}</div>
              <div className="mt-0.5 text-sm text-muted">{label}</div>
            </Card>
          ))}
        </div>
      </Reveal>

      {!viewer.isGuest && (
        <>
          <Reveal delay={0.1}>
            <section>
              <SectionTitle>{t('profile.activity.title')}</SectionTitle>
              <Card>
                <p className="mb-4 text-sm text-muted">
                  {t('profile.activity.summary', {
                    answers: formatNumber((summary?.activity ?? []).reduce((sum, entry) => sum + entry.count, 0)),
                    days: (summary?.activity ?? []).length,
                  })}
                </p>
                <ActivityCalendar
                  days={summary?.activity ?? []}
                  locale={i18n.language}
                  caption={t('profile.activity.title')}
                  lowLabel={t('profile.activity.less')}
                  highLabel={t('profile.activity.more')}
                />
              </Card>
            </section>
          </Reveal>

          <div className="grid gap-4 lg:grid-cols-2">
            <Reveal delay={0.12}>
              <section className="h-full">
                <SectionTitle>{t('profile.insights.categories')}</SectionTitle>
                <Card className="h-full">
                  {insights && insights.categories.length > 0 ? (
                    <BarList
                      caption={t('profile.insights.categories')}
                      max={100}
                      format={(value) => `${value}%`}
                      items={insights.categories.map((category) => ({
                        label: `${category.name} · ${formatNumber(category.total)}`,
                        value: Math.round((category.correct / Math.max(category.total, 1)) * 100),
                      }))}
                    />
                  ) : (
                    <p className="text-sm text-muted">{t('profile.insights.empty')}</p>
                  )}
                </Card>
              </section>
            </Reveal>
            <Reveal delay={0.14}>
              <section className="h-full">
                <SectionTitle>{t('profile.insights.forecast')}</SectionTitle>
                <Card className="h-full">
                  <ColumnChart
                    caption={t('profile.insights.forecast')}
                    height={180}
                    points={(insights?.forecast ?? []).map((entry, index) => {
                      const date = new Date(`${entry.day}T12:00:00`)
                      return {
                        label: index === 0 ? t('profile.insights.today') : date.toLocaleDateString(i18n.language, { weekday: 'short' }),
                        hint: date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }),
                        value: entry.count,
                      }
                    })}
                  />
                  <p className="mt-3 text-xs text-subtle">{t('profile.insights.forecastHint')}</p>
                </Card>
              </section>
            </Reveal>
          </div>

          {insights && insights.hardest.length > 0 && (
            <Reveal delay={0.16}>
              <section>
                <SectionTitle action={<Link to="/learn/cards" className="text-sm font-semibold text-accent">{t('profile.insights.practice')}</Link>}>
                  {t('profile.insights.hardest')}
                </SectionTitle>
                <Card padding="p-0" className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {insights.hardest.map((word, index) => (
                      <li key={`${word.word}-${index}`} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{word.word}</div>
                          {word.translation && <div className="truncate text-sm text-muted">{word.translation}</div>}
                        </div>
                        <span className="shrink-0 text-xs text-subtle">{t('profile.insights.lapses', { count: word.lapses })}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            </Reveal>
          )}
        </>
      )}

      <Reveal delay={0.18}>
        <section>
          <SectionTitle>
            {t('profile.achievements')} · {unlocked.size}/{achievements.length}
          </SectionTitle>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((achievement) => (
              <AchievementTile
                key={achievement.id}
                achievement={achievement}
                unlockedAt={unlocked.get(achievement.id)}
                current={metricValue(achievement, stats, viewer.level, summary?.learned ?? 0)}
              />
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  )
}

/** How far along an achievement's metric the person is, or null when there's no bar to show. */
function metricValue(achievement: Achievement, stats: UserStats | null, level: number, learned: number): number | null {
  switch (achievement.metric) {
    case 'answers':
      return stats?.answers_total ?? 0
    case 'correct':
      return stats?.correct_total ?? 0
    case 'streak':
      return stats?.best_streak ?? 0
    case 'goal_days':
      return stats?.goal_days ?? 0
    case 'modes':
      return stats?.modes_used.length ?? 0
    case 'level':
      return level
    case 'learned':
      return learned
    case 'words':
      return useLibrary.getState().loaded ? useLibrary.getState().words.length : null
    default:
      return null
  }
}

function AchievementTile({ achievement, unlockedAt, current }: { achievement: Achievement; unlockedAt?: string; current: number | null }) {
  const { t, i18n } = useTranslation()
  const done = Boolean(unlockedAt)
  const secret = achievement.hidden && !done

  return (
    <li>
      <Card padding="p-4" className={cx('flex h-full gap-3.5', `rarity-${achievement.rarity}`, !done && 'opacity-80')}>
        <span
          className={cx('grid size-12 shrink-0 place-items-center rounded-control text-2xl', !done && 'grayscale')}
          style={{ background: done ? 'color-mix(in oklab, var(--rarity) 18%, transparent)' : 'var(--surface)', boxShadow: done ? 'inset 0 0 0 1px color-mix(in oklab, var(--rarity) 45%, transparent)' : undefined }}
          aria-hidden="true"
        >
          {secret ? '❔' : achievement.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{secret ? t('achievements.secret') : t(`achievements.items.${achievement.id}.title`)}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-coin">
              <Coins className="size-3.5" />
              {achievement.reward}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {secret ? t('achievements.secretHint') : t(`achievements.items.${achievement.id}.text`, { count: achievement.threshold })}
          </p>
          {done ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-success">
              <CalendarDays className="size-3.5" />
              {new Date(unlockedAt!).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          ) : current !== null && !secret && achievement.threshold > 1 ? (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={current} max={achievement.threshold} className="h-1.5 flex-1" />
              <span className="text-xs text-subtle tabular-nums">
                {formatNumber(Math.min(current, achievement.threshold))}/{formatNumber(achievement.threshold)}
              </span>
            </div>
          ) : null}
        </div>
      </Card>
    </li>
  )
}
