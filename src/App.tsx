import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { motion } from 'motion/react'
import { AppShell } from './components/AppShell'
import { ConfirmHost } from './components/Confirm'
import { LogoMark } from './components/Logo'
import { pageOf, track } from './lib/analytics'
import i18n from './lib/i18n'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { WelcomePage } from './pages/WelcomePage'
import { useAuth } from './stores/auth'
import { resolveTheme, useSettings } from './stores/settings'

// Bigger pages load on first visit, so the first screen downloads less.
function page<K extends string, P>(load: () => Promise<Record<K, ComponentType<P>>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}
const AdminPage = page(() => import('./pages/AdminPage'), 'AdminPage')
const LearnPage = page(() => import('./pages/LearnPage'), 'LearnPage')
const SessionPage = page(() => import('./pages/SessionPage'), 'SessionPage')
const ShopPage = page(() => import('./pages/ShopPage'), 'ShopPage')
const ProfilePage = page(() => import('./pages/ProfilePage'), 'ProfilePage')
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage')
const CommunityPage = page(() => import('./pages/CommunityPage'), 'CommunityPage')
const WordsPage = page(() => import('./pages/WordsPage'), 'WordsPage')
const NotionCallbackPage = page(() => import('./pages/NotionCallbackPage'), 'NotionCallbackPage')
const LegalPage = page(() => import('./pages/LegalPage'), 'LegalPage')

const router = createBrowserRouter([
  { path: '/welcome', element: <WelcomePage /> },
  { path: '/privacy', element: <Lazy><LegalPage doc="privacy" /></Lazy> },
  { path: '/terms', element: <Lazy><LegalPage doc="terms" /></Lazy> },
  { path: '/rules', element: <Lazy><LegalPage doc="rules" /></Lazy> },
  {
    path: '/',
    element: (
      <RequireViewer>
        <AppShell />
      </RequireViewer>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'learn', element: <Lazy><LearnPage /></Lazy> },
      { path: 'learn/:mode', element: <Lazy><SessionPage /></Lazy> },
      { path: 'words', element: <Lazy><WordsPage /></Lazy> },
      { path: 'notion/callback', element: <Lazy><NotionCallbackPage /></Lazy> },
      { path: 'games', element: <ComingSoonPage section="games" /> },
      { path: 'shop', element: <Lazy><ShopPage /></Lazy> },
      { path: 'community', element: <Lazy><CommunityPage /></Lazy> },
      { path: 'profile', element: <Lazy><ProfilePage /></Lazy> },
      { path: 'settings', element: <Lazy><SettingsPage /></Lazy> },
      { path: 'admin', element: <Lazy><AdminPage /></Lazy> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  const init = useAuth((s) => s.init)
  const ready = useAuth((s) => s.ready)
  useEffect(() => init(), [init])
  useThemeAndLanguage()

  // Usage statistics start once we know whether someone is signed in.
  useEffect(() => {
    if (!ready) return
    track('app_open')
    track('page_view', pageOf(router.state.location.pathname))
    return router.subscribe((state) => track('page_view', pageOf(state.location.pathname)))
  }, [ready])

  return (
    <>
      <RouterProvider router={router} />
      <ConfirmHost />
    </>
  )
}

/** Lets in anyone who signed in or chose guest mode; everyone else starts at /welcome. */
function RequireViewer({ children }: { children: ReactNode }) {
  const ready = useAuth((s) => s.ready)
  const session = useAuth((s) => s.session)
  const localGuest = useAuth((s) => s.localGuest)

  if (!ready) return <Splash />
  if (!session && !localGuest) return <Navigate to="/welcome" replace />
  return children
}

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-60 place-items-center">
          <LogoMark className="size-10 animate-pulse" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div
        animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <LogoMark className="size-16" />
      </motion.div>
    </div>
  )
}

function useThemeAndLanguage() {
  const theme = useSettings((s) => s.theme)
  const appleStyle = useSettings((s) => s.appleStyle)
  const locale = useSettings((s) => s.locale)

  useEffect(() => {
    const root = document.documentElement
    if (appleStyle) root.dataset.style = 'apple'
    else delete root.dataset.style
  }, [appleStyle])

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      root.dataset.theme = resolveTheme(theme)
      const meta = document.querySelector('meta[name="theme-color"]')
      meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim())
    }
    apply()
    if (theme !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale
    void i18n.changeLanguage(locale)
  }, [locale])
}
