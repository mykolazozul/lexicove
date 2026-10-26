import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Coins, Flame, Settings, Shield, Sparkles, Zap, type LucideIcon } from 'lucide-react'
import { isAdmin } from '../lib/admin'
import { NAV, type NavKey } from '../app/nav'
import { useShopThemeGuard } from '../lib/cosmetics'
import { cx } from '../lib/cx'
import i18n from '../lib/i18n'
import { useViewer } from '../lib/viewer'
import { useAuth } from '../stores/auth'
import { useEconomy, useEquipped } from '../stores/economy'
import { useLibrary } from '../stores/library'
import { useStudy } from '../stores/study'
import { useProfile } from '../stores/profile'
import { toast } from '../stores/toast'
import { DisplayName, UserAvatar } from './cosmetics'
import { Logo } from './Logo'
import { Toaster } from './Toaster'
import { ProgressBar } from './ui'

export function AppShell() {
  const session = useAuth((s) => s.session)
  const loadProfile = useProfile((s) => s.load)
  const clearProfile = useProfile((s) => s.clear)
  const { pathname } = useLocation()

  const resetLibrary = useLibrary((s) => s.reset)
  const resetStudy = useStudy((s) => s.reset)
  const refreshSummary = useStudy((s) => s.refreshSummary)
  const loadCatalog = useEconomy((s) => s.loadCatalog)
  const loadMine = useEconomy((s) => s.loadMine)
  const resetEconomy = useEconomy((s) => s.reset)
  const applyStreakFreeze = useEconomy((s) => s.applyStreakFreeze)

  useShopThemeGuard()

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const userId = session?.user.id
  useEffect(() => {
    resetLibrary()
    resetStudy()
    resetEconomy()
    if (!userId) {
      clearProfile()
      return
    }
    void loadProfile(userId)
    void loadMine()
    // A missed yesterday is covered by a streak freeze before the streak is counted.
    void applyStreakFreeze().then((saved) => {
      if (saved) toast(i18n.t('shop.freezeUsed'), 'reward', '🧊')
      void refreshSummary()
    })
  }, [userId, loadProfile, clearProfile, resetLibrary, resetStudy, resetEconomy, loadMine, applyStreakFreeze, refreshSummary])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-dvh lg:pl-68">
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <Sidebar />
      <TopBar />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-32 sm:px-6 lg:px-10 lg:pt-2 lg:pb-12">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
      <BottomBar />
      <Toaster />
    </div>
  )
}

function currentKey(pathname: string): NavKey | 'settings' | 'admin' | null {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/admin')) return 'admin'
  return NAV.find((item) => item.to !== '/' && pathname.startsWith(item.to))?.key ?? null
}

function Sidebar() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const equipped = useEquipped()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 flex-col border-r border-line bg-bg/55 px-4 py-6 backdrop-blur-2xl lg:flex">
      <Link to="/" className="mb-8 px-3">
        <Logo />
      </Link>

      <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => (
          <SidebarLink key={item.key} to={item.to} icon={item.icon} label={t(`nav.${item.key}`)} />
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        {isAdmin(viewer.role) && <SidebarLink to="/admin" icon={Shield} label={t('nav.admin')} />}
        <SidebarLink to="/settings" icon={Settings} label={t('nav.settings')} />
        <Link
          to="/profile"
          className="glass ring-gradient mt-3 flex flex-col gap-3 rounded-card p-3.5 transition-transform hover:-translate-y-0.5"
        >
          <span className="flex items-center gap-3">
            <UserAvatar name={viewer.name} url={viewer.avatarUrl} size={40} avatar={equipped.avatar} frame={equipped.frame} />
            <span className="min-w-0 flex-1">
              <DisplayName name={viewer.name} color={equipped.nameColor} className="block truncate text-sm font-semibold" />
              <span className="block text-xs text-muted">{t('common.level', { level: viewer.level })}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-coin tabular-nums">
              <Coins className="size-3.5" strokeWidth={2.4} />
              {viewer.coins.toLocaleString()}
            </span>
          </span>
          <ProgressBar value={viewer.intoLevel} max={viewer.needed} className="h-1.5" />
        </Link>
      </div>
    </aside>
  )
}

function SidebarLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-control px-3 py-2.5 text-[0.95rem] font-medium transition-colors',
          isActive ? 'text-fg' : 'text-muted hover:bg-surface hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-control border border-line bg-surface-hover"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            >
              <span className="bg-gradient-accent absolute top-2.5 bottom-2.5 -left-px w-[3px] rounded-full shadow-[0_0_12px_var(--accent)]" />
            </motion.span>
          )}
          <Icon className={cx('relative size-5', isActive && 'text-accent')} strokeWidth={2} />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  )
}

function TopBar() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const equipped = useEquipped()
  const { pathname } = useLocation()
  const key = currentKey(pathname)

  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-xl lg:border-none lg:bg-transparent lg:backdrop-blur-none">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-20 lg:px-10">
        <Link to="/" className="lg:hidden">
          <Logo compact />
        </Link>
        <h1 className="hidden font-display text-xl font-semibold lg:block">{key ? t(`nav.${key}`) : ''}</h1>

        <div className="flex items-center gap-2">
          {viewer.boostUntil && <BoostPill until={viewer.boostUntil} />}
          <StatPill icon={Flame} value={viewer.streak} label={t('common.streak')} tone="text-fire" />
          <Link to="/shop" className="rounded-full">
            <StatPill icon={Coins} value={viewer.coins} label={t('common.coins')} tone="text-coin" />
          </Link>
          <span className="hidden sm:block">
            <StatPill
              icon={Sparkles}
              value={viewer.level}
              label={t('common.level', { level: viewer.level })}
              tone="text-xp"
            />
          </span>
          <Link
            to="/settings"
            aria-label={t('nav.settings')}
            className="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg lg:hidden"
          >
            <Settings className="size-5" />
          </Link>
          <Link to="/profile" aria-label={t('nav.profile')} className="hidden rounded-full lg:block">
            <UserAvatar name={viewer.name} url={viewer.avatarUrl} size={40} avatar={equipped.avatar} frame={equipped.frame} />
          </Link>
        </div>
      </div>
    </header>
  )
}

/** Double XP is on: shows the minutes left and disappears when the boost ends. */
function BoostPill({ until }: { until: Date }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = Math.max(0, Math.round((until.getTime() - now) / 1000))
  if (left === 0) return null
  return (
    <span title={t('shop.boostActive')} className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-xp tabular-nums">
      <Zap className="size-[1.1rem]" strokeWidth={2.4} aria-hidden="true" />
      <span className="hidden sm:inline">×2</span>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  )
}

function StatPill({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number; label: string; tone: string }) {
  return (
    <span
      title={label}
      className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold tabular-nums sm:px-3"
    >
      <Icon className={cx('size-[1.1rem]', tone)} strokeWidth={2.4} aria-hidden="true" />
      <span aria-label={label}>{value.toLocaleString()}</span>
    </span>
  )
}

function BottomBar() {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('nav.main')}
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/80 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-1">
        {NAV.filter((item) => item.inBottomBar).map(({ key, to, icon: Icon }) => (
          <li key={key} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex h-full flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold transition-colors',
                  isActive ? 'text-fg' : 'text-subtle',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'grid h-7 w-12 place-items-center rounded-full transition-colors',
                      isActive && 'bg-accent/15',
                    )}
                  >
                    <Icon className={cx('size-5', isActive && 'text-accent')} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="max-w-full truncate px-0.5">{t(`nav.${key}`)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
