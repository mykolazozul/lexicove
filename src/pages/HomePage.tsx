import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Coins, Flame, Lock, Sparkles, Target, Trophy } from 'lucide-react'
import { BrandIcon } from '../components/BrandIcon'
import { Card, IconChip, ProgressRing, Reveal, type ChipTone } from '../components/ui'
import { cx } from '../lib/cx'
import { useViewer } from '../lib/viewer'
import { useSettings } from '../stores/settings'
import { useStudy } from '../stores/study'

function greetingKey(hour: number) {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'day'
  if (hour >= 17 && hour < 23) return 'evening'
  return 'night'
}

const ISLANDS = [
  { key: 'food', emoji: '🍽️' },
  { key: 'animals', emoji: '🐾' },
  { key: 'travel', emoji: '🛣️' },
  { key: 'work', emoji: '💼' },
  { key: 'phrasal', emoji: '🧩' },
  { key: 'feelings', emoji: '🧠' },
] as const

export function HomePage() {
  const { t, i18n } = useTranslation()
  const viewer = useViewer()
  const dailyGoal = useSettings((s) => s.dailyGoal)
  const summary = useStudy((s) => s.summary)
  const learnedToday = summary?.today ?? 0
  const accuracy =
    summary && summary.accuracy_30d.total > 0
      ? `${Math.round((summary.accuracy_30d.correct / summary.accuracy_30d.total) * 100)}%`
      : '—'

  const name = viewer.isGuest ? t('home.friend') : viewer.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.18em] text-subtle uppercase">
          {new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t(`home.greeting.${greetingKey(new Date().getHours())}`, { name })}
        </h2>
        <p className="mt-2 text-muted">{t('home.subtitle')}</p>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal delay={0.05} className="lg:col-span-2">
          <Card glow className="h-full overflow-hidden">
            <div className="bg-gradient-accent pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full opacity-25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-16 -z-10 size-64 rounded-full bg-accent-2/15 blur-3xl" />
            <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <ProgressRing value={learnedToday} max={dailyGoal}>
                <div>
                  <div className="font-display text-3xl font-semibold tabular-nums">{learnedToday}</div>
                  <div className="text-xs text-muted">{t('home.goal.progress', { goal: dailyGoal })}</div>
                </div>
              </ProgressRing>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center gap-3 sm:justify-start">
                  <IconChip tone="accent" className="size-9">
                    <Target className="size-[1.1rem]" />
                  </IconChip>
                  <h3 className="font-display text-lg font-semibold">{t('home.goal.title')}</h3>
                </div>
                <p className="mt-2 text-muted">{t('home.goal.text', { goal: dailyGoal })}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
                  <Link to="/learn" className="btn btn-primary">
                    {t('home.goal.start')}
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link to="/words" className="btn btn-secondary">
                    {t('home.goal.addWords')}
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <StreakCard streak={viewer.streak} locale={i18n.language} />
        </Reveal>
      </div>

      <Reveal delay={0.15}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile icon={Coins} tone="coin" label={t('home.stats.coins')} value={viewer.coins.toLocaleString()} />
          <StatTile icon={Sparkles} tone="xp" label={t('home.stats.level')} value={String(viewer.level)} />
          <StatTile icon={Trophy} tone="success" label={t('home.stats.learned')} value={String(summary?.learned ?? 0)} />
          <StatTile icon={Target} tone="accent-2" label={t('home.stats.accuracy')} value={accuracy} />
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal delay={0.2}>
          <Card className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-12 place-items-center rounded-control bg-fg text-bg">
                <BrandIcon provider="notion" className="size-6" />
              </span>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{t('home.notion.title')}</h3>
            <p className="mt-2 flex-1 text-muted">{t('home.notion.text')}</p>
            <Link to="/words" className="btn btn-secondary mt-5 self-start">
              {t('home.notion.cta')}
              <ArrowRight className="size-4" />
            </Link>
          </Card>
        </Reveal>

        <Reveal delay={0.25}>
          <Card className="h-full">
            <h3 className="font-display text-lg font-semibold">{t('home.islands.title')}</h3>
            <p className="mt-2 text-muted">{t('home.islands.text')}</p>
            <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {ISLANDS.map((island, index) => (
                <li
                  key={island.key}
                  className={cx(
                    'flex items-center gap-2 rounded-control border border-dashed border-line px-3 py-2.5 text-sm',
                    index === 0 ? 'text-fg' : 'text-muted',
                  )}
                >
                  <span className={cx('text-lg', index !== 0 && 'opacity-50 grayscale')}>{island.emoji}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t(`home.islands.${island.key}`)}</span>
                  {index !== 0 && <Lock className="size-3.5 shrink-0 text-subtle" aria-label={t('home.islands.locked')} />}
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      </div>
    </div>
  )
}

function StreakCard({ streak, locale }: { streak: number; locale: string }) {
  const { t } = useTranslation()
  const today = new Date()
  // Monday-first week, matching the Ukrainian calendar.
  const mondayOffset = (today.getDay() + 6) % 7
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() - mondayOffset + i)
    return {
      label: date.toLocaleDateString(locale, { weekday: 'narrow' }),
      isToday: i === mondayOffset,
    }
  })

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center gap-3">
        <IconChip tone="fire" className="size-9">
          <Flame className="size-[1.1rem]" />
        </IconChip>
        <h3 className="font-display text-lg font-semibold">{t('home.streak.title')}</h3>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="font-display text-5xl font-semibold tabular-nums">{streak}</span>
        <span className="mb-1.5 text-muted">{t('common.days', { count: streak })}</span>
      </div>
      <p className="mt-2 flex-1 text-sm text-muted">{t('home.streak.text')}</p>
      <ol className="mt-5 grid grid-cols-7 gap-1.5">
        {days.map((day, index) => (
          <li key={index} className="flex flex-col items-center gap-1.5">
            <span
              className={cx(
                'grid size-8 place-items-center rounded-full border text-xs',
                day.isToday ? 'border-fire/50 bg-fire/10 text-fire' : 'border-line text-subtle',
              )}
            >
              <Flame className="size-3.5" />
            </span>
            <span className={cx('text-[0.7rem] font-semibold uppercase', day.isToday ? 'text-fg' : 'text-subtle')}>
              {day.label}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Coins
  tone: ChipTone
  label: string
  value: string
}) {
  return (
    <Card padding="p-4 sm:p-5">
      <IconChip tone={tone}>
        <Icon className="size-5" strokeWidth={2.2} />
      </IconChip>
      <div className="mt-4 font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm text-muted">{label}</div>
    </Card>
  )
}
