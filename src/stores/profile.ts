import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type Role = 'user' | 'tester' | 'moderator' | 'admin' | 'owner'

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  role: Role
  xp: number
  coins: number
  created_at: string
}

type ProfileState = {
  profile: Profile | null
  load: (userId: string) => Promise<void>
  clear: () => void
}

export const useProfile = create<ProfileState>()((set) => ({
  profile: null,

  load: async (userId) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, role, xp, coins, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.warn('Could not load profile', error.message)
      return
    }
    set({ profile: (data as Profile | null) ?? null })
  },

  clear: () => set({ profile: null }),
}))
