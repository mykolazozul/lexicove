import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MessageCircle, ShieldAlert, Trophy, Users } from 'lucide-react'
import { ChatView } from '../components/community/ChatView'
import { FriendsView } from '../components/community/FriendsView'
import { LeagueView } from '../components/community/LeagueView'
import { ModerationView } from '../components/community/ModerationView'
import { GuestNotice } from '../components/GuestNotice'
import { Reveal } from '../components/ui'
import { ROLE_RANK } from '../lib/admin'
import { dmRoom } from '../lib/community'
import { cx } from '../lib/cx'
import { useViewer } from '../lib/viewer'
import { useProfile } from '../stores/profile'

type Tab = 'chat' | 'league' | 'friends' | 'moderation'

export function CommunityPage() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const me = useProfile((s) => s.profile?.id)
  const [params, setParams] = useSearchParams()
  const isModerator = ROLE_RANK[viewer.role] >= ROLE_RANK.moderator

  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && (requested !== 'moderation' || isModerator) ? requested : 'chat'
  const room = params.get('room')

  const go = useCallback((next: Tab, extra?: Record<string, string>) => setParams({ tab: next, ...extra }, { replace: true }), [setParams])
  const openDm = useCallback((userId: string) => me && go('chat', { room: dmRoom(me, userId) }), [go, me])

  if (viewer.isGuest) return <GuestNotice title={t('community.guestTitle')} text={t('community.guestText')} />

  const tabs = [
    { value: 'chat' as const, icon: MessageCircle },
    { value: 'league' as const, icon: Trophy },
    { value: 'friends' as const, icon: Users },
    ...(isModerator ? [{ value: 'moderation' as const, icon: ShieldAlert }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <div role="tablist" aria-label={t('nav.community')} className="flex gap-1 overflow-x-auto rounded-control border border-line bg-surface p-1">
          {tabs.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => go(value)}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-[calc(var(--radius-md)-4px)] px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                tab === value ? 'bg-elevated text-fg shadow-[var(--shadow-card)]' : 'text-muted hover:text-fg',
              )}
            >
              <Icon className="hidden size-4 sm:block" />
              {t(`community.tabs.${value}`)}
            </button>
          ))}
        </div>
      </Reveal>

      {tab === 'chat' && <ChatView initialRoom={room} />}
      {tab === 'league' && <LeagueView onMessage={openDm} />}
      {tab === 'friends' && <FriendsView onMessage={openDm} />}
      {tab === 'moderation' && <ModerationView />}
    </div>
  )
}
