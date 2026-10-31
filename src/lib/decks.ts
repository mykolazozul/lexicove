// Ready-made word lists from A1 to B2. The words live in the database (deck_words), so duels can
// draw on the same pool; adding a deck copies its words into the user's own list on the server.

import type { ChipTone } from '../components/ui'
import { supabase } from './supabase'

export const DECKS = [
  { id: 'a1', emoji: '🌱', tone: 'success' },
  { id: 'a2', emoji: '🌿', tone: 'accent-2' },
  { id: 'b1', emoji: '🌳', tone: 'accent' },
  { id: 'b2', emoji: '🏔️', tone: 'fire' },
] as const satisfies ReadonlyArray<{ id: string; emoji: string; tone: ChipTone }>

export type DeckId = (typeof DECKS)[number]['id']
export type DeckInfo = { deck: DeckId; count: number; added: number; sample: string[] }

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function fetchDecks(): Promise<DeckInfo[]> {
  const { data, error } = await client().rpc('starter_decks')
  if (error) throw error
  return (data ?? []) as DeckInfo[]
}

/** Adds the deck's words the user doesn't have yet and says how many that was. */
export async function addDeck(deck: DeckId, toNotion: boolean): Promise<number> {
  const { data, error } = await client().rpc('add_starter_deck', { p_deck: deck, p_to_notion: toNotion })
  if (error) throw error
  return data as number
}
