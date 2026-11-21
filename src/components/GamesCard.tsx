import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from './icons'
import { GAMES } from '../lib/games'
import { Card } from './ui'

/** The way into the games from Home and Learn (on phones they aren't in the bottom bar). */
export function GamesCard() {
  const { t } = useTranslation()
  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 text-2xl" aria-hidden="true">
        {GAMES.slice(0, 5).map((game) => (
          <span key={game.id}>{game.emoji}</span>
        ))}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{t('games.cardTitle')}</h3>
      <p className="mt-2 flex-1 text-muted">{t('games.cardText')}</p>
      <Link to="/games" className="btn btn-secondary mt-5 self-start">
        {t('games.cardCta')}
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  )
}
