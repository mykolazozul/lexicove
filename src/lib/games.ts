// Word games: pure helpers (puzzle generators, Wordle marks), the word pool and best scores.
// Games are free practice: they never touch the spaced-repetition schedule or the economy, so
// nothing here has to be trusted by the server. Best scores stay on the device.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { shuffle, type StudyWord } from './study'
import { supabase } from './supabase'

export type GameId = 'pairs' | 'speed' | 'rain' | 'balloons' | 'wordle' | 'crossword' | 'search' | 'anagrams' | 'truefalse'

export type GameMeta = {
  id: GameId
  emoji: string
  /** Whether a bigger score is better (points) or a smaller one (seconds). */
  better: 'higher' | 'lower'
  /** Words the game needs before it can start. */
  needs: number
  /** Only single words of plain letters, in this length range. */
  letters?: [number, number]
}

export const GAMES: GameMeta[] = [
  { id: 'pairs', emoji: '🧩', better: 'lower', needs: 6 },
  { id: 'speed', emoji: '⚡', better: 'higher', needs: 4 },
  { id: 'rain', emoji: '🌧️', better: 'higher', needs: 6 },
  { id: 'balloons', emoji: '🎈', better: 'higher', needs: 3, letters: [3, 12] },
  { id: 'wordle', emoji: '🟩', better: 'higher', needs: 1, letters: [5, 5] },
  { id: 'crossword', emoji: '✏️', better: 'lower', needs: 6, letters: [3, 10] },
  { id: 'search', emoji: '🔎', better: 'lower', needs: 6, letters: [3, 9] },
  { id: 'anagrams', emoji: '🔤', better: 'higher', needs: 5, letters: [3, 10] },
  { id: 'truefalse', emoji: '✅', better: 'higher', needs: 4 },
]

export function gameMeta(id: string): GameMeta | undefined {
  return GAMES.find((game) => game.id === id)
}

/** "42 points" or "95 seconds", by how the game is scored. */
export function formatScore(game: GameMeta, score: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  return game.better === 'lower' ? t('games.seconds', { count: score }) : t('games.points', { count: score })
}

export type GameWord = StudyWord

/** Words that are a single run of English letters, upper-cased, within the length range. */
export function letterWords(words: readonly GameWord[], [min, max]: [number, number]): GameWord[] {
  const seen = new Set<string>()
  return words.filter((word) => {
    const text = word.word.trim().toUpperCase()
    if (!/^[A-Z]+$/.test(text) || text.length < min || text.length > max || seen.has(text) || !word.translation.trim()) return false
    seen.add(text)
    return true
  })
}

/** The words a game can use from a pool. */
export function playable(game: GameMeta, words: readonly GameWord[]): GameWord[] {
  const withTranslation = words.filter((word) => word.word.trim() && word.translation.trim())
  return game.letters ? letterWords(withTranslation, game.letters) : withTranslation
}

// ---------- the word pool ----------

export type DeckLevel = 'mix' | 'a1' | 'a2' | 'b1' | 'b2'
export const DECK_LEVELS: DeckLevel[] = ['mix', 'a1', 'a2', 'b1', 'b2']

let deckCache: GameWord[] | null = null

/** The starter decks, readable without an account, so guests can play too. */
export async function loadDeckWords(level: DeckLevel): Promise<GameWord[]> {
  if (!deckCache) {
    if (!supabase) return []
    const { data, error } = await supabase.from('deck_words').select('id, deck, word, translation, pronunciation, example, category').order('deck').order('sort')
    if (error) throw error
    deckCache = (data ?? []).map((row) => ({
      id: `deck-${row.id}`,
      word: row.word as string,
      translation: row.translation as string,
      pronunciation: row.pronunciation as string,
      examples: row.example as string,
      explanation: '',
      category: row.category as string,
      deck: row.deck as string,
    })) as Array<GameWord & { deck: string }>
  }
  return level === 'mix' ? deckCache : (deckCache as Array<GameWord & { deck: string }>).filter((word) => word.deck === level)
}

// ---------- settings and best scores ----------

type GamesState = {
  source: 'mine' | 'deck'
  level: DeckLevel
  best: Partial<Record<GameId, number>>
  setSource: (source: 'mine' | 'deck') => void
  setLevel: (level: DeckLevel) => void
  /** Saves a score; true when it beats the best so far. */
  record: (game: GameId, score: number) => boolean
}

