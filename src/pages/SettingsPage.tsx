import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, LogIn, LogOut } from 'lucide-react'
import { siGithub } from 'simple-icons'
import { Card, Reveal, SectionTitle, Segmented } from '../components/ui'
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
  const { theme, setTheme, locale, setLocale } = useSettings()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Reveal>
        <section>
          <SectionTitle>{t('settings.appearance')}</SectionTitle>
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
