import { describe, expect, it } from 'vitest'
import { botProgress } from './duels'

describe('the bot in a duel', () => {
  const plan = [
    { ms: 3000, correct: true },
    { ms: 2000, correct: false },
    { ms: 4000, correct: true },
  ]

  it('has answered nothing before its first answer is due', () => {
    expect(botProgress(plan, 2999)).toEqual({ answered: 0, correct: 0 })
  })

  it('counts every answer whose time has come', () => {
    expect(botProgress(plan, 5000)).toEqual({ answered: 2, correct: 1 })
    expect(botProgress(plan, 60_000)).toEqual({ answered: 3, correct: 2 })
  })

  it('copes with a missing plan', () => {
    expect(botProgress(null, 10_000)).toEqual({ answered: 0, correct: 0 })
  })
})
