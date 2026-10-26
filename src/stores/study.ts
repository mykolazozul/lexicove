import { create } from 'zustand'
import { review, type Grade, type ProgressRow } from '../lib/srs'
import { streakFrom, type Mode } from '../lib/study'
import { supabase } from '../lib/supabase'
import { browserTimeZone } from './profile'

export type StudySummary = {
  today: number
  today_correct: number
  days: string[]
  accuracy_30d: { correct: number; total: number }
  learned: number
  due: number
  started: number
  /** Answers per local day over the last half year. */
  activity: Array<{ day: string; count: number }>
}

export type StudyInsights = {
  categories: Array<{ name: string; correct: number; total: number }>
  hardest: Array<{ word: string; translation: string; lapses: number }>
  forecast: Array<{ day: string; count: number }>
}

type Answer = {
  wordId?: string
  ruleId?: string
  mode: Exclude<Mode, 'mix'>
  grade: Grade
  correct: boolean
  durationMs: number
}

type StudyState = {
  progress: Map<string, ProgressRow>
  progressLoaded: boolean
  summary: StudySummary | null
  insights: StudyInsights | null
  streak: number
  loadProgress: () => Promise<void>
  refreshSummary: () => Promise<void>
  loadInsights: () => Promise<void>
  answer: (answer: Answer) => Promise<void>
  reset: () => void
}

const PROGRESS_COLUMNS =
  'word_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review'

const timeZone = browserTimeZone

/** Today's date (YYYY-MM-DD) in the user's own time zone. */
export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone() }).format(new Date())
}

export const useStudy = create<StudyState>()((set, get) => ({
  progress: new Map(),
  progressLoaded: false,
  summary: null,
  insights: null,
  streak: 0,

  loadProgress: async () => {
    if (!supabase) return
    const rows: ProgressRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('word_progress')
        .select(PROGRESS_COLUMNS)
        .range(from, from + 999)
      if (error) throw error
      rows.push(...((data ?? []) as ProgressRow[]))
      if (!data || data.length < 1000) break
    }
    set({ progress: new Map(rows.map((row) => [row.word_id, row])), progressLoaded: true })
  },

  refreshSummary: async () => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('study_summary', { p_time_zone: timeZone() })
    if (error) return
    const summary = data as StudySummary
    set({ summary, streak: streakFrom(summary.days, localToday()) })
  },

  loadInsights: async () => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('study_insights')
    if (!error) set({ insights: data as StudyInsights })
  },

  answer: async ({ wordId, ruleId, mode, grade, correct, durationMs }) => {
    if (!supabase) return
    const now = new Date()

    if (wordId) {
      const next = review(wordId, get().progress.get(wordId), grade, now)
      const progress = new Map(get().progress)
      progress.set(wordId, next)
      set({ progress })
      const { error } = await supabase.from('word_progress').upsert(next, { onConflict: 'user_id,word_id' })
      if (error) throw error
    }

    const { error } = await supabase.from('review_log').insert({
      word_id: wordId ?? null,
      rule_id: ruleId ?? null,
      mode,
      rating: grade,
      correct,
      duration_ms: Math.min(600000, Math.max(0, Math.round(durationMs))),
    })
    if (error) throw error

    // Keep today's counters live without a round trip after every answer.
    const summary = get().summary
    if (summary) {
      const today = localToday()
      const days = summary.days.includes(today) ? summary.days : [today, ...summary.days]
      const updated = {
        ...summary,
        today: summary.today + 1,
        today_correct: summary.today_correct + (correct ? 1 : 0),
        days,
        activity: summary.activity.some((entry) => entry.day === today)
          ? summary.activity.map((entry) => (entry.day === today ? { ...entry, count: entry.count + 1 } : entry))
          : [...summary.activity, { day: today, count: 1 }],
        accuracy_30d: {
          correct: summary.accuracy_30d.correct + (correct ? 1 : 0),
          total: summary.accuracy_30d.total + 1,
        },
      }
      set({ summary: updated, streak: streakFrom(days, today) })
    }
  },

  reset: () => set({ progress: new Map(), progressLoaded: false, summary: null, insights: null, streak: 0 }),
}))
