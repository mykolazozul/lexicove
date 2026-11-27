import {
  BookOpen,
  Gamepad2,
  GraduationCap,
  House,
  ShoppingBag,
  UserRound,
  Users,
  type LucideIcon,
} from '../components/icons'

export type NavKey = 'home' | 'learn' | 'words' | 'games' | 'shop' | 'community' | 'profile'

export type NavItem = {
  key: NavKey
  to: string
  icon: LucideIcon
  /** Shown in the phone's bottom bar (it fits five). */
  inBottomBar: boolean
  /** Other sections that light this item up in the bottom bar, where they have no item of their own. */
  also?: string[]
}

export const NAV: NavItem[] = [
  { key: 'home', to: '/', icon: House, inBottomBar: true },
  { key: 'learn', to: '/learn', icon: GraduationCap, inBottomBar: true },
  { key: 'words', to: '/words', icon: BookOpen, inBottomBar: true },
  { key: 'games', to: '/games', icon: Gamepad2, inBottomBar: true },
  // On phones the shop opens from the Coins pill in the top bar.
  { key: 'shop', to: '/shop', icon: ShoppingBag, inBottomBar: false },
  { key: 'community', to: '/community', icon: Users, inBottomBar: true, also: ['/decks'] },
  // On phones the profile opens from the avatar in the top bar.
  { key: 'profile', to: '/profile', icon: UserRound, inBottomBar: false },
]
