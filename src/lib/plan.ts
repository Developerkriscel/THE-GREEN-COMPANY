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

/** The deck's "Group Sales / Direct Sales" for the monthly bonus, e.g. "50 sq yd group + 50 sq yd direct a month". */
export function bonusCondition(r: Pick<Rank, 'bonus_direct_sqyd' | 'bonus_group_sqyd'>) {
  const g = Number(r.bonus_group_sqyd ?? 0)
  const d = Number(r.bonus_direct_sqyd ?? 0)
  if (!g && !d) return ''
  return `${[g > 0 && `${num(g)} sq yd group`, d > 0 && `${num(d)} sq yd direct`].filter(Boolean).join(' + ')} a month`
}

/**
 * Plan rules the deck states in words (slides 6, 10, 11). Shown with the
 * rank plan in the member's panel.
 */
export const PLAN_RULES = [
  'Rank condition: you must complete 3 criteria — 3 direct, group business and the qualifying rank.',
  'Rank selection chance is available only once.',
  'The joining fee is non-refundable.',
  'Channel Partner entry is allowed only after Core Manager rank. After Core Manager, Channel Partners are eligible for the 17%, 18%, 19% and 20% slabs.',
  'Diamond and Crown are Board Members: 1% of your own team’s turnover plus an iPhone as a gift.',
  'Incentive / bonus is given every month when that month’s group and direct sales reach your rank’s target.',
]

export function rankFeatures(r: Rank): string {
  const parts: string[] = []
  const fee = Number(r.training_fee ?? 0)
  if (fee > 0) parts.push(`${money(fee)} training fee`)
  if (r.training_note) parts.push(r.training_note)
  const board = Number(r.board_pct ?? 0)
  if (board > 0) parts.push(`Board Member: ${board}% of team turnover`)
  const salary = Number(r.salary ?? 0)
  if (salary > 0) parts.push(`${money(salary)} monthly bonus${bonusCondition(r) ? ` at ${bonusCondition(r)}` : ''}`)
  if (r.reward_title) {
    const d = Number(r.reward_sqyd ?? 0)
    const g = Number(r.reward_group_sqyd ?? 0)
    const target = [d > 0 && `${num(d)} sq yd direct`, g > 0 && `${num(g)} sq yd group`].filter(Boolean).join(' + ')
    parts.push(target ? `${r.reward_title} at ${target}` : r.reward_title)
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