export const useGames = create<GamesState>()(
  persist(
    (set, get) => ({
      source: 'mine',
      level: 'mix',
      best: {},
      setSource: (source) => set({ source }),
      setLevel: (level) => set({ level }),
      record: (game, score) => {
        const meta = gameMeta(game)
        const previous = get().best[game]
        const better = previous === undefined || (meta?.better === 'lower' ? score < previous : score > previous)
        if (better) set({ best: { ...get().best, [game]: score } })
        return better
      },
    }),
    {
      name: 'lexicove-games',
      version: 1,
      // Balloons took the place of the old letter-guessing game; its best score carries over.
      migrate: (state, version) => {
        const saved = state as { best?: Record<string, number> }
        if (version < 1 && saved.best && 'hangman' in saved.best) {
          const { hangman, ...rest } = saved.best
          saved.best = { ...rest, balloons: hangman }
        }
        return saved as GamesState
      },
    },
  ),
)

// ---------- Wordle ----------

export type Mark = 'hit' | 'near' | 'miss'

/** Green for the right letter in the right place, yellow for a letter that is elsewhere, counting repeats. */
export function wordleMarks(guess: string, answer: string): Mark[] {
  const g = guess.toUpperCase()
  const a = answer.toUpperCase()
  const marks: Mark[] = Array.from({ length: g.length }, () => 'miss')
  const left = new Map<string, number>()
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) marks[i] = 'hit'
    else left.set(a[i]!, (left.get(a[i]!) ?? 0) + 1)
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'hit') continue
    const count = left.get(g[i]!) ?? 0
    if (count > 0) {
      marks[i] = 'near'
      left.set(g[i]!, count - 1)
    }
  }
  return marks
}

// ---------- Anagrams ----------

/** The letters of a word in a new order (never the original one, when there is another). */
export function scramble(word: string, random = Math.random): string {
  const letters = word.toUpperCase().split('')
  if (new Set(letters).size < 2) return letters.join('')
  for (let i = 0; i < 20; i++) {
    const mixed = shuffle(letters, random).join('')
    if (mixed !== word.toUpperCase()) return mixed
  }
  return [...letters].reverse().join('')
}

// ---------- Crossword ----------

export type Direction = 'across' | 'down'
export type CrosswordEntry = { word: string; clue: string; row: number; col: number; dir: Direction; number: number }
export type Crossword = { width: number; height: number; entries: CrosswordEntry[] }

const key = (row: number, col: number) => `${row},${col}`

/**
 * A small crossword from the words: each new word crosses one already placed, with no two words
 * touching side by side. Tries a few orders and keeps the fullest grid.
 */
export function buildCrossword(words: ReadonlyArray<{ word: string; clue: string }>, max = 8, random = Math.random): Crossword | null {
  let best: Array<Omit<CrosswordEntry, 'number'>> = []
  const pool = words
    .map((w) => ({ word: w.word.trim().toUpperCase(), clue: w.clue }))
    .filter((w, i, all) => /^[A-Z]{3,12}$/.test(w.word) && all.findIndex((o) => o.word === w.word) === i)

  for (let attempt = 0; attempt < 25 && best.length < max; attempt++) {
    const order = shuffle(pool, random)
    // A longer word in the middle gives the others more to hang on.
    order.sort((a, b) => b.word.length - a.word.length)
    const head = order.slice(0, 3)
    const rest = shuffle(order.slice(3), random)
    const placed = place([...shuffle(head, random), ...rest], max)
    if (placed.length > best.length) best = placed
  }
  if (best.length < 3) return null

  const minRow = Math.min(...best.map((e) => e.row))
  const minCol = Math.min(...best.map((e) => e.col))
  const shifted = best.map((e) => ({ ...e, row: e.row - minRow, col: e.col - minCol }))
  const width = Math.max(...shifted.map((e) => e.col + (e.dir === 'across' ? e.word.length : 1)))
  const height = Math.max(...shifted.map((e) => e.row + (e.dir === 'down' ? e.word.length : 1)))

  // Numbers go in reading order; words starting on the same square share one.
  const starts = [...new Set(shifted.map((e) => key(e.row, e.col)))].sort((a, b) => {
    const [ar, ac] = a.split(',').map(Number)
    const [br, bc] = b.split(',').map(Number)
    return ar! - br! || ac! - bc!
  })
  const entries = shifted.map((e) => ({ ...e, number: starts.indexOf(key(e.row, e.col)) + 1 }))
  return { width, height, entries }
}

