// Chat, friends, leagues and moderation. Every action is a database function that checks
// permissions, bans and limits on the server (supabase/migrations/*_community.sql).

import { supabase } from './supabase'
import type { Role, Slot } from '../stores/profile'

/** What anyone may see about another user. */
export type PublicCard = {
  id: string
  username: string | null
  display_name: string
  avatar_url: string | null
  role: Role
  xp: number
  equipped: Partial<Record<Slot, string>>
  verified?: boolean
}

export type ChatRoom = { id: string; icon: string; sort: number; slow_mode_seconds: number; closed: boolean }

export type ChatMessage = {
  id: number
  room: string
  user_id: string
  body: string
  reply_to: number | null
  /** A photo; only the owner can post them. */
  image_url: string | null
  reactions: Record<string, number>
  filtered: number
  created_at: string
  deleted_at: string | null
  hidden: boolean
}

export type ChatStatus = {
  rules_accepted: boolean
  restriction: { kind: 'mute' | 'ban'; until: string | null } | null
  warnings: Array<{ reason: string; created_at: string }>
  links_allowed: boolean
  moderator: boolean
}

export type FriendEntry = {
  id: string
  status: 'friend' | 'incoming' | 'outgoing'
  user: PublicCard
  online: boolean
  last_seen_at: string | null
  streak: number
  week_xp: number
}

export type League = {
  week_start: string
  ends_at: string
  tier: number
  joined: boolean
  xp: number
  promote: number
  demote: number
  members: Array<{ user: PublicCard; xp: number; rank: number; me: boolean }>
  last: { week_start: string; tier: number; rank: number; outcome: 'promoted' | 'stayed' | 'demoted'; reward: number } | null
}

export type PublicProfile = {
  user: PublicCard
  created_at: string
  best_streak: number
  streak: number
  answers: number
  achievements: number
  league_tier: number
  friendship: 'friend' | 'incoming' | 'outgoing' | null
  me: boolean
}

export type Report = {
  message_id: number
  room: string
  body: string
  created_at: string
  hidden: boolean
  filtered: number
  author: PublicCard
  reports: number
  reasons: string[]
  notes: string[]
  last_report: string
}

export type Sanction = {
  id: string
  kind: 'warning' | 'mute' | 'ban'
  reason: string
  until: string | null
  created_at: string
  revoked_at?: string | null
  user?: PublicCard
  by?: string | null
}

export type ModUser = {
  can_moderate: boolean
  sanctions: Sanction[]
  messages: Array<{ id: number; room: string; body: string; created_at: string; deleted: boolean }>
  reports_against: number
}

export const TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'diamond', 'legend'] as const
export const TIER_ICONS = ['🥉', '🥈', '🥇', '🔷', '♦️', '💎', '👑'] as const
export const TIER_COLORS = ['#cd7f32', '#c0c7d1', '#fbbf24', '#3b82f6', '#ef4444', '#22d3ee', '#a855f7'] as const

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🎉', '🔥'] as const
export const REPORT_REASONS = ['spam', 'abuse', 'hate', 'sexual', 'other'] as const

/** A server error as a short code the interface can translate, plus its detail. */
export class CommunityError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code)
  }
}

const CODES = [
  'sign_in_first', 'rules_not_accepted', 'banned', 'muted', 'no_such_room', 'room_closed', 'not_friends', 'empty',
  'too_long', 'bad_reply', 'too_fast', 'slow_mode', 'duplicate', 'no_links_yet', 'no_such_user', 'self', 'too_many',
  'no_such_message', 'own_message', 'forbidden', 'no_such_sanction', 'bad_duration', 'images_owner_only', 'bad_image',
]

function client() {
  if (!supabase) throw new CommunityError('offline')
  return supabase
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) {
    const code = CODES.find((known) => error.message === known || error.message.startsWith(`${known} `)) ?? (error.code === '42501' ? 'forbidden' : 'unknown')
    throw new CommunityError(code, error.details ?? undefined)
  }
  return data as T
}

export const DM_PREFIX = 'dm:'

