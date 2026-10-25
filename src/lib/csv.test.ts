import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from './csv'

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes and line breaks inside quotes', () => {
    const text = 'Word,Translation,Examples\r\nbreeze,"легкий, приємний вітерець","He said ""hi"".\nTwice."\r\n'
    expect(parseCsv(text)).toEqual([
      ['Word', 'Translation', 'Examples'],
      ['breeze', 'легкий, приємний вітерець', 'He said "hi".\nTwice.'],
    ])
  })

  it('detects semicolons and tabs, strips the BOM and skips blank lines', () => {
    expect(parseCsv('﻿Word;Translation\n\nwait;чекати')).toEqual([
      ['Word', 'Translation'],
      ['wait', 'чекати'],
    ])
    expect(parseCsv('Word\tTranslation\nstay\tзалишатися')).toEqual([
      ['Word', 'Translation'],
      ['stay', 'залишатися'],
    ])
  })
})

describe('toCsv', () => {
  it('quotes when needed and survives a round trip', () => {
    const rows = [
      ['Word', 'Examples'],
      ['look forward to', 'I look forward to it, "really".'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('neutralises spreadsheet formulas', () => {
    const csv = toCsv([['=HYPERLINK("http://x")', '+1', '-ing', '@cmd', 'safe']])
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain(`'+1`)
    expect(csv).toContain(`'-ing`)
    expect(csv).toContain(`'@cmd`)
    expect(csv.endsWith(',safe')).toBe(true)
  })
})
