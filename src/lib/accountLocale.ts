// Supabase writes the auth emails (sign-up code, password reset) from templates that read
// user_metadata.app_locale, so a signed-in account keeps the interface language there.

import { supabase } from './supabase'
import { useAuth } from '../stores/auth'
import { useSettings } from '../stores/settings'

let timer: ReturnType<typeof setTimeout> | undefined
let saving: string | null = null

function sync() {
  const { session, passwordRecovery } = useAuth.getState()
  const locale = useSettings.getState().locale
  // Saving metadata fires USER_UPDATED, which ends a password recovery, so wait for the new password.
  if (!supabase || !session || passwordRecovery) return
  if (session.user.user_metadata?.app_locale === locale || saving === locale) return
  saving = locale
  void supabase.auth
    .updateUser({ data: { app_locale: locale } })
    .catch(() => {})
    .finally(() => {
      saving = null
    })
}

// The auth store sets the session a moment before it marks a recovery, so check a beat later.
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(sync, 1000)
}

/** Keeps the account's email language in step with the interface. Returns the unsubscribe. */
export function syncAccountLocale(): () => void {
  schedule()
  const offAuth = useAuth.subscribe(schedule)
  const offSettings = useSettings.subscribe(schedule)
  return () => {
    clearTimeout(timer)
    offAuth()
    offSettings()
  }
}
