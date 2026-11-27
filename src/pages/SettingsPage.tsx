import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, ChevronRight, Coins, Download, ExternalLink, Keyboard, Lock, LogIn, LogOut, Monitor, Moon, Power, RefreshCw, Shield, Sparkles, Swords, Vibrate, Volume2, type LucideIcon } from '../components/icons'
import { isAdmin } from '../lib/admin'
import { siGithub } from 'simple-icons'
import { DisplayNameCard, UsernameCard } from '../components/community/FriendsView'
import { confirmDialog } from '../components/Confirm'
import { PasswordCard } from '../components/PasswordCard'
import { ThemePreview } from '../components/cosmetics'
import { Card, Reveal, SectionTitle, Segmented, Switch } from '../components/ui'
import { canVibrate, useOwnedThemes } from '../lib/cosmetics'
import { cx } from '../lib/cx'
import { LOCALES, LOCALE_NAMES } from '../lib/locale'
import {
  checkForUpdate,
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_RELEASES_URL,
  installUpdate,
  onUpdate,
  setHotkey,
  setStartsWithSystem,
  startsWithSystem,
  updateStatus,
  type UpdateStatus,
} from '../lib/desktop'
import { APP_VERSION, isTauri, REPO_URL } from '../lib/platform'
import { isSubscribed, pushSupport, PushError, subscribe, unsubscribe } from '../lib/push'
import { clockTime } from '../lib/time'
import { useViewer } from '../lib/viewer'
import { useAuth } from '../stores/auth'
import { useEconomy } from '../stores/economy'
import { useProfile, type PushTopic } from '../stores/profile'
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
  const { theme, setTheme, analytics, setAnalytics, sounds, setSounds, vibration, setVibration, locale, setLocale, setDailyGoal, timeFormat, setTimeFormat } =
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
            {canVibrate && (
              <div className="flex items-center gap-4 border-t border-line pt-5">
                <Vibrate className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t('settings.vibration')}</div>
                  <p className="mt-0.5 text-sm text-muted">{t('settings.vibrationHint')}</p>
                </div>
                <Switch checked={vibration} onChange={setVibration} label={t('settings.vibration')} />
              </div>
            )}
            {!viewer.isGuest && <ReminderSetting />}
          </Card>
        </section>
      </Reveal>

      {isTauri ? <DesktopSettings signedIn={!viewer.isGuest} /> : <DesktopDownload />}

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
      {on && (
        <>
          <PushTopicSetting
            topic="word_push"
            icon={Sparkles}
            title={t('settings.reminders.word')}
            hint={t('settings.reminders.wordHint', { time: clockTime(9, 0, i18n.language) })}
          />
          <PushTopicSetting topic="duel_push" icon={Swords} title={t('settings.reminders.duel')} hint={t('settings.reminders.duelHint')} />
        </>
      )}
    </>
  )
}

const CARD_INTERVALS = [0, 15, 30, 60] as const

/** Only in the desktop app (src-tauri): its version and update, word cards, start with the system, the hotkey. */
function DesktopSettings({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation()
  const { cardEvery, setCardEvery, quiet, setQuiet } = useSettings()
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    void startsWithSystem()
      .then(setAutostart)
      .catch(() => setAutostart(false))
  }, [])

  async function toggleAutostart(on: boolean) {
    try {
      await setStartsWithSystem(on)
      setAutostart(on)
    } catch {
      toast(t('errors.generic'), 'error')
    }
  }

  return (
    <Reveal delay={0.04}>
      <section>
        <SectionTitle>{t('settings.desktop.title')}</SectionTitle>
        <Card className="flex flex-col gap-5">
          <DesktopUpdate />
          {signedIn && (
            <>
              <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <Monitor className="mt-0.5 size-5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="font-semibold">{t('settings.desktop.cards')}</div>
                    <p className="mt-0.5 text-sm text-muted">{t('settings.desktop.cardsHint')}</p>
                  </div>
                </div>
                <Segmented
                  label={t('settings.desktop.cards')}
                  value={String(cardEvery)}
                  onChange={(value) => setCardEvery(Number(value))}
                  options={CARD_INTERVALS.map((minutes) => ({
                    value: String(minutes),
                    label: minutes === 0 ? t('settings.desktop.off') : t('settings.desktop.minutes', { count: minutes }),
                  }))}
                />
              </div>
              <div className="flex items-center gap-4 border-t border-line pt-5">
                <Moon className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t('settings.desktop.quiet')}</div>
                  <p className="mt-0.5 text-sm text-muted">{t('settings.desktop.quietHint')}</p>
                </div>
                <Switch checked={quiet} onChange={setQuiet} label={t('settings.desktop.quiet')} />
              </div>
            </>
          )}
          <div className="flex items-center gap-4 border-t border-line pt-5">
            <Power className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t('settings.desktop.autostart')}</div>
              <p className="mt-0.5 text-sm text-muted">{t('settings.desktop.autostartHint')}</p>
            </div>
            {autostart !== null && (
              <Switch checked={autostart} onChange={(on) => void toggleAutostart(on)} label={t('settings.desktop.autostart')} />
            )}
          </div>
          {signedIn && (
            <div className="flex items-center gap-4 border-t border-line pt-5">
              <Keyboard className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t('settings.desktop.hotkey')}</div>
                <p className="mt-0.5 text-sm text-muted">{t('settings.desktop.hotkeyHint')}</p>
              </div>
              <HotkeyPicker />
            </div>
          )}
        </Card>
      </section>
    </Reveal>
  )
}

