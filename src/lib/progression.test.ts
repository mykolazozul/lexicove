import { describe, expect, it } from 'vitest'
import { levelFromXp, xpForLevel } from './progression'

describe('level curve', () => {
  it('asks for more XP at every level, and the step keeps growing', () => {
    expect([1, 2, 3, 5, 10].map(xpForLevel)).toEqual([100, 160, 240, 460, 1360])
    for (let level = 2; level < 60; level++) {
      const grew = xpForLevel(level) - xpForLevel(level - 1)
      const grewBefore = level > 2 ? xpForLevel(level - 1) - xpForLevel(level - 2) : 0
      expect(grew).toBeGreaterThan(grewBefore)
    }
  })

  it('turns total XP into a level and progress inside it', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, intoLevel: 0, needed: 100 })
    expect(levelFromXp(99).level).toBe(1)
    expect(levelFromXp(100)).toEqual({ level: 2, intoLevel: 0, needed: 160 })
    expect(levelFromXp(259)).toEqual({ level: 2, intoLevel: 159, needed: 160 })
    expect(levelFromXp(260).level).toBe(3)
    expect(levelFromXp(-5).level).toBe(1)
  })
})
