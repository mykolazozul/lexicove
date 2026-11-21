import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/onest'
import '@fontsource-variable/unbounded'
import './styles/index.css'
import './lib/i18n'
import { App } from './App'
import { isTauri } from './lib/platform'
import { reloadOnce } from './lib/reload'

// Vite's own signal that a preloaded code file is gone (a new version was deployed).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The installed web app works offline thanks to the service worker; the desktop app doesn't need one.
if (import.meta.env.PROD && !isTauri) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}
