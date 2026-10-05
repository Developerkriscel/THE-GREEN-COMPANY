#!/usr/bin/env node
/**
 * End-to-end test of the Payments CRM, over HTTP through the gateway.
 *
 *   node server/index.mjs &            # gateway must be running
 *   node scripts/test-payments-crm.mjs
 *
 * A member files a "New plot sale" (booking amount, EMIs, milestones), the
 * schedule appears at once, the member uploads a receipt, the office verifies
 * it (one payment, not two) or sends it back; the office records money at the
 * counter (again counted once), files and confirms its own sale (the buyer's
 * customer account is attached by mobile), and a rejected sale drops its
 * unpaid schedule and frees the plot.
 *
 * No member's sale is confirmed, so no income is distributed; everything the
 * run creates is removed at the end (local and live share one database).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { junit } from './lib/junit.mjs'
import { ADMIN, REP, passwordFor } from './lib/test-accounts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const BASE = process.env.GATEWAY_URL ?? 'http://localhost:54321'
const ANON = env.VITE_SUPABASE_ANON_KEY

const mk = () => createClient(BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
db.on('error', (e) => console.log(`  db connection error: ${e.message}`))
await db.connect()

let passed = 0
let failed = 0
const report = junit('payments-crm')
function check(label, ok, detail) {
  report.add('Payments CRM', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}
const sum = (xs, k = 'amount') => xs.reduce((t, x) => t + Number(x[k]), 0)
const iso = (d) => d.toISOString().slice(0, 10)

const TAG = String(Date.now()).slice(-9)
const BUYER_PHONE = '7' + TAG
const bookings = []
const plots = []
let customerId = null
const slips = []

const sale = (plotId, extra = {}) => ({
  p_plot_id: plotId, p_customer_name: `Gwtest Buyer ${TAG}`, p_customer_phone: BUYER_PHONE,
  p_customer_email: `buyer${TAG}@example.com`, p_customer_address: '1 Test Road', p_area: 100, p_rate: 10000,
  p_total: null, p_booking_amount: 100000, p_emi_count: 6, p_emi_amount: null, p_start_date: iso(new Date()),
  p_notes: 'gwtest', p_milestones: [{ label: 'Registry', due_date: '2027-12-01', amount: 100000 }], ...extra,
})

try {
  const admin = mk()
  const rep = mk()
  const other = mk()
  check('admin signs in', !(await admin.auth.signInWithPassword(ADMIN)).error)
  check('member signs in', !(await rep.auth.signInWithPassword(REP)).error)
  const { rows: [o] } = await db.query(`select email from public.profiles where role = 'rep' and status = 'active' and email like '%@members.rsgc.local' and email <> $1 order by member_code limit 1`, [REP.email])
  check('a second member signs in', o && !(await other.auth.signInWithPassword({ email: o.email, password: passwordFor(o.email) })).error)

  const { data: avail } = await rep.rpc('available_plots')
  const [p1, p2, p3] = (avail ?? []).slice(-3)
  check('three plots are available to test with', p1 && p2 && p3)
  plots.push(p1.id, p2.id, p3.id)

  console.log('\nThe member files a new plot sale')
  const bad1 = await rep.rpc('create_plot_sale', sale(p1.id, { p_booking_amount: 950000 }))
  check('booking + milestones over the total is refused', /more than the total/.test(bad1.error?.message ?? ''), bad1.error?.message)
  const bad2 = await rep.rpc('create_plot_sale', sale(p1.id, { p_emi_amount: 200000 }))
  check('EMIs over the balance are refused', /more than the balance/.test(bad2.error?.message ?? ''), bad2.error?.message)
  const bad3 = await rep.rpc('create_plot_sale', sale(p1.id, { p_confirm: true }))
  check('a member cannot confirm their own sale', /Only the office/.test(bad3.error?.message ?? ''), bad3.error?.message)
  const bad4 = await rep.rpc('create_plot_sale', sale(p1.id, { p_milestones: [{ label: '', due_date: '2027-01-01', amount: 5 }] }))
  check('a milestone without a label is refused', /milestone/.test(bad4.error?.message ?? ''), bad4.error?.message)

  const s1 = await rep.rpc('create_plot_sale', sale(p1.id))
  check('the sale is filed', !s1.error && s1.data, s1.error?.message)
  bookings.push(s1.data)
  const { data: b1 } = await rep.from('bookings').select('status, sale_value, area, rate_per_unit, customer_email, notes, token_amount').eq('id', s1.data).single()
  check('area × rate became the total and the details were kept',
    b1?.status === 'step1_done' && Number(b1.sale_value) === 1000000 && Number(b1.rate_per_unit) === 10000 && b1.customer_email?.startsWith('buyer') && b1.notes === 'gwtest', JSON.stringify(b1))

  const { data: items } = await rep.from('emis').select('id, seq, kind, label, amount, due_date, status').eq('booking_id', s1.data).order('seq')
  check('the schedule exists at once: booking + 6 EMIs + 1 milestone', items?.length === 8, `${items?.length} items`)
  check('it adds up to the total', sum(items ?? []) === 1000000, String(sum(items ?? [])))
  check('booking amount on the start date', items?.[0]?.kind === 'booking' && Number(items[0].amount) === 100000 && String(items[0].due_date).slice(0, 10) <= iso(new Date(Date.now() + 86400000)))
  check('EMIs split the 8,00,000 evenly', (items ?? []).filter((i) => i.kind === 'emi').reduce((t, i) => t + Number(i.amount), 0) === 800000)
  check('the milestone is labelled', items?.some((i) => i.kind === 'milestone' && i.label === 'Registry' && Number(i.amount) === 100000))
  const { data: still } = await rep.rpc('available_plots')
  check('the plot is no longer offered', !(still ?? []).some((p) => p.id === p1.id))

  console.log('\nReceipts')
  const booking = items[0]
  const cheat = await rep.from('emis').update({ status: 'paid' }).eq('id', booking.id).select('id')
  check('the member cannot mark an item paid', Boolean(cheat.error), cheat.error?.message)
  const noslip = await rep.from('emis').update({ status: 'awaiting_verification' }).eq('id', booking.id).select('id')
  check('an item cannot go for verification without a receipt', Boolean(noslip.error), noslip.error?.message)
  const amt = await rep.from('emis').update({ amount: 1 }).eq('id', booking.id).select('id')
  check('the member cannot change an amount', Boolean(amt.error))
  const slipPath = `${s1.data}/item-0-${Date.now()}.pdf`
  slips.push(slipPath)
  const up = await rep.storage.from('emi-slips').upload(slipPath, new Blob(['%PDF-1.4 receipt'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  check('the member uploads the receipt', !up.error, up.error?.message)
  const otherUp = await other.storage.from('emi-slips').upload(`${s1.data}/item-9-${Date.now()}.pdf`, new Blob(['x'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  check("another member cannot upload to this sale", Boolean(otherUp.error))
  const { data: otherSees } = await other.from('emis').select('id').eq('booking_id', s1.data)
  check("another member cannot see this sale's schedule", (otherSees ?? []).length === 0)
  const sent = await rep.from('emis').update({ slip_path: slipPath, status: 'awaiting_verification', slip_mode: 'upi', slip_paid_on: iso(new Date()), reference: 'UTR-GW' + TAG }).eq('id', booking.id).select('status')
  check('the item goes for verification', !sent.error && sent.data?.[0]?.status === 'awaiting_verification', sent.error?.message)
  const { data: an } = await admin.from('notifications').select('link').eq('title', 'Receipt to verify').ilike('body', `%${(await admin.from('bookings').select('reference').eq('id', s1.data).single()).data.reference}%`)
  check('the office is told, with a link to the receipts tab', an?.[0]?.link === '/admin/crm?tab=pending')

  const ok = await admin.from('emis').update({ status: 'paid' }).eq('id', booking.id)
  check('the office verifies it', !ok.error, ok.error?.message)
  const { data: pays1 } = await admin.from('payments').select('amount, mode, reference, emi_id').eq('booking_id', s1.data)
  check('exactly one payment, with the mode and UTR from the receipt',
    pays1?.length === 1 && Number(pays1[0].amount) === 100000 && pays1[0].mode === 'upi' && pays1[0].reference === 'UTR-GW' + TAG, JSON.stringify(pays1))
  const { data: rn } = await rep.from('notifications').select('link, body').eq('title', 'Payment verified').order('created_at', { ascending: false }).limit(1)
  check('the member is told, with a link to the CRM', rn?.[0]?.link === '/sponsor/crm' && rn[0].body.includes('Booking amount'))

  const emi1 = items.find((i) => i.seq === 1)
  const slip2 = `${s1.data}/item-1-${Date.now()}.pdf`
  slips.push(slip2)
  await rep.storage.from('emi-slips').upload(slip2, new Blob(['%PDF-1.4 r2'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  await rep.from('emis').update({ slip_path: slip2, status: 'awaiting_verification' }).eq('id', emi1.id)
  await admin.from('emis').update({ status: 'rejected', reject_reason: 'Amount does not match' }).eq('id', emi1.id)
  const { data: back } = await rep.from('notifications').select('body, link').eq('title', 'Receipt sent back').order('created_at', { ascending: false }).limit(1)
  check('a receipt sent back reaches the member with the reason', back?.[0]?.body.includes('Amount does not match') && back[0].link === '/sponsor/crm')
  const again = await rep.from('emis').update({ slip_path: slip2, status: 'awaiting_verification' }).eq('id', emi1.id).select('reject_reason')
  check('the member can upload again, clearing the reason', !again.error && again.data?.[0]?.reject_reason === null, again.error?.message)

  console.log('\nMoney recorded at the office')
  const rp = await admin.rpc('record_payment', { p_booking: s1.data, p_amount: 50000, p_mode: 'cash', p_reference: null, p_paid_on: null, p_emi_id: null, p_receipt: null })
  check('the office records a counter payment', !rp.error, rp.error?.message)
  const { data: pays2 } = await admin.from('payments').select('amount').eq('booking_id', s1.data)
  check('it is counted once (the double count is gone)', sum(pays2 ?? []) === 150000, `collected ${sum(pays2 ?? [])}`)
  const { data: after } = await admin.from('emis').select('seq, status').eq('booking_id', s1.data).order('seq')
  check('the booking item stays paid; a part payment leaves EMI 1 owing', after?.[0]?.status === 'paid' && after?.[1]?.status !== 'paid')

  console.log('\nA rejected sale lets go')
  const rej = await admin.from('bookings').update({ status: 'rejected', reject_remark: 'gwtest' }).eq('id', s1.data)
  check('the office rejects the sale', !rej.error, rej.error?.message)
  const { data: left } = await admin.from('emis').select('seq, status').eq('booking_id', s1.data)
  check('unpaid items are dropped, the paid one is kept', left?.length === 1 && left[0].seq === 0, JSON.stringify(left))
  const { data: freed } = await rep.rpc('available_plots')
  check('the plot is available again', (freed ?? []).some((p) => p.id === p1.id))

  console.log('\nThe office files and confirms a sale')
  const cc = await admin.functions.invoke('create-customer', { body: { full_name: `Gwtest Buyer ${TAG}`, phone: BUYER_PHONE, password: 'Buyer@' + TAG.slice(-4) } })
  customerId = cc.data?.id
  check('the buyer has a customer account', Boolean(customerId), JSON.stringify(cc.error ?? cc.data))
  const s2 = await admin.rpc('create_plot_sale', sale(p2.id, { p_emi_count: 0, p_milestones: [], p_booking_amount: 200000 }))
  check('office sale filed (waiting for verification)', !s2.error && s2.data, s2.error?.message)
  bookings.push(s2.data)
  const conf = await admin.from('bookings').update({ status: 'confirmed' }).eq('id', s2.data).select('customer_id')
  check('on confirmation the customer account is attached by mobile', !conf.error && conf.data?.[0]?.customer_id === customerId, conf.error?.message ?? JSON.stringify(conf.data))
  const { data: s2items } = await admin.from('emis').select('kind, amount').eq('booking_id', s2.data).order('seq')
  check('no EMIs: booking amount + one balance', s2items?.length === 2 && s2items[1].kind === 'balance' && Number(s2items[1].amount) === 800000)

  const s3 = await admin.rpc('create_plot_sale', sale(p3.id, { p_confirm: true, p_booking_paid: true, p_customer_id: customerId, p_emi_count: 4, p_emi_amount: 150000 }))
  check('office sale confirmed on the spot with the booking amount received', !s3.error && s3.data, s3.error?.message)
  bookings.push(s3.data)
  const { data: s3items } = await admin.from('emis').select('kind, amount, status').eq('booking_id', s3.data).order('seq')
  check('typed EMIs of 1,50,000 leave a 2,00,000 balance', s3items?.filter((i) => i.kind === 'emi').length === 4 && s3items.some((i) => i.kind === 'balance' && Number(i.amount) === 200000), JSON.stringify(s3items))
  check('the booking item is already paid', s3items?.[0]?.kind === 'booking' && s3items[0].status === 'paid')
  const { data: q } = await admin.rpc('collection_queue')
  const row = (q ?? []).find((r) => r.booking_id === s3.data)
  check('the collection queue shows it: collected 1,00,000, outstanding 9,00,000', row && Number(row.collected) === 100000 && Number(row.outstanding) === 900000, JSON.stringify(row))
  check('the queue carries the overdue amount and receipts waiting', row && 'overdue_amount' in row && 'awaiting' in row)
  const repQueue = await rep.rpc('collection_queue')
  check('a member cannot read the office queue', (repQueue.data ?? []).length === 0)
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  const q = (sql, args) => db.query(sql, args).catch((e) => console.log(`  cleanup: ${e.message.split('\n')[0]}`))
  if (bookings.length) {
    const { rows } = await db.query(`select reference from public.bookings where id = any($1::uuid[])`, [bookings])
    for (const r of rows) await q(`delete from public.notifications where body like '%' || $1 || '%'`, [r.reference])
    await q(`delete from public.audit_log where entity_id = any($1::text[])`, [bookings])
    await q(`delete from public.audit_log where entity = 'payments' and after ->> 'booking_id' = any($1::text[])`, [bookings])
    await q(`delete from public.member_ledger where booking_id = any($1::uuid[])`, [bookings])
    await q(`delete from public.bookings where id = any($1::uuid[])`, [bookings])
  }
  if (slips.length) await q(`delete from storage.objects where bucket_id = 'emi-slips' and name = any($1::text[])`, [slips])
  if (plots.length) await q(`update public.plots set status = 'available' where id = any($1::uuid[]) and status <> 'available'`, [plots])
  if (customerId) {
    await q(`delete from public.notifications where user_id = $1::uuid`, [customerId])
    await q(`delete from public.audit_log where entity_id = $1::text or actor_id = $1::uuid`, [customerId])
    await q(`delete from public.customer_details where customer_id = $1::uuid`, [customerId])
    await q(`delete from auth.users where id = $1::uuid`, [customerId])
    await q(`delete from public.profiles where id = $1::uuid`, [customerId])
  }
  const { rows: [left] } = await db.query(
    `select (select count(*) from public.bookings where customer_name = $1)::int b,
            (select count(*) from public.profiles where phone = $2)::int p,
            (select count(*) from public.plots where id = any($3::uuid[]) and status <> 'available')::int pl`,
    [`Gwtest Buyer ${TAG}`, BUYER_PHONE, plots])
  check('test data removed and plots released', left.b === 0 && left.p === 0 && left.pl === 0, JSON.stringify(left))
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
