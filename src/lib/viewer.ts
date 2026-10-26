import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import { useProfile } from '../stores/profile'
import { useSettings } from '../stores/settings'
import { useStudy } from '../stores/study'
import { levelFromXp } from './progression'

/** Everything the UI needs to know about the person using the app, guest or signed in. */
export function useViewer() {
  const { t } = useTranslation()
  const session = useAuth((s) => s.session)
  const profile = useProfile((s) => s.profile)
  const streak = useStudy((s) => s.streak)
  const user = session?.user ?? null

  const metaName = user?.user_metadata?.full_name ?? user?.user_metadata?.name
  const name =
    profile?.display_name ??
    (typeof metaName === 'string' ? metaName : null) ??
    user?.email?.split('@')[0] ??
    t('common.guest')

  const xp = profile?.xp ?? 0
  const localGoal = useSettings((s) => s.dailyGoal)
  const boostUntil = profile?.boost_until ? new Date(profile.boost_until) : null

  return {
    isGuest: !user,
    name,
    email: user?.email ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    role: profile?.role ?? 'user',
    xp,
    coins: profile?.coins ?? 0,
    streak,
    memberSince: profile?.created_at ?? null,
    verified: profile?.verified ?? false,
    dailyGoal: profile?.daily_goal ?? localGoal,
    /** When the double-XP boost ends, if one is running. */
    boostUntil: boostUntil && boostUntil.getTime() > Date.now() ? boostUntil : null,
    ...levelFromXp(xp),
  }
}
