import { describe, expect, it } from 'vitest'
import {
  collectionTotals, collectionsOf, dayStart, leadBuckets, payoutCycle, rewardQualifyingArea,
  type EmiRow, type LeadRow, type LeadStatus, type PaymentRow,
} from '@/lib/sponsor-crm'
import type { SaleRow } from '@/lib/sponsor'

/**
 * The CRM arithmetic, tested away from the database and the UI.
 *
 * Every function here takes a `ref` date so the assertions do not drift with
 * the calendar — a suite that passes in September and fails in February is
 * worse than no suite at all.
 */

const lead = (p: Partial<LeadRow>): LeadRow => ({
  id: Math.random().toString(36).slice(2),
  owner_id: 'm', name: 'X', mobile: '9990001111', email: null, project_id: null,
  category: null, budget: null, visit_date: null, token_amount: null,
  plot_number: null, source: 'referral', remark: null, status: 'new',
  next_follow_up: null, converted_booking_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...p,
})

const emi = (p: Partial<EmiRow>): EmiRow => ({
  id: Math.random().toString(36).slice(2),
  booking_id: 'b1', seq: 1, due_date: '2026-09-01', amount: 1000,
  status: 'pending', paid_at: null, reference: null,
  ...p,
})

const pay = (p: Partial<PaymentRow>): PaymentRow => ({
  id: Math.random().toString(36).slice(2),
  booking_id: 'b1', emi_id: null, amount: 0, mode: 'bank_transfer',
  reference: null, paid_on: '2026-09-01', receipt_no: null,
  ...p,
})

const sale = (p: Partial<SaleRow>): SaleRow => ({
  id: 'b1', reference: 'BK-1', status: 'confirmed', sale_value: 10000,
  created_at: '2026-01-01T00:00:00Z', step3_at: null, plot: null, project: null,
  ...p,
})

/* ------------------------------------------------------------ payout cycle */

describe('payoutCycle - which fortnight the member is paid on', () => {
  it('puts a day-5 joiner on the 1-15 cycle, paid on the 15th', () => {
    const c = payoutCycle('2026-01-05T00:00:00Z', new Date(2026, 8, 1))!
    expect(c.joinDay).toBe(5)
    expect(c.cycle).toBe('1-15')
    expect(c.payoutDay).toBe(15)
  })

  it('puts a day-20 joiner on the 16-30 cycle, paid on the 30th', () => {
    const c = payoutCycle('2026-01-20T00:00:00Z', new Date(2026, 8, 1))!
    expect(c.cycle).toBe('16-30')
    expect(c.payoutDay).toBe(30)
  })

  it('the 15th boundary belongs to the first cycle, the 16th to the second', () => {
    expect(payoutCycle('2026-01-15T00:00:00Z', new Date(2026, 8, 1))!.cycle).toBe('1-15')
    expect(payoutCycle('2026-01-16T00:00:00Z', new Date(2026, 8, 1))!.cycle).toBe('16-30')
  })

  it('rolls to next month once this month\'s date has passed', () => {
    // 24 Sep, paid on the 15th -> September's date is gone, so October's.
    const c = payoutCycle('2026-01-05T00:00:00Z', new Date(2026, 8, 24))!
    expect(c.next.getMonth()).toBe(9)
    expect(c.next.getDate()).toBe(15)
  })

  it('a payout landing today is today, not next month', () => {
    const c = payoutCycle('2026-01-05T00:00:00Z', new Date(2026, 8, 15))!
    expect(c.next.getMonth()).toBe(8)
    expect(c.daysAway).toBe(0)
  })

  it('clamps the 30th to the last day of February rather than skipping it', () => {
    // Feb 2026 has 28 days; a "30th" member is paid on the 28th, not in March.
    const c = payoutCycle('2026-01-20T00:00:00Z', new Date(2026, 1, 1))!
    expect(c.next.getMonth()).toBe(1)
    expect(c.next.getDate()).toBe(28)
  })

  it('counts the days remaining', () => {
    const c = payoutCycle('2026-01-05T00:00:00Z', new Date(2026, 8, 10))!
    expect(c.daysAway).toBe(5)
  })

  it('returns null rather than guessing when the join date is unknown', () => {
    expect(payoutCycle(null)).toBeNull()
    expect(payoutCycle('not a date')).toBeNull()
  })
})

