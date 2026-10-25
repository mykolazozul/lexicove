import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { detectLocale, type Locale } from '../lib/locale'

export const DARK_THEMES = ['midnight', 'ocean', 'forest', 'ember', 'dusk', 'graphite'] as const
export const LIGHT_THEMES = ['daylight', 'arcade', 'mono'] as const
export const THEMES = [...DARK_THEMES, ...LIGHT_THEMES, 'auto'] as const
export type ThemeChoice = (typeof THEMES)[number]
export type Theme = Exclude<ThemeChoice, 'auto'>

type SettingsState = {
  theme: ThemeChoice
  /** Apple-style interface layer (system font, continuous corners, capsule buttons). On by default. */
  appleStyle: boolean
  /** Send anonymous usage statistics (see src/lib/analytics.ts and the privacy policy). */
  analytics: boolean
  locale: Locale
  dailyGoal: number
  setTheme: (theme: ThemeChoice) => void
  setAppleStyle: (appleStyle: boolean) => void
  setAnalytics: (analytics: boolean) => void
  setLocale: (locale: Locale) => void
}

// The storage key is also read by public/theme-init.js before React loads.
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'midnight',
      appleStyle: true,
      analytics: true,
      locale: detectLocale(),
      dailyGoal: 20,
      setTheme: (theme) => set({ theme }),
      setAppleStyle: (appleStyle) => set({ appleStyle }),
      setAnalytics: (analytics) => set({ analytics }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'lexicove-settings',
      partialize: ({ theme, appleStyle, analytics, locale, dailyGoal }) => ({
        theme,
        appleStyle,
        analytics,
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
