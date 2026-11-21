import { useEffect, useState } from 'react'
import { OAUTH_PROVIDERS, type OAuthProvider } from '../stores/auth'

let cached: Promise<OAuthProvider[]> | null = null

/**
 * The sign-in providers switched on in Supabase (Authentication → Sign In / Providers). Read from
 * the project's public auth settings, so a provider shows up as soon as the owner turns it on and a
 * button never leads to "provider is not enabled".
 */
export function enabledProviders(): Promise<OAuthProvider[]> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return Promise.resolve([])
  cached ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    .then((response) => (response.ok ? response.json() : { external: {} }))
    .then((settings: { external?: Record<string, boolean> }) => OAUTH_PROVIDERS.filter((provider) => settings.external?.[provider]))
    .catch(() => {
      cached = null
      return []
    })
  return cached
}

export function useEnabledProviders(): OAuthProvider[] {
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  useEffect(() => {
    let alive = true
    void enabledProviders().then((list) => alive && setProviders(list))
    return () => {
      alive = false
    }
  }, [])
  return providers
}
