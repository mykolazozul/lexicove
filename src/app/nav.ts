import {
  BookOpen,
  Gamepad2,
  GraduationCap,
  House,
  ShoppingBag,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavKey = 'home' | 'learn' | 'words' | 'games' | 'shop' | 'community' | 'profile'

export type NavItem = {
  key: NavKey
  to: string
  icon: LucideIcon
  /** Shown in the phone's bottom bar (it fits five). */
  inBottomBar: boolean
}

export const NAV: NavItem[] = [
  { key: 'home', to: '/', icon: House, inBottomBar: true },
  { key: 'learn', to: '/learn', icon: GraduationCap, inBottomBar: true },
  { key: 'words', to: '/words', icon: BookOpen, inBottomBar: true },
  { key: 'games', to: '/games', icon: Gamepad2, inBottomBar: false },
  { key: 'shop', to: '/shop', icon: ShoppingBag, inBottomBar: false },
  { key: 'community', to: '/community', icon: Users, inBottomBar: true },
  { key: 'profile', to: '/profile', icon: UserRound, inBottomBar: true },
]

/** Sections that are planned but not built yet, with the phase from SPEC.md that delivers them. */
export const UPCOMING = {
  shop: { phase: 3, icon: ShoppingBag },
  community: { phase: 4, icon: Users },
  games: { phase: 6, icon: Gamepad2 },
} as const

export type UpcomingKey = keyof typeof UPCOMING
