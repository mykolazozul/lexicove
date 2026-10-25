import { useTranslation } from 'react-i18next'
import { Check, Hammer } from 'lucide-react'
import { UPCOMING, type UpcomingKey } from '../app/nav'
import { Badge, Card, Reveal } from '../components/ui'

export function ComingSoonPage({ section }: { section: UpcomingKey }) {
  const { t } = useTranslation()
  const { phase, icon: Icon } = UPCOMING[section]
  const features = t(`soon.${section}.features`, { returnObjects: true }) as string[]

  return (
    <div className="mx-auto max-w-3xl">
      <Reveal>
        <Card glow padding="p-6 sm:p-10" className="overflow-hidden">
          <div className="bg-gradient-accent pointer-events-none absolute -top-32 -right-20 -z-10 size-80 rounded-full opacity-20 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">
                <Hammer className="size-3.5" />
                {t('soon.badge')}
              </Badge>
              <Badge>{t('common.phase', { n: phase })}</Badge>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <span className="bg-gradient-accent grid size-14 shrink-0 place-items-center rounded-card text-on-accent shadow-[var(--shadow-accent)]">
                <Icon className="size-7" strokeWidth={2} />
              </span>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {t(`soon.${section}.title`)}
              </h2>
            </div>
            <p className="mt-4 text-lg text-muted">{t(`soon.${section}.text`)}</p>

            <h3 className="mt-8 font-display text-sm font-semibold tracking-wide text-muted uppercase">
              {t('soon.planned')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {features.map((feature, index) => (
                <Reveal key={feature} delay={0.08 + index * 0.05}>
                  <li className="flex items-start gap-3 rounded-control border border-line bg-surface px-4 py-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} />
                    <span>{feature}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </Card>
      </Reveal>
    </div>
  )
}