/* -------------------------------------------------------------- lead triage */

describe('leadBuckets', () => {
  const ref = new Date(2026, 8, 24) // 24 Sep 2026
  const on = (d: string, status: LeadStatus = 'new') => lead({ next_follow_up: d, status })

  it('separates overdue from due-soon by today', () => {
    const b = leadBuckets([on('2026-09-20'), on('2026-09-24'), on('2026-09-28')], ref)
    expect(b.overdue).toHaveLength(1)
    // Today and +4 days both fall inside the seven-day window.
    expect(b.dueSoon).toHaveLength(2)
  })

  it('leaves a follow-up beyond seven days out of both buckets', () => {
    const b = leadBuckets([on('2026-10-30')], ref)
    expect(b.overdue).toHaveLength(0)
    expect(b.dueSoon).toHaveLength(0)
  })

  it('never chases a converted or lost lead', () => {
    const b = leadBuckets([on('2026-09-01', 'converted'), on('2026-09-01', 'lost')], ref)
    expect(b.overdue).toHaveLength(0)
    expect(b.open).toBe(0)
  })

  it('sorts the overdue list oldest first, so the worst is at the top', () => {
    const b = leadBuckets([on('2026-09-22'), on('2026-09-10'), on('2026-09-18')], ref)
    expect(b.overdue.map((l) => l.next_follow_up)).toEqual(['2026-09-10', '2026-09-18', '2026-09-22'])
  })

  it('ignores a lead with no follow-up date rather than treating it as overdue', () => {
    const b = leadBuckets([lead({ next_follow_up: null })], ref)
    expect(b.overdue).toHaveLength(0)
    expect(b.open).toBe(1)
  })

  it('measures conversion against closed leads only', () => {
    // 1 converted, 1 lost, 2 still open -> 50%, not 25%.
    const b = leadBuckets(
      [lead({ status: 'converted' }), lead({ status: 'lost' }), lead({}), lead({})],
      ref,
    )
    expect(b.conversionPct).toBe(50)
  })

  it('is 0% rather than NaN when nothing has closed', () => {
    expect(leadBuckets([lead({}), lead({})], ref).conversionPct).toBe(0)
  })

  it('reports every status, including the empty ones', () => {
    const b = leadBuckets([lead({})], ref)
    expect(b.byStatus).toHaveLength(7)
    expect(b.byStatus.find((s) => s.status === 'new')?.count).toBe(1)
    expect(b.byStatus.find((s) => s.status === 'lost')?.count).toBe(0)
  })
})

/* ---------------------------------------------------------------- payments */

