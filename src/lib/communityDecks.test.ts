import { describe, expect, it } from 'vitest'
import { publishProblem } from './communityDecks'

describe('publishProblem', () => {
  it('accepts a normal deck', () => {
    expect(publishProblem('Travel basics', 'Words for a trip', 12)).toBeNull()
  })

  it('wants a title of 3 to 60 characters', () => {
    expect(publishProblem('  Hi ', '', 10)).toBe('title')
    expect(publishProblem('x'.repeat(61), '', 10)).toBe('title')
  })

  it('limits the description', () => {
    expect(publishProblem('Travel', 'x'.repeat(301), 10)).toBe('description')
  })

  it('needs 5 to 300 words', () => {
    expect(publishProblem('Travel', '', 4)).toBe('few')
    expect(publishProblem('Travel', '', 301)).toBe('many')
    expect(publishProblem('Travel', '', 5)).toBeNull()
  })
})
