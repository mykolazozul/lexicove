import { isTauri } from './platform'
import { supabase } from './supabase'
import { useSettings } from '../stores/settings'

// First-party usage statistics for the admin panel. What is sent is listed in the privacy policy:
// the event name, the page (without ids or query strings), platform, language, theme and the
// Apple-style switch. Signed-in events carry the account; guest events carry nothing at all.
// Turning off "Usage statistics" in Settings stops everything.

export type AnalyticsEvent =
  | 'app_open'
  | 'page_view'
  | 'word_saved'
  | 'words_imported'
  | 'notion_connected'
  | 'notion_synced'
  | 'source_linked'

const KNOWN_PAGES = ['/', '/learn', '/words', '/games', '/shop', '/community', '/profile', '/settings', '/admin', '/welcome', '/privacy', '/terms']

function platform(): 'web' | 'pwa' | 'desktop' {
  if (isTauri) return 'desktop'
  return window.matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'web'
}

/** Reduce a URL path to a known page so nothing personal ends up in the stats. */
export function pageOf(pathname: string): string {
  if (pathname.startsWith('/notion/')) return '/words'
  return KNOWN_PAGES.includes(pathname) ? pathname : 'other'
}

let lastPage = ''

export function track(name: AnalyticsEvent, path?: string): void {
  const settings = useSettings.getState()
  if (!supabase || !settings.analytics) return
  if (name === 'page_view') {
    if (path === lastPage) return
    lastPage = path ?? ''
  }
  void supabase
    .from('analytics_events')
    .insert({
      name,
      path: path ?? null,
      platform: platform(),
      locale: settings.locale,
      theme: settings.theme,
      apple_style: settings.appleStyle,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('analytics', error.message)
    })
}
