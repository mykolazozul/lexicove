// Pure helpers that translate between Notion pages and Lexicove rows.
// No Deno or network APIs here, so the same file is unit-tested with Vitest.

export type Kind = 'words' | 'rules'

export const FIELDS = {
  words: ['word', 'translation', 'pronunciation', 'examples', 'explanation', 'category', 'added'],
  rules: ['rule', 'topic', 'explanation', 'examples', 'added'],
} as const satisfies Record<Kind, readonly string[]>

export type WordField = (typeof FIELDS.words)[number]
export type RuleField = (typeof FIELDS.rules)[number]
export type Field = WordField | RuleField

/** The field every row must have; it maps to the Notion title property by default. */
export const TITLE_FIELD: Record<Kind, Field> = { words: 'word', rules: 'rule' }

/** app field -> Notion property name */
export type Mapping = Partial<Record<Field, string>>
/** Notion property name -> Notion property type */
export type PropertyTypes = Record<string, string>

/** Property types we can read a text value from. */
export const READABLE_TYPES = new Set([
  'title',
  'rich_text',
  'select',
  'multi_select',
  'status',
  'date',
  'url',
  'email',
  'phone_number',
  'number',
  'formula',
  'created_time',
  'last_edited_time',
  'checkbox',
])

/** Property types we can write back to Notion. */
export const WRITABLE_TYPES = new Set([
  'title',
  'rich_text',
  'select',
  'multi_select',
  'date',
  'url',
  'email',
  'phone_number',
  'number',
])

// Lower-cased names (English and Ukrainian) that hint at each field.
const ALIASES: Record<Field, string[]> = {
  word: ['word', 'words', 'слово', 'term', 'english', 'англійська', 'vocabulary'],
  rule: ['rule', 'rules', 'правило', 'правила', 'grammar', 'граматика'],
  translation: ['translation', 'переклад', 'meaning', 'значення', 'ukrainian', 'українська'],
  pronunciation: ['pronunciation', 'вимова', 'transcription', 'транскрипція', 'ipa'],
  examples: ['examples', 'example', 'приклади', 'приклад', 'sentence', 'sentences', 'речення'],
  explanation: ['explanation', 'пояснення', 'notes', 'note', 'нотатки', 'definition', 'визначення'],
  category: ['category', 'категорія', 'group', 'група', 'tag', 'tags', 'теги'],
  topic: ['topic', 'тема', 'category', 'категорія', 'section', 'розділ'],
  added: ['added', 'додано', 'date', 'дата', 'created', 'створено'],
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Guess which Notion property feeds each app field. */
export function suggestMapping(kind: Kind, types: PropertyTypes): Mapping {
  const mapping: Mapping = {}
  const used = new Set<string>()
  const names = Object.keys(types)

  for (const field of FIELDS[kind]) {
    const aliases = ALIASES[field].map(normalize)
    const match = names.find(
      (name) => !used.has(name) && READABLE_TYPES.has(types[name] ?? '') && aliases.includes(normalize(name)),
    )
    if (match) {
      mapping[field] = match
      used.add(match)
    }
  }

  // Fall back to the title property for the main field.
  const titleField = TITLE_FIELD[kind]
  if (!mapping[titleField]) {
    const title = names.find((name) => types[name] === 'title' && !used.has(name))
    if (title) mapping[titleField] = title
  }

  // A "created time" column is the natural "added" date when nothing else matched.
  if (!mapping.added) {
    const created = names.find((name) => types[name] === 'created_time' && !used.has(name))
    if (created) mapping.added = created
  }

  return mapping
}

/** Decide whether a data source looks like a word list or a rule list. */
export function guessKind(title: string, types: PropertyTypes): Kind {
  const haystack = normalize(title) + ' ' + Object.keys(types).map(normalize).join(' ')
  const ruleHits = ['rule', 'правил', 'grammar', 'граматик'].filter((w) => haystack.includes(w)).length
  const wordHits = ['word', 'слов', 'translation', 'переклад', 'vocab'].filter((w) => haystack.includes(w)).length
  return ruleHits > wordHits ? 'rules' : 'words'
}

/** Check a mapping chosen by the user. Returns an error message, or null when it is valid. */
export function validateMapping(kind: Kind, mapping: unknown, types: PropertyTypes): string | null {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return 'mapping must be an object'
  const allowed = new Set<string>(FIELDS[kind])
  const seen = new Set<string>()

  for (const [field, property] of Object.entries(mapping as Record<string, unknown>)) {
    if (!allowed.has(field)) return `unknown field "${field}"`
    if (property === null || property === undefined || property === '') continue
    if (typeof property !== 'string') return `property for "${field}" must be a string`
    const type = types[property]
    if (!type) return `property "${property}" does not exist in this table`
    if (!READABLE_TYPES.has(type)) return `property "${property}" has type "${type}", which can't be read`
    if (seen.has(property)) return `property "${property}" is used twice`
    seen.add(property)
  }

  const titleField = TITLE_FIELD[kind]
  if (!(mapping as Mapping)[titleField]) return `"${titleField}" must be mapped`
  return null
}

// ---------- Reading Notion values ----------

type RichText = { plain_text?: string }
type NotionProperty = { type?: string; [key: string]: unknown }

function joinRichText(value: unknown): string {
  return Array.isArray(value) ? (value as RichText[]).map((part) => part.plain_text ?? '').join('') : ''
}

/** Turn any supported Notion property value into plain text. */
export function propertyToText(property: NotionProperty | undefined): string {
  if (!property || typeof property.type !== 'string') return ''
  const value = property[property.type] as unknown

  switch (property.type) {
    case 'title':
    case 'rich_text':
      return joinRichText(value)
    case 'select':
    case 'status':
      return (value as { name?: string } | null)?.name ?? ''
    case 'multi_select':
      return Array.isArray(value) ? (value as { name?: string }[]).map((o) => o.name ?? '').filter(Boolean).join(', ') : ''
    case 'date':
      return ((value as { start?: string } | null)?.start ?? '').slice(0, 10)
    case 'url':
    case 'email':
    case 'phone_number':
    case 'created_time':
    case 'last_edited_time':
      return typeof value === 'string' ? value : ''
    case 'number':
      return typeof value === 'number' ? String(value) : ''
    case 'checkbox':
      return value === true ? 'true' : 'false'
    case 'formula': {
      const formula = value as { type?: string; [key: string]: unknown } | null
      if (!formula?.type) return ''
      const inner = formula[formula.type]
      if (formula.type === 'date') return ((inner as { start?: string } | null)?.start ?? '').slice(0, 10)
      return inner === null || inner === undefined ? '' : String(inner)
    }
    default:
      return ''
  }
}

export type NotionPage = {
  id: string
  object?: string
  last_edited_time?: string
  in_trash?: boolean
  archived?: boolean
  properties?: Record<string, NotionProperty>
}

// Text limits, matching the check constraints on the words and rules tables.
const LIMITS: Record<Kind, Partial<Record<Field, number>>> = {
  words: { word: 200, translation: 1000, pronunciation: 200, examples: 4000, explanation: 4000, category: 100 },
  rules: { rule: 300, topic: 100, explanation: 8000, examples: 4000 },
}

/** Column names in the words / rules tables for each field. */
const COLUMN: Record<Field, string> = {
  word: 'word',
  rule: 'rule',
  translation: 'translation',
  pronunciation: 'pronunciation',
  examples: 'examples',
  explanation: 'explanation',
  category: 'category',
  topic: 'topic',
  added: 'added_on',
}

/**
 * Convert a Notion page to a row for the words or rules table.
 * Returns null for pages without a title (blank rows), which are skipped.
 */
export function pageToRow(kind: Kind, page: NotionPage, mapping: Mapping): Record<string, string | null> | null {
  if (page.in_trash || page.archived) return null
  const row: Record<string, string | null> = {}

  for (const field of FIELDS[kind]) {
    const property = mapping[field]
    const text = property ? propertyToText(page.properties?.[property]).trim() : ''
    if (field === 'added') {
      row[COLUMN.added] = /^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) ? text.slice(0, 10) : null
    } else {
      row[COLUMN[field]] = text.slice(0, LIMITS[kind][field] ?? 1000)
    }
  }

  return row[COLUMN[TITLE_FIELD[kind]]] ? row : null
}

