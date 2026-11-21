import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Swords, X } from '../icons'
import { errorText, PersonAvatar } from './People'
import { duels, type DuelInvite } from '../../lib/duels'
import { useAuth } from '../../stores/auth'
import { toast } from '../../stores/toast'

/**
 * A challenge to a duel pops up wherever the person is in the app, the moment it's sent, with
 * buttons to accept or decline. Invites last two minutes.
 */
export function DuelInvites() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  // The duels tab lists invites itself, and nothing should pop up in the middle of a duel.
  const onDuelsTab = (pathname === '/community' && new URLSearchParams(search).get('tab') === 'duels') || pathname.startsWith('/duel/')
  const userId = useAuth((s) => s.session?.user.id)
  const [invites, setInvites] = useState<DuelInvite[]>([])
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)

  const load = useCallback(() => duels.overview().then((overview) => setInvites(overview.incoming)).catch(() => {}), [])

  useEffect(() => {
    if (!userId) return
    void load()
    return duels.watchMine(userId, (duel) => {
      if (duel.player_b === userId && duel.status === 'waiting') void load()
    })
  }, [userId, load])

  // Let expired invites drop off on their own.
  useEffect(() => {
    if (invites.length === 0) return
    const timer = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(timer)
  }, [invites.length])

  const fresh = invites.filter((invite) => Date.parse(invite.created_at) > Date.now() - 120_000)
  const invite = onDuelsTab ? undefined : fresh[0]

  async function respond(accept: boolean) {
    if (!invite) return
    setBusy(true)
    try {
      await duels.respond(invite.id, accept)
      setInvites((list) => list.filter((item) => item.id !== invite.id))
      if (accept) navigate(`/duel/${invite.id}`)
    } catch (error) {
      toast(errorText(t, error), 'error')
      void load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          key={invite.id}
          role="alertdialog"
          aria-label={t('duels.invite.title', { name: invite.user.display_name })}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="glass ring-gradient fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md flex-col gap-3 rounded-card bg-elevated p-4 lg:right-6 lg:bottom-6 lg:left-auto lg:mx-0 lg:w-96"
        >
          <div className="flex items-center gap-3">
            <PersonAvatar user={invite.user} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t(invite.rematch ? 'duels.invite.rematchTitle' : 'duels.invite.title', { name: invite.user.display_name })}</p>
              <p className="text-xs text-muted">
                {t(`duels.levels.${invite.level}`)} · {invite.stake > 0 ? t('duels.stake', { coins: invite.stake }) : t('duels.noStake')}
              </p>
            </div>
            {fresh.length > 1 && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">+{fresh.length - 1}</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => void respond(true)}>
              <Swords className="size-4" />
              {t('duels.invite.accept')}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void respond(false)} aria-label={t('duels.invite.decline')}>
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
