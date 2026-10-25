import { describe, expect, it } from 'vitest'
import { formatInterval, previewDue, Rating, review, State } from './srs'
import {
  buildQueue,
  checkTyped,
  gradeFor,
  inflectLike,
  makeBuilder,
  makeCloze,
  modesFor,
  normalize,
  pickDistractors,
  similarity,
  streakFrom,
  type StudyWord,
} from './study'

// Words in the shape of the real "English words" table.
const word = (id: string, overrides: Partial<StudyWord> = {}): StudyWord => ({
  id,
  word: id,
  translation: `${id}-uk`,
  pronunciation: '',
  examples: '',
  explanation: '',
  category: '⚙️ Actions',
  ...overrides,
})

const WEAR = word('wear', { translation: 'носити', examples: 'I am wearing a black T-shirt.', category: '👕 Clothes' })
const LOOK = word('look forward to', { examples: 'I look forward to the weekend.' })
const HAPPEN = word('happen', { examples: 'What is happening here?' })
const STAY = word('stay', { examples: 'I am staying in Salzburg this week.' })

describe('answer checking', () => {
  it('normalizes case, apostrophes and punctuation', () => {
    expect(normalize('  Don’t   STOP!! ')).toBe("don't stop")
  })

  it('forgives one typo in longer words only', () => {
    expect(checkTyped('Currently', 'currently')).toBe('exact')
    expect(checkTyped('curently', 'currently')).toBe('close')
    expect(checkTyped('cat', 'car')).toBe('wrong')
    expect(checkTyped('', 'car')).toBe('wrong')
  })

  it('measures similarity for pronunciation', () => {
    expect(similarity('look forward to', 'Look forward to.')).toBe(1)
    expect(similarity('weather', 'whether')).toBeGreaterThan(0.7)
    expect(similarity('cat', 'elephant')).toBeLessThan(0.3)
  })

  it('turns results into FSRS grades', () => {
    expect(gradeFor({ correct: false })).toBe(Rating.Again)
    expect(gradeFor({ correct: true, hinted: true })).toBe(Rating.Hard)
    expect(gradeFor({ correct: true, close: true })).toBe(Rating.Hard)
    expect(gradeFor({ correct: true })).toBe(Rating.Good)
  })
})

describe('cloze', () => {
  it('finds inflected single words and phrases in the examples', () => {
    expect(makeCloze(WEAR)).toMatchObject({ before: 'I am ', answer: 'wearing', after: ' a black T-shirt.' })
    expect(makeCloze(HAPPEN)?.answer).toBe('happening')
    expect(makeCloze(STAY)?.answer).toBe('staying')
    expect(makeCloze(LOOK)?.answer).toBe('look forward to')
  })

  it('gives up when the word is not in any example', () => {
    expect(makeCloze(word('go', { examples: 'She went home early.' }))).toBeNull()
    expect(makeCloze(word('go'))).toBeNull()
  })
})

describe('inflectLike', () => {
  it('copies the ending of the answer onto other words', () => {
    expect(inflectLike('waiting', 'wait', 'stay')).toBe('staying')
    expect(inflectLike('waiting', 'wait', 'wear')).toBe('wearing')
    expect(inflectLike('making', 'make', 'happen')).toBe('happening')
    expect(inflectLike('stayed', 'stay', 'move')).toBe('moved')
    expect(inflectLike('waits', 'wait', 'watch')).toBe('watches')
    expect(inflectLike('Currently', 'currently', 'often')).toBe('Often')
    expect(inflectLike('wait', 'wait', 'stay')).toBe('stay')
  })
})

describe('sentence builder', () => {
  it('shuffles the words of a short example but never keeps them in order', () => {
    const fixed = () => 0.99 // a "random" that would keep the order
    const builder = makeBuilder(WEAR, fixed)!
    expect(builder.tokens).toEqual(['I', 'am', 'wearing', 'a', 'black', 'T-shirt.'])
    expect(builder.shuffled.join(' ')).not.toBe(builder.tokens.join(' '))
    expect([...builder.shuffled].sort()).toEqual([...builder.tokens].sort())
  })
})

