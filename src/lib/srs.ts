import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs'

// Spaced repetition with FSRS. Every learning mode ends in one of four grades, and the
// scheduler turns the grade into the next due date for that word.

export { Rating, State }
export type { Grade }

/** A row of the word_progress table. */
export type ProgressRow = {
  word_id: string
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: string | null
}

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 3 * 365,
    enable_fuzz: true,
  }),
)

export function toCard(row: ProgressRow | undefined, now = new Date()): Card {
  if (!row) return createEmptyCard(now)
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  }
}

export function fromCard(wordId: string, card: Card): ProgressRow {
  return {
    word_id: wordId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}

/** The progress row after answering with `grade`. */
export function review(wordId: string, row: ProgressRow | undefined, grade: Grade, now = new Date()): ProgressRow {
  return fromCard(wordId, scheduler.next(toCard(row, now), now, grade).card)
}

/** When the word would come back for each grade, for the flashcard buttons. */
export function previewDue(row: ProgressRow | undefined, now = new Date()): Record<Grade, Date> {
  const preview = scheduler.repeat(toCard(row, now), now)
  return {
    [Rating.Again]: preview[Rating.Again].card.due,
    [Rating.Hard]: preview[Rating.Hard].card.due,
    [Rating.Good]: preview[Rating.Good].card.due,
    [Rating.Easy]: preview[Rating.Easy].card.due,
  } as Record<Grade, Date>
}

/** "<1 min", "10 min", "4 d", "2 mo" in the given language, for interval hints. */
export function formatInterval(from: Date, to: Date, locale: string): string {
  const minutes = Math.max(0, (to.getTime() - from.getTime()) / 60000)
  const unit = (value: number, name: 'minute' | 'hour' | 'day' | 'month' | 'year') =>
    // "short" rather than "narrow": in Ukrainian narrow minutes are a bare "х", which reads like "x".
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value)

  if (minutes < 1) return `<${unit(1, 'minute')}`
  if (minutes < 60) return unit(Math.round(minutes), 'minute')
  const hours = minutes / 60
  if (hours < 24) return unit(Math.round(hours), 'hour')
  const days = hours / 24
  if (days < 30) return unit(Math.round(days), 'day')
  if (days < 365) return unit(Math.round(days / 30), 'month')
  return unit(Math.round((days / 365) * 10) / 10, 'year')
}

export function isDue(row: ProgressRow | undefined, now = new Date()): boolean {
  return row !== undefined && new Date(row.due) <= now
}
