import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Award, Flame, Lock, Shield, Swords, Trophy, UserPlus } from 'lucide-react'
import { Avatar, Badge, Card, ProgressBar, Reveal, SectionTitle } from '../components/ui'
import { useViewer } from '../lib/viewer'

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const viewer = useViewer()

  const stats = [
    { icon: Flame, tone: 'text-fire', label: t('profile.stats.bestStreak'), value: t('common.days', { count: 0 }) },
    { icon: Trophy, tone: 'text-success', label: t('profile.stats.learned'), value: '0' },
    { icon: Swords, tone: 'text-accent', label: t('profile.stats.duels'), value: '0' },
    { icon: Shield, tone: 'text-coin', label: t('profile.stats.league'), value: '—' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card padding="p-0" className="overflow-hidden">
          <div className="bg-gradient-accent relative h-28 sm:h-36">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_120%,rgb(255_255_255/0.35),transparent_55%)]" />
          </div>
          <div className="px-5 pb-6 sm:px-8">
            {/* relative z-10: the banner above is positioned and would otherwise paint over the avatar */}
            <div className="relative z-10 -mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
              <div className="w-fit rounded-full bg-elevated p-1.5 shadow-[var(--shadow-card)]">
                <Avatar name={viewer.name} url={viewer.avatarUrl} size={96} />
              </div>
              <div className="flex-1 sm:pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-semibold">{viewer.name}</h2>
                  {viewer.isGuest && <Badge>{t('common.guest')}</Badge>}
                  {viewer.role !== 'user' && <Badge tone="accent">{t(`profile.roles.${viewer.role}`)}</Badge>}
                </div>
                {viewer.memberSince && (
                  <p className="mt-1 text-sm text-muted">
                    {t('profile.memberSince', {
                      date: new Date(viewer.memberSince).toLocaleDateString(i18n.language, {
                        month: 'long',
                        year: 'numeric',
                      }),
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-display font-semibold">{t('common.level', { level: viewer.level })}</span>
                <span className="text-sm text-muted tabular-nums">
                  {t('profile.levelProgress', {
                    current: viewer.intoLevel,
                    needed: viewer.needed,
                    next: viewer.level + 1,
                  })}
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

      <Reveal delay={0.1}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ icon: Icon, tone, label, value }) => (
            <Card key={label} padding="p-4 sm:p-5">
              <Icon className={`size-5 ${tone}`} />
              <div className="mt-3 font-display text-xl font-semibold">{value}</div>
              <div className="mt-0.5 text-sm text-muted">{label}</div>
            </Card>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <section>
          <SectionTitle>{t('profile.achievements')}</SectionTitle>
          <Card>
            <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8">
              {Array.from({ length: 8 }, (_, i) => (
                <li
                  key={i}
                  className="grid aspect-square place-items-center rounded-control border border-dashed border-line text-subtle"
                >
                  {i === 0 ? <Award className="size-6" /> : <Lock className="size-4" />}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">{t('profile.achievementsSoon')}</p>
          </Card>
        </section>
      </Reveal>
    </div>
  )
}
