import { useCallback, useEffect } from 'react'
import { useAuth } from '../stores/auth'
import { useEconomy, useEquipped } from '../stores/economy'
import { isShopTheme, useSettings, type ShopTheme } from '../stores/settings'
import { play, type Cue, type Pack } from './sounds'

/** Plays an interface sound in the equipped pack, unless sounds are off in Settings. */
export function useSound() {
  const enabled = useSettings((s) => s.sounds)
  const { sound } = useEquipped()
  const pack = (sound?.data.pack as Pack | undefined) ?? 'classic'
  return useCallback((cue: Cue) => {
    if (enabled) play(cue, pack)
  }, [enabled, pack])
}

/** Shop themes this account owns. */
export function useOwnedThemes(): Set<ShopTheme> {
  const inventory = useEconomy((s) => s.inventory)
  const owned = new Set<ShopTheme>()
  for (const id of inventory.keys()) {
    const name = id.startsWith('theme_') ? id.slice(6) : ''
    if (isShopTheme(name as ShopTheme)) owned.add(name as ShopTheme)
  }
  return owned
}

/**
 * A shop theme stays only while its owner is signed in: after signing out, or on an account
 * that doesn't own it, the app goes back to the default theme.
 */
export function useShopThemeGuard() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const ready = useAuth((s) => s.ready)
  const signedIn = useAuth((s) => Boolean(s.session))
  const mineLoaded = useEconomy((s) => s.mineLoaded)
  const ownsTheme = useEconomy((s) => s.inventory.has(`theme_${theme}`))

  useEffect(() => {
    if (!isShopTheme(theme) || !ready) return
    if (!signedIn || (mineLoaded && !ownsTheme)) setTheme('midnight')
  }, [theme, ready, signedIn, mineLoaded, ownsTheme, setTheme])
}