/** Ctrl+Shift plus a letter or digit the user presses; the desktop app re-registers it at once. */
function HotkeyPicker() {
  const { t } = useTranslation()
  const hotkey = useSettings((s) => s.hotkey)
  const saveHotkey = useSettings((s) => s.setHotkey)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (!listening) return
    function onKey(event: KeyboardEvent) {
      event.preventDefault()
      if (event.key === 'Escape') {
        setListening(false)
        return
      }
      const key = /^(Key|Digit)([A-Z0-9])$/.exec(event.code)?.[2]
      if (!key) return
      setListening(false)
      void setHotkey(key)
        .then(() => {
          saveHotkey(key)
          toast(t('settings.desktop.hotkeySaved', { keys: `Ctrl Shift ${key}` }))
        })
        .catch(() => toast(t('settings.desktop.hotkeyTaken', { keys: `Ctrl Shift ${key}` }), 'error'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listening, saveHotkey, t])

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <kbd className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold">
        {listening ? t('settings.desktop.hotkeyPress') : `Ctrl Shift ${hotkey}`}
      </kbd>
      <button type="button" className="btn btn-ghost h-8 px-2.5 text-xs" onClick={() => setListening((on) => !on)}>
        {listening ? t('common.cancel') : t('settings.desktop.hotkeyChange')}
      </button>
    </div>
  )
}

/** The installed version and its update: check, download progress, restart. */
function DesktopUpdate() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void updateStatus()
      .then(setStatus)
      .catch(() => {})
    return onUpdate(setStatus)
  }, [])

  if (!status) return null
  const line =
    status.state === 'checking'
      ? t('settings.desktop.update.checking')
      : status.state === 'downloading'
        ? t('settings.desktop.update.downloading', { version: status.version, percent: status.percent ?? 0 })
        : status.state === 'ready'
          ? t('settings.desktop.update.ready', { version: status.version })
          : status.state === 'none'
            ? t('settings.desktop.update.none')
            : status.state === 'error'
              ? t('settings.desktop.update.error')
              : status.state === 'disabled'
                ? t('settings.desktop.update.disabled')
                : t('settings.desktop.update.auto')

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <RefreshCw className="mt-0.5 size-5 shrink-0 text-muted" />
        <div className="min-w-0">
          <div className="font-semibold">{t('settings.desktop.update.title', { version: status.current })}</div>
          <p className="mt-0.5 text-sm text-muted" aria-live="polite">
            {line}
          </p>
          {status.notes && (status.state === 'ready' || status.state === 'downloading') && (
            <div className="mt-3 rounded-control border border-line bg-surface p-3">
              <div className="text-xs font-semibold tracking-wide text-subtle uppercase">{t('settings.desktop.update.whatsNew')}</div>
              <p className="mt-1 text-sm whitespace-pre-line">{status.notes}</p>
            </div>
          )}
        </div>
      </div>
      {status.state === 'ready' ? (
        <button
          type="button"
          className="btn btn-primary shrink-0"
          onClick={() => void installUpdate().catch(() => toast(t('settings.desktop.update.error'), 'error'))}
        >
          {t('settings.desktop.update.install')}
        </button>
      ) : status.state !== 'disabled' ? (
        <button
          type="button"
          className="btn btn-secondary shrink-0"
          disabled={status.state === 'checking' || status.state === 'downloading'}
          onClick={() => void checkForUpdate()}
        >
          {t('settings.desktop.update.check')}
        </button>
      ) : null}
    </div>
  )
}

/** On the website: the desktop app to download. One link always gets the newest installer. */
function DesktopDownload() {
  const { t } = useTranslation()
  return (
    <Reveal delay={0.04}>
      <section>
        <SectionTitle>{t('settings.desktop.title')}</SectionTitle>
        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <Monitor className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="min-w-0">
              <div className="font-semibold">{t('settings.desktop.download.title')}</div>
              <p className="mt-0.5 text-sm text-muted">{t('settings.desktop.download.text')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={DESKTOP_DOWNLOAD_URL} className="btn btn-primary" rel="noreferrer">
              <Download className="size-4" />
              {t('settings.desktop.download.windows')}
            </a>
            <a href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer" className="btn btn-secondary">
              {t('settings.desktop.download.other')}
              <ExternalLink className="size-3.5 text-muted" />
            </a>
          </div>
          <p className="text-xs text-subtle">{t('settings.desktop.download.smartscreen')}</p>
        </Card>
      </section>
    </Reveal>
  )
}

/** One kind of notification, for everyone who has reminders on. */
function PushTopicSetting({ topic, icon: Icon, title, hint }: { topic: PushTopic; icon: LucideIcon; title: string; hint: string }) {
  const on = useProfile((s) => s.profile?.[topic] ?? true)
  const setPushTopic = useProfile((s) => s.setPushTopic)
  return (
    <div className="flex items-center gap-4 pl-9">
      <Icon className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 text-sm text-muted">{hint}</p>
      </div>
      <Switch checked={on} onChange={(next) => void setPushTopic(topic, next)} label={title} />
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

