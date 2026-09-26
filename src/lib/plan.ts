import { money, num, pct } from '@/lib/format'
import type { Rank } from '@/lib/types'

/**
 * The public plan tables, built from the ranks the income engine actually
 * pays on. The office edits ranks once (Admin → Business Settings → Rank
 * plan) and the Plans page, the Home page and the sponsor panel all follow;
 * they used to carry their own typed-in copies, which drifted from the plan.
 */
export interface PlanRow {
  rank: string
  joining: string
  /** Sponsor slab: paid on a direct recruit's sale. */
  direct: string
  /** Own-sale slab. */
  pct: string
  features: string
  elite: boolean
}

/** From this seniority up a rank is shown as elite (a car reward). */
export const ELITE_FROM_SENIORITY = 9

export function joiningLabel(r: Pick<Rank, 'joining_fee'>) {
  return Number(r.joining_fee ?? 0) > 0 ? money(Number(r.joining_fee)) : 'Free'
}

export function rankFeatures(r: Rank): string {
  const parts: string[] = []
  const fee = Number(r.training_fee ?? 0)
  if (fee > 0) parts.push(`${money(fee)} training fee`)
  if (r.training_note) parts.push(r.training_note)
  const salary = Number(r.salary ?? 0)
  if (salary > 0) parts.push(`${money(salary)} monthly salary`)
  if (r.reward_title) {
    const at = Number(r.reward_sqyd ?? 0)
    parts.push(at > 0 ? `${r.reward_title} at ${num(at)} sq yd` : r.reward_title)
  }
  return parts.join(' · ')
}

export function planRows(ranks: Rank[]): PlanRow[] {
  return [...ranks]
    .filter((r) => r.active)
    .sort((a, b) => a.seniority - b.seniority)
    .map((r) => ({
      rank: r.name,
      joining: joiningLabel(r),
      direct: Number(r.override_pct ?? 0) > 0 ? pct(Number(r.override_pct)) : '—',
      pct: pct(Number(r.own_sale_rate)),
      features: rankFeatures(r),
      elite: r.seniority >= ELITE_FROM_SENIORITY,
    }))
}
