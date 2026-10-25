import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, ExternalLink, LogIn, LogOut, Shield } from 'lucide-react'
import { isAdmin } from '../lib/admin'
import { siApple, siGithub } from 'simple-icons'
import { Card, Reveal, SectionTitle, Segmented, Switch } from '../components/ui'
import { cx } from '../lib/cx'
import { LOCALES, LOCALE_NAMES } from '../lib/locale'
import { APP_VERSION, REPO_URL } from '../lib/platform'
import { useViewer } from '../lib/viewer'
import { useAuth } from '../stores/auth'
import { DARK_THEMES, LIGHT_THEMES, useSettings, type Theme, type ThemeChoice } from '../stores/settings'

const THEME_GROUPS: Array<{ key: 'dark' | 'light'; themes: readonly ThemeChoice[] }> = [
  { key: 'dark', themes: DARK_THEMES },
  { key: 'light', themes: [...LIGHT_THEMES, 'auto'] },
]

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const viewer = useViewer()
  const signOut = useAuth((s) => s.signOut)
  const { theme, setTheme, appleStyle, setAppleStyle, analytics, setAnalytics, locale, setLocale } = useSettings()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Reveal>
        <section>
          <SectionTitle>{t('settings.appearance')}</SectionTitle>
          <Card className="mb-6 flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-fg text-bg">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <path d={siApple.path} />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t('settings.appleStyle')}</div>
              <p className="mt-0.5 text-sm text-muted">{t('settings.appleStyleHint')}</p>
            </div>
            <Switch checked={appleStyle} onChange={setAppleStyle} label={t('settings.appleStyle')} />
          </Card>
          {THEME_GROUPS.map((group) => (
            <div key={group.key} className="mb-5">
              <h3 className="mb-2.5 text-sm font-semibold text-muted">{t(`settings.themeGroups.${group.key}`)}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.themes.map((choice) => (
                  <ThemeCard
                    key={choice}
                    choice={choice}
                    active={theme === choice}
                    onSelect={() => setTheme(choice)}
                  />
                ))}
              </div>
            </div>
          ))}
          <p className="text-sm text-muted">{t('settings.themeHint')}</p>
        </section>
      </Reveal>

      <Reveal delay={0.05}>
        <section>
          <SectionTitle>{t('settings.language')}</SectionTitle>
          <Segmented
            label={t('settings.language')}
            value={locale}
            onChange={setLocale}
            options={LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))}
          />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section>
          <SectionTitle>{t('settings.account')}</SectionTitle>
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">
              {viewer.isGuest ? t('settings.guestMode') : t('settings.signedInAs', { name: viewer.email ?? viewer.name })}
            </p>
            {viewer.isGuest ? (
              <button type="button" className="btn btn-primary" onClick={() => navigate('/welcome')}>
                <LogIn className="size-4" />
                {t('common.signIn')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await signOut()
                  navigate('/welcome')
                }}
              >
                <LogOut className="size-4" />
                {t('common.signOut')}
              </button>
            )}
          </Card>
        </section>
      </Reveal>

      <Reveal delay={0.12}>
        <section>
          <SectionTitle>{t('settings.privacy')}</SectionTitle>
          <Card className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t('settings.analytics')}</div>
              <p className="mt-0.5 text-sm text-muted">
                {t('settings.analyticsHint')}{' '}
                <Link to="/privacy" className="text-accent underline-offset-4 hover:underline">
                  {t('settings.privacyLink')}
                </Link>
              </p>
            </div>
            <Switch checked={analytics} onChange={setAnalytics} label={t('settings.analytics')} />
          </Card>
          {isAdmin(viewer.role) && (
            <Link to="/admin" className="glass ring-gradient mt-3 flex items-center gap-3 rounded-card p-4 transition-transform hover:-translate-y-0.5">
              <Shield className="size-5 text-accent" />
              <span className="flex-1 font-semibold">{t('nav.admin')}</span>
              <ChevronRight className="size-4 text-subtle" />
            </Link>
          )}
        </section>
      </Reveal>

      <Reveal delay={0.15}>
        <section>
          <SectionTitle>{t('settings.about')}</SectionTitle>
          <Card className="flex flex-col gap-1">
            <p className="font-display font-semibold">Lexicove</p>
            <p className="text-sm text-muted">{t('settings.version', { version: APP_VERSION })}</p>
            <p className="text-sm text-muted">{t('settings.license')}</p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary mt-4 self-start"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                <path d={siGithub.path} />
              </svg>
              {t('settings.source')}
              <ExternalLink className="size-3.5 text-muted" />
            </a>
          </Card>
        </section>
      </Reveal>
    </div>
  )
}

function ThemeCard({ choice, active, onSelect }: { choice: ThemeChoice; active: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cx(
        'group relative overflow-hidden rounded-card border-2 text-left transition-transform hover:-translate-y-0.5',
        active ? 'border-accent' : 'border-line',
      )}
    >
      {choice === 'auto' ? (
        <div className="grid h-24 grid-cols-2">
          <ThemePreview theme="daylight" />
          <ThemePreview theme="midnight" />
        </div>
      ) : (
        <ThemePreview theme={choice} className="h-24" />
      )}
      <div className="flex items-start justify-between gap-2 bg-surface p-3">
        <div>
          <div className="font-semibold">{t(`settings.themes.${choice}`)}</div>
          <div className="text-xs text-muted">{t(`settings.themeDescriptions.${choice}`)}</div>
        </div>
        {active && (
          <span className="bg-gradient-accent grid size-5 shrink-0 place-items-center rounded-full text-on-accent">
            <Check className="size-3" strokeWidth={3.5} />
          </span>
        )}
      </div>
    </button>
  )
}

/** A tiny mock screen drawn with the given theme's own colours. */
function ThemePreview({ theme, className }: { theme: Theme; className?: string }) {
  return (
    <div data-theme={theme} className={cx('relative isolate overflow-hidden bg-bg p-3', className)}>
      <div className="aurora absolute" />
      <div className="glass flex h-full flex-col gap-1.5 rounded-[var(--radius-md)] p-2">
        <div className="h-1.5 w-1/2 rounded-full bg-fg/80" />
        <div className="h-1.5 w-3/4 rounded-full bg-muted/50" />
        <div className="bg-gradient-accent mt-auto h-3.5 w-2/5 rounded-full" />
      </div>
    </div>
  )
}
