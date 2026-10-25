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
  locale: Locale
  dailyGoal: number
  setTheme: (theme: ThemeChoice) => void
  setLocale: (locale: Locale) => void
}

// The storage key is also read by public/theme-init.js before React loads.
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'midnight',
      locale: detectLocale(),
      dailyGoal: 20,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'lexicove-settings',
      partialize: ({ theme, locale, dailyGoal }) => ({ theme, locale, dailyGoal }),
    },
  ),
)

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== 'auto') return choice
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'midnight'
}
