/**
 * XP needed to go from `level` to `level + 1`. Each level asks for more than the last and the
 * step itself grows, so early levels come quickly and high ones take real effort.
 * The database uses the same curve (private.level_for).
 */
export function xpForLevel(level: number): number {
  const n = level - 1
  return 100 + 50 * n + 10 * n * n
}

export function levelFromXp(totalXp: number) {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp))
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level += 1
  }
  return { level, intoLevel: remaining, needed: xpForLevel(level) }
}