describe('collectionsOf', () => {
  const ref = new Date(2026, 8, 24)

  it('sums receipts and leaves the rest outstanding', () => {
    const [r] = collectionsOf([sale({ sale_value: 10000 })], [], [pay({ amount: 4000 })], ref)
    expect(r.collected).toBe(4000)
    expect(r.outstanding).toBe(6000)
    expect(r.collectedPct).toBe(40)
  })

  it('never reports negative outstanding when a customer overpays', () => {
    const [r] = collectionsOf([sale({ sale_value: 10000 })], [], [pay({ amount: 12000 })], ref)
    expect(r.outstanding).toBe(0)
    expect(r.collectedPct).toBe(100)
  })

  it('counts an unpaid instalment past its due date as overdue', () => {
    const [r] = collectionsOf(
      [sale({})],
      [emi({ seq: 1, due_date: '2026-09-01' }), emi({ seq: 2, due_date: '2026-10-01' })],
      [], ref,
    )
    expect(r.overdue).toHaveLength(1)
    expect(r.overdue[0].seq).toBe(1)
  })

  it('does not chase an instalment that is paid, verified or waived', () => {
    const [r] = collectionsOf(
      [sale({})],
      [
        emi({ seq: 1, due_date: '2026-01-01', status: 'paid' }),
        emi({ seq: 2, due_date: '2026-01-01', status: 'verified' }),
        emi({ seq: 3, due_date: '2026-01-01', status: 'waived' }),
      ],
      [], ref,
    )
    expect(r.overdue).toHaveLength(0)
    expect(r.nextDue).toBeNull()
  })

  it('names the soonest unsettled instalment as next due', () => {
    const [r] = collectionsOf(
      [sale({})],
      [
        emi({ seq: 2, due_date: '2026-11-01' }),
        emi({ seq: 1, due_date: '2026-10-01' }),
      ],
      [], ref,
    )
    expect(r.nextDue?.seq).toBe(1)
  })

  it('keeps one booking\'s money out of another\'s', () => {
    const rows = collectionsOf(
      [sale({ id: 'b1', sale_value: 10000 }), sale({ id: 'b2', reference: 'BK-2', sale_value: 10000 })],
      [],
      [pay({ booking_id: 'b1', amount: 5000 })],
      ref,
    )
    expect(rows[0].collected).toBe(5000)
    expect(rows[1].collected).toBe(0)
  })

  it('is 0%, not NaN, for a booking with no sale value', () => {
    const [r] = collectionsOf([sale({ sale_value: 0 })], [], [], ref)
    expect(r.collectedPct).toBe(0)
  })
})

describe('collectionTotals', () => {
  const ref = new Date(2026, 8, 24)

  it('adds up across bookings', () => {
    const rows = collectionsOf(
      [sale({ id: 'b1', sale_value: 10000 }), sale({ id: 'b2', reference: 'BK-2', sale_value: 30000 })],
      [emi({ booking_id: 'b1', due_date: '2026-09-01', amount: 2500 })],
      [pay({ booking_id: 'b1', amount: 5000 })],
      ref,
    )
    const t = collectionTotals(rows)
    expect(t.saleValue).toBe(40000)
    expect(t.collected).toBe(5000)
    expect(t.outstanding).toBe(35000)
    expect(t.overdueCount).toBe(1)
    expect(t.overdueAmount).toBe(2500)
    expect(t.collectedPct).toBe(13)
  })

  it('is all zeroes for a member with no bookings', () => {
    const t = collectionTotals([])
    expect(t.saleValue).toBe(0)
    expect(t.collectedPct).toBe(0)
    expect(t.bookings).toBe(0)
  })
})

/* ------------------------------------------------------- wire-format dates */

describe('dayStart - a `date` column arrives in two different shapes', () => {
  it('accepts the bare form PostgREST returns', () => {
    expect(dayStart('2026-09-24')).toBe(new Date(2026, 8, 24).getTime())
  })

  it('accepts the full ISO timestamp this gateway returns', () => {
    // 2026-09-23T18:30Z is midnight on the 24th in IST. Regression: the old
    // code appended 'T00:00:00' to this and produced Invalid Date, so every
    // comparison came out false and a due follow-up quietly stopped being due.
    const iso = new Date(2026, 8, 24).toISOString()
    expect(dayStart(iso)).toBe(new Date(2026, 8, 24).getTime())
  })

  it('strips the time, so two moments on one day compare equal', () => {
    expect(dayStart('2026-09-24T23:59:59.000+05:30')).toBe(dayStart('2026-09-24'))
  })

  it('is NaN for null or nonsense rather than 1970', () => {
    expect(dayStart(null)).toBeNaN()
    expect(dayStart('')).toBeNaN()
    expect(dayStart('whenever')).toBeNaN()
  })
})