export function dmRoom(a: string, b: string): string {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`
}

export function dmPartner(room: string, me: string): string | null {
  if (!room.startsWith(DM_PREFIX)) return null
  const [, first, second] = room.split(':')
  return first === me ? (second ?? null) : (first ?? null)
}

export const community = {
  status: () => rpc<ChatStatus>('chat_status'),
  acceptRules: () => rpc<void>('accept_chat_rules'),
  rooms: async () => {
    const { data, error } = await client().from('chat_rooms').select('id, icon, sort, slow_mode_seconds, closed').order('sort')
    if (error) throw new CommunityError('unknown')
    return data as ChatRoom[]
  },
  messages: async (room: string, before?: number, limit = 50) => {
    let query = client()
      .from('chat_messages')
      .select('id, room, user_id, body, reply_to, image_url, reactions, filtered, created_at, deleted_at, hidden')
      .eq('room', room)
      .order('id', { ascending: false })
      .limit(limit)
    if (before) query = query.lt('id', before)
    const { data, error } = await query
    if (error) throw new CommunityError('unknown')
    return (data as ChatMessage[]).reverse()
  },
  cards: async (ids: string[]) => {
    if (ids.length === 0) return [] as PublicCard[]
    const { data, error } = await client().from('profiles').select('id, username, display_name, avatar_url, role, xp, equipped').in('id', ids)
    if (error) throw new CommunityError('unknown')
    return data as PublicCard[]
  },
  myReactions: async (messageIds: number[]) => {
    if (messageIds.length === 0) return [] as Array<{ message_id: number; emoji: string }>
    const { data } = await client().from('chat_reactions').select('message_id, emoji').in('message_id', messageIds)
    return (data ?? []) as Array<{ message_id: number; emoji: string }>
  },
  react: async (messageId: number, emoji: string, on: boolean) => {
    const table = client().from('chat_reactions')
    const { error } = on
      ? await table.insert({ message_id: messageId, emoji })
      : await table.delete().eq('message_id', messageId).eq('emoji', emoji)
    if (error && error.code !== '23505') throw new CommunityError(error.message.includes('too_fast') ? 'too_fast' : 'unknown')
  },
  send: (room: string, body: string, replyTo?: number | null, image?: string | null) =>
    rpc<ChatMessage>('send_message', { p_room: room, p_body: body, p_reply_to: replyTo ?? null, p_image: image ?? null }),
  uploadImage: async (file: File, userId: string) => {
    const blob = await shrinkImage(file)
    const path = `${userId}/${crypto.randomUUID().replace(/-/g, '')}.webp`
    const { error } = await client().storage.from('chat-images').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
    if (error) throw new CommunityError('upload_failed')
    return client().storage.from('chat-images').getPublicUrl(path).data.publicUrl
  },
  deleteOwn: (id: number) => rpc<void>('delete_my_message', { p_id: id }),
  report: (id: number, reason: string, note: string) => rpc<void>('report_message', { p_id: id, p_reason: reason, p_note: note }),

  friends: () => rpc<FriendEntry[]>('my_friends'),
  addFriend: (target: { id?: string; username?: string }) =>
    rpc<'sent' | 'accepted' | 'already'>('send_friend_request', { p_user: target.id ?? null, p_username: target.username ?? null }),
  respond: (id: string, accept: boolean) => rpc<void>('respond_friend_request', { p_id: id, p_accept: accept }),
  removeFriend: (userId: string) => rpc<void>('remove_friend', { p_user: userId }),
  profile: (userId: string) => rpc<PublicProfile | null>('public_profile', { p_user: userId }),
  league: () => rpc<League>('league_standings'),
  touch: () => rpc<void>('touch_presence'),

  modReports: () => rpc<Report[]>('mod_reports'),
  modSanctions: () => rpc<Sanction[]>('mod_sanctions'),
  modUser: (userId: string) => rpc<ModUser>('mod_user', { p_user: userId }),
  modDelete: (id: number, reason = '') => rpc<void>('mod_delete_message', { p_id: id, p_reason: reason }),
  modDismiss: (id: number) => rpc<void>('mod_dismiss_reports', { p_id: id }),
  modSanction: (userId: string, kind: Sanction['kind'], minutes: number | null, reason: string) =>
    rpc<string>('mod_sanction', { p_user: userId, p_kind: kind, p_minutes: minutes, p_reason: reason }),
  modRevoke: (id: string) => rpc<void>('mod_revoke_sanction', { p_id: id }),
  modRoom: (room: string, slowMode: number, closed: boolean) =>
    rpc<void>('mod_set_room', { p_room: room, p_slow_mode: slowMode, p_closed: closed }),
}

/** Scales a photo down to 1600 px on its longer side and re-encodes it as WebP. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new CommunityError('bad_image')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  if (!blob || blob.size > 5 * 1024 * 1024) throw new CommunityError('bad_image')
  return blob
}

/** Splits a message into plain text, @mentions and safe http(s) links. */
export function tokenize(body: string): Array<{ kind: 'text' | 'mention' | 'link'; value: string }> {
  const parts: Array<{ kind: 'text' | 'mention' | 'link'; value: string }> = []
  const pattern = /(https?:\/\/[^\s<>"']+[^\s<>"'.,!?;:)\]])|(@[A-Za-z0-9_]{3,24})/g
  let last = 0
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) parts.push({ kind: 'text', value: body.slice(last, start) })
    parts.push({ kind: match[1] ? 'link' : 'mention', value: match[0] })
    last = start + match[0].length
  }
  if (last < body.length) parts.push({ kind: 'text', value: body.slice(last) })
  return parts
}
