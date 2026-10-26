import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useProfile, type Slot } from './profile'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type ItemKind = Slot | 'theme' | 'boost'

export type ShopItem = {
  id: string
  kind: ItemKind
  price: number
  rarity: Rarity
  data: {
    emoji?: string
    from?: string
    to?: string
    motion?: 'bob' | 'tilt' | 'wave' | 'glitch' | 'flame'
    style?: string
    theme?: string
    pack?: string
    color?: string
    minutes?: number
  }
  requires_achievement: string | null
  consumable: boolean
  sort: number
}

export type Achievement = {
  id: string
  metric: string
  threshold: number
  reward: number
  icon: string
  rarity: Rarity
  hidden: boolean
  sort: number
}

export type Quest = {
  id: string
  period: 'day' | 'week'
  period_start: string
  kind: string
  target: number
  reward: number
  progress: number
  claimed_at: string | null
}

export type UserStats = {
  day: string | null
  answers_today: number
  goal_reached_today: boolean
  answers_total: number
  correct_total: number
  new_words_total: number
  goal_days: number
  modes_used: string[]
  current_streak: number
  best_streak: number
  last_active_day: string | null
  last_chest_day: string | null
}

export type ChestReward = { coins: number; streak_freeze: boolean }

type EconomyState = {
  items: ShopItem[]
  achievements: Achievement[]
  catalogLoaded: boolean
  inventory: Map<string, number>
  unlocked: Map<string, string>
  stats: UserStats | null
  quests: Quest[]
  mineLoaded: boolean
  loadCatalog: () => Promise<void>
  loadMine: () => Promise<void>
  loadQuests: () => Promise<void>
  buy: (itemId: string) => Promise<void>
  equip: (slot: Slot, itemId: string | null) => Promise<void>
  claimQuest: (questId: string) => Promise<number>
  openChest: () => Promise<ChestReward>
  startBoost: () => Promise<void>
  applyStreakFreeze: () => Promise<boolean>
  reset: () => void
}

function client() {
  if (!supabase) throw new Error('offline')
  return supabase
}

/** Turns a Postgres "raise exception" into a short code the UI can translate. */
export class EconomyError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

function fail(message: string): never {
  const known = ['not enough coins', 'locked', 'already owned', 'not owned', 'chest already opened today', 'no boost left', 'quest not finished', 'already claimed']
  throw new EconomyError(known.find((text) => message.includes(text))?.replaceAll(' ', '_') ?? 'unknown')
}

export const useEconomy = create<EconomyState>()((set, get) => ({
  items: [],
  achievements: [],
  catalogLoaded: false,
  inventory: new Map(),
  unlocked: new Map(),
  stats: null,
  quests: [],
  mineLoaded: false,

  // The catalog is public, so guests can browse the shop too.
  loadCatalog: async () => {
    if (!supabase || get().catalogLoaded) return
    const [items, achievements] = await Promise.all([
      supabase.from('shop_items').select('id, kind, price, rarity, data, requires_achievement, consumable, sort').eq('active', true).order('sort'),
      supabase.from('achievements').select('id, metric, threshold, reward, icon, rarity, hidden, sort').order('sort'),
    ])
    if (items.error || achievements.error) return
    set({ items: items.data as ShopItem[], achievements: achievements.data as Achievement[], catalogLoaded: true })
  },

  loadMine: async () => {
    const db = client()
    const [inventory, unlocked, stats] = await Promise.all([
      db.from('inventory').select('item_id, quantity'),
      db.from('user_achievements').select('achievement_id, unlocked_at'),
      db.from('user_stats').select('*').maybeSingle(),
    ])
    if (inventory.error || unlocked.error || stats.error) return
    set({
      inventory: new Map(inventory.data.map((row) => [row.item_id as string, row.quantity as number])),
      unlocked: new Map(unlocked.data.map((row) => [row.achievement_id as string, row.unlocked_at as string])),
      stats: (stats.data as UserStats | null) ?? null,
      mineLoaded: true,
    })
  },

  loadQuests: async () => {
    const { data, error } = await client().rpc('ensure_quests')
    if (!error) set({ quests: data as Quest[] })
  },

  buy: async (itemId) => {
    const { error } = await client().rpc('buy_item', { p_item: itemId })
    if (error) fail(error.message)
    await Promise.all([get().loadMine(), useProfile.getState().refresh()])
  },

  equip: async (slot, itemId) => {
    const { data, error } = await client().rpc('equip_item', { p_slot: slot, p_item: itemId })
    if (error) fail(error.message)
    const profile = useProfile.getState().profile
    if (profile) useProfile.setState({ profile: { ...profile, equipped: data as typeof profile.equipped } })
  },

  claimQuest: async (questId) => {
    const { data, error } = await client().rpc('claim_quest', { p_quest: questId })
    if (error) fail(error.message)
    set({ quests: get().quests.map((quest) => (quest.id === questId ? { ...quest, claimed_at: new Date().toISOString() } : quest)) })
    await useProfile.getState().refresh()
    return data as number
  },

  openChest: async () => {
    const { data, error } = await client().rpc('open_daily_chest')
    if (error) fail(error.message)
    await Promise.all([get().loadMine(), useProfile.getState().refresh()])
    return data as ChestReward
  },

  startBoost: async () => {
    const { error } = await client().rpc('use_boost')
    if (error) fail(error.message)
    await Promise.all([get().loadMine(), useProfile.getState().refresh()])
  },

  applyStreakFreeze: async () => {
    const { data, error } = await client().rpc('apply_streak_freeze')
    if (error || !data) return false
    await get().loadMine()
    return true
  },

  reset: () => set({ inventory: new Map(), unlocked: new Map(), stats: null, quests: [], mineLoaded: false }),
}))

/** The shop items behind a set of equipped slots: someone else's (from a public card) or your own. */
export function useLook(equipped: Partial<Record<Slot, string>> | undefined) {
  const items = useEconomy((s) => s.items)
  const find = (slot: Slot) => {
    const id = equipped?.[slot]
    return id ? items.find((item) => item.id === id) : undefined
  }
  return {
    avatar: find('avatar'),
    frame: find('frame'),
    banner: find('banner'),
    title: find('title'),
    cardBack: find('card_back'),
    sound: find('sound'),
    nameColor: find('name_color'),
  }
}

/** What the signed-in person has on. */
export function useEquipped() {
  return useLook(useProfile((s) => s.profile?.equipped))
}

export type Equipped = ReturnType<typeof useEquipped>
