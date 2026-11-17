// Duels, the rating and weekly tournaments. Questions, answers, timing and coins all live in
// database functions (supabase/migrations/*_duels.sql); the app only shows what they return and
// never sees a right answer before it has sent its own.

import { CommunityError, type PublicCard } from './community'
import { supabase } from './supabase'

export type DuelLevel = 'mix' | 'a1' | 'a2' | 'b1' | 'b2'
export const DUEL_LEVELS: DuelLevel[] = ['mix', 'a1', 'a2', 'b1', 'b2']
export const STAKES = [0, 10, 25, 50, 100] as const
export const QUESTIONS = 10
export const SECONDS_PER_QUESTION = 15

export type DuelKind = 'ranked' | 'friendly' | 'bot' | 'tournament'
export type DuelStatus = 'waiting' | 'active' | 'finished' | 'cancelled' | 'declined' | 'expired'
export type Outcome = 'win' | 'loss' | 'draw'

export type DuelSide = {
  user: PublicCard | null
  answered: number
  correct: number
  time_ms: number
  rating: number | null
  /** Tournament duels only: whether this player has started their run. */
  started?: boolean | null
}

export type DuelQuestion = {
  idx: number
  prompt: string
  options: string[]
  direction: 'en_uk' | 'uk_en'
  /** Known once this question is answered, or after the duel. */
  answer: number | null
}

export type DuelState = {
  id: string
  kind: DuelKind
  status: DuelStatus
  level: DuelLevel
  stake: number
  side: 'a' | 'b'
  now: string
  created_at: string
  /** When the caller's clock starts and runs out. */
  starts_at: string | null
  ends_at: string | null
  round_ends_at: string | null
  outcome: Outcome | null
  rating_change: number | null
  me: DuelSide
  opponent: DuelSide
  bot_plan: Array<{ ms: number; correct: boolean }> | null
  questions: DuelQuestion[] | null
  my_answers: Array<{ idx: number; choice: number; correct: boolean }>
  rematch_of: string | null
}

export type DuelInvite = { id: string; user: PublicCard; stake: number; level: DuelLevel; created_at: string; rematch?: boolean }

export type DuelSummary = {
  id: string
  kind: DuelKind
  stake: number
  finished_at: string
  opponent: PublicCard | null
  outcome: Outcome
  my_correct: number
  their_correct: number
  rating_change: number | null
}

export type DuelOverview = {
  stats: {
    rating: number
    best_rating: number
    ranked_games: number
    wins: number
    losses: number
    draws: number
    tournament_wins: number
    rank: number | null
  }
  queued: boolean
  active: string | null
  incoming: DuelInvite[]
  outgoing: DuelInvite[]
  recent: DuelSummary[]
  leaders: Array<{ user: PublicCard; rating: number; wins: number; me: boolean }>
}

export type TournamentMatch = {
  round: number
  slot: number
  a: string | null
  b: string | null
  winner: string | null
  /** Only for the caller's own matches. */
  duel_id: string | null
  a_correct: number | null
  b_correct: number | null
  a_done: boolean | null
  b_done: boolean | null
}

export type Tournament = {
  id: string
  week_start: string
  status: 'registration' | 'running' | 'finished'
  registration_ends_at: string
  ends_at: string
  rounds: number | null
  current_round: number
  round_ends_at: string | null
  now: string
  joined: boolean
  players: Array<{
    user: PublicCard
    rating: number
    seed: number | null
    place: number | null
    prize: number
    eliminated_round: number | null
    me: boolean
  }>
  matches: TournamentMatch[]
  last: { week_start: string; podium: Array<{ user: PublicCard; place: number; prize: number }> } | null
}

export const TOURNAMENT_PRIZES = [300, 150, 75] as const
export const TOURNAMENT_SIZE = 64

const CODES = [
  'sign_in_first', 'banned', 'too_many_duels', 'already_in_duel', 'not_enough_coins', 'opponent_not_enough_coins',
  'friends_only', 'bad_opponent', 'bad_stake', 'bad_level', 'too_many_invites', 'no_such_invite', 'invite_expired',
  'no_such_duel', 'duel_not_active', 'duel_not_started', 'duel_time_up', 'wrong_question', 'registration_closed',
  'tournament_full',
]

function client() {
  if (!supabase) throw new CommunityError('offline')
  return supabase
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new CommunityError(CODES.find((known) => error.message === known) ?? 'unknown')
  return data as T
}

export const duels = {
  overview: () => rpc<DuelOverview>('duel_overview'),
  state: (id: string) => rpc<DuelState>('duel_state', { p_duel: id }),
  /** Ranked matchmaking: the duel once there's an opponent, null while still in the queue. */
  find: () => rpc<string | null>('duel_find'),
  leaveQueue: () => rpc<void>('duel_leave_queue'),
  vsBot: (level: DuelLevel) => rpc<string>('duel_vs_bot', { p_level: level }),
  challenge: (userId: string, stake: number, level: DuelLevel) =>
    rpc<string>('duel_challenge', { p_user: userId, p_stake: stake, p_level: level }),
  respond: (id: string, accept: boolean) => rpc<void>('duel_respond', { p_duel: id, p_accept: accept }),
  cancel: (id: string) => rpc<void>('duel_cancel', { p_duel: id }),
  rematch: (id: string) => rpc<string>('duel_rematch', { p_duel: id }),
  /** Starts the caller's own run in a tournament duel. */
  begin: (id: string) => rpc<void>('duel_begin', { p_duel: id }),
  answer: (id: string, idx: number, choice: number) =>
    rpc<{ correct: boolean; answer: number }>('duel_answer', { p_duel: id, p_idx: idx, p_choice: choice }),
  tournament: () => rpc<Tournament>('tournament_bracket'),
  joinTournament: () => rpc<void>('tournament_join'),
  leaveTournament: () => rpc<void>('tournament_leave'),

  /** Changes to one duel: the opponent's progress, the start and the result. */
  watch(id: string, onChange: () => void): () => void {
    if (!supabase) return () => {}
    const channel = supabase
      .channel(`duel:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duels', filter: `id=eq.${id}` }, onChange)
      .subscribe()
    return () => void supabase?.removeChannel(channel)
  },

  /** New duels involving the user: invites to them, and matches the queue found for them. */
  watchMine(userId: string, onInsert: (duel: { id: string; kind: DuelKind; status: DuelStatus; player_a: string; player_b: string | null }) => void): () => void {
    if (!supabase) return () => {}
    const handler = (payload: { new: Record<string, unknown> }) => onInsert(payload.new as Parameters<typeof onInsert>[0])
    const channel = supabase
      .channel(`duels-for:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'duels', filter: `player_b=eq.${userId}` }, handler)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'duels', filter: `player_a=eq.${userId}` }, handler)
      .subscribe()
    return () => void supabase?.removeChannel(channel)
  },
}

/** How far the bot has got by a moment in the duel, from the run it decided at the start. */
export function botProgress(plan: Array<{ ms: number; correct: boolean }> | null, elapsedMs: number): { answered: number; correct: number } {
  let answered = 0
  let correct = 0
  let at = 0
  for (const step of plan ?? []) {
    at += step.ms
    if (at > elapsedMs) break
    answered++
    if (step.correct) correct++
  }
  return { answered, correct }
}
