import { describe, expect, it } from 'vitest'
import { dmPartner, dmRoom, tokenize } from './community'

describe('tokenize', () => {
  it('finds mentions and http(s) links, leaving the rest as text', () => {
    expect(tokenize('hi @bob_1, see https://example.com/a?b=1.')).toEqual([
      { kind: 'text', value: 'hi ' },
      { kind: 'mention', value: '@bob_1' },
      { kind: 'text', value: ', see ' },
      { kind: 'link', value: 'https://example.com/a?b=1' },
      { kind: 'text', value: '.' },
    ])
  })

  it('never turns other schemes into links', () => {
    for (const body of ['javascript:alert(1)', 'data:text/html,hi', 'vbscript:x', 'file:///etc/passwd']) {
      expect(tokenize(body).every((part) => part.kind !== 'link')).toBe(true)
    }
  })

  it('keeps plain text whole', () => {
    expect(tokenize('Привіт усім!')).toEqual([{ kind: 'text', value: 'Привіт усім!' }])
  })
})

describe('direct message rooms', () => {
  const a = '11111111-1111-1111-1111-111111111111'
  const b = '22222222-2222-2222-2222-222222222222'

  it('names the room the same way from both sides, like the server', () => {
    expect(dmRoom(a, b)).toBe(`dm:${a}:${b}`)
    expect(dmRoom(b, a)).toBe(dmRoom(a, b))
  })

  it('finds the other person', () => {
    expect(dmPartner(dmRoom(a, b), a)).toBe(b)
    expect(dmPartner(dmRoom(a, b), b)).toBe(a)
    expect(dmPartner('general', a)).toBeNull()
  })
})
