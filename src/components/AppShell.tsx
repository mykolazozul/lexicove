import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Coins, Flame, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import { NAV, type NavKey } from '../app/nav'
import { cx } from '../lib/cx'
import { useViewer } from '../lib/viewer'
import { useAuth } from '../stores/auth'
import { useProfile } from '../stores/profile'
import { Logo } from './Logo'
import { Avatar } from './ui'

export function AppShell() {
  const session = useAuth((s) => s.session)
  const loadProfile = useProfile((s) => s.load)
  const clearProfile = useProfile((s) => s.clear)
  const { pathname } = useLocation()

  const userId = session?.user.id
  useEffect(() => {
    if (userId) void loadProfile(userId)
    else clearProfile()
  }, [userId, loadProfile, clearProfile])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-dvh lg:pl-68">
      <div className="aurora" aria-hidden="true" />
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
    </div>
  )
}

function currentKey(pathname: string): NavKey | 'settings' | null {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/settings')) return 'settings'
  return NAV.find((item) => item.to !== '/' && pathname.startsWith(item.to))?.key ?? null
}

function Sidebar() {
  const { t } = useTranslation()
  const viewer = useViewer()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 flex-col border-r border-line bg-bg/60 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link to="/" className="mb-8 px-3">
        <Logo />
      </Link>

      <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => (
          <SidebarLink key={item.key} to={item.to} icon={item.icon} label={t(`nav.${item.key}`)} />
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <SidebarLink to="/settings" icon={Settings} label={t('nav.settings')} />
        <Link
          to="/profile"
          className="mt-2 flex items-center gap-3 rounded-control p-2 transition-colors hover:bg-surface"
        >
          <Avatar name={viewer.name} url={viewer.avatarUrl} size={38} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{viewer.name}</span>
            <span className="block text-xs text-muted">{t('common.level', { level: viewer.level })}</span>
          </span>
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
            />
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
            <Avatar name={viewer.name} url={viewer.avatarUrl} size={40} />
          </Link>
        </div>
      </div>
    </header>
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
