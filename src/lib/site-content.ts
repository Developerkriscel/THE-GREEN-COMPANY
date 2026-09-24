// Default website content — the same items the public pages have always shown.
// Used two ways: as the fallback the public pages render when a CMS table is
// empty, and as the "Import current content" seed the admin CMS can push into
// the database to start managing it. Single source of truth, no retyped URLs.

import { DIRECTORS, MANAGING_DIRECTORS, BRANCH_MANAGERS, RANK_ACHIEVERS } from '@/pages/public/Team'
import { ACHIEVERS } from '@/pages/public/Home'
import { EVENTS } from '@/pages/public/Events'
import { NEWS } from '@/pages/public/News'
import { REWARDS } from '@/pages/public/Rewards'
import { RANKS, LEVELS } from '@/pages/public/Plans'

export interface TeamRow { [k: string]: unknown; name: string; designation: string; category: string; photo_url: string; sort_order: number }
export interface AchieverRow { [k: string]: unknown; name: string; rank: string; photo_url: string; sort_order: number }
export interface EventRow { [k: string]: unknown; title: string; description: string; event_date: string; location: string; image_url: string; sort_order: number }
export interface NewsRow { [k: string]: unknown; title: string; description: string; news_date: string; image_url: string; sort_order: number }
export interface RewardRow { [k: string]: unknown; level: number; title: string; joining: string; sales: string; image_url: string; trending: boolean; sort_order: number }
export interface PlanRankRow { [k: string]: unknown; rank: string; joining: string; direct: string; pct: string; features: string; elite: boolean; sort_order: number }
export interface PlanLevelRow { [k: string]: unknown; level: number; rate: number; tag: string; sort_order: number }

export const DEFAULT_TEAM: TeamRow[] = [
  ...DIRECTORS.map((m) => ({ ...m, category: 'director' })),
  ...MANAGING_DIRECTORS.map((m) => ({ ...m, category: 'managing_director' })),
  ...BRANCH_MANAGERS.map((m) => ({ ...m, category: 'branch_manager' })),
  ...RANK_ACHIEVERS.map((m) => ({ ...m, category: 'rank_achiever' })),
].map((m, i) => ({ name: m.name, designation: m.role, category: m.category, photo_url: m.img, sort_order: i }))

export const DEFAULT_ACHIEVERS: AchieverRow[] = ACHIEVERS.map((a, i) => ({
  name: a.name, rank: a.rank, photo_url: a.img, sort_order: i,
}))

export const DEFAULT_EVENTS: EventRow[] = EVENTS.map((e, i) => ({
  title: e.title, description: e.desc, event_date: e.date, location: e.location, image_url: e.img, sort_order: i,
}))

export const DEFAULT_NEWS: NewsRow[] = NEWS.map((n, i) => ({
  title: n.title, description: n.desc, news_date: n.date, image_url: n.img, sort_order: i,
}))

export const DEFAULT_REWARDS: RewardRow[] = REWARDS.map((r, i) => ({
  level: r.level, title: r.title, joining: r.joining, sales: r.sales, image_url: r.img, trending: r.trending, sort_order: i,
}))

export const DEFAULT_PLAN_RANKS: PlanRankRow[] = RANKS.map((r, i) => ({
  rank: r.rank, joining: r.joining, direct: r.direct, pct: r.pct, features: r.features, elite: r.elite, sort_order: i,
}))

export const DEFAULT_PLAN_LEVELS: PlanLevelRow[] = LEVELS.map((l, i) => ({
  level: l.level, rate: l.rate, tag: l.tag, sort_order: i,
}))

export const TEAM_CATEGORIES: { value: string; label: string }[] = [
  { value: 'director', label: 'Director' },
  { value: 'managing_director', label: 'Managing Director' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'rank_achiever', label: 'Rank Achiever' },
]
