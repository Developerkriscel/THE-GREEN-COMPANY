#!/usr/bin/env node
/**
 * Employees (Admin -> Employees), over HTTP as the office, a member and an
 * anonymous visitor: the record and its code, the automatic timeline,
 * privacy of every table and file, the public ID-card check, re-issuing a
 * card, exit, assets and leave.
 *
 *   node scripts/test-employees.mjs      (gateway must be running)
 *
 * Removes everything it creates (local and live share one database).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { junit } from './lib/junit.mjs'
import { ADMIN, REP } from './lib/test-accounts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const BASE = process.env.GATEWAY_URL ?? 'http://localhost:54321'
const mk = () => createClient(BASE, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
db.on('error', (e) => console.log(`  db connection error: ${e.message}`))
await db.connect()

let passed = 0
let failed = 0
const report = junit('employees')
function check(label, ok, detail) {
  report.add('Employees', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

const created = []
const files = []
const started = new Date()

try {
  const admin = mk()
  const rep = mk()
  const anon = mk()
  check('admin signs in', !(await admin.auth.signInWithPassword(ADMIN)).error)
  check('a member signs in', !(await rep.auth.signInWithPassword(REP)).error)

  console.log('\nThe record')
  const { data: boss, error: e0 } = await admin.from('employees').insert({
    full_name: '  Gwtest   Manager ', designation: 'Sales Manager', department: 'Sales', joining_date: '2024-04-01', monthly_salary: 60000,
  }).select('*').single()
  check('the office adds an employee', !e0 && boss, e0?.message)
  if (boss) created.push(boss.id)
  check('a code is given (RSGC-E-0000)', /^RSGC-E-\d{4}$/.test(boss?.employee_code ?? ''), boss?.employee_code)
  check('the name is tidied', boss?.full_name === 'Gwtest Manager', boss?.full_name)

  const { data: emp, error: e1 } = await admin.from('employees').insert({
    full_name: 'Gwtest Employee', designation: 'Sales Executive', department: 'Sales', employment_type: 'full_time',
    joining_date: '2025-06-15', probation_end: '2025-12-15', monthly_salary: 25000, reporting_manager_id: boss?.id,
    pan: 'abcde1234f', ifsc: 'hdfc0001234', aadhaar_last4: '4321', blood_group: 'B+',
    emergency_name: 'Gwtest Father', emergency_relation: 'Father', emergency_phone: '9876500000', card_valid_till: '2099-12-31',
  }).select('*').single()
  check('with job, pay, statutory and emergency details', !e1 && emp, e1?.message)
  if (emp) created.push(emp.id)
  check('PAN and IFSC are upper-cased', emp?.pan === 'ABCDE1234F' && emp?.ifsc === 'HDFC0001234')
  const badPan = await admin.from('employees').insert({ full_name: 'Gwtest Bad', pan: '12345' }).select('id').single()
  check('a malformed PAN is refused', /PAN/.test(badPan.error?.message ?? ''), badPan.error?.message)
  if (badPan.data) created.push(badPan.data.id)
  const badAadhaar = await admin.from('employees').insert({ full_name: 'Gwtest Bad', aadhaar_last4: '123456789012' }).select('id').single()
  check('a full Aadhaar number cannot be stored (last 4 only)', !!badAadhaar.error)
  if (badAadhaar.data) created.push(badAadhaar.data.id)

  console.log('\nTimeline')
  let { data: ev } = await admin.from('employee_events').select('kind, title, auto').eq('employee_id', emp.id)
  check('joining is on the timeline by itself', ev?.length === 1 && ev[0].kind === 'joined' && ev[0].auto && /Sales Executive/.test(ev[0].title), JSON.stringify(ev))
  const up = await admin.from('employees').update({ designation: 'Senior Sales Executive', monthly_salary: 30000, confirmation_date: '2025-12-15' }).eq('id', emp.id)
  check('promotion with a raise', !up.error, up.error?.message)
  ;({ data: ev } = await admin.from('employee_events').select('kind, title, detail').eq('employee_id', emp.id))
  const kinds = (ev ?? []).map((x) => x.kind).sort().join(',')
  check('designation, salary and confirmation are recorded', kinds === 'confirmed,joined,promotion,salary', kinds)
  const sal = (ev ?? []).find((x) => x.kind === 'salary')
  check('the salary entry shows the old figure and the rise', /30,000/.test(sal?.title ?? '') && /25,000/.test(sal?.detail ?? '') && /\+20/.test(sal?.detail ?? ''), JSON.stringify(sal))
  const note = await admin.from('employee_events').insert({ employee_id: emp.id, kind: 'appreciation', title: 'Gwtest top seller' })
  check('the office adds an appreciation by hand', !note.error, note.error?.message)

  console.log('\nPrivacy')
  const { data: repSees } = await rep.from('employees').select('id').in('id', created)
  check('a member cannot read employee records', (repSees ?? []).length === 0)
  const { data: anonSees } = await anon.from('employees').select('id').in('id', created)
  check('a visitor cannot read them either', (anonSees ?? []).length === 0)
  const { data: repEv } = await rep.from('employee_events').select('id').eq('employee_id', emp.id)
  check('nor the timeline', (repEv ?? []).length === 0)
  const repIns = await rep.from('employees').insert({ full_name: 'Gwtest Sneaky' }).select('id')
  check('a member cannot add an employee', !!repIns.error || (repIns.data ?? []).length === 0)

  console.log('\nFiles')
  const jpg = new Blob([Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64')], { type: 'image/jpeg' })
  const photoPath = `${emp.id}/photo-${Date.now()}.jpg`
  const pu = await admin.storage.from('hr').upload(photoPath, jpg, { contentType: 'image/jpeg' })
  check('the office uploads a photo to the private hr bucket', !pu.error, pu.error?.message)
  files.push(photoPath)
  await admin.from('employees').update({ photo_path: photoPath }).eq('id', emp.id)
  const pdf = new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' })
  const docPath = `${emp.id}/pan-${Date.now()}.pdf`
  const du = await admin.storage.from('hr').upload(docPath, pdf, { contentType: 'application/pdf' })
  files.push(docPath)
  const di = await admin.from('employee_documents').insert({ employee_id: emp.id, doc_type: 'pan', title: 'PAN card', storage_path: docPath, expiry_date: '2020-01-01' })
  check('and a document, with an expiry', !du.error && !di.error, du.error?.message ?? di.error?.message)
  check('the office can open the document', !(await admin.storage.from('hr').createSignedUrl(docPath, 60)).error)
  check('a member cannot open it', !!(await rep.storage.from('hr').createSignedUrl(docPath, 60)).error)
  check('a visitor cannot open it', !!(await anon.storage.from('hr').createSignedUrl(docPath, 60)).error)
  const repUp = await rep.storage.from('hr').upload(`${emp.id}/x-${Date.now()}.pdf`, pdf, { contentType: 'application/pdf' })
  check('a member cannot upload to it', !!repUp.error)
  if (!repUp.error) files.push(repUp.data.path)

  console.log('\nThe public ID-card check')
  const token = emp.card_token
  let { data: v } = await anon.rpc('verify_employee', { p_token: token })
  check('the QR shows a valid card to anyone', v?.state === 'valid' && v.name === 'Gwtest Employee' && v.designation === 'Senior Sales Executive', JSON.stringify(v))
  check('it shows nothing private (no phone, salary, PAN)', v && !('phone' in v) && !('monthly_salary' in v) && !('pan' in v) && !JSON.stringify(v).includes('ABCDE'))
  check('the verify page can show the photo', !(await anon.storage.from('hr').createSignedUrl(v.photo_path, 60)).error)
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: 'not-a-token' }))
  check('a made-up code says "unknown", without an error', v?.state === 'unknown')
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: '00000000-0000-4000-8000-000000000000' }))
  check('an unknown card says "unknown"', v?.state === 'unknown')

  const sneaky = await admin.from('employees').update({ card_token: '00000000-0000-4000-8000-000000000001' }).eq('id', emp.id).select('card_token').single()
  check('the card token cannot be edited directly', sneaky.data?.card_token === token, JSON.stringify(sneaky.data))

  const re = await admin.rpc('reissue_employee_card', { p_employee_id: emp.id, p_valid_till: '2099-01-31', p_reason: 'Lost' })
  check('the office re-issues the card', !re.error, re.error?.message)
  const { data: after } = await admin.from('employees').select('card_token, card_issue_no').eq('id', emp.id).single()
  check('issue 2 with a new QR', after?.card_issue_no === 2 && after.card_token !== token)
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: token }))
  check('the lost card no longer verifies', v?.state === 'unknown')
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: after.card_token }))
  check('the new one does', v?.state === 'valid' && v.issue_no === 2)
  const repRe = await rep.rpc('reissue_employee_card', { p_employee_id: emp.id, p_valid_till: null, p_reason: null })
  check('a member cannot issue cards', !!repRe.error)
  const pastRe = await admin.rpc('reissue_employee_card', { p_employee_id: emp.id, p_valid_till: '2001-01-01', p_reason: null })
  check('a card cannot be issued already expired', /future/.test(pastRe.error?.message ?? ''), pastRe.error?.message)

  await db.query(`update public.employees set card_valid_till = current_date - 1 where id = $1`, [emp.id])
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: after.card_token }))
  check('an expired card says so', v?.state === 'expired')
  await db.query(`update public.employees set card_valid_till = '2099-01-31' where id = $1`, [emp.id])

  console.log('\nAssets and leave')
  const a1 = await admin.from('employee_assets').insert({ employee_id: emp.id, asset_type: 'laptop', name: 'Gwtest Laptop', serial_no: 'SN1', value: 45000 }).select('id').single()
  check('a laptop is issued', !a1.error, a1.error?.message)
  const badReturn = await admin.from('employee_assets').update({ returned_on: '2000-01-01' }).eq('id', a1.data?.id)
  check('it cannot be returned before it was issued', !!badReturn.error)
  const l1 = await admin.from('employee_leaves').insert({ employee_id: emp.id, leave_type: 'casual', from_date: '2026-03-02', to_date: '2026-03-03', days: 2 })
  check('two days of casual leave are recorded', !l1.error, l1.error?.message)
  const l2 = await admin.from('employee_leaves').insert({ employee_id: emp.id, leave_type: 'sick', from_date: '2026-03-05', to_date: '2026-03-04', days: 1 })
  check('leave ending before it starts is refused', !!l2.error)
  const { data: repLeaves } = await rep.from('employee_leaves').select('id').eq('employee_id', emp.id)
  check('a member cannot see leave', (repLeaves ?? []).length === 0)

  console.log('\nExit')
  const ex = await admin.from('employees').update({ status: 'exited', exit_type: 'resigned', exit_reason: 'Gwtest moving city' }).eq('id', emp.id).select('exit_date').single()
  check('the office records an exit; the exit date fills itself', !ex.error && !!ex.data?.exit_date, ex.error?.message)
  ;({ data: ev } = await admin.from('employee_events').select('kind, title').eq('employee_id', emp.id).eq('kind', 'exit'))
  check('the exit is on the timeline', ev?.length === 1 && /resigned/.test(ev[0].title), JSON.stringify(ev))
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: after.card_token }))
  check('the card now says "no longer an employee", and nothing more', v?.state === 'exited' && !('designation' in v) && !('photo_path' in v), JSON.stringify(v))
  check("and the ex-employee's photo is private again", !!(await anon.storage.from('hr').createSignedUrl(photoPath, 60)).error)
  const back = await admin.from('employees').update({ status: 'active' }).eq('id', emp.id).select('exit_date, exit_type').single()
  check('rejoining clears the exit from the record', !back.error && back.data?.exit_date === null && back.data?.exit_type === null, back.error?.message)
  ;({ data: ev } = await admin.from('employee_events').select('title').eq('employee_id', emp.id).eq('kind', 'status'))
  check('and is on the timeline as "Rejoined"', ev?.some((x) => x.title === 'Rejoined'), JSON.stringify(ev))

  const arch = await admin.from('employees').update({ deleted_at: new Date().toISOString() }).eq('id', emp.id)
  check('a record can be deleted (archived)', !arch.error)
  ;({ data: v } = await anon.rpc('verify_employee', { p_token: after.card_token }))
  check('and its card stops verifying', v?.state === 'unknown')

  const { rows: [aud] } = await db.query(`select count(*)::int n from public.audit_log where entity = 'employees' and entity_id = $1`, [emp.id])
  check('every change is in the audit log', aud.n >= 4, String(aud.n))
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  const q = (sql, args) => db.query(sql, args).catch((e) => console.log(`  cleanup: ${e.message.split('\n')[0]}`))
  if (files.length) {
    const cleaner = mk()
    await cleaner.auth.signInWithPassword(ADMIN)
    await cleaner.storage.from('hr').remove(files).catch(() => {})
  }
  await q(`delete from storage.objects where bucket_id = 'hr' and name = any($1)`, [files])
  const { rows: extra } = await db.query(`select id from public.employees where full_name like 'Gwtest%'`).catch(() => ({ rows: [] }))
  const ids = [...new Set([...created, ...extra.map((r) => r.id)])]
  await q(`update public.employees set reporting_manager_id = null where id = any($1::uuid[])`, [ids])
  await q(`delete from public.employees where id = any($1::uuid[])`, [ids])
  await q(`delete from public.audit_log where entity = 'employees' and entity_id = any($1::text[])`, [ids])
  // Leave the numbering as it was when no real employee exists yet.
  await q(`do $$ begin if not exists (select 1 from public.employees) then alter sequence app.employee_code_seq restart with 1; end if; end $$`)
  const { rows: [left] } = await db.query(`select count(*)::int n from public.employees where full_name like 'Gwtest%'`)
  check('test data removed', left.n === 0)
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  void started
  process.exit(failed ? 1 : 0)
}
