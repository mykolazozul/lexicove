import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { readFlag, writeFlag } from '../lib/storage'

export const OAUTH_PROVIDERS = ['google', 'github', 'discord', 'notion'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

// Guests are kept on the device only, so drive-by visitors never create server accounts.
const LOCAL_GUEST_KEY = 'lexicove-local-guest'

type AuthState = {
  ready: boolean
  session: Session | null
  localGuest: boolean
  init: () => () => void
  signInWithProvider: (provider: OAuthProvider) => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  continueAsGuest: () => void
  signOut: () => Promise<void>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const useAuth = create<AuthState>()((set) => ({
  ready: false,
  session: null,
  localGuest: readFlag(LOCAL_GUEST_KEY),

  init: () => {
    if (!supabase) {
      set({ ready: true })
      return () => {}
    }
    // INITIAL_SESSION fires once the stored session (or an OAuth ?code=) has been processed.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, ready: true })
      if (session) {
        writeFlag(LOCAL_GUEST_KEY, false)
        set({ localGuest: false })
      }
    })
    return () => data.subscription.unsubscribe()
  },

  signInWithProvider: async (provider) => {
    const { error } = await client().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
  },

  signInWithEmail: async (email, password) => {
    const { error } = await client().auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUpWithEmail: async (email, password) => {
    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  },

  continueAsGuest: () => {
    writeFlag(LOCAL_GUEST_KEY, true)
    set({ localGuest: true })
  },

  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    writeFlag(LOCAL_GUEST_KEY, false)
    set({ session: null, localGuest: false })
  },
}))
