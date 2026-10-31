import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, ChevronRight, Coins, ExternalLink, Lock, LogIn, LogOut, Shield, Sparkles, Volume2 } from 'lucide-react'
import { isAdmin } from '../lib/admin'
import { siApple, siGithub } from 'simple-icons'
import { DisplayNameCard, UsernameCard } from '../components/community/FriendsView'
import { confirmDialog } from '../components/Confirm'
import { PasswordCard } from '../components/PasswordCard'
import { ThemePreview } from '../components/cosmetics'
import { Card, Reveal, SectionTitle, Segmented, Switch } from '../components/ui'
import { useOwnedThemes } from '../lib/cosmetics'
import { cx } from '../lib/cx'
import { LOCALES, LOCALE_NAMES } from '../lib/locale'
import { APP_VERSION, REPO_URL } from '../lib/platform'
import { isSubscribed, pushSupport, PushError, subscribe, unsubscribe } from '../lib/push'
import { clockTime } from '../lib/time'
import { useViewer } from '../lib/viewer'
import { useAuth } from '../stores/auth'
import { useEconomy } from '../stores/economy'
import { useProfile } from '../stores/profile'
import { toast } from '../stores/toast'
import { DAILY_GOALS, DARK_THEMES, LIGHT_THEMES, SHOP_THEMES, useSettings, type ThemeChoice } from '../stores/settings'

const THEME_GROUPS: Array<{ key: 'dark' | 'light'; themes: readonly ThemeChoice[] }> = [
  { key: 'dark', themes: DARK_THEMES },
  { key: 'light', themes: [...LIGHT_THEMES, 'auto'] },
]

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const viewer = useViewer()
  const signOut = useAuth((s) => s.signOut)
  const { theme, setTheme, appleStyle, setAppleStyle, analytics, setAnalytics, sounds, setSounds, locale, setLocale, setDailyGoal, timeFormat, setTimeFormat } =
    useSettings()
  const saveDailyGoal = useProfile((s) => s.setDailyGoal)
  const owned = useOwnedThemes()
  const items = useEconomy((s) => s.items)

  function chooseGoal(goal: number) {
    setDailyGoal(goal)
    if (!viewer.isGuest) void saveDailyGoal(goal)
  }

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
          <div className="mb-5">
            <h3 className="mb-2.5 text-sm font-semibold text-muted">{t('settings.themeGroups.shop')}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SHOP_THEMES.map((choice) => (
                <ThemeCard
                  key={choice}
                  choice={choice}
                  active={theme === choice}
                  locked={!owned.has(choice)}
                  price={items.find((item) => item.id === `theme_${choice}`)?.price}
                  onSelect={() => (owned.has(choice) ? setTheme(choice) : navigate('/shop'))}
                />
              ))}
            </div>
          </div>
          <p className="text-sm text-muted">{t('settings.themeHint')}</p>
        </section>
      </Reveal>

      <Reveal delay={0.03}>
        <section>
          <SectionTitle>{t('settings.study')}</SectionTitle>
          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{t('settings.dailyGoal')}</div>
                <p className="mt-0.5 text-sm text-muted">{t('settings.dailyGoalHint')}</p>
              </div>
              <Segmented
                label={t('settings.dailyGoal')}
                value={String(viewer.dailyGoal)}
                onChange={(value) => chooseGoal(Number(value))}
                options={DAILY_GOALS.map((goal) => ({ value: String(goal), label: String(goal) }))}
              />
            </div>
            <div className="flex items-center gap-4 border-t border-line pt-5">
              <Volume2 className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t('settings.sounds')}</div>
                <p className="mt-0.5 text-sm text-muted">{t('settings.soundsHint')}</p>
              </div>
              <Switch checked={sounds} onChange={setSounds} label={t('settings.sounds')} />
            </div>
            {!viewer.isGuest && <ReminderSetting />}
          </Card>
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
          <h3 className="mt-5 mb-2.5 text-sm font-semibold text-muted">{t('settings.timeFormat.title')}</h3>
          <Segmented
            label={t('settings.timeFormat.title')}
            value={timeFormat}
            onChange={setTimeFormat}
            options={[
              { value: 'auto', label: t('settings.timeFormat.auto') },
              { value: '24', label: t('settings.timeFormat.h24') },
              { value: '12', label: t('settings.timeFormat.h12') },
            ]}
          />
          <p className="mt-2 text-sm text-muted">{t('settings.timeFormat.example', { time: clockTime(19, 30, i18n.language) })}</p>
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section>
          <SectionTitle>{t('settings.account')}</SectionTitle>
          {!viewer.isGuest && (
            <div className="mb-3 flex flex-col gap-3">
              <DisplayNameCard />
              <UsernameCard />
              {viewer.email && <PasswordCard />}
            </div>
          )}
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

/** Streak reminders over Web Push, at 19:00 local time on days with a streak at risk. */
function ReminderSetting() {
  const { t, i18n } = useTranslation()
  const support = pushSupport()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void isSubscribed().then(setOn)
  }, [])

  async function toggle(next: boolean) {
    // The browser's own permission prompt can't be styled, so ours explains first.
    if (next && Notification.permission !== 'granted') {
      const ok = await confirmDialog({ title: t('settings.reminders.askTitle'), text: t('settings.reminders.askText', { time: clockTime(19, 0, i18n.language) }), confirm: t('settings.reminders.allow') })
      if (!ok) return
    }
    setBusy(true)
    try {
      if (next) await subscribe(i18n.language)
      else await unsubscribe()
      setOn(next)
      if (next) toast(t('settings.reminders.on'), 'ok', '🔔')
    } catch (error) {
      toast(t(error instanceof PushError && error.message === 'denied' ? 'settings.reminders.denied' : 'settings.reminders.failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <BellRing className="size-5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t('settings.reminders.title')}</div>
          <p className="mt-0.5 text-sm text-muted">
            {support === 'ok' ? t('settings.reminders.hint', { time: clockTime(19, 0, i18n.language) }) : t(`settings.reminders.${support}`)}
          </p>
        </div>
        {support === 'ok' && <Switch checked={on} onChange={(next) => !busy && void toggle(next)} label={t('settings.reminders.title')} />}
      </div>
      {on && <WordPushSetting />}
    </>
  )
}

/** The word of the day as a 09:00 notification, for everyone who has reminders on. */
function WordPushSetting() {
  const { t, i18n } = useTranslation()
  const wordPush = useProfile((s) => s.profile?.word_push ?? true)
  const setWordPush = useProfile((s) => s.setWordPush)
  return (
    <div className="flex items-center gap-4 pl-9">
      <Sparkles className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t('settings.reminders.word')}</div>
        <p className="mt-0.5 text-sm text-muted">{t('settings.reminders.wordHint', { time: clockTime(9, 0, i18n.language) })}</p>
      </div>
      <Switch checked={wordPush} onChange={(next) => void setWordPush(next)} label={t('settings.reminders.word')} />
    </div>
  )
}

function ThemeCard({
  choice,
  active,
  locked = false,
  price,
  onSelect,
}: {
  choice: ThemeChoice
  active: boolean
  /** A shop theme this account doesn't own yet: the card opens the shop instead. */
  locked?: boolean
  price?: number
  onSelect: () => void
}) {
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
      {locked && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-bg/80 px-2 py-1 text-xs font-semibold backdrop-blur">
          <Lock className="size-3" />
          {price !== undefined && (
            <>
              <Coins className="size-3 text-coin" />
              {price}
            </>
          )}
        </span>
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

