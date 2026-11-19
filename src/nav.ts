/** Navigation entries; routes come from file-based routing in src/pages/. */
import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/play', label: 'Play' },
  { path: '/leaderboard', label: 'Leaderboard' },
]
