/** XP needed to go from `level` to `level + 1`. Each level asks for 50 XP more than the last. */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50
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
