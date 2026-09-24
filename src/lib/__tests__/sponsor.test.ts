import { describe, expect, it } from 'vitest'
import {
  confirmedArea, inFinancialYear, inMonth, isCounted, legsOf, levelSummary,
  netOf, rankProgress, rewardTiers, walletFrom,
  type DownlineRow, type LedgerRow, type SaleRow, type WithdrawalRow,
} from '@/lib/sponsor'
import type { Profile, Rank } from '@/lib/types'

/**
 * Unit tests for the money and rank arithmetic.
 *
 * These are the calculations a member will argue with the office about, so
 * they are tested in isolation from the database and the UI: given these rows,
 * this number, every time.
 */

const led = (p: Partial<LedgerRow>): LedgerRow => ({
  id: Math.random().toString(36).slice(2),
  member_id: 'm', kind: 'credit', source: 'direct_income', reference: null,
  amount: 0, gross: 0, tds: 0, admin_charge: 0, net: 0,
  status: 'credited', level: null, from_member_id: null, booking_id: null,
  area_sqyd: null, rate_applied: null, in_kind: false, note: null,
  created_at: new Date().toISOString(),
  ...p,
})

const dl = (p: Partial<DownlineRow>): DownlineRow => ({
  id: Math.random().toString(36).slice(2),
  member_code: 'RGC1', full_name: 'X', rank_name: null, rank_seniority: 1,
  status: 'active', level: 1, direct_count: 0, team_count: 0,
  joined: new Date().toISOString(), sponsor_id: null, sponsor_code: null, sponsor_name: null,
  ...p,
})

const rank = (p: Partial<Rank>): Rank => ({
  id: `r${p.seniority}`, name: `Rank ${p.seniority}`, seniority: 1,
  own_sale_rate: 5, description: null, active: true,
  req_direct: 0, req_team: 0, req_legs: 0, req_rank_sen: null, req_rank_count: 0,
  reward_title: null, reward_sqyd: 0, salary: 0, joining_fee: 0, override_pct: 0,
  ...p,
})

describe('isCounted - what may touch a total', () => {
  it('counts an ordinary credited row', () => {
    expect(isCounted(led({ net: 100 }))).toBe(true)
  })
  it('excludes a reversed row', () => {
    expect(isCounted(led({ net: 100, status: 'reversed' }))).toBe(false)
  })
  it('excludes a reward awarded in kind, which never hit the wallet', () => {
    expect(isCounted(led({ net: 100, in_kind: true }))).toBe(false)
  })
})

describe('netOf - signed sum', () => {
  it('adds credits and subtracts debits', () => {
    expect(netOf([led({ net: 100 }), led({ net: 40, kind: 'debit' })])).toBe(60)
  })
  it('ignores reversed and in-kind rows', () => {
    expect(netOf([
      led({ net: 100 }),
      led({ net: 999, status: 'reversed' }),
      led({ net: 999, in_kind: true }),
    ])).toBe(100)
  })
  it('is 0 for an empty ledger, not NaN', () => {
    expect(netOf([])).toBe(0)
  })
})

describe('walletFrom - the balance identity', () => {
  const wd = (p: Partial<WithdrawalRow>): WithdrawalRow => ({
    id: 'w', member_id: 'm', amount: 0, account: null, utr: null,
    status: 'paid', requested_at: '', processed_at: null, approved_at: null,
    paid_at: null, payout_reference: null, reject_reason: null, note: null,
    ...p,
  })

  it('available = credited minus withdrawn minus pending', () => {
    const w = walletFrom(
      [led({ net: 10000 })],
      [wd({ amount: 2000, status: 'paid' }), wd({ amount: 500, status: 'requested' })],
    )
    expect(w.credited).toBe(10000)
    expect(w.withdrawn).toBe(2000)
    expect(w.pending).toBe(500)
    expect(w.available).toBe(7500)
  })

  it('treats an approved-but-unpaid request as still held', () => {
    const w = walletFrom([led({ net: 1000 })], [wd({ amount: 300, status: 'approved' })])
    expect(w.pending).toBe(300)
    expect(w.available).toBe(700)
  })

  it('rejected and cancelled requests return the money', () => {
    const w = walletFrom(
      [led({ net: 1000 })],
      [wd({ amount: 300, status: 'rejected' }), wd({ amount: 200, status: 'cancelled' })],
    )
    expect(w.pending).toBe(0)
    expect(w.available).toBe(1000)
  })
})

describe('levelSummary - always twelve levels', () => {
  it('returns all 12 even when the team is one level deep', () => {
    const s = levelSummary([dl({ level: 1 })], [])
    expect(s).toHaveLength(12)
    expect(s[0].members).toBe(1)
    expect(s[11].members).toBe(0)
  })

  it('attributes level income to the right level', () => {
    const s = levelSummary(
      [dl({ level: 1 }), dl({ level: 2 })],
      [led({ source: 'level_income', level: 2, net: 750 })],
    )
    expect(s[0].income).toBe(0)
    expect(s[1].income).toBe(750)
  })

  it('counts active separately from total', () => {
    const s = levelSummary([dl({ level: 1 }), dl({ level: 1, status: 'pending' })], [])
    expect(s[0].members).toBe(2)
    expect(s[0].active).toBe(1)
  })
})

