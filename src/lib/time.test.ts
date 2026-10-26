import { afterEach, describe, expect, it } from 'vitest'
import { useSettings } from '../stores/settings'
import { clockTime, formatTime } from './time'

describe('clock times', () => {
  afterEach(() => useSettings.setState({ timeFormat: 'auto' }))

  it('uses 24 hours when asked, in any language', () => {
    useSettings.setState({ timeFormat: '24' })
    expect(clockTime(19, 0, 'uk')).toBe('19:00')
    expect(clockTime(7, 5, 'en')).toBe('07:05')
  })

  it('writes AM/PM for 12-hour time, even in Ukrainian', () => {
    useSettings.setState({ timeFormat: '12' })
    expect(clockTime(19, 0, 'uk')).toBe('7:00 PM')
    expect(formatTime(new Date(2026, 9, 26, 9, 30), 'en')).toBe('9:30 AM')
  })
})