function place(order: ReadonlyArray<{ word: string; clue: string }>, max: number): Array<Omit<CrosswordEntry, 'number'>> {
  const cells = new Map<string, { letter: string; dirs: Set<Direction> }>()
  const placed: Array<Omit<CrosswordEntry, 'number'>> = []

  const put = (word: string, clue: string, row: number, col: number, dir: Direction) => {
    for (let i = 0; i < word.length; i++) {
      const r = dir === 'down' ? row + i : row
      const c = dir === 'across' ? col + i : col
      const cell = cells.get(key(r, c)) ?? { letter: word[i]!, dirs: new Set<Direction>() }
      cell.dirs.add(dir)
      cells.set(key(r, c), cell)
    }
    placed.push({ word, clue, row, col, dir })
  }

  const fits = (word: string, row: number, col: number, dir: Direction): number => {
    const dr = dir === 'down' ? 1 : 0
    const dc = dir === 'across' ? 1 : 0
    // Nothing right before or after the word.
    if (cells.has(key(row - dr, col - dc)) || cells.has(key(row + dr * word.length, col + dc * word.length))) return -1
    let crossings = 0
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i
      const c = col + dc * i
      const cell = cells.get(key(r, c))
      if (cell) {
        if (cell.letter !== word[i] || cell.dirs.has(dir)) return -1
        crossings++
      } else {
        // A new letter mustn't sit beside another word.
        if (cells.has(key(r + dc, c + dr)) || cells.has(key(r - dc, c - dr))) return -1
      }
    }
    return crossings
  }

  for (const { word, clue } of order) {
    if (placed.length >= max) break
    if (placed.length === 0) {
      put(word, clue, 0, 0, 'across')
      continue
    }
    let choice: { row: number; col: number; dir: Direction; crossings: number } | null = null
    for (const [cellKey, cell] of cells) {
      const [r, c] = cellKey.split(',').map(Number) as [number, number]
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== cell.letter) continue
        for (const dir of ['across', 'down'] as const) {
          if (cell.dirs.has(dir)) continue
          const row = dir === 'down' ? r - i : r
          const col = dir === 'across' ? c - i : c
          const crossings = fits(word, row, col, dir)
          if (crossings > 0 && (!choice || crossings > choice.crossings)) choice = { row, col, dir, crossings }
        }
      }
    }
    if (choice) put(word, clue, choice.row, choice.col, choice.dir)
  }
  return placed
}

// ---------- Word search ----------

export type SearchWord = { word: string; clue: string; cells: Array<[number, number]> }
export type WordSearch = { size: number; grid: string[][]; words: SearchWord[] }

const SEARCH_DIRECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
]

/** A square of letters hiding the words left to right, top to bottom or diagonally. */
export function buildWordSearch(words: ReadonlyArray<{ word: string; clue: string }>, size = 10, count = 7, random = Math.random): WordSearch {
  const grid: Array<Array<string | null>> = Array.from({ length: size }, () => Array.from({ length: size }, () => null))
  const placed: SearchWord[] = []
  const pool = shuffle(
    words.map((w) => ({ word: w.word.trim().toUpperCase(), clue: w.clue })).filter((w) => /^[A-Z]+$/.test(w.word) && w.word.length >= 3 && w.word.length <= size),
    random,
  )

  for (const { word, clue } of pool) {
    if (placed.length >= count) break
    if (placed.some((p) => p.word === word)) continue
    for (let attempt = 0; attempt < 150; attempt++) {
      const [dr, dc] = SEARCH_DIRECTIONS[Math.floor(random() * SEARCH_DIRECTIONS.length)]!
      const row = Math.floor(random() * size)
      const col = Math.floor(random() * size)
      const endRow = row + dr * (word.length - 1)
      const endCol = col + dc * (word.length - 1)
      if (endRow < 0 || endRow >= size || endCol >= size) continue
      const cells: Array<[number, number]> = Array.from({ length: word.length }, (_, i) => [row + dr * i, col + dc * i])
      if (cells.some(([r, c], i) => grid[r]![c] !== null && grid[r]![c] !== word[i])) continue
      cells.forEach(([r, c], i) => (grid[r]![c] = word[i]!))
      placed.push({ word, clue, cells })
      break
    }
  }

  const alphabet = 'ABCDEFGHIJKLMNOPRSTUVWY'
  const filled = grid.map((row) => row.map((letter) => letter ?? alphabet[Math.floor(random() * alphabet.length)]!))
  return { size, grid: filled, words: placed }
}

/** The cells of a straight line between two cells, or null when they aren't in a line. */
export function lineBetween(from: [number, number], to: [number, number]): Array<[number, number]> | null {
  const dr = Math.sign(to[0] - from[0])
  const dc = Math.sign(to[1] - from[1])
  const rows = Math.abs(to[0] - from[0])
  const cols = Math.abs(to[1] - from[1])
  if (rows !== 0 && cols !== 0 && rows !== cols) return null
  const length = Math.max(rows, cols) + 1
  return Array.from({ length }, (_, i) => [from[0] + dr * i, from[1] + dc * i])
}
