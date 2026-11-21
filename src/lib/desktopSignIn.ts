// Google, GitHub, Discord and Notion refuse to sign in inside an embedded browser, so the desktop
// app signs in through the user's own browser:
//
// 1. The app makes a one-time state and opens /desktop/signin?provider=…&state=… in the browser.
// 2. That page signs in with a separate Supabase client (its own storage, so the website's own
//    session in that browser stays as it was) and lands on /desktop/signin/done.
// 3. The done page hands the session to lexicove://signin#state=…&access_token=…&refresh_token=…
//    and forgets it, so only the app keeps using that refresh token.
// 4. The app (src-tauri/src/lib.rs) passes the link to the main window, which takes the session
//    only if the state is the one it started with.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { OAuthProvider } from '../stores/auth'
import { OAUTH_PROVIDERS } from '../stores/auth'
import { isTauri } from './platform'
import { supabase } from './supabase'

const PENDING_KEY = 'lexicove-desktop-signin'
const PENDING_FOR_MS = 10 * 60_000

type Pending = { state: string; at: number }

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isProvider(value: string | null): value is OAuthProvider {
  return value !== null && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

export function isState(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{48}$/.test(value)
}

/** In the desktop app: opens the sign-in in the user's browser. */
export function startDesktopSignIn(provider: OAuthProvider): void {
  const state = randomState()
  const pending: Pending = { state, at: Date.now() }
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  const url = new URL('/desktop/signin', window.location.origin)
  url.searchParams.set('provider', provider)
  url.searchParams.set('state', state)
  // The desktop shell opens new windows in the default browser (src-tauri/src/lib.rs).
  window.open(url.toString(), '_blank', 'noopener')
}

export function cancelDesktopSignIn(): void {
  localStorage.removeItem(PENDING_KEY)
}

function takePending(): Pending | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    localStorage.removeItem(PENDING_KEY)
    const pending = raw ? (JSON.parse(raw) as Pending) : null
    return pending && Date.now() - pending.at < PENDING_FOR_MS ? pending : null
  } catch {
    return null
  }
}

/** In the desktop app: takes the session from a lexicove://signin link. False if it isn't ours. */
export async function completeDesktopSignIn(link: string): Promise<boolean> {
  if (!supabase) return false
  let params: URLSearchParams
  try {
    const url = new URL(link)
    if (url.protocol !== 'lexicove:' || url.host !== 'signin') return false
    params = new URLSearchParams(url.hash.slice(1))
  } catch {
    return false
  }
  const pending = takePending()
  const state = params.get('state')
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!pending || state !== pending.state || !access_token || !refresh_token) return false
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  return !error
}

/** Listens for sign-in links in the desktop app; returns the unsubscribe function. */
export function onDesktopSignInLink(callback: (link: string) => void): () => void {
  if (!isTauri) return () => {}
  let stop: (() => void) | null = null
  let stopped = false
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<string>('lexicove-signin', (event) => callback(event.payload)).then((unlisten) => {
      if (stopped) unlisten()
      else stop = unlisten
    }),
  )
  return () => {
    stopped = true
    stop?.()
  }
}

let handoffClient: SupabaseClient | null = null

/** In the browser: a client of its own, so the website's session there is left alone. */
export function handoff(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  handoffClient ??= createClient(url, key, {
    auth: {
      flowType: 'pkce',
      storageKey: 'lexicove-desktop-handoff',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: true,
    },
  })
  return handoffClient
}
