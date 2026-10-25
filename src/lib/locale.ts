export const LOCALES = ['uk', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
}

/** Short labels for compact switchers. "UK" would read as United Kingdom, so Ukrainian is "UA". */
export const LOCALE_SHORT: Record<Locale, string> = {
  uk: 'UA',
  en: 'EN',
}

export function detectLocale(): Locale {
  const lang = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase()
  return lang.startsWith('uk') ? 'uk' : 'en'
}
