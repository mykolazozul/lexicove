import type { Role } from '../stores/profile'
import { supabase } from './supabase'

export const ROLE_RANK: Record<Role, number> = { user: 0, tester: 1, moderator: 2, admin: 3, owner: 4 }

export function isAdmin(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.admin
}

export type Overview = {
  users_total: number
  users_7d: number
  users_30d: number
  testers: number
  dau: number
  wau: number
  mau: number
  guest_opens_7d: number
  events_30d: number
  words_total: number
  rules_total: number
  notion_connections: number
  notion_sources: number
  notion_errors: number
  signups_by_day: Array<{ day: string; count: number }>
  active_by_day: Array<{ day: string; count: number }>
  heatmap: Array<{ dow: number; hour: number; count: number }>
  funnel: { signed_up: number; has_words: number; notion_connected: number; notion_linked: number }
  retention_7d: { cohort: number; returned: number }
  words_histogram: Record<string, number>
  top_categories: Array<{ name: string; count: number }>
  recent_signups: Array<{ name: string; provider: string; created_at: string }>
  providers: Record<string, number>
  platforms: Record<string, number>
  locales: Record<string, number>
  themes: Record<string, number>
  apple_style: Record<string, number>
  top_pages: Array<{ path: string; count: number }>
  actions: Record<string, number>
  db_bytes: number
  tables: Array<{ name: string; rows: number; bytes: number }> | null
}

export type AdminUser = {
  id: string
  email: string | null
  display_name: string
  role: Role
  hidden_from_stats: boolean
  provider: string
  created_at: string
  last_sign_in_at: string | null
  last_seen_at: string | null
  words: number
  notion_connected: boolean
}

export type AdminSource = {
  email: string | null
  title: string
  kind: 'words' | 'rules'
  rows_count: number
  last_synced_at: string | null
  last_error: string | null
}

export type AuditEntry = {
  created_at: string
  actor: string | null
  action: string
  target: string | null
  details: Record<string, unknown>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export type Economy = {
  circulation: number
  holders: number
  answer_coins_30d: number
  spent_30d: number
  earned_by_reason: Array<{ reason: string; amount: number }>
  spent_daily: Array<{ day: string; value: number }>
  top_items: Array<{ item: string; owners: number }>
  quests: Array<{ kind: string; given: number; claimed: number }>
  chests_30d: number
  achievements: Array<{ id: string; icon: string; unlocked: number }>
  leagues: Array<{ tier: number; users: number }>
  league_players: number
  chat: { messages_7d: number; open_reports: number; active_sanctions: number }
}

export const admin = {
  overview: () => rpc<Overview>('admin_overview'),
  users: (search: string, offset = 0) => rpc<AdminUser[]>('admin_users', { p_search: search, p_limit: 50, p_offset: offset }),
  setRole: (userId: string, role: Role) => rpc<void>('admin_set_role', { p_user: userId, p_role: role }),
  sources: () => rpc<AdminSource[]>('admin_notion_sources'),
  audit: () => rpc<AuditEntry[]>('admin_audit', { p_limit: 100 }),
  economy: () => rpc<Economy>('admin_economy'),
}

/** Free-plan limits that matter for this app (Supabase, autumn 2026). */
export const FREE_LIMITS = {
  dbBytes: 500 * 1024 * 1024,
  mau: 50_000,
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}
