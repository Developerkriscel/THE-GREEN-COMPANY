import { useCmsContent, useRanks } from '@/lib/queries'
import { assetUrl } from '@/lib/supabase'
import { num } from '@/lib/format'

export interface WebsiteReward {
  key: string
  rank: string | null
  title: string
  /** e.g. "50 sq yd direct + 100 sq yd group" */
  target: string | null
  /** The deck's reward slab, e.g. "2%". */
  slab: string | null
  img: string | null
}

/**
 * The rewards the website shows, as the office keeps them in Website CMS ->
 * Rewards (reward, rank, sales target, optional photo, order, show/hide).
 * Only if that list is empty does the site fall back to the rewards in
 * Business Settings -> Rank plan, so the page is never blank.
 */
export function useWebsiteRewards(): WebsiteReward[] {
  const { data: rows = [] } = useCmsContent<{ id: string; title: string; joining: string | null; sales: string | null; slab: string | null; image_url: string | null }>('rewards', { activeOnly: true })
  const { data: ranks = [] } = useRanks()
  if (rows.length) {
    return rows.map((r) => ({ key: r.id, rank: r.joining?.trim() || null, title: r.title, target: r.sales?.trim() || null, slab: r.slab?.trim() || null, img: assetUrl(r.image_url) }))
  }
  return [...ranks]
    .filter((r) => r.active && r.reward_title)
    .sort((a, b) => a.seniority - b.seniority)
    .map((r) => ({
      key: r.id,
      rank: r.name,
      title: r.reward_title ?? '',
      target: Number(r.reward_sqyd ?? 0) > 0
        ? `${num(Number(r.reward_sqyd))} sq yd direct${Number(r.reward_group_sqyd ?? 0) > 0 ? ` + ${num(Number(r.reward_group_sqyd))} sq yd group` : ''}`
        : null,
      slab: null,
      img: null,
    }))
}
