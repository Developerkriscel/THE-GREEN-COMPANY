#!/usr/bin/env node
/**
 * Plot resale (customer → office → buyers → transfer) and payment reminders
 * (hourly run, sponsor/office reminders), checked in the database as the
 * real signed-in roles, through RLS.
 *
 *   node scripts/test-resale-reminders.mjs
 *
 * Runs in ONE transaction that is rolled back (local and live share a
 * database), and puts the ID sequences back afterwards so a test run never
 * uses up a real RSGC-RS / RSGC-CUST number.
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'

const { junit } = await import('./lib/junit.mjs').catch(() => ({ junit: () => ({ add() {}, write() {} }) }))
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
db.on('error', (e) => console.log(`  db connection error: ${e.message}`))
await db.connect()

let passed = 0
let failed = 0
const report = junit('resale-reminders')
function check(label, ok, detail) {
  report.add('Resale & reminders', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}
const q = async (sql, args) => (await db.query(sql, args)).rows
/** Run fn as a signed-in user (or anon when id is null), through RLS. */
async function as(id, fn) {
  await q(`select set_config('request.jwt.claims', $1, true)`, [id ? JSON.stringify({ sub: id, role: 'authenticated' }) : ''])
  await q(id ? 'set local role authenticated' : 'set local role anon')
  // After an error the transaction is aborted; rolling back to the savepoint undoes these anyway.
  try { return await fn() } finally { await q('reset role').catch(() => {}); await q(`select set_config('request.jwt.claims', '', true)`).catch(() => {}) }
}
async function refused(fn) {
  await q('savepoint t')
  try { await fn(); await q('release savepoint t'); return '' } catch (e) { await q('rollback to savepoint t'); return e.message }
}
const SEQS = ['app.resale_seq', 'app.customer_code_seq', 'public.member_code_seq']
const seqState = {}
for (const s of SEQS) seqState[s] = (await q(`select last_value, is_called from ${s}`))[0]
const [{ n: listingsBefore }] = await q(`select count(*)::int n from public.resale_listings`)