describe('leadBuckets with gateway-shaped dates', () => {
  const ref = new Date(2026, 8, 24)
  const iso = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

  it('sees a follow-up due today even as a full timestamp', () => {
    const b = leadBuckets([lead({ next_follow_up: iso(2026, 8, 24) })], ref)
    expect(b.dueSoon).toHaveLength(1)
  })

  it('sees an overdue follow-up even as a full timestamp', () => {
    const b = leadBuckets([lead({ next_follow_up: iso(2026, 8, 10) })], ref)
    expect(b.overdue).toHaveLength(1)
  })

  it('does not call an unparseable date overdue', () => {
    const b = leadBuckets([lead({ next_follow_up: 'soon' })], ref)
    expect(b.overdue).toHaveLength(0)
    expect(b.dueSoon).toHaveLength(0)
  })
})

describe('collectionsOf with gateway-shaped dates', () => {
  const ref = new Date(2026, 8, 24)
  const iso = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

  it('still flags an overdue instalment when due_date is a timestamp', () => {
    const [r] = collectionsOf([sale({})], [emi({ due_date: iso(2026, 8, 1) })], [], ref)
    expect(r.overdue).toHaveLength(1)
  })

  it('orders instalments by date, not by string, across both shapes', () => {
    const [r] = collectionsOf(
      [sale({})],
      [emi({ seq: 2, due_date: iso(2026, 10, 1) }), emi({ seq: 1, due_date: '2026-10-01' })],
      [], ref,
    )
    expect(r.emis[0].seq).toBe(1)
  })
})

/* ------------------------------------------------- reward-qualifying area */

describe('rewardQualifyingArea - slide 7, "Reward Count After 50% payment"', () => {
  const plot = (size: number) => ({ id: 'p', number: '1', size, size_unit: 'sqyd' })

  it('counts a sale once half the value is in', () => {
    const s = [sale({ id: 'b1', sale_value: 10000, plot: plot(100) })]
    expect(rewardQualifyingArea(s, [pay({ booking_id: 'b1', amount: 5000 })])).toBe(100)
  })

  it('does not count a sale one rupee short of half', () => {
    const s = [sale({ id: 'b1', sale_value: 10000, plot: plot(100) })]
    expect(rewardQualifyingArea(s, [pay({ booking_id: 'b1', amount: 4999 })])).toBe(0)
  })

  it('a confirmed sale with nothing collected earns no reward progress', () => {
    const s = [sale({ id: 'b1', sale_value: 10000, plot: plot(500) })]
    expect(rewardQualifyingArea(s, [])).toBe(0)
  })

  it('adds several part-payments together before testing the threshold', () => {
    const s = [sale({ id: 'b1', sale_value: 10000, plot: plot(100) })]
    const p = [
      pay({ booking_id: 'b1', amount: 2000 }),
      pay({ booking_id: 'b1', amount: 3000 }),
    ]
    expect(rewardQualifyingArea(s, p)).toBe(100)
  })

  it('ignores a sale that is not confirmed, however much is paid', () => {
    const s = [sale({ id: 'b1', status: 'step1_done', sale_value: 10000, plot: plot(100) })]
    expect(rewardQualifyingArea(s, [pay({ booking_id: 'b1', amount: 10000 })])).toBe(0)
  })

  it('does not let a payment on one booking qualify another', () => {
    const s = [
      sale({ id: 'b1', sale_value: 10000, plot: plot(100) }),
      sale({ id: 'b2', reference: 'BK-2', sale_value: 10000, plot: plot(900) }),
    ]
    expect(rewardQualifyingArea(s, [pay({ booking_id: 'b1', amount: 9000 })])).toBe(100)
  })

  it('treats a sale with no value as unqualifiable rather than free', () => {
    const s = [sale({ id: 'b1', sale_value: 0, plot: plot(100) })]
    expect(rewardQualifyingArea(s, [])).toBe(0)
  })
})