describe('distractors', () => {
  it('are unique, never the answer, and prefer the same category', () => {
    const pool = [
      WEAR,
      word('shirt', { translation: 'сорочка', category: '👕 Clothes' }),
      word('coat', { translation: 'пальто', category: '👕 Clothes' }),
      word('run', { translation: 'бігти' }),
      word('walk', { translation: 'носити' }), // same translation as the answer
      word('jump', { translation: 'стрибати' }),
    ]
    const options = pickDistractors(WEAR, pool, 3, (w) => w.translation)
    expect(options).toHaveLength(3)
    expect(new Set(options).size).toBe(3)
    expect(options).not.toContain('носити')
    expect(options.slice(0, 2).sort()).toEqual(['пальто', 'сорочка'])
  })
})

describe('modes', () => {
  it('offers only the modes a word can support', () => {
    const plain = modesFor(word('alone', { examples: '' }), { speech: false, recognition: false, categories: 1 })
    expect(plain).toEqual(['cards', 'choice', 'typing'])
    const rich = modesFor(WEAR, { speech: true, recognition: true, categories: 5 })
    expect(rich).toEqual(['cards', 'choice', 'typing', 'cloze', 'builder', 'listening', 'dictation', 'speaking', 'sorting'])
  })
})

describe('queue', () => {
  const now = new Date('2026-10-25T12:00:00Z')
  const progressRow = (id: string, due: string) => ({
    word_id: id,
    due,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: State.Review,
    last_review: '2026-10-20T10:00:00Z',
  })

  it('takes due words, then new ones up to the limit', () => {
    const words = ['a', 'b', 'c', 'd', 'e'].map((id) => word(id))
    const progress = new Map([
      ['a', progressRow('a', '2026-10-24T00:00:00Z')],
      ['b', progressRow('b', '2026-11-30T00:00:00Z')],
    ])
    const queue = buildQueue(words, progress, { size: 10, newLimit: 2, now })
    expect(queue.filter((q) => !q.isNew).map((q) => q.word.id)).toEqual(['a'])
    expect(queue.filter((q) => q.isNew)).toHaveLength(2)
    expect(queue.map((q) => q.word.id)).not.toContain('b')
  })

  it('tops up with practice words when asked', () => {
    const words = ['a', 'b'].map((id) => word(id))
    const progress = new Map([['b', progressRow('b', '2026-11-30T00:00:00Z')]])
    const queue = buildQueue(words, progress, { size: 5, newLimit: 0, now, practice: true })
    expect(queue.map((q) => q.word.id)).toEqual(['b'])
  })
})

describe('FSRS', () => {
  const now = new Date('2026-10-25T12:00:00Z')

  it('moves a new word into learning and spaces it out when remembered', () => {
    const first = review('w', undefined, Rating.Good, now)
    expect(first.state).not.toBe(State.New)
    expect(first.reps).toBe(1)

    const later = new Date(first.due)
    const second = review('w', first, Rating.Good, later)
    expect(new Date(second.due).getTime()).toBeGreaterThan(new Date(first.due).getTime())
  })

  it('brings a forgotten word back soon and orders the previews', () => {
    const preview = previewDue(undefined, now)
    expect(preview[Rating.Again].getTime()).toBeLessThanOrEqual(preview[Rating.Hard].getTime())
    expect(preview[Rating.Good].getTime()).toBeLessThanOrEqual(preview[Rating.Easy].getTime())
  })

  it('formats intervals compactly', () => {
    expect(formatInterval(now, new Date(now.getTime() + 20_000), 'en')).toMatch(/^<1/)
    expect(formatInterval(now, new Date(now.getTime() + 10 * 60_000), 'en')).toMatch(/10/)
    expect(formatInterval(now, new Date(now.getTime() + 4 * 86_400_000), 'en')).toMatch(/4/)
  })
})

describe('streak', () => {
  it('counts back from today, or from yesterday if today is empty', () => {
    expect(streakFrom(['2026-10-25', '2026-10-24', '2026-10-22'], '2026-10-25')).toBe(2)
    expect(streakFrom(['2026-10-24', '2026-10-23'], '2026-10-25')).toBe(2)
    expect(streakFrom(['2026-10-20'], '2026-10-25')).toBe(0)
  })
})
