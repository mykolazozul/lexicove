import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { readFlag, writeFlag } from '../lib/storage'
import { useSettings } from './settings'

export const OAUTH_PROVIDERS = ['google', 'github', 'discord', 'notion'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

// Guests are kept on the device only, so drive-by visitors never create server accounts.
const LOCAL_GUEST_KEY = 'lexicove-local-guest'

type AuthState = {
  ready: boolean
  session: Session | null
  localGuest: boolean
  /** Signed in with a reset code or link, and the new password isn't saved yet. */
  passwordRecovery: boolean
  init: () => () => void
  signInWithProvider: (provider: OAuthProvider) => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  /** Confirms a new account with the code from the email, right on the sign-up page. */
  verifySignupCode: (email: string, code: string) => Promise<void>
  resendSignupCode: (email: string) => Promise<void>
  /** Emails a reset code. Succeeds for unknown addresses too, so nobody can probe who has an account. */
  sendPasswordReset: (email: string) => Promise<void>
  /** Signs in with the reset code; the new password is set next with setNewPassword. */
  verifyResetCode: (email: string, code: string) => Promise<void>
  setNewPassword: (password: string) => Promise<void>
  /** Keeps the old password and goes into the app. */
  skipNewPassword: () => void
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
  passwordRecovery: false,

  init: () => {
    if (!supabase) {
      set({ ready: true })
      return () => {}
    }
    // INITIAL_SESSION fires once the stored session (or an OAuth ?code=) has been processed.
    // A reset code or link arrives as PASSWORD_RECOVERY, together with its session, so the
    // welcome page can ask for the new password before letting the person in.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      set({ session, ready: true })
      if (event === 'PASSWORD_RECOVERY') set({ passwordRecovery: true })
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') set({ passwordRecovery: false })
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
      // The confirmation email is written in this language (see supabase/templates).
      options: { emailRedirectTo: `${window.location.origin}/`, data: { app_locale: useSettings.getState().locale } },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  },

  verifySignupCode: async (email, code) => {
    const token = code.replace(/\D/g, '')
    const { error } = await client().auth.verifyOtp({ email, token, type: 'signup' })
    if (!error) return
    // Newer projects issue the same code as a general email code.
    const retry = await client().auth.verifyOtp({ email, token, type: 'email' })
    if (retry.error) throw error
  },

  resendSignupCode: async (email) => {
    const { error } = await client().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/` } })
    if (error) throw error
  },

  sendPasswordReset: async (email) => {
    // The link fallback lands on the welcome page, which then asks for the new password.
    const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/welcome` })
    if (error) throw error
  },

  verifyResetCode: async (email, code) => {
    const { error } = await client().auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'recovery' })
    if (error) throw error
  },

  setNewPassword: async (password) => {
    const { error } = await client().auth.updateUser({ password })
    if (error) throw error
    // Whoever knew the old password is signed out everywhere else.
    await client().auth.signOut({ scope: 'others' }).catch(() => {})
  },

  skipNewPassword: () => set({ passwordRecovery: false }),

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