try {
  await q('begin')
  const [admin] = await q(`select id from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1`)
  const [rep] = await q(`select id from public.profiles where member_code = 'RSGC100004'`)
  const [otherRep] = await q(`select id from public.profiles where role = 'rep' and status = 'active' and id <> $1 order by member_code limit 1`, [rep.id])
  const [seller] = await q(`select id from public.profiles where user_code = 'RSGC-CUST-0001'`)
  const [bk] = await q(`select id from public.bookings where customer_id = $1 and status = 'confirmed' and deleted_at is null limit 1`, [seller.id])
  check('found the demo customer and their confirmed plot', seller && bk)
  await q(`update public.bookings set rep_id = $2 where id = $1`, [bk.id, rep.id])

  // A second customer to buy the plot (made directly; nothing is kept).
  await q(`alter table auth.users disable trigger user`)
  const [{ id: buyerId }] = await q(`insert into auth.users (email, encrypted_password, email_confirmed_at) values ('resale-buyer@test.local', 'x', now()) returning id`)
  await q(`alter table auth.users enable trigger user`)
  await q(`insert into public.profiles (id, role, status, full_name, email, phone, user_code) values ($1, 'customer', 'active', 'Resale Buyer', 'resale-buyer@test.local', '9000099999', 'TEST-BUYER')`, [buyerId])

  /* ------------------------------------------------------------ reminders */
  console.log('\nPayment reminders')
  const today = (await q(`select current_date d`))[0].d
  const items = await q(`select id from public.emis where booking_id = $1 and status in ('pending','overdue') order by seq`, [bk.id])
  check('the demo plot has at least three unpaid instalments', items.length >= 3, String(items.length))
  // Instalment dates are the office's to change (emis_guard).
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
  await q(`update public.emis set status = 'pending', due_date = current_date + 2 where id = $1`, [items[0].id])
  await q(`update public.emis set status = 'pending', due_date = current_date where id = $1`, [items[1].id])
  await q(`update public.emis set status = 'pending', due_date = current_date - 10 where id = $1`, [items[2].id])
  await q(`update public.emis set due_date = current_date + 60 where booking_id = $1 and status in ('pending','overdue') and id <> all($2::uuid[])`, [bk.id, items.slice(0, 3).map((i) => i.id)])
  await q(`delete from public.payment_reminders where booking_id = $1`, [bk.id])
  await q(`select set_config('request.jwt.claims', '', true)`)
  await q(`delete from public.notifications where user_id = any($1::uuid[]) and type = 'payment'`, [[seller.id, rep.id]])
  const [{ n: sent }] = await q(`select app.run_payment_reminders() n`)
  check('the run reminds about this plot (due soon, due today, overdue)', sent >= 3, String(sent))
  const kinds = (await q(`select kind from public.payment_reminders where booking_id = $1 order by kind`, [bk.id])).map((r) => r.kind)
  check('one reminder of each kind is logged', kinds.join() === 'auto_due_soon,auto_due_today,auto_overdue', kinds.join())
  const [late] = await q(`select status from public.emis where id = $1`, [items[2].id])
  check('the late instalment is now marked overdue', late.status === 'overdue', late.status)
  const custNotes = await q(`select title, body from public.notifications where user_id = $1 and type = 'payment'`, [seller.id])
  check('the customer is told: due soon, due today, overdue', ['Instalment due soon', 'Instalment due today', 'Payment overdue'].every((t) => custNotes.some((n) => n.title === t)), JSON.stringify(custNotes.map((n) => n.title)))
  check('the overdue message gives the days late', custNotes.some((n) => /overdue by 10 days/.test(n.body)), JSON.stringify(custNotes.map((n) => n.body)))
  const repNotes = await q(`select title, body, link from public.notifications where user_id = $1 and type = 'payment'`, [rep.id])
  check('the sponsor is told their customer is overdue', repNotes.some((n) => n.title === 'Customer payment overdue' && n.link === '/sponsor/customers'), JSON.stringify(repNotes))
  const [{ n: again }] = await q(`select app.run_payment_reminders() n`)
  const [{ c: logged }] = await q(`select count(*)::int c from public.payment_reminders where booking_id = $1`, [bk.id])
  check('running again the same day sends nothing twice', logged === 3, `${again} sent, ${logged} logged`)
  const overdueOf = async (id) => (await q(`select count(*)::int c from public.payment_reminders where emi_id = $1 and kind = 'auto_overdue'`, [id]))[0].c
  await q(`select app.run_payment_reminders(current_date + 1)`)
  check('the next day: the instalment due yesterday gets its first overdue reminder', await overdueOf(items[1].id) === 1)
  check('…and the 10-day-late one is not repeated yet (weekly after the first week)', await overdueOf(items[2].id) === 1)
  await q(`select app.run_payment_reminders(current_date + 4)`)
  check('a recently late instalment is reminded again after 3 days', await overdueOf(items[1].id) === 2)
  await q(`select app.run_payment_reminders(current_date + 7)`)
  check('the long-overdue one is reminded again a week later', await overdueOf(items[2].id) === 2)

  const panel = await refused(() => as(rep.id, () => q(`select public.send_payment_reminder($1, 'panel', null)`, [bk.id])))
  check('the sponsor reminds their customer in the panel', panel === '', panel)
  const twice = await refused(() => as(rep.id, () => q(`select public.send_payment_reminder($1, 'panel', null)`, [bk.id])))
  check('…but only once a day in the panel', /already sent/.test(twice), twice)
  const wa = await refused(() => as(rep.id, () => q(`select public.send_payment_reminder($1, 'whatsapp', 'Sent on WhatsApp')`, [bk.id])))
  check('a WhatsApp reminder is logged', wa === '', wa)
  const stranger = await refused(() => as(otherRep.id, () => q(`select public.send_payment_reminder($1, 'whatsapp', null)`, [bk.id])))
  check('another sponsor cannot remind this customer', /own customers/.test(stranger), stranger)
  const [{ c: repSees }] = await as(rep.id, () => q(`select count(*)::int c from public.payment_reminders where booking_id = $1`, [bk.id]))
  const [{ c: otherSees }] = await as(otherRep.id, () => q(`select count(*)::int c from public.payment_reminders where booking_id = $1`, [bk.id]))
  check('the sponsor sees the reminder log; another sponsor does not', repSees >= 5 && otherSees === 0, `${repSees} / ${otherSees}`)
  const [{ c: custSees }] = await as(seller.id, () => q(`select count(*)::int c from public.payment_reminders`))
  check('a customer cannot read the reminder log', custSees === 0, String(custSees))
  const notAdmin = await refused(() => as(rep.id, () => q(`select public.run_payment_reminders_now()`)))
  check('only the office can run reminders by hand', /Only the office/.test(notAdmin), notAdmin)

  /* --------------------------------------------------------------- resale */
  console.log('\nResale')
  const notMine = await refused(() => as(buyerId, () => q(`select public.customer_request_resale($1, 2500000, true, null)`, [bk.id])))
  check('a customer cannot resell someone else\'s plot', /not in your account/.test(notMine), notMine)
  const [{ id: listingId }] = await as(seller.id, () => q(`select public.customer_request_resale($1, 2500000, true, 'Moving to Pune') id`, [bk.id]))
  check('the owner asks to resell their plot', !!listingId)
  const [listing] = await q(`select reference, status from public.resale_listings where id = $1`, [listingId])
  check('it gets an RSGC-RS reference and waits for review', /^RSGC-RS-\d{4}$/.test(listing.reference) && listing.status === 'submitted', JSON.stringify(listing))
  const dup = await refused(() => as(seller.id, () => q(`select public.customer_request_resale($1, 2600000, true, null)`, [bk.id])))
  check('a second open request for the same plot is refused', /already has an open/.test(dup), dup)
  const [{ c: adminNote }] = await q(`select count(*)::int c from public.notifications where user_id = $1 and title like 'New resale request%'`, [admin.id])
  check('the office is notified', adminNote >= 1)
  check('not on the website before approval', (await as(null, () => q(`select id from public.public_resale_listings() where id = $1`, [listingId]))).length === 0)

  const repReview = await refused(() => as(rep.id, () => q(`select public.admin_set_resale($1, 'listed', 2400000, 25000, true, null)`, [listingId])))
  check('a sponsor cannot approve a resale', /Only the office/.test(repReview), repReview)
  await as(admin.id, () => q(`select public.admin_set_resale($1, 'listed', 2400000, 25000, true, 'Approved at 24 lakh')`, [listingId]))
  const [listed] = await q(`select status, listed_price::numeric p, transfer_fee::numeric f, show_on_website w from public.resale_listings where id = $1`, [listingId])
  check('the office approves: listed at ₹24 lakh, fee ₹25,000, on the website', listed.status === 'listed' && Number(listed.p) === 2400000 && Number(listed.f) === 25000 && listed.w, JSON.stringify(listed))
  const [{ c: sellerNote }] = await q(`select count(*)::int c from public.notifications where user_id = $1 and title = 'Your plot is listed for resale'`, [seller.id])
  check('the owner is told it is listed', sellerNote === 1)
  const pub = await as(null, () => q(`select * from public.public_resale_listings() where id = $1`, [listingId]))
  check('the website shows it at the listed price', pub.length === 1 && Number(pub[0].price) === 2400000, JSON.stringify(pub[0]))
  check('…without the owner\'s name or phone', pub[0] && !Object.keys(pub[0]).some((k) => /seller|name$|phone|customer/.test(k) && k !== 'project_name'), Object.keys(pub[0] ?? {}).join(','))
  check('sponsors see it in Resale plots', (await as(rep.id, () => q(`select id from public.resale_market() where id = $1`, [listingId]))).length === 1)
  check('customers do not get the sponsor market', (await as(buyerId, () => q(`select id from public.resale_market()`))).length === 0)
  const back = await refused(() => as(admin.id, () => q(`select public.admin_set_resale($1, 'submitted', null, null, null, null)`, [listingId])))
  check('a listed plot cannot go back to "submitted"', /cannot be moved/.test(back), back)

  const web = await as(null, () => q(`select public.resale_inquire($1, 'Website Buyer', '98765 43210', 'Is it corner?') r`, [listingId]))
  check('a website visitor sends an enquiry', web[0].r === 'received', JSON.stringify(web))
  const webAgain = await as(null, () => q(`select public.resale_inquire($1, 'Website Buyer', '9876543210', null) r`, [listingId]))
  check('the same phone again the same day is taken once', webAgain[0].r === 'already')
  const badPhone = await refused(() => as(null, () => q(`select public.resale_inquire($1, 'X', '12345', null)`, [listingId])))
  check('a short phone number is refused', /10-digit/.test(badPhone), badPhone)
  await as(rep.id, () => q(`select public.resale_inquire($1, 'Rep Prospect', '9811122233', 'My client')`, [listingId]))
  const [mine] = await as(rep.id, () => q(`select source, sponsor_id from public.resale_inquiries where listing_id = $1`, [listingId]))
  check('a sponsor registers their prospect; they see only their own enquiry', mine && mine.source === 'sponsor' && mine.sponsor_id === rep.id, JSON.stringify(mine))
  const [{ c: sellerInq }] = await as(seller.id, () => q(`select count(*)::int c from public.resale_inquiries`))
  check('the owner cannot read the buyers\' details', sellerInq === 0, String(sellerInq))
  const [{ inquiries }] = await as(seller.id, () => q(`select inquiries from public.customer_my_resales() where id = $1`, [listingId]))
  check('…but sees how many buyers enquired', inquiries === 2, String(inquiries))

  await as(admin.id, () => q(`select public.admin_set_resale($1, 'buyer_found', null, null, null, 'Buyer paying token')`, [listingId]))
  const toSelf = await refused(() => as(admin.id, () => q(`select public.admin_complete_resale($1, $2, 2350000, null)`, [listingId, seller.id])))
  check('the plot cannot be "transferred" to its own seller', /cannot be the seller/.test(toSelf), toSelf)
  await as(admin.id, () => q(`select public.admin_complete_resale($1, $2, 2350000, 'Transfer deed signed')`, [listingId, buyerId]))
  const [moved] = await q(`select customer_id, customer_name, customer_phone from public.bookings where id = $1`, [bk.id])
  check('the booking now belongs to the buyer', moved.customer_id === buyerId && moved.customer_name === 'Resale Buyer' && moved.customer_phone === '9000099999', JSON.stringify(moved))
  const [tr] = await q(`select from_customer, to_customer, price::numeric p, transfer_fee::numeric f from public.booking_transfers where booking_id = $1`, [bk.id])
  check('the transfer is recorded with price and fee', tr && tr.from_customer === seller.id && tr.to_customer === buyerId && Number(tr.p) === 2350000 && Number(tr.f) === 25000, JSON.stringify(tr))
  const [{ c: buyerEmis }] = await as(buyerId, () => q(`select count(*)::int c from public.emis where booking_id = $1`, [bk.id]))
  const [{ c: sellerEmis }] = await as(seller.id, () => q(`select count(*)::int c from public.emis where booking_id = $1`, [bk.id]))
  check('the buyer now sees the instalments; the seller no longer does', buyerEmis > 0 && sellerEmis === 0, `${buyerEmis} / ${sellerEmis}`)
  const [done] = await as(seller.id, () => q(`select status, sold_price::numeric s from public.customer_my_resales() where id = $1`, [listingId]))
  check('the seller sees it closed as transferred', done.status === 'transferred' && Number(done.s) === 2350000, JSON.stringify(done))
  check('it is off the website', (await as(null, () => q(`select id from public.public_resale_listings() where id = $1`, [listingId]))).length === 0)
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  await db.query('rollback').catch(() => {})
  for (const [s, v] of Object.entries(seqState)) await q(`select setval('${s}', $1, $2)`, [v.last_value, v.is_called])
  const [{ n }] = await q(`select count(*)::int n from public.resale_listings`)
  check('nothing was kept (rolled back, sequences restored)', n === listingsBefore, `${listingsBefore} → ${n}`)
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
