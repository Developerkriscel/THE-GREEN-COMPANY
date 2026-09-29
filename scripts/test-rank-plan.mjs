#!/usr/bin/env node
/**
 * Does editing the rank plan (Admin → Business Settings → Rank plan) change
 * what the system actually does?
 *
 *   node scripts/test-rank-plan.mjs
 *
 * Every case edits a rank the way the admin screen does, then runs the real
 * engine and checks the money / rank / reward that comes out. It all runs as
 * the signed-in admin inside ONE transaction that is rolled back at the end,
 * so the live plan and ledger are untouched (local and live share a database).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { junit } from './lib/junit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
db.on('error', (e) => console.log(`  db connection error: ${e.message}`))
await db.connect()
const q = async (sql, args) => (await db.query(sql, args)).rows

let passed = 0
let failed = 0
const report = junit('rank-plan')
function check(label, ok, detail) {
  report.add('Rank plan', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

await db.query('begin')
try {
  const [{ id: adminId }] = await q(`select id from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1`)
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: adminId, role: 'authenticated' })])
  await db.query('set local role authenticated')

  const ranks = await q(`select * from public.ranks where active order by seniority`)
  const entry = ranks[0]
  const second = ranks[1]
  const [member] = await q(
    `select p.id, p.full_name, p.member_code, p.direct_count from public.profiles p
      where p.role = 'rep' and p.status = 'active' and p.rank_id = $1 and not coalesce(p.frozen, false)
        and p.deleted_at is null order by p.direct_count desc limit 1`, [entry.id])
  check(`a ${entry.name} member to test with`, Boolean(member), member?.member_code)

  console.log('\nOwn sale % → direct income')
  await q(`update public.ranks set own_sale_rate = 6.5 where id = $1`, [entry.id])
  const [plot] = await q(`select * from public.available_plots() limit 1`)
  const [{ create_plot_sale: bookingId }] = await q(
    `select public.create_plot_sale(p_plot_id => $1, p_customer_name => 'Rank plan test', p_total => 1000000,
            p_booking_amount => 0, p_rep_id => $2, p_confirm => true)`, [plot.id, member.id])
  const [direct] = await q(`select rate_applied, gross, tds, admin_charge, net from public.member_ledger
                             where booking_id = $1 and source = 'direct_income' and member_id = $2`, [bookingId, member.id])
  check('a verified sale pays the NEW own-sale rate (6.5% of ₹10,00,000 = ₹65,000 gross)',
    direct && Number(direct.rate_applied) === 6.5 && Number(direct.gross) === 65000, JSON.stringify(direct))
  const [lvl1] = await q(`select rate_applied, area_sqyd, gross from public.member_ledger
                           where booking_id = $1 and source = 'level_income' and level = 1`, [bookingId])
  check('level income is paid per sq yd (Level 1 rate × plot area)',
    !lvl1 || Number(lvl1.gross) === Number(lvl1.rate_applied) * Number(lvl1.area_sqyd),
    lvl1 ? `${lvl1.rate_applied} × ${lvl1.area_sqyd} sq yd = ₹${lvl1.gross}` : 'seller has no upline')
  const [rates] = await q(`select value from public.site_settings where key = 'sponsor.rates'`)
  const tds = Number(rates?.value?.tds_pct ?? 5)
  const adm = Number(rates?.value?.admin_pct ?? 3)
  check(`TDS ${tds}% and admin ${adm}% come off it`, direct && Number(direct.net) === 65000 - 65000 * tds / 100 - 65000 * adm / 100, `net ${direct?.net}`)

  console.log('\nSalary / mo → monthly salary run')
  await q(`update public.ranks set salary = 1234 where id = $1`, [entry.id])
  await q(`select public.credit_monthly_salary('2031-01-01'::date)`)
  const [sal] = await q(`select gross from public.member_ledger where member_id = $1 and source = 'salary' and reference = 'SALARY-2031-01'`, [member.id])
  check('running salary pays the NEW salary (₹1,234 gross)', sal && Number(sal.gross) === 1234, JSON.stringify(sal))
  await q(`select public.credit_monthly_salary('2031-01-01'::date)`)
  const [{ n: salRows }] = await q(`select count(*)::int n from public.member_ledger where member_id = $1 and source = 'salary' and reference = 'SALARY-2031-01'`, [member.id])
  check('running it twice for the same month pays once', salRows === 1)

  console.log('\nReward & perks → reward issued')
  await q(`update public.ranks set reward_title = 'Test Reward', reward_sqyd = 77 where id = $1`, [entry.id])
  await q(`select public.award_reward($1, $2, null)`, [member.id, entry.id])
  const [rw] = await q(`select reference, area_sqyd, in_kind from public.member_ledger where member_id = $1 and source = 'reward' order by created_at desc limit 1`, [member.id])
  check('issuing the reward uses the NEW title and area', rw?.reference === 'REWARD-TEST-REWARD-77' && Number(rw.area_sqyd) === 77 && rw.in_kind, JSON.stringify(rw))

  console.log('\nTo qualify → rank')
  // app.* is internal; read it as the owner, then carry on as the admin.
  const asOwner = async (sql, args) => { await db.query('reset role'); try { return await q(sql, args) } finally { await db.query('set local role authenticated') } }
  const before = await asOwner(`select app.qualified_rank($1) r`, [member.id])
  await q(`update public.ranks set req_direct = 0, req_team = 0, req_legs = 0, req_rank_count = 0 where id = $1`, [second.id])
  const after = await asOwner(`select app.qualified_rank($1) r`, [member.id])
  check(`lowering ${second.name}'s requirement makes the member qualify for it`, before[0].r === entry.id && after[0].r !== entry.id, `${before[0].r === entry.id ? entry.name : '?'} → ${ranks.find((r) => r.id === after[0].r)?.name}`)
  await q(`select public.recalculate_all_ranks()`)
  const [{ rank_id }] = await q(`select rank_id from public.profiles where id = $1`, [member.id])
  check('re-running ranks moves the member up', rank_id === after[0].r, ranks.find((r) => r.id === rank_id)?.name)

  console.log('\nSponsor % and Joining')
  const [{ used }] = await asOwner(`select count(*)::int used from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname in ('public', 'app') and p.prokind = 'f'
                                 and (pg_get_functiondef(p.oid) ilike '%override_pct%' or pg_get_functiondef(p.oid) ilike '%joining_fee%')`)
  console.log(`  info Sponsor % / Joining are read by ${used} calculation(s) — shown on the plan only`)
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  await db.query('rollback')
  const [{ n }] = await q(`select count(*)::int n from public.bookings where customer_name = 'Rank plan test'`)
  check('everything rolled back', n === 0)
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
