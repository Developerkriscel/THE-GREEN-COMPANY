import { describe, expect, it } from 'vitest'
import {
  autoMap, checkLeads, extractFromText, normalizeMobile, parseBudget, parseDate, parseVcf, rowsFromTable, toTable,
} from '@/lib/lead-import'

const defaults = { source: 'import', project_id: null, next_follow_up: '2026-10-01' }

describe('normalizeMobile', () => {
  it('reduces every Indian form to the same 10 digits', () => {
    for (const v of ['9876543210', '+91 98765 43210', '91-9876543210', '09876543210', '(+91) 98765-43210']) {
      expect(normalizeMobile(v)).toBe('9876543210')
    }
  })
  it('keeps other countries with their code, and rejects short numbers', () => {
    expect(normalizeMobile('+1 415 555 0132')).toBe('+14155550132')
    expect(normalizeMobile('12345')).toBeNull()
    expect(normalizeMobile('')).toBeNull()
  })
})

describe('tables', () => {
  it('guesses columns from their headings', () => {
    const t = toTable([
      ['S.No', 'Customer Name', 'Contact No.', 'E-mail', 'City', 'Remarks'],
      ['1', 'Rahul', '9876543210', 'r@x.in', 'Delhi', 'hot'],
    ])
    const m = autoMap(t)
    expect(t.headers[m.name!]).toBe('Customer Name')
    expect(t.headers[m.mobile!]).toBe('Contact No.')
    expect(t.headers[m.email!]).toBe('E-mail')
    expect(t.headers[m.city!]).toBe('City')
    expect(t.headers[m.remark!]).toBe('Remarks')
  })

  it('treats a first row of data as data, and finds the phone column by its contents', () => {
    const t = toTable([
      ['Rahul Sharma', '98765 43210'],
      ['Priya Verma', '9876543211'],
    ])
    expect(t.rows).toHaveLength(2)
    const m = autoMap(t)
    expect(m.mobile).toBe(1)
    expect(m.name).toBe(0)
  })

  it('joins first and last name', () => {
    const t = toTable([['First Name', 'Last Name', 'Mobile'], ['Rahul', 'Sharma', '9876543210']])
    const raws = rowsFromTable(t, autoMap(t))
    expect(raws[0].name).toBe('Rahul Sharma')
  })
})

describe('free text (PDF, Word, WhatsApp)', () => {
  it('reads "name number" lines, numbered lists and name-then-number pairs', () => {
    const leads = extractFromText([
      '1. Rahul Sharma - 9876543210',
      '2) Priya Verma, +91 98765 43211, priya@mail.com',
      'Amit Kumar',
      '9876543212',
      'Mob: 9876543213 Name: Neha',
    ].join('\n'))
    expect(leads.map((l) => [l.name, normalizeMobile(l.mobile)])).toEqual([
      ['Rahul Sharma', '9876543210'],
      ['Priya Verma', '9876543211'],
      ['Amit Kumar', '9876543212'],
      ['Neha', '9876543213'],
    ])
    expect(leads[1].email).toBe('priya@mail.com')
  })
})

describe('contacts (.vcf)', () => {
  it('reads name, phone and e-mail from each card', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Rahul Sharma', 'TEL;TYPE=CELL:+91 98765 43210', 'EMAIL:rahul@x.in', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Verma;Priya;;;', 'TEL:9876543211', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:No Number', 'END:VCARD',
    ].join('\r\n')
    const leads = parseVcf(vcf)
    expect(leads).toHaveLength(2)
    expect(leads[0]).toMatchObject({ name: 'Rahul Sharma', email: 'rahul@x.in' })
    expect(leads[1].name).toBe('Priya Verma')
  })
})

describe('values', () => {
  it('reads Indian budgets', () => {
    expect(parseBudget('5 lakh')).toBe(500000)
    expect(parseBudget('₹50,00,000')).toBe(5000000)
    expect(parseBudget('1.2 Cr')).toBe(12000000)
    expect(parseBudget('')).toBeNull()
  })
  it('reads dates day-first, ISO, and Excel day numbers', () => {
    expect(parseDate('15/10/2026')).toBe('2026-10-15')
    expect(parseDate('2026-10-15')).toBe('2026-10-15')
    expect(parseDate('46310')).toBe('2026-10-15')
    expect(parseDate('31/13/2026')).toBeNull()
  })
})

describe('checkLeads', () => {
  it('marks duplicates within the file and against existing leads, and rows without a number', () => {
    const out = checkLeads(
      [
        { name: 'A', mobile: '9876543210' },
        { name: 'B', mobile: '+91 98765 43210' }, // same number again
        { name: 'C', mobile: '9876543299' },      // already a lead
        { name: 'D', mobile: '12' },
        { name: '', mobile: '9876543288' },       // no name
      ],
      defaults,
      ['09876543299'],
    )
    expect(out.map((r) => r.status)).toEqual(['ready', 'duplicate', 'duplicate', 'invalid', 'ready'])
    expect(out[1].reason).toBe('Repeated in this file')
    expect(out[2].reason).toBe('Already in your leads')
    expect(out[4].lead!.name).toBe('Lead 3288')
    expect(out[0].lead).toMatchObject({ mobile: '9876543210', source: 'import', next_follow_up: '2026-10-01', status: 'new' })
  })

  it('folds the city into the remark and keeps a follow-up date from the file', () => {
    const [r] = checkLeads([{ name: 'Rahul', mobile: '9876543210', city: 'Delhi', remark: 'hot', next_follow_up: '20/10/2026' }], defaults, [])
    expect(r.lead).toMatchObject({ remark: 'hot · City: Delhi', next_follow_up: '2026-10-20' })
  })
})
