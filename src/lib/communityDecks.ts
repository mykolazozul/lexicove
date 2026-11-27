// Community decks: word lists people share for others to copy into their own words and Notion
// (supabase/migrations/20261127100000_community_decks.sql). Guests can browse; the rest needs an
// account.

import type { PublicCard } from './community'
import { supabase } from './supabase'

export const DECK_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'mixed'] as const
export type DeckLevel = (typeof DECK_LEVELS)[number]
export type DeckSort = 'top' | 'new' | 'mine'

export type CommunityDeck = {
  id: string
  title: string
  description: string
  level: DeckLevel
  word_count: number
  likes: number
  copies: number
  hidden: boolean
  created_at: string
  mine: boolean
  liked: boolean
  copied: boolean
  owner: PublicCard | null
  sample: string[]
}

export type DeckWord = { word: string; translation: string; pronunciation: string; example: string }
export type CommunityDeckFull = CommunityDeck & { words: DeckWord[]; can_moderate: boolean }

/** Server refusals the app explains in words; anything else is a generic error. */
export const DECK_ERRORS = ['sign_in_first', 'restricted', 'bad_text', 'bad_words', 'bad_level', 'word_count', 'too_many', 'not_found', 'not_allowed'] as const
export type DeckError = (typeof DECK_ERRORS)[number]

export class DeckRpcError extends Error {
  constructor(readonly code: DeckError | 'unknown') {
    super(code)
  }
}

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new DeckRpcError('unknown')
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const code = DECK_ERRORS.find((known) => error.message.includes(known))
    throw new DeckRpcError(code ?? 'unknown')
  }
  return data as T
}

export const communityDecks = {
  list: (sort: DeckSort, level: DeckLevel | null, search: string, offset = 0) =>
    call<CommunityDeck[]>('community_decks_list', {
      p_sort: sort,
      p_level: level,
      p_search: search.trim() || null,
      p_limit: 30,
      p_offset: offset,
    }),
  get: (id: string) => call<CommunityDeckFull>('community_deck', { p_id: id }),
  publish: (title: string, description: string, level: DeckLevel, wordIds: string[]) =>
    call<string>('community_deck_publish', { p_title: title, p_description: description, p_level: level, p_word_ids: wordIds }),
  update: (id: string, title: string, description: string, level: DeckLevel) =>
    call<void>('community_deck_update', { p_id: id, p_title: title, p_description: description, p_level: level }),
  remove: (id: string) => call<void>('community_deck_delete', { p_id: id }),
  like: (id: string, on: boolean) => call<number>('community_deck_like', { p_id: id, p_on: on }),
  copy: (id: string, toNotion: boolean) => call<number>('community_deck_copy', { p_id: id, p_to_notion: toNotion }),
  hide: (id: string, hidden: boolean) => call<void>('community_deck_hide', { p_id: id, p_hidden: hidden }),
}

/** Publishing rules the form checks before asking the server (which checks them again). */
export const PUBLISH_LIMITS = { titleMin: 3, titleMax: 60, descriptionMax: 300, wordsMin: 5, wordsMax: 300 } as const

export function publishProblem(title: string, description: string, count: number): 'title' | 'description' | 'few' | 'many' | null {
  const length = title.trim().length
  if (length < PUBLISH_LIMITS.titleMin || length > PUBLISH_LIMITS.titleMax) return 'title'
  if (description.trim().length > PUBLISH_LIMITS.descriptionMax) return 'description'
  if (count < PUBLISH_LIMITS.wordsMin) return 'few'
  if (count > PUBLISH_LIMITS.wordsMax) return 'many'
  return null
}