describe('rankProgress', () => {
  const ladder = [
    rank({ seniority: 1 }),
    rank({ seniority: 2, req_direct: 3, req_team: 9 }),
    rank({ seniority: 3, req_direct: 3, req_team: 18, req_rank_sen: 2, req_rank_count: 1 }),
  ]
  const profile = (sen: number) => ({ rank: ladder.find((r) => r.seniority === sen) }) as Profile

  it('names the next rank up', () => {
    const p = rankProgress(profile(1), ladder, [])
    expect(p.next?.seniority).toBe(2)
  })

  it('reports the top rank as having no next', () => {
    const p = rankProgress(profile(3), ladder, [])
    expect(p.next).toBeNull()
    expect(p.allMet).toBe(true)
  })

  it('the bar is the LOWEST requirement, so it never over-promises', () => {
    // 3 of 3 directs (100%) but 3 of 9 team (33%) -> 33%, not the average.
    const team = [dl({ level: 1 }), dl({ level: 1 }), dl({ level: 1 })]
    const p = rankProgress(profile(1), ladder, team)
    expect(p.percent).toBe(33)
  })

  it('caps at 100% while the numeric label stays truthful', () => {
    const team = Array.from({ length: 20 }, () => dl({ level: 1 }))
    const p = rankProgress(profile(1), ladder, team)
    expect(p.percent).toBe(100)
    const directs = p.requirements.find((r) => r.label === 'Direct members')!
    expect(directs.achieved).toBe(20)
    expect(directs.required).toBe(3)
  })

  it('names the requirement the member is closest on', () => {
    const team = [dl({ level: 1 }), dl({ level: 1 })] // 2 of 3 direct, 2 of 9 team
    const p = rankProgress(profile(1), ladder, team)
    expect(p.biggestGap?.label).toBe('Direct members')
  })

  it('counts qualified members anywhere in the team, at any depth', () => {
    const team = [
      dl({ level: 1, rank_seniority: 1 }),
      dl({ level: 2, rank_seniority: 2 }),
    ]
    const p = rankProgress(profile(2), ladder, team)
    const qualified = p.requirements.find((r) => r.label.includes('members in team'))
    expect(qualified?.achieved).toBe(1)
  })
})

describe('rewardTiers', () => {
  const ladder = [
    rank({ seniority: 2, reward_title: 'Juicer', reward_sqyd: 100 }),
    rank({ seniority: 3, reward_title: 'Mixer', reward_sqyd: 100 }),
    rank({ seniority: 8, reward_title: 'Laptop', reward_sqyd: 500 }),
    rank({ seniority: 1 }), // no reward - must be dropped
  ]

  it('drops ranks with no reward', () => {
    expect(rewardTiers(ladder, 0)).toHaveLength(3)
  })

  it('marks every tier at or below the area as earned', () => {
    const t = rewardTiers(ladder, 100)
    expect(t.filter((x) => x.earned)).toHaveLength(2)
  })

  it('reaching a tier does not consume the area', () => {
    // 500 sq yd earns the 100s AND the 500 - progress is cumulative.
    expect(rewardTiers(ladder, 500).every((x) => x.earned)).toBe(true)
  })

  it('sorts by target so "next" is the lowest unearned', () => {
    const t = rewardTiers(ladder, 0)
    expect(t.map((x) => x.targetSqyd)).toEqual([100, 100, 500])
    expect(t.find((x) => !x.earned)?.title).toBe('Juicer')
  })

  it('tiers sharing a target stay distinct, by identity not value', () => {
    const t = rewardTiers(ladder, 0)
    const hundreds = t.filter((x) => x.targetSqyd === 100)
    expect(new Set(hundreds.map((x) => x.seniority)).size).toBe(2)
  })
})

describe('confirmedArea - only confirmed sales count', () => {
  const sale = (status: string, size: number): SaleRow => ({
    id: 's', reference: 'BK', status, sale_value: 0, created_at: '', step3_at: null,
    plot: { id: 'p', number: '1', size, size_unit: 'sqyd' }, project: null,
  })

  it('ignores pending and cancelled sales', () => {
    expect(confirmedArea([sale('confirmed', 100), sale('step1_done', 500), sale('cancelled', 900)]))
      .toBe(100)
  })
})

describe('legsOf - one leg per direct member', () => {
  it('groups the whole branch under its level-1 head', () => {
    const a = dl({ id: 'a', level: 1 })
    const b = dl({ id: 'b', level: 2, sponsor_id: 'a' })
    const c = dl({ id: 'c', level: 3, sponsor_id: 'b' })
    const legs = legsOf([a, b, c])
    expect(legs).toHaveLength(1)
    expect(legs[0].branch.map((x) => x.id).sort()).toEqual(['b', 'c'])
  })
})

describe('date windows', () => {
  it('inMonth matches the same calendar month', () => {
    const ref = new Date(2026, 8, 15)
    expect(inMonth(new Date(2026, 8, 1).toISOString(), ref)).toBe(true)
    expect(inMonth(new Date(2026, 7, 31).toISOString(), ref)).toBe(false)
  })

  it('inFinancialYear runs 1 Apr to 31 Mar', () => {
    const ref = new Date(2026, 8, 15) // Sep 2026 -> FY Apr 2026 to Mar 2027
    expect(inFinancialYear(new Date(2026, 3, 1).toISOString(), ref)).toBe(true)
    expect(inFinancialYear(new Date(2027, 2, 31).toISOString(), ref)).toBe(true)
    expect(inFinancialYear(new Date(2026, 2, 31).toISOString(), ref)).toBe(false)
  })
})
