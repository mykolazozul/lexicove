import type { TFunction } from 'i18next'
import { NotionError } from '../../lib/notion'

const KNOWN = new Set([
  'not_configured',
  'not_connected',
  'reconnect_required',
  'too_soon',
  'notion_busy',
  'bad_state',
  'account_required',
  'unauthorized',
  'too_many_sources',
])

/** A translated message for known server errors, or the server's own text otherwise. */
export function notionErrorText(t: TFunction, error: unknown): string {
  if (error instanceof NotionError) {
    return KNOWN.has(error.code) ? t(`notion.errors.${error.code}`) : error.message || t('errors.generic')
  }
  return error instanceof Error && error.message ? error.message : t('errors.generic')
}
