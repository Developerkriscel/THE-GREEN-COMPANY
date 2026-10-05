#!/usr/bin/env node
/**
 * Sponsor sign-up from the website (/sponsor-login -> Sign Up), over HTTP as
 * an anonymous visitor, and what the office sees.
 *
 *   node scripts/test-sponsor-signup.mjs      (gateway must be running)
 *
 * Removes everything it creates (local and live share one database).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { junit } from './lib/junit.mjs'
import { ADMIN } from './lib/test-accounts.mjs'

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
const report = junit('sponsor-signup')
function check(label, ok, detail) {
  report.add('Sponsor sign-up', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

const TAG = String(Date.now()).slice(-8)
const P1 = '9' + TAG + '1'
const P2 = '8' + TAG + '2'
const started = new Date()

try {
  const anon = mk()
  const admin = mk()
  check('admin signs in', !(await admin.auth.signInWithPassword(ADMIN)).error)

  const r1 = await anon.rpc('request_sponsor_signup', { p_name: 'Gwtest Signup', p_phone: '+91 ' + P1, p_sponsor_code: null })
  check('a visitor signs up without a sponsor ID', !r1.error && r1.data === 'received', r1.error?.message ?? r1.data)
  const r1b = await anon.rpc('request_sponsor_signup', { p_name: 'Gwtest Signup', p_phone: P1, p_sponsor_code: '' })
  check('pressing again does not make a second request', r1b.data === 'already_received', r1b.error?.message ?? r1b.data)

  const r2 = await anon.rpc('request_sponsor_signup', { p_name: 'Gwtest Referred', p_phone: P2, p_sponsor_code: 'rgc100004' })
  check('a visitor signs up with a sponsor ID (any case)', !r2.error && r2.data === 'received', r2.error?.message)

  const bad = await anon.rpc('request_sponsor_signup', { p_name: 'Gwtest Bad', p_phone: '7' + TAG + '3', p_sponsor_code: 'RGC999999' })
  check('an unknown sponsor ID is refused with a clear message', /was not found/.test(bad.error?.message ?? ''), bad.error?.message)
  const { rows: [member] } = await db.query(`select phone from public.profiles where role = 'rep' and phone ~ '^[6-9][0-9]{9}$' and deleted_at is null limit 1`)
  const dup = await anon.rpc('request_sponsor_signup', { p_name: 'Gwtest Dup', p_phone: member.phone, p_sponsor_code: null })
  check('a mobile that is already a member is sent to log in', /already registered/.test(dup.error?.message ?? ''), dup.error?.message)
  const badPhone = await anon.rpc('request_sponsor_signup', { p_name: 'Gwtest', p_phone: '12345', p_sponsor_code: null })
  check('a short phone number is refused', /10-digit/.test(badPhone.error?.message ?? ''), badPhone.error?.message)
  const noName = await anon.rpc('request_sponsor_signup', { p_name: 'H', p_phone: '7' + TAG + '4', p_sponsor_code: null })
  check('a one-letter name is refused', /full name/.test(noName.error?.message ?? ''), noName.error?.message)

  const { data: peek } = await anon.from('referral_requests').select('id').in('mobile', [P1, P2])
  check('visitors cannot read the requests', (peek ?? []).length === 0)

  const { data: queue } = await admin.from('referral_requests')
    .select('full_name, mobile, source, status, sponsor:profiles!referral_requests_sponsor_id_fkey ( member_code )')
    .in('mobile', [P1, P2]).order('mobile')
  const own = (queue ?? []).find((q) => q.mobile === P1)
  const referred = (queue ?? []).find((q) => q.mobile === P2)
  check('the office sees both, marked Website and waiting', queue?.length === 2 && queue.every((q) => q.source === 'website' && q.status === 'invited'), JSON.stringify(queue))
  check('the one without a sponsor has none (office chooses)', own && own.sponsor === null)
  check('the referred one is under the right sponsor', referred?.sponsor?.member_code === 'RSGC100004')
  const { data: an } = await admin.from('notifications').select('title, link').eq('title', 'New sponsor sign-up').gte('created_at', started.toISOString())
  check('the office is notified', (an ?? []).length >= 2 && an[0].link === '/admin/members')
  const { rows: [sn] } = await db.query(`select count(*)::int n from public.notifications n join public.profiles p on p.id = n.user_id
                                          where p.member_code = 'RSGC100004' and n.title = 'Someone signed up with your Sponsor ID' and n.created_at >= $1`, [started])
  check('the sponsor is told someone joined with their ID', sn.n === 1)
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  const q = (sql, args) => db.query(sql, args).catch((e) => console.log(`  cleanup: ${e.message.split('\n')[0]}`))
  const { rows } = await db.query(`select id from public.referral_requests where mobile = any($1)`, [[P1, P2]]).catch(() => ({ rows: [] }))
  await q(`delete from public.audit_log where entity = 'referral_requests' and entity_id = any($1::text[])`, [rows.map((r) => r.id)])
  await q(`delete from public.referral_requests where mobile = any($1)`, [[P1, P2]])
  await q(`delete from public.notifications where created_at >= $1 and (title = 'New sponsor sign-up' or title = 'Someone signed up with your Sponsor ID') and body like 'Gwtest%'`, [started])
  const { rows: [left] } = await db.query(`select count(*)::int n from public.referral_requests where full_name like 'Gwtest%'`)
  check('test data removed', left.n === 0)
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
