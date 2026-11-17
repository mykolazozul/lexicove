import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'

/** The level of a duel's questions and what's at stake. */
export function StakeLine({ stake, level }: { stake: number; level: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap justify-center gap-2 text-sm">
      <span className="rounded-full bg-surface px-3 py-1 font-semibold text-muted">{t(`duels.levels.${level}`)}</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-coin/12 px-3 py-1 font-semibold text-coin">
        <Coins className="size-4" />
        {stake > 0 ? t('duels.stake', { coins: stake }) : t('duels.noStake')}
      </span>
    </div>
  )
}
