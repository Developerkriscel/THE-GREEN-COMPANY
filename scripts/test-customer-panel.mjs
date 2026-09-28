#!/usr/bin/env node
/**
 * End-to-end test of the Customer panel, over HTTP through the gateway.
 *
 *   node server/index.mjs &          # gateway must be running
 *   node scripts/test-customer-panel.mjs
 *
 * Walks the whole loop the office and the buyer go through: the office opens
 * a customer account, books a plot for them, uploads the registry; the buyer
 * signs in with their customer ID, sees only their own plot, EMIs and papers,
 * uploads a slip, refers a friend and leaves feedback; the office replies.
 * Plus the refusals: a sponsor cannot open customer accounts, a customer
 * cannot mark their own EMI paid or read another buyer's details.
 *
 * Local and live share one database, so everything it creates is removed at
 * the end (tagged by a unique test mobile number).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { junit } from './lib/junit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const BASE = process.env.GATEWAY_URL ?? 'http://localhost:54321'
const ANON = env.VITE_SUPABASE_ANON_KEY
const ADMIN = { email: process.env.TEST_ADMIN_EMAIL ?? 'admin@rgc.local', password: process.env.TEST_ADMIN_PASSWORD ?? 'Admin@1234' }
const REP = { email: process.env.TEST_REP_EMAIL ?? 'rep@rgc.local', password: process.env.TEST_REP_PASSWORD ?? 'Rep@12345' }

const mk = () => createClient(BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

let passed = 0
let failed = 0
const report = junit('customer-panel')
function check(label, ok, detail) {
  report.add('Customer panel', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}
async function fnStatus(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body })
  if (!error) return { status: 200, data }
  const res = error.context
  return { status: res?.status ?? 0, data: res ? await res.json().catch(() => null) : null }
}

// A number no real customer has: 9 + 9 digits of the clock.
const PHONE = '9' + String(Date.now()).slice(-9)
const PASSWORD = 'Cust@' + Math.random().toString(36).slice(2, 8)
let customerId = null
let bookingId = null
let plotId = null

try {
  const admin = mk()
  const rep = mk()
  const anon = mk()
  const cust = mk()
  check('admin signs in', !(await admin.auth.signInWithPassword(ADMIN)).error)
  check('sponsor signs in', !(await rep.auth.signInWithPassword(REP)).error)

  console.log('\nOpening the account')
  const body = { full_name: 'Gwtest Customer', phone: PHONE, password: PASSWORD, guardian_relation: 'S/O', guardian_name: 'Test Father', address: '12 Test Lane', city: 'Gurugram', rm_name: 'Office RM', rm_phone: '9000000001', referred_by_name: 'Old Buyer', referred_by_phone: '9000000002' }
  const byRep = await fnStatus(rep, 'create-customer', body)
  check('a sponsor cannot open a customer account', byRep.status === 403, `got ${byRep.status}`)
  const made = await fnStatus(admin, 'create-customer', body)
  check('the office opens a customer account', made.status === 200 && made.data?.id && /^RG-C-/.test(made.data?.user_code ?? ''), JSON.stringify(made.data))
  customerId = made.data?.id
  const code = made.data?.user_code
  const dup = await fnStatus(admin, 'create-customer', body)
  check('the same mobile cannot be opened twice', dup.status === 409, `got ${dup.status}`)

  const { data: det } = await admin.from('customer_details').select('*').eq('customer_id', customerId).maybeSingle()
  check('S/O, RM and referrer are stored', det?.guardian_name === 'Test Father' && det?.rm_name === 'Office RM' && det?.referred_by_phone === '9000000002')

  console.log('\nSigning in')
  const byCode = await anon.rpc('resolve_customer_identifier', { p_identifier: code })
  const byPhone = await anon.rpc('resolve_customer_identifier', { p_identifier: '+91 ' + PHONE })
  const byRepCode = await anon.rpc('resolve_customer_identifier', { p_identifier: 'RGC100004' })
  check('the customer ID resolves', typeof byCode.data === 'string' && byCode.data.includes('@'))
  check('the mobile (with +91) resolves', byPhone.data === byCode.data)
  check('a sponsor ID does not resolve at the customer door', byRepCode.data == null)
  check('the customer signs in', !(await cust.auth.signInWithPassword({ email: byCode.data, password: PASSWORD })).error)
  const { data: me } = await cust.from('profiles').select('role, user_code').eq('id', customerId).single()
  check('they are a customer', me?.role === 'customer' && me?.user_code === code)

  console.log('\nBooking a plot')
  const { data: plots } = await admin.rpc('available_plots')
  plotId = plots?.[plots.length - 1]?.id
  check('there is an available plot to book', Boolean(plotId))
  const repTry = await rep.rpc('admin_create_customer_booking', { p_customer_id: customerId, p_plot_id: plotId, p_sale_value: 300000, p_token_amount: 60000, p_payment_plan: 'emi', p_emi_count: 3, p_emi_amount: null, p_emi_start: '2026-11-05', p_rep_id: null })
  check('a sponsor cannot book for a customer this way', Boolean(repTry.error))
  const bk = await admin.rpc('admin_create_customer_booking', { p_customer_id: customerId, p_plot_id: plotId, p_sale_value: 300000, p_token_amount: 60000, p_payment_plan: 'emi', p_emi_count: 3, p_emi_amount: null, p_emi_start: '2026-11-05', p_rep_id: null })
  check('the office books a plot for the customer', !bk.error && bk.data, bk.error?.message)
  bookingId = bk.data

  const { data: myBookings } = await cust.from('bookings').select('id, status, sale_value, reference')
  check('the customer sees exactly their booking', myBookings?.length === 1 && myBookings[0].id === bookingId && myBookings[0].status === 'confirmed', JSON.stringify(myBookings))
  const { data: myEmis } = await cust.from('emis').select('id, seq, amount, status, booking_id').order('seq')
  check('the customer sees 3 EMIs of ₹80,000', myEmis?.length === 3 && myEmis.every((e) => Number(e.amount) === 80000), JSON.stringify(myEmis?.map((e) => e.amount)))

  console.log('\nPapers')
  const pdf = new Blob(['%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'], { type: 'application/pdf' })
  const docPath = `${bookingId}/registry-${Date.now()}.pdf`
  const up = await admin.storage.from('registry').upload(docPath, pdf, { contentType: 'application/pdf' })
  check('the office uploads the registry', !up.error, up.error?.message)
  const ins = await admin.from('documents').insert({ booking_id: bookingId, owner_id: customerId, type: 'registry', title: 'Registry', storage_path: docPath, size_bytes: pdf.size })
  check('and lists it on the booking', !ins.error, ins.error?.message)
  const { data: myDocs } = await cust.from('documents').select('id, type, storage_path')
  check('the customer sees the registry', myDocs?.some((d) => d.type === 'registry'))
  const signed = await cust.storage.from('registry').createSignedUrl(docPath, 60)
  check('the customer can open it', Boolean(signed.data?.signedUrl), signed.error?.message)
  if (signed.data?.signedUrl) {
    const r = await fetch(signed.data.signedUrl)
    check('the file downloads', r.ok && (await r.text()).startsWith('%PDF'))
  }
  const repSigned = await rep.storage.from('registry').createSignedUrl(docPath, 60)
  check("an unrelated sponsor cannot open the customer's registry", !repSigned.data?.signedUrl)

  await admin.from('bookings').update({ registry_status: 'done', registry_at: new Date().toISOString() }).eq('id', bookingId)
  const { data: notes } = await cust.from('notifications').select('title, link')
  check('the customer is told about the paper', notes?.some((n) => n.title?.startsWith('New paper') && n.link === '/customer/documents'))
  check('and about the registry', notes?.some((n) => n.title === 'Registry done' && n.link === '/customer/plots'))

  console.log('\nInstalments')
  const e1 = myEmis?.[0]
  const cheat = await cust.from('emis').update({ status: 'paid' }).eq('id', e1.id)
  const { data: after } = await admin.from('emis').select('status').eq('id', e1.id).single()
  check('the customer cannot mark an EMI paid', Boolean(cheat.error) || after?.status !== 'paid', `status ${after?.status}`)
  const slip = new Blob(['%PDF-1.4 slip'], { type: 'application/pdf' })
  const slipPath = `${bookingId}/emi-1-${Date.now()}.pdf`
  const su = await cust.storage.from('emi-slips').upload(slipPath, slip, { contentType: 'application/pdf' })
  check('the customer uploads a slip', !su.error, su.error?.message)
  const sw = await cust.from('emis').update({ slip_path: slipPath, slip_uploaded_at: new Date().toISOString(), status: 'awaiting_verification', reference: 'UTR123' }).eq('id', e1.id)
  check('the EMI goes for verification', !sw.error, sw.error?.message)
  const { data: adminNotes } = await admin.from('notifications').select('link, body').eq('link', '/admin/crm').ilike('body', `%${myBookings?.[0]?.reference}%`).order('created_at', { ascending: false }).limit(1)
  check('the office is pointed at Payments CRM', adminNotes?.length === 1)
  await admin.from('emis').update({ status: 'rejected', reject_reason: 'Slip is blurred' }).eq('id', e1.id)
  const { data: notes2 } = await cust.from('notifications').select('title, body')
  check('the customer hears a slip was sent back, with the reason', notes2?.some((n) => n.title === 'Payment slip not accepted' && n.body?.includes('blurred')))

  console.log('\nReferral and feedback')
  const ref = await cust.rpc('customer_refer', { p_name: 'Gwtest Friend', p_mobile: '8' + PHONE.slice(1), p_note: 'wants 100 sq yd' })
  check('the customer refers a friend', !ref.error && ref.data?.ok, ref.error?.message)
  const { data: myRefs } = await cust.rpc('my_customer_referrals')
  check('and sees them, masked', myRefs?.length === 1 && myRefs[0].mobile.endsWith(PHONE.slice(-4)) && !myRefs[0].mobile.includes(PHONE.slice(1, 6)))
  const { data: lead } = await admin.from('leads').select('id, source, referred_by_customer').eq('referred_by_customer', customerId).maybeSingle()
  check('the office has the lead, tagged to the customer', lead?.source === 'customer_referral')

  const fb = await cust.from('customer_feedback').insert({ rating: 5, message: 'Gwtest: very smooth registry' }).select('id').single()
  check('the customer leaves feedback', !fb.error, fb.error?.message)
  const fbCheat = await cust.from('customer_feedback').update({ admin_reply: 'self reply', status: 'replied' }).eq('id', fb.data?.id).select('id')
  check('the customer cannot answer their own feedback', Boolean(fbCheat.error) || (fbCheat.data ?? []).length === 0)
  await admin.from('customer_feedback').update({ admin_reply: 'Thank you!', status: 'replied', replied_at: new Date().toISOString() }).eq('id', fb.data?.id)
  const { data: fbBack } = await cust.from('customer_feedback').select('admin_reply').eq('id', fb.data?.id).single()
  check('the customer sees the office reply', fbBack?.admin_reply === 'Thank you!')

  console.log('\nWalls')
  const { data: repSees } = await rep.from('customer_details').select('customer_id').eq('customer_id', customerId)
  check("a sponsor cannot read a customer's details", (repSees ?? []).length === 0)
  const { data: custOthers } = await cust.from('customer_details').select('customer_id')
  check('a customer reads only their own details', custOthers?.length === 1 && custOthers[0].customer_id === customerId)
  const { data: allB } = await cust.from('bookings').select('id')
  check("a customer cannot see anyone else's bookings", allB?.length === 1)
  const detEdit = await cust.from('customer_details').update({ rm_name: 'Me' }).eq('customer_id', customerId).select('rm_name')
  check('a customer cannot edit their RM', Boolean(detEdit.error) || (detEdit.data ?? []).length === 0)

  await admin.storage.from('emi-slips').remove([slipPath]).catch(() => {})
  await admin.storage.from('registry').remove([docPath]).catch(() => {})
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  // Shared database: remove every trace.
  const q = (sql, args) => db.query(sql, args).catch((e) => console.log(`  cleanup: ${e.message.split('\n')[0]}`))
  if (customerId) {
    await q(`delete from public.leads where referred_by_customer = $1`, [customerId])
    await q(`delete from public.customer_feedback where customer_id = $1`, [customerId])
  }
  if (bookingId) {
    await q(`delete from public.notifications where body like '%' || (select reference from public.bookings where id = $1) || '%'`, [bookingId])
    await q(`delete from public.audit_log where entity_id = $1::text`, [bookingId])
    await q(`delete from public.bookings where id = $1`, [bookingId])
  }
  if (plotId) await q(`update public.plots set status = 'available' where id = $1 and status <> 'available'`, [plotId])
  if (customerId) {
    await q(`delete from public.notifications where user_id = $1`, [customerId])
    await q(`delete from public.audit_log where entity_id = $1::text or actor_id = $1::uuid`, [customerId])
    await q(`delete from public.documents where owner_id = $1::uuid`, [customerId])
    await q(`delete from public.customer_details where customer_id = $1`, [customerId])
    await q(`delete from auth.users where id = $1`, [customerId])
    await q(`delete from public.profiles where id = $1`, [customerId])
  }
  const { rows } = await db.query(`select count(*)::int n from public.profiles where phone like '%' || $1`, [PHONE])
  check('test data removed', rows[0].n === 0)
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
