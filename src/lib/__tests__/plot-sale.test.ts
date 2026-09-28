import { describe, expect, it } from 'vitest'
import { addMonths, itemLabel, previewSchedule } from '../plot-sale'

const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0)

describe('addMonths', () => {
  it('clamps to the end of a shorter month, like Postgres', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })
})

describe('previewSchedule', () => {
  const base = { total: 1_000_000, bookingAmount: 100_000, emiCount: 6, start: '2026-10-01', milestones: [] }

  it('books the booking amount on the start date and EMIs monthly from a month later', () => {
    const { items, error } = previewSchedule(base)
    expect(error).toBeNull()
    expect(items[0]).toMatchObject({ kind: 'booking', label: 'Booking amount', due_date: '2026-10-01', amount: 100_000 })
    expect(items[1]).toMatchObject({ kind: 'emi', label: 'EMI 1', due_date: '2026-11-01' })
    expect(items[6]).toMatchObject({ label: 'EMI 6', due_date: '2027-04-01' })
    expect(sum(items)).toBe(1_000_000)
  })

  it('splits evenly in whole rupees with the rounding on the first EMI (as the SQL does)', () => {
    const { items } = previewSchedule(base)
    const emis = items.filter((i) => i.kind === 'emi')
    expect(emis.map((e) => e.amount)).toEqual([150_000, 150_000, 150_000, 150_000, 150_000, 150_000])
    const odd = previewSchedule({ ...base, total: 900_001, bookingAmount: 0, emiCount: 3 }).items
    expect(odd.map((e) => e.amount)).toEqual([300_001, 300_000, 300_000])
  })

  it('uses a typed EMI amount and puts what is left in a final balance', () => {
    const { items, error } = previewSchedule({ ...base, emiAmount: 140_000 })
    expect(error).toBeNull()
    expect(items.filter((i) => i.kind === 'emi').every((e) => e.amount === 140_000)).toBe(true)
    expect(items.at(-1)).toMatchObject({ kind: 'balance', amount: 60_000, due_date: '2027-05-01' })
    expect(sum(items)).toBe(1_000_000)
  })

  it('adds milestones on their own dates and takes them out of what the EMIs cover', () => {
    const { items, balance } = previewSchedule({
      ...base,
      milestones: [
        { label: 'Possession', due_date: '2027-09-01', amount: 50_000 },
        { label: 'Registry', due_date: '2027-06-01', amount: 150_000 },
      ],
    })
    expect(balance).toBe(700_000)
    expect(items.filter((i) => i.kind === 'milestone').map((i) => i.label)).toEqual(['Registry', 'Possession'])
    expect(items.at(-1)?.label).toBe('Possession') // sorted by date
    expect(sum(items)).toBe(1_000_000)
  })

  it('with no EMIs, the rest is one balance a month after booking', () => {
    const { items } = previewSchedule({ ...base, emiCount: 0 })
    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({ kind: 'balance', amount: 900_000, due_date: '2026-11-01' })
  })

  it('honours a first EMI date', () => {
    const { items } = previewSchedule({ ...base, firstEmi: '2026-12-15' })
    expect(items[1].due_date).toBe('2026-12-15')
    expect(items[2].due_date).toBe('2027-01-15')
  })

  it('refuses plans that do not add up', () => {
    expect(previewSchedule({ ...base, total: 0 }).error).toMatch(/total/)
    expect(previewSchedule({ ...base, bookingAmount: 1_200_000 }).error).toMatch(/more than the total/)
    expect(previewSchedule({ ...base, emiAmount: 200_000 }).error).toMatch(/more than the balance/)
    expect(previewSchedule({ ...base, emiCount: 0, emiAmount: 5_000 }).error).toMatch(/number of EMIs/)
    expect(previewSchedule({ ...base, milestones: [{ label: '', due_date: '2027-01-01', amount: 10 }] }).error).toMatch(/milestone/)
  })
})

describe('itemLabel', () => {
  it('falls back for rows written before labels existed', () => {
    expect(itemLabel({ seq: 0 })).toBe('Booking amount')
    expect(itemLabel({ seq: 3 })).toBe('EMI 3')
    expect(itemLabel({ seq: 101, label: 'Registry' })).toBe('Registry')
  })
})
