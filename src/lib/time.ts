// Clock times in the person's own format: 19:00 or 7:00 PM. "Auto" follows the device's locale;
// Settings can force either one. Month and weekday names still follow the interface language,
// but a 12-hour time always reads AM/PM (Ukrainian would otherwise print "дп/пп").

import { useSettings } from '../stores/settings'

export function uses12Hours(): boolean {
  const choice = useSettings.getState().timeFormat
  if (choice !== 'auto') return choice === '12'
  try {
    const cycle = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hourCycle
    return cycle === 'h12' || cycle === 'h11'
  } catch {
    return false
  }
}

export function formatTime(date: Date | string, locale: string): string {
  const twelve = uses12Hours()
  return new Date(date).toLocaleTimeString(twelve ? 'en-US' : locale, { hour: 'numeric', minute: '2-digit', hour12: twelve })
}

export function formatDateTime(date: Date | string, locale: string): string {
  const day = new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${day}, ${formatTime(date, locale)}`
}

/** A time of day, such as when reminders go out. */
export function clockTime(hours: number, minutes: number, locale: string): string {
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return formatTime(date, locale)
}
