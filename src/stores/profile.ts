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
}

type ProfileState = {
  profile: Profile | null
  load: (userId: string) => Promise<void>
  /** Re-reads the signed-in profile, e.g. after the server changed coins or XP. */
  refresh: () => Promise<void>
  setDailyGoal: (goal: number) => Promise<void>
  /** Saves the @name friends search for. Throws 'taken' or 'invalid'. */
  setUsername: (username: string | null) => Promise<void>
  clear: () => void
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
    if (error) throw new Error(error.code === '23505' ? 'taken' : 'invalid')
    set({ profile: { ...profile, username } })
  },

  clear: () => set({ profile: null }),
}))
