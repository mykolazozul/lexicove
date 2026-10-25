import { create } from 'zustand'
import { notionCall, type NotionStatus, type SyncSummary } from '../lib/notion'
import { supabase } from '../lib/supabase'

export type Word = {
  id: string
  source_id: string | null
  notion_page_id: string | null
  word: string
  translation: string
  pronunciation: string
  examples: string
  explanation: string
  category: string
  added_on: string | null
  needs_push: boolean
  created_at: string
}

export type Rule = {
  id: string
  source_id: string | null
  notion_page_id: string | null
  rule: string
  topic: string
  explanation: string
  examples: string
  added_on: string | null
  needs_push: boolean
  created_at: string
}

export type Source = {
  id: string
  kind: 'words' | 'rules'
  data_source_id: string
  title: string
  last_synced_at: string | null
  last_error: string | null
}

export type WordInput = Pick<Word, 'word' | 'translation' | 'pronunciation' | 'examples' | 'explanation' | 'category'> & {
  added_on?: string | null
}
export type RuleInput = Pick<Rule, 'rule' | 'topic' | 'explanation' | 'examples'> & { added_on?: string | null }

const WORD_COLUMNS =
  'id, source_id, notion_page_id, word, translation, pronunciation, examples, explanation, category, added_on, needs_push, created_at'
const RULE_COLUMNS = 'id, source_id, notion_page_id, rule, topic, explanation, examples, added_on, needs_push, created_at'

type LibraryState = {
  loaded: boolean
  loading: boolean
  syncing: boolean
  error: string | null
  words: Word[]
  rules: Rule[]
  sources: Source[]
  notion: NotionStatus | null
  load: () => Promise<void>
  refreshNotion: () => Promise<void>
  sync: () => Promise<SyncSummary[]>
  saveWord: (input: WordInput, existing?: Word) => Promise<void>
  deleteWord: (word: Word) => Promise<void>
  saveRule: (input: RuleInput, existing?: Rule) => Promise<void>
  deleteRule: (rule: Rule) => Promise<void>
  importWords: (rows: WordInput[], toNotion: boolean) => Promise<number>
  removeSource: (source: Source) => Promise<void>
  reset: () => void
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** PostgREST returns at most 1000 rows per request, so read in pages. */
async function fetchAll<T>(table: 'words' | 'rules', columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client()
      .from(table)
      .select(columns)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

/** Newest first by the date added, then alphabetically. */
function byAdded<T extends { added_on: string | null; created_at: string }>(a: T, b: T) {
  return (b.added_on ?? b.created_at).localeCompare(a.added_on ?? a.created_at)
}

function sourceFor(sources: Source[], kind: Source['kind']) {
  return sources.find((source) => source.kind === kind) ?? null
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  loaded: false,
  loading: false,
  syncing: false,
  error: null,
  words: [],
  rules: [],
  sources: [],
  notion: null,

  load: async () => {
    if (!supabase || get().loading) return
    set({ loading: true, error: null })
    try {
      const [words, rules, sources] = await Promise.all([
        fetchAll<Word>('words', WORD_COLUMNS),
        fetchAll<Rule>('rules', RULE_COLUMNS),
        client()
          .from('notion_sources')
          .select('id, kind, data_source_id, title, last_synced_at, last_error')
          .order('created_at'),
      ])
      if (sources.error) throw sources.error
      set({
        words: words.sort(byAdded),
        rules: rules.sort(byAdded),
        sources: (sources.data ?? []) as Source[],
        loaded: true,
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ loading: false })
    }
    void get().refreshNotion()
  },

  refreshNotion: async () => {
    try {
      set({ notion: await notionCall<NotionStatus>('status') })
    } catch {
      set({ notion: { configured: false, connected: false, workspace: null } })
    }
  },

  sync: async () => {
    set({ syncing: true })
    try {
      const { results } = await notionCall<{ results: Array<SyncSummary & { error?: string }> }>('sync')
      await get().load()
      const failed = results.find((result) => result.error)
      if (failed?.error) throw new Error(failed.error)
      return results
    } finally {
      set({ syncing: false })
    }
  },

  saveWord: async (input, existing) => {
    const source = existing ? null : sourceFor(get().sources, 'words')
    if (existing) {
      const { error } = await client()
        .from('words')
        .update({ ...input, needs_push: existing.source_id !== null })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      // New words go to the linked Notion table when there is one.
      const { error } = await client()
        .from('words')
        .insert({ ...input, added_on: input.added_on ?? today(), source_id: source?.id ?? null, needs_push: source !== null })
      if (error) throw error
    }
    await get().load()
  },

  deleteWord: async (word) => {
    // Synced words are flagged so the next sync also moves the Notion page to the trash.
    const query = word.source_id
      ? client().from('words').update({ deleted_at: new Date().toISOString(), needs_push: true }).eq('id', word.id)
      : client().from('words').delete().eq('id', word.id)
    const { error } = await query
    if (error) throw error
    set({ words: get().words.filter((item) => item.id !== word.id) })
  },

  saveRule: async (input, existing) => {
    const source = existing ? null : sourceFor(get().sources, 'rules')
    if (existing) {
      const { error } = await client()
        .from('rules')
        .update({ ...input, needs_push: existing.source_id !== null })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await client()
        .from('rules')
        .insert({ ...input, added_on: input.added_on ?? today(), source_id: source?.id ?? null, needs_push: source !== null })
      if (error) throw error
    }
    await get().load()
  },

  deleteRule: async (rule) => {
    const query = rule.source_id
      ? client().from('rules').update({ deleted_at: new Date().toISOString(), needs_push: true }).eq('id', rule.id)
      : client().from('rules').delete().eq('id', rule.id)
    const { error } = await query
    if (error) throw error
    set({ rules: get().rules.filter((item) => item.id !== rule.id) })
  },

  importWords: async (rows, toNotion) => {
    const source = toNotion ? sourceFor(get().sources, 'words') : null
    const records = rows.map((row) => ({
      ...row,
      added_on: row.added_on ?? today(),
      source_id: source?.id ?? null,
      needs_push: source !== null,
    }))
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await client().from('words').insert(records.slice(i, i + 500))
      if (error) throw error
    }
    await get().load()
    return records.length
  },

  removeSource: async (source) => {
    const { error } = await client().from('notion_sources').delete().eq('id', source.id)
    if (error) throw error
    await get().load()
  },

  reset: () => set({ loaded: false, words: [], rules: [], sources: [], notion: null, error: null }),
}))

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
