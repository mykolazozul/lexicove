import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Bot, Coins, Info, Loader2, Medal, Swords, Trophy, Users, X } from '../icons'
import { Modal } from '../Modal'
import { Card, IconChip, SectionTitle, Segmented, Select } from '../ui'
import { errorText, PersonAvatar, PersonName, UserLine } from './People'
import { community, type FriendEntry, type PublicCard } from '../../lib/community'
import { cx } from '../../lib/cx'
import {
  DUEL_LEVELS,
  duels,
  STAKES,
  TOURNAMENT_PRIZES,
  TOURNAMENT_SIZE,
  type DuelLevel,
  type DuelOverview,
  type Tournament,
  type TournamentMatch,
} from '../../lib/duels'
import { formatDateTime } from '../../lib/time'
import { useViewer } from '../../lib/viewer'
import { toast } from '../../stores/toast'
import { StakeLine } from './StakeLine'

/** Ranked games, practice with the bot, challenges between friends and the weekly tournament. */
export function DuelsView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [overview, setOverview] = useState<DuelOverview | null>(null)
  const [challengeOpen, setChallengeOpen] = useState(false)

  const load = useCallback(() => duels.overview().then(setOverview).catch((error) => toast(errorText(t, error), 'error')), [t])
  useEffect(() => {
    void load()
  }, [load])

  async function act(action: () => Promise<unknown>) {
    try {
      await action()
      await load()
    } catch (error) {
      toast(errorText(t, error), 'error')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {overview?.active && (
        <Card glow className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <Swords className="size-6 text-accent" />
          <p className="flex-1 font-semibold">{t('duels.activeNow')}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/duel/${overview.active}`)}>
            {t('duels.continue')}
          </button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <RatingCard overview={overview} />
        <PlayCard onChallenge={() => setChallengeOpen(true)} />
      </div>

      {overview && overview.incoming.length > 0 && (
        <section>
          <SectionTitle>{t('duels.incoming')}</SectionTitle>
          <Card padding="p-0" className="divide-y divide-line overflow-hidden">
            {overview.incoming.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <UserLine user={invite.user} subtitle={inviteLine(t, invite.stake, invite.level)} />
                <button type="button" className="btn btn-primary h-9 px-3" onClick={() => void act(async () => {
                  await duels.respond(invite.id, true)
                  navigate(`/duel/${invite.id}`)
                })}>
                  <Swords className="size-4" />
                  {t('duels.invite.accept')}
                </button>
                <button type="button" className="btn btn-ghost h-9 px-3" aria-label={t('duels.invite.decline')} onClick={() => void act(() => duels.respond(invite.id, false))}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      {overview && overview.outgoing.length > 0 && (
        <section>
          <SectionTitle>{t('duels.outgoing')}</SectionTitle>
          <Card padding="p-0" className="divide-y divide-line overflow-hidden">
            {overview.outgoing.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
                <UserLine user={invite.user} subtitle={t('duels.waitingShort')} onClick={() => navigate(`/duel/${invite.id}`)} />
                <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={() => void act(() => duels.cancel(invite.id))}>
                  {t('duels.waiting.cancel')}
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <TournamentCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>{t('duels.recent')}</SectionTitle>
          {!overview ? (
            <div className="h-40 animate-pulse rounded-card bg-surface" />
          ) : overview.recent.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted">{t('duels.noRecent')}</Card>
          ) : (
            <Card padding="p-0" className="divide-y divide-line overflow-hidden">
              {overview.recent.map((duel) => (
                <button
                  key={duel.id}
                  type="button"
                  onClick={() => navigate(`/duel/${duel.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                >
                  {duel.opponent ? (
                    <PersonAvatar user={duel.opponent} size={32} />
                  ) : (
                    <span className="grid size-8 place-items-center rounded-full bg-accent-2/15 text-accent-2">
                      <Bot className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    {duel.opponent ? <PersonName user={duel.opponent} /> : <span className="font-semibold">{t('duels.bot')}</span>}
                    <span className="block text-xs text-muted">
                      {t(`duels.kinds.${duel.kind}`)} · {duel.my_correct}:{duel.their_correct}
                    </span>
                  </span>
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold',
                      duel.outcome === 'win' ? 'bg-success/15 text-success' : duel.outcome === 'loss' ? 'bg-danger/15 text-danger' : 'bg-surface text-muted',
                    )}
                  >
                    {t(`duels.outcomeShort.${duel.outcome}`)}
                    {duel.rating_change !== null && ` ${duel.rating_change >= 0 ? '+' : ''}${duel.rating_change}`}
                  </span>
                </button>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionTitle>{t('duels.leaders')}</SectionTitle>
          {!overview ? (
            <div className="h-40 animate-pulse rounded-card bg-surface" />
          ) : overview.leaders.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted">{t('duels.noLeaders')}</Card>
          ) : (
            <Card padding="p-0" className="divide-y divide-line overflow-hidden">
              {overview.leaders.map((row, index) => (
                <div key={row.user.id} className={cx('flex items-center gap-3 px-4 py-2.5', row.me && 'bg-accent/8')}>
                  <span className="w-6 text-center text-sm font-bold text-subtle tabular-nums">{index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}</span>
                  <UserLine user={row.user} size={30} />
                  <span className="text-sm font-semibold tabular-nums">{row.rating}</span>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>

      <Card className="flex gap-3 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-2" />
        <p>{t('duels.rules')}</p>
      </Card>

      {challengeOpen && <ChallengeModal onClose={() => setChallengeOpen(false)} />}
    </div>
  )
}

function inviteLine(t: (key: string, options?: Record<string, unknown>) => string, stake: number, level: string) {
  return `${t(`duels.levels.${level}`)} · ${stake > 0 ? t('duels.stake', { coins: stake }) : t('duels.noStake')}`
}

function RatingCard({ overview }: { overview: DuelOverview | null }) {
  const { t } = useTranslation()
  const stats = overview?.stats
  return (
    <Card glow className="flex flex-col">
      <div className="flex items-center gap-3">
        <IconChip tone="accent" className="size-9">
          <Medal className="size-[1.1rem]" />
        </IconChip>
        <h3 className="font-display text-lg font-semibold">{t('duels.ratingTitle')}</h3>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="font-display text-5xl font-semibold tabular-nums">{stats?.rating ?? '—'}</span>
        {stats?.rank && <span className="mb-1.5 text-muted">#{stats.rank}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">
        {stats && stats.ranked_games > 0 ? t('duels.best', { rating: stats.best_rating }) : t('duels.unranked')}
      </p>
      <dl className="mt-auto grid grid-cols-3 gap-2 pt-5 text-center">
        {(['wins', 'losses', 'draws'] as const).map((key) => (
          <div key={key} className="rounded-control bg-surface px-2 py-2">
            <dt className="text-xs text-subtle">{t(`duels.${key}`)}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">{stats?.[key] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/** Ranked search (with the bot on offer while nobody turns up), practice and challenges. */
function PlayCard({ onChallenge }: { onChallenge: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searching, setSearching] = useState<number | null>(null)
  const [level, setLevel] = useState<DuelLevel>('mix')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const stopped = useRef(false)

  // While searching, ask every three seconds: that both keeps our place in the queue and picks up
  // a match someone else started with us.
  useEffect(() => {
    if (searching === null) return
    stopped.current = false
    const poll = async () => {
      try {
        const found = await duels.find()
        if (found && !stopped.current) navigate(`/duel/${found}`)
      } catch (error) {
        setSearching(null)
        toast(errorText(t, error), 'error')
      }
    }
    void poll()
    const polling = setInterval(() => void poll(), 3000)
    const ticking = setInterval(() => setTick((n) => n + 1), 1000)
    // Stopping, or leaving the page while searching, leaves the queue too.
    return () => {
      stopped.current = true
      clearInterval(polling)
      clearInterval(ticking)
      void duels.leaveQueue().catch(() => {})
    }
  }, [searching, navigate, t])

  function stop() {
    setSearching(null)
  }

  async function playBot() {
    setBusy(true)
    try {
      if (searching !== null) stop()
      navigate(`/duel/${await duels.vsBot(level)}`)
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const waited = searching === null ? 0 : Math.floor((Date.now() - searching) / 1000)

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2">
      <div>
        <h3 className="font-display text-lg font-semibold">{t('duels.playTitle')}</h3>
        <p className="mt-1 text-sm text-muted">{t('duels.playText')}</p>
      </div>

      {searching === null ? (
        <button type="button" className="btn btn-primary h-12" onClick={() => setSearching(Date.now())}>
          <Swords className="size-5" />
          {t('duels.findRanked')}
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-control border border-accent/30 bg-accent/10 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-accent" />
            <span className="flex-1 font-semibold">{t('duels.searching', { seconds: waited })}</span>
            <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={stop}>
              {t('duels.stopSearch')}
            </button>
          </div>
          {waited >= 20 && <p className="text-sm text-muted">{t('duels.nobodyYet')}</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-control border border-line bg-surface p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="size-4 text-accent-2" />
            {t('duels.practice')}
          </div>
          <p className="text-sm text-muted">{t('duels.practiceText')}</p>
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Select
              label={t('duels.level')}
              value={level}
              onChange={setLevel}
              options={DUEL_LEVELS.map((value) => ({ value, label: t(`duels.levels.${value}`) }))}
            />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void playBot()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : t('duels.play')}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-control border border-line bg-surface p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-accent" />
            {t('duels.challengeTitle')}
          </div>
          <p className="text-sm text-muted">{t('duels.challengeText')}</p>
          <button type="button" className="btn btn-secondary mt-auto" onClick={onChallenge}>
            <Coins className="size-4 text-coin" />
            {t('duels.challenge')}
          </button>
        </div>
      </div>
    </Card>
  )
}

/** Pick a friend (unless one is given), a stake and a level, and send the challenge. */
export function ChallengeModal({ friend, onClose }: { friend?: PublicCard; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const viewer = useViewer()
  const [friends, setFriends] = useState<FriendEntry[] | null>(null)
  const [chosen, setChosen] = useState<PublicCard | null>(friend ?? null)
  const [stake, setStake] = useState<number>(0)
  const [level, setLevel] = useState<DuelLevel>('mix')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (friend) return
    community
      .friends()
      .then((list) => setFriends(list.filter((entry) => entry.status === 'friend')))
      .catch(() => setFriends([]))
  }, [friend])

  async function send() {
    if (!chosen) return
    setBusy(true)
    try {
      const id = await duels.challenge(chosen.id, stake, level)
      onClose()
      navigate(`/duel/${id}`)
    } catch (error) {
      toast(errorText(t, error), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('duels.challengeTitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!chosen || busy} onClick={() => void send()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Swords className="size-4" />}
            {t('duels.sendChallenge')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {chosen ? (
          <div className="flex items-center gap-3 rounded-control border border-line bg-surface p-3">
            <UserLine user={chosen} />
            {!friend && (
              <button type="button" className="btn btn-ghost h-8 px-2 text-sm" onClick={() => setChosen(null)}>
                {t('duels.changeFriend')}
              </button>
            )}
          </div>
        ) : friends === null ? (
          <div className="h-24 animate-pulse rounded-control bg-surface" />
        ) : friends.length === 0 ? (
          <p className="rounded-control border border-line bg-surface p-4 text-sm text-muted">{t('duels.noFriends')}</p>
        ) : (
          <div className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-control border border-line">
            {friends.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                <UserLine user={entry.user} online={entry.online} onClick={() => setChosen(entry.user)} size={32} />
              </div>
            ))}
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold">{t('duels.stakeTitle')}</h4>
          <Segmented
            label={t('duels.stakeTitle')}
            value={String(stake)}
            onChange={(value) => setStake(Number(value))}
            options={STAKES.map((value) => ({ value: String(value), label: value === 0 ? t('duels.noStakeShort') : String(value) }))}
          />
          <p className="mt-2 text-xs text-subtle">{t('duels.stakeHint', { coins: viewer.coins })}</p>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">{t('duels.level')}</h4>
          <Select label={t('duels.level')} value={level} onChange={setLevel} options={DUEL_LEVELS.map((value) => ({ value, label: t(`duels.levels.${value}`) }))} />
        </div>

        {chosen && <StakeLine stake={stake} level={level} />}
      </div>
    </Modal>
  )
}

// ---------- Weekly tournament ----------

function TournamentCard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [busy, setBusy] = useState(false)
  const [bracketOpen, setBracketOpen] = useState(false)

  const load = useCallback(() => duels.tournament().then(setTournament).catch(() => {}), [])
  useEffect(() => {
    void load()
  }, [load])

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await action()
      toast(done, 'ok')
      await load()
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!tournament) return <div className="h-40 animate-pulse rounded-card bg-surface" />

  const me = tournament.players.find((player) => player.me)
  const myMatch = tournament.matches.find(
    (match) => match.round === tournament.current_round && match.duel_id && !match.winner,
  )
  const date = (iso: string | null) => (iso ? formatDateTime(iso, i18n.language) : '')

  return (
    <Card glow className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <IconChip tone="coin" className="size-10">
          <Trophy className="size-5" />
        </IconChip>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold">{t('duels.tournament.title')}</h3>
          <p className="text-sm text-muted">
            {tournament.status === 'registration'
              ? t('duels.tournament.registration', { date: date(tournament.registration_ends_at), count: tournament.players.length, max: TOURNAMENT_SIZE })
              : tournament.status === 'running'
                ? t('duels.tournament.running', { round: tournament.current_round, rounds: tournament.rounds ?? 0, date: date(tournament.round_ends_at) })
                : t('duels.tournament.finished')}
          </p>
        </div>
        {tournament.matches.length > 0 && (
          <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={() => setBracketOpen(true)}>
            {t('duels.tournament.bracket')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {TOURNAMENT_PRIZES.map((prize, index) => (
          <span key={prize} className="inline-flex items-center gap-1 rounded-full bg-coin/12 px-2.5 py-1 text-coin">
            {['🥇', '🥈', '🥉'][index]} {prize}
          </span>
        ))}
      </div>

      {tournament.status === 'registration' &&
        (tournament.joined ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-success">{t('duels.tournament.joined')}</p>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act(duels.leaveTournament, t('duels.tournament.left'))}>
              {t('duels.tournament.leave')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary self-start" disabled={busy} onClick={() => void act(duels.joinTournament, t('duels.tournament.joinedToast'))}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t('duels.tournament.join')}
          </button>
        ))}

      {tournament.status === 'running' && me && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface p-3">
          <p className="flex-1 text-sm">
            {me.eliminated_round
              ? t('duels.tournament.out', { round: me.eliminated_round })
              : myMatch
                ? t('duels.tournament.yourMatch', { round: tournament.current_round })
                : t('duels.tournament.through')}
          </p>
          {myMatch && !me.eliminated_round && (
            <button type="button" className="btn btn-primary h-9 px-3" onClick={() => navigate(`/duel/${myMatch.duel_id}`)}>
              <Swords className="size-4" />
              {t('duels.tournament.play')}
            </button>
          )}
        </div>
      )}

      {tournament.status === 'running' && !me && <p className="text-sm text-muted">{t('duels.tournament.notIn')}</p>}

      {(tournament.status === 'finished' ? podiumOf(tournament) : tournament.last?.podium ?? []).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted">
            {tournament.status === 'finished' ? t('duels.tournament.podium') : t('duels.tournament.lastPodium')}
          </h4>
          <div className="flex flex-col gap-2">
            {(tournament.status === 'finished' ? podiumOf(tournament) : tournament.last?.podium ?? []).map((row) => (
              <div key={row.user.id} className="flex items-center gap-3">
                <span className="w-6 text-center">{['🥇', '🥈', '🥉'][row.place - 1]}</span>
                <UserLine user={row.user} size={28} />
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-coin">
                  <Coins className="size-3.5" />
                  {row.prize}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bracketOpen && <BracketModal tournament={tournament} onClose={() => setBracketOpen(false)} />}
    </Card>
  )
}

function podiumOf(tournament: Tournament) {
  return tournament.players
    .filter((player) => player.place !== null && player.place <= 3)
    .sort((a, b) => (a.place ?? 9) - (b.place ?? 9))
    .map((player) => ({ user: player.user, place: player.place!, prize: player.prize }))
}

function BracketModal({ tournament, onClose }: { tournament: Tournament; onClose: () => void }) {
  const { t } = useTranslation()
  const cards = new Map(tournament.players.map((player) => [player.user.id, player.user]))
  const rounds = Array.from({ length: tournament.rounds ?? 0 }, (_, i) => i + 1)

  return (
    <Modal open onClose={onClose} title={t('duels.tournament.bracket')} wide>
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {rounds.map((round) => {
          const matches = tournament.matches.filter((match) => match.round === round)
          return (
            <div key={round} className="flex min-w-56 flex-col gap-3">
              <h4 className="text-sm font-semibold text-muted">
                {round === tournament.rounds ? t('duels.tournament.final') : t('duels.tournament.round', { round })}
              </h4>
              {matches.length === 0 ? (
                <p className="text-xs text-subtle">{t('duels.tournament.later')}</p>
              ) : (
                matches.map((match) => <BracketMatch key={match.slot} match={match} cards={cards} />)
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function BracketMatch({ match, cards }: { match: TournamentMatch; cards: Map<string, PublicCard> }) {
  const { t } = useTranslation()
  const row = (id: string | null, correct: number | null, done: boolean | null) => (
    <div className={cx('flex items-center gap-2 px-3 py-2 text-sm', id && match.winner === id && 'bg-success/10 font-semibold')}>
      {id && cards.get(id) ? <UserLine user={cards.get(id)!} size={22} /> : <span className="flex-1 text-subtle">{t('duels.tournament.bye')}</span>}
      {correct !== null && <span className="text-xs text-muted tabular-nums">{done ? correct : '…'}</span>}
    </div>
  )
  return (
    <div className="divide-y divide-line overflow-hidden rounded-control border border-line bg-surface">
      {row(match.a, match.a_correct, match.a_done)}
      {row(match.b, match.b_correct, match.b_done)}
    </div>
  )
}
