import { describe, expect, it } from 'vitest'
import { buildCrossword, buildWordSearch, letterWords, lineBetween, scramble, wordleMarks, type GameWord } from './games'

/** A repeatable random source, so failures can be replayed. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const WORDS = ['APPLE', 'BREAD', 'WATER', 'CHEESE', 'HORSE', 'TABLE', 'MORNING', 'TICKET', 'JOURNEY', 'SALARY'].map((word) => ({
  word,
  clue: word.toLowerCase(),
}))

describe('Wordle marks', () => {
  it('marks right places, letters elsewhere and misses', () => {
    expect(wordleMarks('CRANE', 'CHEAP')).toEqual(['hit', 'miss', 'near', 'miss', 'near'])
  })

  it('does not count a repeated letter twice', () => {
    expect(wordleMarks('LLAMA', 'HELLO')).toEqual(['near', 'near', 'miss', 'miss', 'miss'])
    expect(wordleMarks('APPLE', 'PAPER')).toEqual(['near', 'near', 'hit', 'miss', 'near'])
  })
})

describe('anagrams', () => {
  it('keeps the letters but changes the order', () => {
    const mixed = scramble('bread', seeded(1))
    expect(mixed).not.toBe('BREAD')
    expect([...mixed].sort().join('')).toBe('ABDER')
  })
})

describe('the crossword', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`fits its words together without clashes (seed ${seed})`, () => {
      const puzzle = buildCrossword(WORDS, 8, seeded(seed))
      expect(puzzle).not.toBeNull()
      const grid = new Map<string, string>()
      for (const entry of puzzle!.entries) {
        for (let i = 0; i < entry.word.length; i++) {
          const r = entry.dir === 'down' ? entry.row + i : entry.row
          const c = entry.dir === 'across' ? entry.col + i : entry.col
          expect(r).toBeLessThan(puzzle!.height)
          expect(c).toBeLessThan(puzzle!.width)
          const cell = `${r},${c}`
          if (grid.has(cell)) expect(grid.get(cell)).toBe(entry.word[i])
          grid.set(cell, entry.word[i]!)
        }
      }
      // Every word after the first crosses another one.
      const crossings = puzzle!.entries.filter((entry) =>
        puzzle!.entries.some((other) => other !== entry && other.dir !== entry.dir && crosses(entry, other)),
      )
      expect(crossings.length).toBe(puzzle!.entries.length)
      expect(puzzle!.entries.length).toBeGreaterThanOrEqual(4)
    })
  }
})

function crosses(a: { row: number; col: number; dir: string; word: string }, b: { row: number; col: number; dir: string; word: string }) {
  const across = a.dir === 'across' ? a : b
  const down = a.dir === 'across' ? b : a
  return down.col >= across.col && down.col < across.col + across.word.length && across.row >= down.row && across.row < down.row + down.word.length
}

describe('the word search', () => {
  it('hides each word in a straight line', () => {
    const puzzle = buildWordSearch(WORDS, 10, 7, seeded(7))
    expect(puzzle.words.length).toBeGreaterThanOrEqual(5)
    for (const hidden of puzzle.words) {
      expect(hidden.cells.map(([r, c]) => puzzle.grid[r]![c]).join('')).toBe(hidden.word)
      expect(lineBetween(hidden.cells[0]!, hidden.cells.at(-1)!)).toEqual(hidden.cells)
    }
    expect(puzzle.grid.every((row) => row.length === 10 && row.every((letter) => /^[A-Z]$/.test(letter)))).toBe(true)
  })

  it('knows a straight line from a crooked one', () => {
    expect(lineBetween([0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]])
    expect(lineBetween([3, 1], [3, 0])).toEqual([[3, 1], [3, 0]])
    expect(lineBetween([0, 0], [1, 2])).toBeNull()
  })
})

describe('words for letter games', () => {
  it('keeps single words of plain letters in the length range', () => {
    const words = ['apple', 'look at', "don't", 'TEA', 'apple', 'kitchen'].map(
      (word, i): GameWord => ({ id: String(i), word, translation: 'x', pronunciation: '', examples: '', explanation: '', category: '' }),
    )
    expect(letterWords(words, [3, 5]).map((w) => w.word)).toEqual(['apple', 'TEA'])
  })
})
