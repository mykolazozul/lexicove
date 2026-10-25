import { useEffect, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { motion } from 'motion/react'
import { AppShell } from './components/AppShell'
import { LogoMark } from './components/Logo'
import i18n from './lib/i18n'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { WelcomePage } from './pages/WelcomePage'
import { useAuth } from './stores/auth'
import { resolveTheme, useSettings } from './stores/settings'

const router = createBrowserRouter([
  { path: '/welcome', element: <WelcomePage /> },
  {
    path: '/',
    element: (
      <RequireViewer>
        <AppShell />
      </RequireViewer>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'learn', element: <ComingSoonPage section="learn" /> },
      { path: 'words', element: <ComingSoonPage section="words" /> },
      { path: 'games', element: <ComingSoonPage section="games" /> },
      { path: 'shop', element: <ComingSoonPage section="shop" /> },
      { path: 'community', element: <ComingSoonPage section="community" /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => init(), [init])
  useThemeAndLanguage()
  return <RouterProvider router={router} />
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
  const locale = useSettings((s) => s.locale)

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
