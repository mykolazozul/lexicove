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
  clear: () => void
}

const COLUMNS = 'id, username, display_name, avatar_url, role, xp, coins, created_at, daily_goal, time_zone, equipped, boost_until'

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
    const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle()
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
      if (!zoneError) set({ profile: { ...profile, time_zone: zone } })
    }
  },

  refresh: async () => {
    const id = get().profile?.id
    if (!supabase || !id) return
    const { data } = await supabase.from('profiles').select(COLUMNS).eq('id', id).maybeSingle()
    if (data) set({ profile: data as Profile })
  },

  setDailyGoal: async (goal) => {
    const profile = get().profile
    if (!supabase || !profile) return
    set({ profile: { ...profile, daily_goal: goal } })
    const { error } = await supabase.from('profiles').update({ daily_goal: goal }).eq('id', profile.id)
    if (error) set({ profile })
  },

  clear: () => set({ profile: null }),
}))
