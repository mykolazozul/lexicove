import { Rating, type Grade, type ProgressRow } from './srs'

// Pure helpers behind the learning modes: answer checking, question building and the
// order in which words come up. Kept free of React and I/O so they are easy to test.

export type StudyWord = {
  id: string
  word: string
  translation: string
  pronunciation: string
  examples: string
  explanation: string
  category: string
}

export type WordMode = 'cards' | 'choice' | 'typing' | 'cloze' | 'builder' | 'listening' | 'dictation' | 'speaking' | 'sorting'
export type Mode = WordMode | 'rules' | 'mix'

export const WORD_MODES: WordMode[] = ['cards', 'choice', 'typing', 'cloze', 'builder', 'listening', 'dictation', 'speaking', 'sorting']

// ---------- answer checking ----------

/** Lower-case, unify apostrophes and dashes, drop other punctuation, collapse spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/[^\p{L}\p{N}'\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost)
    }
    previous = current
  }
  return previous[b.length]!
}

/** 1 for identical text, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const x = normalize(a)
  const y = normalize(b)
  const longest = Math.max(x.length, y.length)
  return longest === 0 ? 1 : 1 - levenshtein(x, y) / longest
}

export type TypedResult = 'exact' | 'close' | 'wrong'

/** A single typo is forgiven in longer words, two in very long phrases. */
export function checkTyped(answer: string, target: string): TypedResult {
  const a = normalize(answer)
  const t = normalize(target)
  if (!a) return 'wrong'
  if (a === t) return 'exact'
  const allowed = t.length >= 12 ? 2 : t.length >= 5 ? 1 : 0
  return levenshtein(a, t) <= allowed ? 'close' : 'wrong'
}

/** Wrong is "again", a hint or a typo is "hard", a clean answer is "good". */
export function gradeFor(result: { correct: boolean; hinted?: boolean; close?: boolean }): Grade {
  if (!result.correct) return Rating.Again
  if (result.hinted || result.close) return Rating.Hard
  return Rating.Good
}

// ---------- randomness ----------

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * Wrong options for a multiple-choice question: distinct from the answer and each other,
 * preferring words from the same category so the choice isn't obvious.
 */
export function pickDistractors(
  target: StudyWord,
  pool: readonly StudyWord[],
  count: number,
  value: (word: StudyWord) => string,
  random = Math.random,
): string[] {
  const answer = normalize(value(target))
  const seen = new Set([answer])
  const sameCategory = shuffle(pool.filter((w) => w.id !== target.id && w.category && w.category === target.category), random)
  const others = shuffle(pool.filter((w) => w.id !== target.id && w.category !== target.category), random)
  const picked: string[] = []
  for (const word of [...sameCategory, ...others]) {
    const text = value(word).trim()
    const key = normalize(text)
    if (!text || seen.has(key)) continue
    seen.add(key)
    picked.push(text)
    if (picked.length === count) break
  }
  return picked
}

// ---------- example sentences ----------

/** Splits the Examples field into sentences (new lines or sentence ends). */
export function sentencesOf(examples: string): string[] {
  return examples
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 3)
}

export type Cloze = { before: string; answer: string; after: string; sentence: string }

/**
 * Finds the word inside one of its examples and cuts it out. Matches phrases as written and
 * single words by their stem, so "wear" finds "wearing" and "stay" finds "stayed".
 */