// ---------- Writing Notion values ----------

/** Notion caps each rich-text item at 2000 characters, so long text is split. */
function textItems(content: string) {
  const items = []
  for (let i = 0; i < content.length; i += 2000) {
    items.push({ type: 'text', text: { content: content.slice(i, i + 2000) } })
  }
  return items
}

/** Build a Notion property value of the given type from plain text, or undefined to skip it. */
export function textToProperty(type: string, text: string): unknown {
  const value = text.trim()
  switch (type) {
    case 'title':
      return { title: textItems(value) }
    case 'rich_text':
      return { rich_text: textItems(value) }
    case 'select':
      // Notion forbids commas in option names.
      return { select: value ? { name: value.replace(/,/g, ' ').slice(0, 100) } : null }
    case 'multi_select':
      return {
        multi_select: value
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ name: name.slice(0, 100) })),
      }
    case 'date':
      return { date: /^\d{4}-\d{2}-\d{2}$/.test(value) ? { start: value } : null }
    case 'url':
      return { url: value || null }
    case 'email':
      return { email: value || null }
    case 'phone_number':
      return { phone_number: value || null }
    case 'number': {
      const number = Number(value.replace(',', '.'))
      return { number: value && Number.isFinite(number) ? number : null }
    }
    default:
      return undefined
  }
}

/** Build the `properties` object for creating or updating a Notion page from a row. */
export function rowToProperties(
  kind: Kind,
  row: Record<string, unknown>,
  mapping: Mapping,
  types: PropertyTypes,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const field of FIELDS[kind]) {
    const property = mapping[field]
    if (!property) continue
    const type = types[property]
    if (!type || !WRITABLE_TYPES.has(type)) continue
    const raw = row[COLUMN[field]]
    const value = textToProperty(type, typeof raw === 'string' ? raw : raw == null ? '' : String(raw))
    if (value !== undefined) properties[property] = value
  }
  return properties
}

/** Plain-text title of a data source (or database) object. */
export function titleOf(object: { title?: unknown; name?: unknown }): string {
  const text = joinRichText(object.title)
  if (text) return text
  return typeof object.name === 'string' ? object.name : ''
}

/** Extract name -> type from a data source's `properties` object. */
export function propertyTypesOf(properties: unknown): PropertyTypes {
  const types: PropertyTypes = {}
  if (!properties || typeof properties !== 'object') return types
  for (const [name, value] of Object.entries(properties as Record<string, { type?: unknown }>)) {
    if (value && typeof value.type === 'string') types[name] = value.type
  }
  return types
}
