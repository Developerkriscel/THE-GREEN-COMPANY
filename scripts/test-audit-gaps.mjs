#!/usr/bin/env node
/**
 * The gaps closed after auditing against royalgreencompany.com, end to end
 * over the gateway:
 *   - KYC with a nominee; rejection; the member resubmits (this used to be
 *     impossible); a status history both sides can read.
 *   - Name locked for members; father / spouse names editable.
 *   - Downline by sponsor and by placement.
 *
 *   node scripts/test-audit-gaps.mjs      (gateway must be running)
 *
 * Uses a seeded member with no KYC and removes everything it creates.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { junit } from './lib/junit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const BASE = process.env.GATEWAY_URL ?? 'http://localhost:54321'
const ADMIN = { email: process.env.TEST_ADMIN_EMAIL ?? 'admin@rgc.local', password: process.env.TEST_ADMIN_PASSWORD ?? 'Admin@1234' }
const MEMBER_PASSWORD = process.env.TEST_MEMBER_PASSWORD ?? 'Member@123'
const mk = () => createClient(BASE, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

let passed = 0
let failed = 0
const report = junit('audit-gaps')
function check(label, ok, detail) {
  report.add('Audit gaps', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

let member = null
let kycId = null
let original = null
const started = new Date()

try {
  const { rows: [m] } = await db.query(
    `select p.id, p.email, p.full_name, p.father_name, p.spouse_name from public.profiles p
      where p.role = 'rep' and p.status = 'active' and p.email like '%@members.rgc.local'
        and not exists (select 1 from public.kyc k where k.user_id = p.id)
        and exists (select 1 from public.profiles c where c.referrer_id = p.id)
      order by p.member_code limit 1`)
  member = m
  original = m && { father_name: m.father_name, spouse_name: m.spouse_name }
  check('a seeded member without KYC (and with a team) exists', Boolean(m))

  const admin = mk()
  const me = mk()
  check('admin signs in', !(await admin.auth.signInWithPassword(ADMIN)).error)
  check('member signs in', !(await me.auth.signInWithPassword({ email: m.email, password: MEMBER_PASSWORD })).error)

  console.log('\nProfile')
  const rename = await me.from('profiles').update({ full_name: 'Someone Else' }).eq('id', m.id)
  check('a member cannot change their own name', Boolean(rename.error), rename.error?.message)
  const fam = await me.from('profiles').update({ father_name: 'Gwtest Father', spouse_name: 'Gwtest Spouse' }).eq('id', m.id).select('father_name, spouse_name')
  check('a member can set father / spouse names', !fam.error && fam.data?.[0]?.father_name === 'Gwtest Father', fam.error?.message)

  console.log('\nKYC with a nominee')
  const ins = await me.from('kyc').insert({
    user_id: m.id, id_type: 'aadhaar', id_last4: '9012', status: 'pending',
    legal_name: m.full_name, dob: '1990-05-01', kyc_address: '1 Test Road',
    nominee_name: 'Gwtest Nominee', nominee_relation: 'Spouse', nominee_dob: '1992-01-01', nominee_phone: '9000000000',
    nominee_aadhaar_last4: '4321', nominee_share: 100,
  }).select('id, submissions').single()
  check('the member submits KYC with a nominee', !ins.error && ins.data?.submissions === 1, ins.error?.message)
  kycId = ins.data?.id
  const badShare = await me.from('kyc').update({ nominee_share: 150 }).eq('id', kycId)
  check('a nominee share over 100% is refused', Boolean(badShare.error))
  const selfVerify = await me.from('kyc').update({ status: 'verified' }).eq('id', kycId)
  check('the member cannot verify their own KYC', Boolean(selfVerify.error))
  const { data: adminN } = await admin.from('notifications').select('title, link').eq('title', 'New KYC to verify').gte('created_at', started.toISOString())
  check('the office is told a KYC is waiting', (adminN ?? []).some((n) => n.link === '/admin/kyc'))

  const rej = await admin.from('kyc').update({ status: 'rejected', reject_reason: 'Address proof unreadable' }).eq('id', kycId)
  check('the office rejects it', !rej.error, rej.error?.message)
  const resub = await me.from('kyc').update({ status: 'pending', kyc_address: '2 Test Road' }).eq('id', kycId).select('status, submissions, reviewed_by').single()
  check('the member resubmits after a rejection (was impossible before)', !resub.error && resub.data?.status === 'pending' && resub.data?.submissions === 2 && resub.data?.reviewed_by === null, resub.error?.message ?? JSON.stringify(resub.data))
  const { data: rn } = await admin.from('notifications').select('title').eq('title', 'KYC resubmitted — re-review').gte('created_at', started.toISOString())
  check('the office sees it as a re-review', (rn ?? []).length > 0)
  const cheat = await me.from('kyc').update({ submissions: 1 }).eq('id', kycId)
  check('the member cannot reset the submission count', Boolean(cheat.error))

  const { data: evMe } = await me.from('kyc_events').select('event, note').eq('kyc_id', kycId).order('created_at')
  const events = (evMe ?? []).map((e) => e.event)
  check('the member reads their history: submitted, rejected, resubmitted', ['submitted', 'rejected', 'resubmitted'].every((x) => events.includes(x)), events.join(','))
  check('the rejection reason is in the history', (evMe ?? []).some((e) => e.event === 'rejected' && e.note === 'Address proof unreadable'))
  const { data: evOther } = await mk().from('kyc_events').select('id').eq('kyc_id', kycId)
  check('nobody signed out can read it', (evOther ?? []).length === 0)

  const ok = await admin.from('kyc').update({ status: 'verified' }).eq('id', kycId)
  check('the office verifies it', !ok.error, ok.error?.message)
  const edit = await me.from('kyc').update({ nominee_name: 'Changed' }).eq('id', kycId).select('id')
  check('a verified KYC cannot be edited by the member', Boolean(edit.error) || (edit.data ?? []).length === 0)

  console.log('\nDownline by sponsor and by placement')
  const bySponsor = await me.rpc('my_downline', { p_by: 'sponsor' })
  const byPlacement = await me.rpc('my_downline', { p_by: 'placement' })
  const byDefault = await me.rpc('my_downline')
  check('by sponsor returns the team', !bySponsor.error && (bySponsor.data ?? []).length > 0, bySponsor.error?.message)
  check('by placement works', !byPlacement.error && Array.isArray(byPlacement.data), byPlacement.error?.message)
  check('the default is by sponsor', (byDefault.data ?? []).length === (bySponsor.data ?? []).length)
  const { rows: [pl] } = await db.query(`
    with recursive t as (select id, 1 lvl from public.profiles where placement_parent_id = $1 and deleted_at is null
      union all select c.id, t.lvl + 1 from t join public.profiles c on c.placement_parent_id = t.id and c.deleted_at is null where t.lvl < 12)
    select count(*)::int n from t`, [m.id])
  check('placement matches the placement tree in the database', (byPlacement.data ?? []).length === pl.n, `${(byPlacement.data ?? []).length} vs ${pl.n}`)
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  const q = (sql, args) => db.query(sql, args).catch((e) => console.log(`  cleanup: ${e.message.split('\n')[0]}`))
  if (kycId) {
    await q(`delete from public.kyc where id = $1`, [kycId])
    await q(`delete from public.audit_log where entity = 'kyc' and entity_id = $1`, [kycId])
  }
  if (member) {
    await q(`update public.profiles set father_name = $2, spouse_name = $3 where id = $1`, [member.id, original.father_name, original.spouse_name])
    await q(`delete from public.notifications where created_at >= $1 and (user_id = $2 or (type = 'kyc' and body like '%' || $3 || '%'))`, [started, member.id, member.full_name])
    await q(`delete from public.audit_log where entity = 'profiles' and entity_id = $1::text and (before ->> 'father_name' = 'Gwtest Father' or after ->> 'father_name' = 'Gwtest Father')`, [member.id])
  }
  const { rows: [left] } = await db.query(`select count(*)::int n from public.kyc where user_id = $1`, [member?.id ?? '00000000-0000-0000-0000-000000000000'])
  check('test data removed', left.n === 0)
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
