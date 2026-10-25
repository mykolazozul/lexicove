import { isTauri } from './platform'
import { supabase } from './supabase'

export class NotionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Calls the `notion` Edge Function. The user's session is attached automatically. */
export async function notionCall<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new NotionError('not_configured', 'Supabase is not configured')
  const { data, error } = await supabase.functions.invoke('notion', { body: { action, ...payload } })
  if (error) {
    let code = 'error'
    let message = error.message
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const body = (await response.json()) as { error?: string; message?: string }
        code = body.error ?? code
        message = body.message ?? message
      } catch {
        // Not JSON: keep the generic message.
      }
    }
    throw new NotionError(code, message)
  }
  return data as T
}

/** Where Notion sends people back after they approve access. Registered on the integration. */
export function notionRedirectUri(): string {
  return `${window.location.origin}/notion/callback`
}

/** OAuth needs a real browser tab; the desktop app links people to the website instead. */
export const canConnectHere = !isTauri

export type NotionStatus = {
  configured: boolean
  connected: boolean
  workspace: { workspace_name: string | null; workspace_icon: string | null; created_at: string } | null
}

export type NotionSourceOption = {
  id: string
  title: string
  kind: 'words' | 'rules'
  properties: Array<{ name: string; type: string }>
  suggested: { words: Record<string, string>; rules: Record<string, string> }
}

/** A table linked automatically right after connecting. */
export type AutoLinked = { title: string; kind: 'words' | 'rules'; pulled: number }

export type SyncSummary = {
  pulled: number
  removed: number
  pushed: { created: number; updated: number; removed: number }
}
