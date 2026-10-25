import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import { useProfile } from '../stores/profile'
import { levelFromXp } from './progression'

/** Everything the UI needs to know about the person using the app, guest or signed in. */
export function useViewer() {
  const { t } = useTranslation()
  const session = useAuth((s) => s.session)
  const profile = useProfile((s) => s.profile)
  const user = session?.user ?? null

  const metaName = user?.user_metadata?.full_name ?? user?.user_metadata?.name
  const name =
    profile?.display_name ??
    (typeof metaName === 'string' ? metaName : null) ??
    user?.email?.split('@')[0] ??
    t('common.guest')

  const xp = profile?.xp ?? 0

  return {
    isGuest: !user,
    name,
    email: user?.email ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    role: profile?.role ?? 'user',
    xp,
    coins: profile?.coins ?? 0,
    streak: 0,
    memberSince: profile?.created_at ?? null,
    ...levelFromXp(xp),
  }
}
