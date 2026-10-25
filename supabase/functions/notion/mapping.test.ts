import { describe, expect, it } from 'vitest'
import {
  guessKind,
  pageToRow,
  propertyToText,
  rowToProperties,
  suggestMapping,
  textToProperty,
  validateMapping,
  type NotionPage,
  type PropertyTypes,
} from './mapping'

// The shape of the real "English words" and "English Rules" databases.
const WORD_TYPES: PropertyTypes = {
  Word: 'title',
  Translation: 'rich_text',
  Pronunciation: 'rich_text',
  Examples: 'rich_text',
  Explanation: 'rich_text',
  Category: 'select',
  Added: 'date',
}

const RULE_TYPES: PropertyTypes = {
  Rule: 'title',
  Topic: 'select',
  Explanation: 'rich_text',
  Examples: 'rich_text',
  Added: 'date',
}

const text = (value: string) => [{ plain_text: value }]

function wordPage(overrides: Partial<NotionPage> = {}): NotionPage {
  return {
    object: 'page',
    id: 'page-1',
    last_edited_time: '2026-10-20T10:00:00.000Z',
    in_trash: false,
    properties: {
      Word: { type: 'title', title: [{ plain_text: 'look ' }, { plain_text: 'forward to' }] },
      Translation: { type: 'rich_text', rich_text: text('чекати з нетерпінням') },
      Pronunciation: { type: 'rich_text', rich_text: text('/lʊk ˈfɔːrwərd tuː/') },
      Examples: { type: 'rich_text', rich_text: text('I look forward to the weekend.') },
      Explanation: { type: 'rich_text', rich_text: [] },
      Category: { type: 'select', select: { name: '🧩 Phrasal verbs' } },
      Added: { type: 'date', date: { start: '2026-09-03' } },
    },
    ...overrides,
  }
}

describe('suggestMapping', () => {
  it('maps the English words template exactly', () => {
    expect(suggestMapping('words', WORD_TYPES)).toEqual({
      word: 'Word',
      translation: 'Translation',
      pronunciation: 'Pronunciation',
      examples: 'Examples',
      explanation: 'Explanation',
      category: 'Category',
      added: 'Added',
    })
  })

  it('maps the English Rules template exactly', () => {
    expect(suggestMapping('rules', RULE_TYPES)).toEqual({
      rule: 'Rule',
      topic: 'Topic',
      explanation: 'Explanation',
      examples: 'Examples',
      added: 'Added',
    })
  })

  it('understands Ukrainian column names and falls back to the title', () => {
    const mapping = suggestMapping('words', { Назва: 'title', Переклад: 'rich_text', Створено: 'created_time' })
    expect(mapping).toEqual({ word: 'Назва', translation: 'Переклад', added: 'Створено' })
  })
})

describe('guessKind', () => {
  it('tells word lists from rule lists', () => {
    expect(guessKind('English words', WORD_TYPES)).toBe('words')
    expect(guessKind('📘English Rules', RULE_TYPES)).toBe('rules')
  })
})

describe('validateMapping', () => {
  it('accepts a correct mapping', () => {
    expect(validateMapping('words', suggestMapping('words', WORD_TYPES), WORD_TYPES)).toBeNull()
  })

  it('rejects bad mappings', () => {
    expect(validateMapping('words', { translation: 'Translation' }, WORD_TYPES)).toMatch(/word/)
    expect(validateMapping('words', { word: 'Nope' }, WORD_TYPES)).toMatch(/does not exist/)
    expect(validateMapping('words', { word: 'Word', translation: 'Word' }, WORD_TYPES)).toMatch(/twice/)
    expect(validateMapping('words', { word: 'Word', secret: 'Word' }, WORD_TYPES)).toMatch(/unknown field/)
    expect(validateMapping('words', ['Word'], WORD_TYPES)).toMatch(/object/)
  })
})

describe('pageToRow', () => {
  const mapping = suggestMapping('words', WORD_TYPES)

  it('reads every field of a word', () => {
    expect(pageToRow('words', wordPage(), mapping)).toEqual({
      word: 'look forward to',
      translation: 'чекати з нетерпінням',
      pronunciation: '/lʊk ˈfɔːrwərd tuː/',
      examples: 'I look forward to the weekend.',
      explanation: '',
      category: '🧩 Phrasal verbs',
      added_on: '2026-09-03',
    })
  })

  it('skips blank and trashed pages', () => {
    const blank = wordPage({ properties: { Word: { type: 'title', title: [] } } })
    expect(pageToRow('words', blank, mapping)).toBeNull()
    expect(pageToRow('words', wordPage({ in_trash: true }), mapping)).toBeNull()
  })

  it('trims dates with a time and drops invalid ones', () => {
    const withTime = wordPage()
    withTime.properties!.Added = { type: 'date', date: { start: '2026-09-03T12:30:00.000+02:00' } }
    expect(pageToRow('words', withTime, mapping)?.added_on).toBe('2026-09-03')

    const noDate = wordPage()
    noDate.properties!.Added = { type: 'date', date: null }
    expect(pageToRow('words', noDate, mapping)?.added_on).toBeNull()
  })

  it('cuts text to the database limits', () => {
    const long = wordPage()
    long.properties!.Translation = { type: 'rich_text', rich_text: text('x'.repeat(5000)) }
    expect(pageToRow('words', long, mapping)?.translation).toHaveLength(1000)
  })
})

describe('propertyToText', () => {
  it('reads less common property types', () => {
    expect(propertyToText({ type: 'multi_select', multi_select: [{ name: 'A' }, { name: 'B' }] })).toBe('A, B')
    expect(propertyToText({ type: 'status', status: { name: 'Done' } })).toBe('Done')
    expect(propertyToText({ type: 'number', number: 3 })).toBe('3')
    expect(propertyToText({ type: 'formula', formula: { type: 'string', string: 'hi' } })).toBe('hi')
    expect(propertyToText({ type: 'relation', relation: [] })).toBe('')
    expect(propertyToText(undefined)).toBe('')
  })
})

describe('textToProperty', () => {
  it('splits long text into 2000-character pieces', () => {
    const value = textToProperty('rich_text', 'a'.repeat(4500)) as { rich_text: unknown[] }
    expect(value.rich_text).toHaveLength(3)
  })

  it('keeps select names valid and parses numbers and dates', () => {
    expect(textToProperty('select', 'Food, drinks')).toEqual({ select: { name: 'Food  drinks' } })
    expect(textToProperty('select', '')).toEqual({ select: null })
    expect(textToProperty('number', '2,5')).toEqual({ number: 2.5 })
    expect(textToProperty('date', 'soon')).toEqual({ date: null })
    expect(textToProperty('formula', 'x')).toBeUndefined()
  })
})

describe('rowToProperties', () => {
  it('writes mapped, writable properties only', () => {
    const types = { ...WORD_TYPES, Explanation: 'formula' }
    const properties = rowToProperties(
      'words',
      { word: 'breeze', translation: 'легкий вітерець', explanation: 'ignored', category: '🌦️ Nature & weather' },
      suggestMapping('words', WORD_TYPES),
      types,
    )
    expect(properties.Word).toEqual({ title: [{ type: 'text', text: { content: 'breeze' } }] })
    expect(properties.Category).toEqual({ select: { name: '🌦️ Nature & weather' } })
    expect(properties).not.toHaveProperty('Explanation')
    expect(properties.Added).toEqual({ date: null })
  })
})
