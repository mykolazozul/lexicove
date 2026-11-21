import { useEffect } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react'
import { Card, Reveal, Segmented, Select } from '../components/ui'
import { DECK_LEVELS, formatScore, GAMES, playable, useGames, type GameMeta } from '../lib/games'
import { useViewer } from '../lib/viewer'
import { useLibrary } from '../stores/library'

/** Nine word games, on the player's own words or a starter deck. */
export function GamesPage() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const { loaded, load, words } = useLibrary()
  const { source, setSource, level, setLevel, best } = useGames()

  useEffect(() => {
    if (!viewer.isGuest && !loaded) void load()
  }, [viewer.isGuest, loaded, load])

  const usesDeck = viewer.isGuest || source === 'deck'

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">{t('games.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('games.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!viewer.isGuest && (
              <Segmented
                label={t('games.source')}
                value={source}
                onChange={setSource}
                options={[
                  { value: 'mine', label: t('games.mine', { count: words.length }) },
                  { value: 'deck', label: t('games.deck') },
                ]}
              />
            )}
            {usesDeck && (
              <Select
                label={t('games.level')}
                value={level}
                onChange={setLevel}
                options={DECK_LEVELS.map((value) => ({ value, label: t(`duels.levels.${value}`) }))}
              />
            )}
          </div>
        </Card>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game, index) => (
          <Reveal key={game.id} delay={0.03 * index}>
            <GameCard game={game} best={best[game.id]} tooFew={!usesDeck && loaded && playable(game, words).length < game.needs} />
          </Reveal>
        ))}
      </div>
    </div>
  )
}

function GameCard({ game, best, tooFew }: { game: GameMeta; best: number | undefined; tooFew: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to={`/games/${game.id}`} className="block h-full">
      <Card className="flex h-full flex-col gap-3 transition-transform hover:-translate-y-0.5">
        <div className="flex items-center gap-3">
          <span className="bg-gradient-accent grid size-12 shrink-0 place-items-center rounded-control text-2xl shadow-[var(--shadow-accent)]" aria-hidden="true">
            {game.emoji}
          </span>
          <h3 className="font-display text-lg font-semibold">{t(`games.items.${game.id}.name`)}</h3>
        </div>
        <p className="flex-1 text-sm text-muted">{t(`games.items.${game.id}.short`)}</p>
        <div className="flex items-center justify-between gap-2 text-xs">
          {best !== undefined ? (
            <span className="inline-flex items-center gap-1 font-semibold text-coin">
              <Trophy className="size-3.5" />
              {formatScore(game, best, t)}
            </span>
          ) : (
            <span className="text-subtle">{t('games.noBest')}</span>
          )}
          {tooFew && <span className="text-subtle">{t('games.usesDeck')}</span>}
        </div>
      </Card>
    </Link>
  )
}
