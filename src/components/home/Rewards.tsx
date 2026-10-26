import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpenCheck, Check, CheckCheck, Coins, Gift, Layers, ListChecks, Sparkles, Target, type LucideIcon } from 'lucide-react'
import { Confetti } from '../Confetti'
import { Card, IconChip, ProgressBar } from '../ui'
import { useSound } from '../../lib/cosmetics'
import { cx } from '../../lib/cx'
import { useViewer } from '../../lib/viewer'
import { EconomyError, useEconomy, type ChestReward, type Quest } from '../../stores/economy'
import { localToday } from '../../stores/study'
import { toast } from '../../stores/toast'

const QUEST_ICONS: Record<string, LucideIcon> = {
  answers: ListChecks,
  correct: CheckCheck,
  goal: Target,
  goal_days: Target,
  new_words: Sparkles,
  'mode:cards': Layers,
  'mode:choice': ListChecks,
  'mode:typing': BookOpenCheck,
}

/** Time left until the next local midnight (or the next Monday for weekly quests). */
function untilReset(weekly: boolean, t: TFunction): string {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  if (weekly) next.setDate(next.getDate() + ((8 - next.getDay()) % 7))
  const minutes = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return days > 0 ? t('quests.daysHours', { days, hours }) : `${hours}:${String(minutes % 60).padStart(2, '0')}`
}

export function QuestsCard() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const sound = useSound()
  const { quests, loadQuests, claimQuest } = useEconomy()
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!viewer.isGuest) void loadQuests()
  }, [viewer.isGuest, loadQuests])

  async function claim(quest: Quest) {
    setBusy(quest.id)
    try {
      const reward = await claimQuest(quest.id)
      sound('coin')
      toast(t('quests.claimed', { count: reward }), 'reward', '🪙')
    } catch (error) {
      toast(t(`shop.errors.${error instanceof EconomyError ? error.code : 'unknown'}`, { defaultValue: t('shop.errors.unknown') }), 'error')
    } finally {
      setBusy(null)
    }
  }

  const daily = quests.filter((quest) => quest.period === 'day')
  const weekly = quests.filter((quest) => quest.period === 'week')

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center gap-3">
        <IconChip tone="accent" className="size-9">
          <ListChecks className="size-[1.1rem]" />
        </IconChip>
        <h3 className="flex-1 font-display text-lg font-semibold">{t('quests.title')}</h3>
        {!viewer.isGuest && <span className="text-xs text-subtle tabular-nums">{t('quests.resets', { time: untilReset(false, t) })}</span>}
      </div>

      {viewer.isGuest ? (
        <div className="mt-4 flex flex-1 flex-col items-start gap-4">
          <p className="text-muted">{t('quests.guest')}</p>
          <Link to="/welcome" className="btn btn-secondary mt-auto">{t('common.signIn')}</Link>
        </div>
      ) : quests.length === 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-control bg-surface" />)}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <QuestList quests={daily} busy={busy} onClaim={claim} />
          {weekly.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-semibold text-muted">{t('quests.weekly')}</h4>
                <span className="text-xs text-subtle tabular-nums">{t('quests.resets', { time: untilReset(true, t) })}</span>
              </div>
              <QuestList quests={weekly} busy={busy} onClaim={claim} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function QuestList({ quests, busy, onClaim }: { quests: Quest[]; busy: string | null; onClaim: (quest: Quest) => void }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col gap-2.5">
      {quests.map((quest) => {
        const Icon = QUEST_ICONS[quest.kind] ?? Sparkles
        const done = quest.progress >= quest.target
        const claimed = quest.claimed_at !== null
        return (
          <li key={quest.id} className={cx('flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5', claimed && 'opacity-60')}>
            <Icon className={cx('size-5 shrink-0', done ? 'text-success' : 'text-accent')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{t(`quests.kinds.${quest.kind.replace(':', '_')}`, { count: quest.target })}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{Math.min(quest.progress, quest.target)}/{quest.target}</span>
              </div>
              <ProgressBar value={quest.progress} max={quest.target} className="mt-1.5 h-1.5" />
            </div>
            {claimed ? (
              <Check className="size-5 shrink-0 text-success" aria-label={t('quests.done')} />
            ) : done ? (
              <button type="button" className="btn btn-primary h-8 shrink-0 px-3 text-xs" disabled={busy === quest.id} onClick={() => onClaim(quest)}>
                <Coins className="size-3.5" />+{quest.reward}
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-coin tabular-nums">
                <Coins className="size-3.5" />{quest.reward}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function ChestCard() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const sound = useSound()
  const stats = useEconomy((s) => s.stats)
  const mineLoaded = useEconomy((s) => s.mineLoaded)
  const openChest = useEconomy((s) => s.openChest)
  const [opening, setOpening] = useState(false)
  const [reward, setReward] = useState<ChestReward | null>(null)

  const openedToday = stats?.last_chest_day === localToday()

  async function open() {
    setOpening(true)
    try {
      // A short shake before the lid comes off.
      const [result] = await Promise.all([openChest(), new Promise((resolve) => setTimeout(resolve, 700))])
      setReward(result)
      sound('coin')
    } catch (error) {
      toast(t(`shop.errors.${error instanceof EconomyError ? error.code : 'unknown'}`, { defaultValue: t('shop.errors.unknown') }), 'error')
    } finally {
      setOpening(false)
    }
  }

  return (
    <Card className="flex h-full flex-col items-center text-center">
      <div className="flex w-full items-center gap-3 text-left">
        <IconChip tone="coin" className="size-9">
          <Gift className="size-[1.1rem]" />
        </IconChip>
        <h3 className="font-display text-lg font-semibold">{t('chest.title')}</h3>
      </div>

      {reward && (reward.coins >= 40 || reward.streak_freeze) && <Confetti pieces={50} />}
      <div className="relative my-4 grid flex-1 place-items-center">
        <AnimatePresence mode="wait">
          {reward ? (
            <motion.div key="reward" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
              <div className="font-display text-4xl font-semibold text-coin tabular-nums">+{reward.coins} 🪙</div>
              {reward.streak_freeze && <div className="mt-2 text-sm font-semibold text-accent-2">+1 🧊 {t('shop.items.streak_freeze')}</div>}
            </motion.div>
          ) : (
            <motion.span
              key="chest"
              className={cx('text-7xl select-none', !openedToday && !viewer.isGuest && 'chest-ready', openedToday && 'opacity-40 grayscale')}
              animate={opening ? { rotate: [0, -12, 12, -10, 10, 0], scale: [1, 1.1, 1.1, 1.15, 1.15, 1.2] } : undefined}
              transition={{ duration: 0.7 }}
              aria-hidden="true"
            >
              🎁
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {viewer.isGuest ? (
        <p className="text-sm text-muted">{t('chest.guest')}</p>
      ) : reward || openedToday ? (
        <p className="text-sm text-muted">{t('chest.comeBack', { time: untilReset(false, t) })}</p>
      ) : (
        <button type="button" className="btn btn-primary w-full" disabled={!mineLoaded || opening} onClick={() => void open()}>
          {t('chest.open')}
        </button>
      )}
    </Card>
  )
}
