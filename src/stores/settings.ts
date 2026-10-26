import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { detectLocale, type Locale } from '../lib/locale'

export const DARK_THEMES = ['midnight', 'ocean', 'forest', 'ember', 'dusk', 'graphite'] as const
export const LIGHT_THEMES = ['daylight', 'arcade', 'mono'] as const
/** Sold in the shop; the item id is `theme_<name>`. */
export const SHOP_THEMES = ['sakura', 'terminal', 'neon', 'cosmos'] as const
export const THEMES = [...DARK_THEMES, ...LIGHT_THEMES, ...SHOP_THEMES, 'auto'] as const
export type ThemeChoice = (typeof THEMES)[number]
export type Theme = Exclude<ThemeChoice, 'auto'>
export type ShopTheme = (typeof SHOP_THEMES)[number]

export function isShopTheme(theme: ThemeChoice): theme is ShopTheme {
  return (SHOP_THEMES as readonly string[]).includes(theme)
}

export const DAILY_GOALS = [10, 20, 30, 50] as const

type SettingsState = {
  theme: ThemeChoice
  /** Apple-style interface layer (system font, continuous corners, capsule buttons). On by default. */
  appleStyle: boolean
  /** Send anonymous usage statistics (see src/lib/analytics.ts and the privacy policy). */
  analytics: boolean
  /** Short sounds for answers, coins and level-ups (src/lib/sounds.ts). */
  sounds: boolean
  locale: Locale
  /** Answers per day for guests; signed-in users keep theirs in the profile. */
  dailyGoal: number
  setTheme: (theme: ThemeChoice) => void
  setAppleStyle: (appleStyle: boolean) => void
  setAnalytics: (analytics: boolean) => void
  setSounds: (sounds: boolean) => void
  setLocale: (locale: Locale) => void
  setDailyGoal: (dailyGoal: number) => void
}

// The storage key is also read by public/theme-init.js before React loads.
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'midnight',
      appleStyle: true,
      analytics: true,
      sounds: true,
      locale: detectLocale(),
      dailyGoal: 20,
      setTheme: (theme) => set({ theme }),
      setAppleStyle: (appleStyle) => set({ appleStyle }),
      setAnalytics: (analytics) => set({ analytics }),
      setSounds: (sounds) => set({ sounds }),
      setLocale: (locale) => set({ locale }),
      setDailyGoal: (dailyGoal) => set({ dailyGoal }),
    }),
    {
      name: 'lexicove-settings',
      partialize: ({ theme, appleStyle, analytics, sounds, locale, dailyGoal }) => ({
        theme,
        appleStyle,
        analytics,
        sounds,
        locale,
        dailyGoal,
      }),
    },
  ),
)

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== 'auto') return choice
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'midnight'
}