export function makeCloze(word: StudyWord): Cloze | null {
  const target = word.word.trim()
  if (!target) return null
  const isPhrase = /\s/.test(target)

  for (const sentence of sentencesOf(word.examples)) {
    if (isPhrase) {
      const index = sentence.toLowerCase().indexOf(target.toLowerCase())
      if (index >= 0) {
        return {
          before: sentence.slice(0, index),
          answer: sentence.slice(index, index + target.length),
          after: sentence.slice(index + target.length),
          sentence,
        }
      }
      continue
    }
    const lower = target.toLowerCase()
    const stem = lower.length > 4 && lower.endsWith('e') ? lower.slice(0, -1) : lower
    const tokenPattern = /[\p{L}'’-]+/gu
    for (const match of sentence.matchAll(tokenPattern)) {
      const token = match[0]
      const plain = token.toLowerCase()
      if (plain === lower || (stem.length >= 3 && plain.startsWith(stem) && plain.length - stem.length <= 4)) {
        const start = match.index ?? 0
        return { before: sentence.slice(0, start), answer: token, after: sentence.slice(start + token.length), sentence }
      }
    }
  }
  return null
}

/**
 * Gives `other` the same ending the word has in the sentence ("waiting" for "wait" turns
 * "stay" into "staying"), so cloze options don't give the answer away by their form.
 */
export function inflectLike(answer: string, base: string, other: string): string {
  const lowerAnswer = answer.toLowerCase()
  const lowerBase = base.toLowerCase()
  let suffix = ''
  if (lowerAnswer.startsWith(lowerBase)) suffix = lowerAnswer.slice(lowerBase.length)
  else if (lowerBase.endsWith('e') && lowerAnswer.startsWith(lowerBase.slice(0, -1))) suffix = lowerAnswer.slice(lowerBase.length - 1)

  let result = other
  if (suffix && !/\s/.test(other)) {
    const lower = other.toLowerCase()
    if (/^[ie]/.test(suffix) && lower.endsWith('e') && !lower.endsWith('ee')) result = other.slice(0, -1) + suffix
    else if (suffix === 's' && /(s|x|z|ch|sh)$/.test(lower)) result = `${other}es`
    else result = other + suffix
  }
  // Match a capital letter at the start of the sentence.
  if (answer[0] && answer[0] !== answer[0].toLowerCase()) result = result.charAt(0).toUpperCase() + result.slice(1)
  return result
}

export type Builder = { sentence: string; tokens: string[]; shuffled: string[] }

/** A short example split into words and shuffled, for putting back in order. */
export function makeBuilder(word: StudyWord, random = Math.random): Builder | null {
  const sentence = sentencesOf(word.examples).find((s) => {
    const n = s.split(/\s+/).length
    return n >= 3 && n <= 12
  })
  if (!sentence) return null
  const tokens = sentence.split(/\s+/)
  let shuffled = shuffle(tokens, random)
  // Never hand out the answer already in order.
  for (let attempt = 0; attempt < 5 && shuffled.join(' ') === tokens.join(' '); attempt++) shuffled = shuffle(tokens, random)
  if (shuffled.join(' ') === tokens.join(' ')) shuffled = [...tokens].reverse()
  return { sentence, tokens, shuffled }
}

// ---------- what to study ----------

export type Abilities = { speech: boolean; recognition: boolean; categories: number }

export function modesFor(word: StudyWord, abilities: Abilities): WordMode[] {
  const modes: WordMode[] = ['cards']
  if (word.translation) modes.push('choice', 'typing')
  if (makeCloze(word)) modes.push('cloze')
  if (makeBuilder(word)) modes.push('builder')
  if (abilities.speech) modes.push('listening', 'dictation')
  if (abilities.recognition) modes.push('speaking')
  if (word.category && abilities.categories >= 3) modes.push('sorting')
  return modes
}

export type QueueItem = { word: StudyWord; isNew: boolean }

/**
 * The words for one session: everything due (oldest first), then new words up to the daily
 * allowance, then — if the session is still short — words reviewed longest ago, for practice.
 */
export function buildQueue(
  words: readonly StudyWord[],
  progress: ReadonlyMap<string, ProgressRow>,
  options: { size: number; newLimit: number; now?: Date; practice?: boolean; random?: () => number },
): QueueItem[] {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const due = words
    .filter((word) => {
      const row = progress.get(word.id)
      return row !== undefined && new Date(row.due) <= now
    })
    .sort((a, b) => progress.get(a.id)!.due.localeCompare(progress.get(b.id)!.due))
  const fresh = shuffle(
    words.filter((word) => !progress.has(word.id)),
    random,
  ).slice(0, Math.max(0, options.newLimit))

  const queue: QueueItem[] = [
    ...due.map((word) => ({ word, isNew: false })),
    ...fresh.map((word) => ({ word, isNew: true })),
  ].slice(0, options.size)

  if (options.practice && queue.length < options.size) {
    const used = new Set(queue.map((item) => item.word.id))
    const rest = words
      .filter((word) => !used.has(word.id) && progress.has(word.id))
      .sort((a, b) => (progress.get(a.id)!.last_review ?? '').localeCompare(progress.get(b.id)!.last_review ?? ''))
    queue.push(...rest.slice(0, options.size - queue.length).map((word) => ({ word, isNew: false })))
  }
  // Mix due and new so sessions don't start with a wall of hard reviews.
  return shuffle(queue, random)
}

/** Consecutive days with at least one answer, ending today (or yesterday, if today is still empty). */
export function streakFrom(days: readonly string[], today: string): number {
  const set = new Set(days)
  const cursor = new Date(`${today}T12:00:00Z`)
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let streak = 0
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}
