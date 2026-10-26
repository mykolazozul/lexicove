import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type Role = 'user' | 'tester' | 'moderator' | 'admin' | 'owner'

/** Cosmetic slots that can hold one shop item each. */
export type Slot = 'avatar' | 'frame' | 'banner' | 'title' | 'card_back' | 'sound' | 'name_color'

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  role: Role
  xp: number
  coins: number
  created_at: string
  daily_goal: number
  time_zone: string
  equipped: Partial<Record<Slot, string>>
  boost_until: string | null
  verified: boolean
  display_name_changed_at: string | null
  username_changed_at: string | null
}

type ProfileState = {
  profile: Profile | null
  load: (userId: string) => Promise<void>
  /** Re-reads the signed-in profile, e.g. after the server changed coins or XP. */
  refresh: () => Promise<void>
  setDailyGoal: (goal: number) => Promise<void>
  /** Saves the @name friends search for. Throws a NameError. */
  setUsername: (username: string) => Promise<void>
  /** Saves the name everyone sees. Throws a NameError. */
  setDisplayName: (name: string) => Promise<void>
  clear: () => void
}

/** Why the server refused a name; `until` is when the next change is allowed. */
export class NameError extends Error {
  constructor(public code: string, public until?: string) {
    super(code)
  }
}

const NAME_CODES = ['name_length', 'name_invalid', 'name_bad_word', 'name_reserved', 'name_too_soon', 'username_too_soon']

function nameError(error: { code?: string; message: string; details?: string | null }): NameError {
  if (error.code === '23505') return new NameError('taken')
  // The username format is a check constraint on the table.
  if (error.code === '23514') return new NameError('name_invalid')
  const code = NAME_CODES.find((known) => error.message === known) ?? 'unknown'
  return new NameError(code, error.details ?? undefined)
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export const useProfile = create<ProfileState>()((set, get) => ({
  profile: null,

  load: async (userId) => {
    if (!supabase) return
    // Other people's coins, time zone and goal are private, so the full row comes from my_profile().
    const { data, error } = await supabase.rpc('my_profile').maybeSingle()
    if (error) {
      console.warn('Could not load profile', error.message)
      return
    }
    const profile = (data as Profile | null) ?? null
    set({ profile })

    // The server counts days (streaks, quests, the daily chest) in this time zone.
    const zone = browserTimeZone()
    if (profile && profile.time_zone !== zone) {
      const { error: zoneError } = await supabase.from('profiles').update({ time_zone: zone }).eq('id', userId)
      // The server keeps a new time zone at most once every three days, so read back what stuck.
      if (!zoneError) await get().refresh()
    }
  },

  refresh: async () => {
    const id = get().profile?.id
    if (!supabase || !id) return
    const { data } = await supabase.rpc('my_profile').maybeSingle()
    if (data) set({ profile: data as Profile })
  },

  setDailyGoal: async (goal) => {
    const profile = get().profile
    if (!supabase || !profile) return
    set({ profile: { ...profile, daily_goal: goal } })
    const { error } = await supabase.from('profiles').update({ daily_goal: goal }).eq('id', profile.id)
    if (error) set({ profile })
  },

  setUsername: async (username) => {
    const profile = get().profile
    if (!supabase || !profile) return
    const { error } = await supabase.from('profiles').update({ username }).eq('id', profile.id)
    if (error) throw nameError(error)
    await get().refresh()
  },

  setDisplayName: async (displayName) => {
    const profile = get().profile
    if (!supabase || !profile) return
    const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', profile.id)
    if (error) throw nameError(error)
    await get().refresh()
  },

  clear: () => set({ profile: null }),
}))
