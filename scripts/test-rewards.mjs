#!/usr/bin/env node
/**
 * Sponsor-panel rewards (deck slide 8): my_reward_progress() counts the
 * member's own (direct) and team (group) sales, booked in the reward period,
 * once at least half paid.
 *
 *   node scripts/test-rewards.mjs
 *
 * Everything runs inside ONE transaction that is rolled back at the end:
 * local and live share a database, and this test changes nothing.
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

let passed = 0
let failed = 0
const report = junit('rewards')
function check(label, ok, detail) {
  report.add('Rewards', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}
const q = async (sql, args) => (await db.query(sql, args)).rows
/** Run as a signed-in user, then drop back to the owner role. */
async function as(userId, fn) {
  await db.query('savepoint s')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
    await db.query('set local role authenticated')
    return await fn()
  } finally {
    await db.query('rollback to savepoint s')
  }
}
/** Act as a user and KEEP the changes (still inside the outer, rolled-back transaction). */
async function asKeep(userId, fn) {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await db.query('set local role authenticated')
  try { return await fn() } finally {
    await db.query('reset role')
    await db.query(`select set_config('request.jwt.claims', '', true)`)
  }
}
const progress = (who, member) => as(who, async () => (await q(`select * from public.my_reward_progress($1)`, [member]))[0])

/** The rule, written independently of the function. */
async function expected(member, start, end) {
  const [r] = await q(`
    with recursive team as (
      select id from public.profiles where referrer_id = $1 and deleted_at is null
      union select p.id from public.profiles p join team t on p.referrer_id = t.id where p.deleted_at is null
    )
    select
      coalesce(sum(pl.size) filter (where b.rep_id = $1), 0)::numeric d,
      coalesce(sum(pl.size) filter (where b.rep_id <> $1), 0)::numeric g
      from public.bookings b join public.plots pl on pl.id = b.plot_id
     where b.status = 'confirmed' and b.deleted_at is null and b.sale_value > 0
       and coalesce(b.booking_date, b.created_at::date) between $2 and $3
       and coalesce((select sum(amount) from public.payments where booking_id = b.id), 0) >= b.sale_value * 0.5
       and (b.rep_id = $1 or b.rep_id in (select id from team))`, [member, start, end])
  return { d: Number(r.d), g: Number(r.g) }
}

try {
  await db.query('begin')
  const [admin] = await q(`select id from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1`)
  // A member with a team that has sold: the richest test of "group".
  const [lead] = await q(`
    select p.id, p.member_code from public.profiles p
     where p.role = 'rep' and p.deleted_at is null
       and exists (select 1 from public.profiles c join public.bookings b on b.rep_id = c.id
                    where c.referrer_id = p.id and b.status = 'confirmed')
     order by (select count(*) from public.bookings b where b.rep_id = p.id and b.status = 'confirmed') desc
     limit 1`)
  check('found a member whose team has sales', !!lead, 'no such member in the data')
  const [stranger] = await q(`select id from public.profiles where role = 'rep' and deleted_at is null and id <> $1 and referrer_id is distinct from $1 limit 1`, [lead.id])

  console.log('\nThe ladder')
  const ranks = await q(`select seniority, reward_title, reward_sqyd::numeric d, reward_group_sqyd::numeric g from public.ranks where active order by seniority`)
  const deck = { 1: ['Induction', 50, 0], 2: ['Juicer', 50, 100], 9: ['Car (₹5 Lac)', 500, 1500], 12: ['Car (₹12 Lacs)', 1500, 5000] }
  check('rank rewards follow the deck (direct + group)', Object.entries(deck).every(([sen, [t, d, g]]) => {
    const r = ranks.find((x) => x.seniority === Number(sen))
    return r && r.reward_title === t && Number(r.d) === d && Number(r.g) === g
  }), JSON.stringify(ranks.slice(0, 3)))
  const [period] = await q(`select value from public.site_settings where key = 'sponsor.rewards'`)
  check('the reward period is 1 Sep - 31 Dec 2026 at 50%', period?.value?.start === '2026-09-01' && period?.value?.end === '2026-12-31' && Number(period?.value?.min_paid_pct) === 50, JSON.stringify(period?.value))

  console.log('\nCounting')
  // Open the window wide so the existing sales are inside it.
  await q(`update public.site_settings set value = value || '{"start":"2000-01-01","end":"2100-01-01"}' where key = 'sponsor.rewards'`)
  const want = await expected(lead.id, '2000-01-01', '2100-01-01')
  const got = await progress(lead.id, lead.id)
  check('direct = own half-paid sales', Number(got.direct_sqyd) === want.d, `function ${got.direct_sqyd}, rule ${want.d}`)
  check('group = the whole team\'s half-paid sales', Number(got.group_sqyd) === want.g, `function ${got.group_sqyd}, rule ${want.g}`)

  // A confirmed team sale short of 50% paid: pending, not counting...
  const [teamSale] = await q(`
    with recursive team as (
      select id from public.profiles where referrer_id = $1 union select p.id from public.profiles p join team t on p.referrer_id = t.id)
    select b.id, b.sale_value::numeric value, pl.size::numeric area,
           coalesce((select sum(amount) from public.payments where booking_id = b.id), 0)::numeric paid
      from public.bookings b join public.plots pl on pl.id = b.plot_id
     where b.rep_id in (select id from team) and b.status = 'confirmed' and b.deleted_at is null and b.sale_value > 0
       and coalesce((select sum(amount) from public.payments where booking_id = b.id), 0) < b.sale_value * 0.5
     limit 1`, [lead.id])
  check('found a team sale not yet half paid', !!teamSale)
  check('…it shows as waiting on payment, not counting', Number(got.group_pending) >= Number(teamSale.area), `pending ${got.group_pending}, area ${teamSale.area}`)
  // ...until the money comes in (inside this rolled-back transaction, with
  // the payment triggers off so no schedule or income is touched).
  await q(`alter table public.payments disable trigger user`)
  await q(`insert into public.payments (booking_id, amount, mode, paid_on) values ($1, $2, 'cash', current_date)`,
    [teamSale.id, Number(teamSale.value) * 0.5 - Number(teamSale.paid) + 1])
  await q(`alter table public.payments enable trigger user`)
  const paidNow = await progress(lead.id, lead.id)
  check('once half paid, the team sale counts toward the group target', Number(paidNow.group_sqyd) === want.g + Number(teamSale.area),
    `${paidNow.group_sqyd} vs ${want.g} + ${teamSale.area}`)
  check("…and the member's own figure is unchanged", Number(paidNow.direct_sqyd) === want.d)

  // Outside the period nothing counts.
  await q(`update public.site_settings set value = value || '{"start":"2099-01-01","end":"2099-04-30"}' where key = 'sponsor.rewards'`)
  const none = await progress(lead.id, lead.id)
  check('sales outside the reward period do not count', Number(none.direct_sqyd) === 0 && Number(none.group_sqyd) === 0, JSON.stringify(none))

  console.log('\nMonthly bonus (deck slide 9)')
  const bonusLadder = await q(`select seniority, salary::numeric sal, bonus_group_sqyd::numeric g, bonus_direct_sqyd::numeric d from public.ranks where seniority in (5, 8, 12) order by seniority`)
  check('bonus targets follow the deck (AGM 50/50, VP 900/50, Crown 2000/300)',
    bonusLadder.map((r) => `${r.sal}:${r.g}/${r.d}`).join(' ') === '1000.00:50.00/50.00 9000.00:900.00/50.00 100000.00:2000.00/300.00',
    bonusLadder.map((r) => `${r.sal}:${r.g}/${r.d}`).join(' '))
  const [agm] = await q(`select id from public.ranks where seniority = 5`)
  // The office changes the rank (profiles_guard allows only the office to).
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin.id, role: 'authenticated' })])
  await q(`update public.profiles set rank_id = $2 where id = $1`, [lead.id, agm.id])
  await db.query(`select set_config('request.jwt.claims', '', true)`)
  const paidFor = async (month) => (await q(`select gross::numeric, note from public.member_ledger where member_id = $1 and source = 'salary' and reference = $2`, [lead.id, 'SALARY-' + month.slice(0, 7)]))[0]
  // A month with no sales: an AGM is not paid.
  await asKeep(admin.id, () => q(`select public.credit_monthly_salary('2031-01-01'::date)`))
  check("no bonus when the month's sales miss the target", !(await paidFor('2031-01-01')))
  // Put the member's own and the team's confirmed sales into Feb 2031.
  await q(`update public.bookings set booking_date = '2031-02-10' where rep_id = $1 and status = 'confirmed' and deleted_at is null`, [lead.id])
  await q(`
    with recursive team as (
      select id from public.profiles where referrer_id = $1 union select p.id from public.profiles p join team t on p.referrer_id = t.id)
    update public.bookings set booking_date = '2031-02-12' where rep_id in (select id from team) and status = 'confirmed' and deleted_at is null`, [lead.id])
  const feb = await as(lead.id, async () => (await q(`select * from public.member_month_sales($1, '2031-02-01'::date)`, [lead.id]))[0])
  check("the member sees that month's own and team sales", Number(feb.direct_sqyd) > 0 && Number(feb.group_sqyd) > 0, JSON.stringify(feb))
  const qualifies = Number(feb.direct_sqyd) >= 50 && Number(feb.group_sqyd) >= 50
  await asKeep(admin.id, () => q(`select public.credit_monthly_salary('2031-02-01'::date)`))
  const febPay = await paidFor('2031-02-01')
  check(qualifies ? 'targets met: the AGM bonus (Rs 1,000) is credited' : 'targets not met: no bonus', qualifies ? Number(febPay?.gross) === 1000 : !febPay,
    `own ${feb.direct_sqyd}, team ${feb.group_sqyd}, paid ${JSON.stringify(febPay)}`)
  await asKeep(admin.id, () => q(`select public.credit_monthly_salary('2031-02-01'::date)`))
  const [{ n: febRows }] = await q(`select count(*)::int n from public.member_ledger where member_id = $1 and source = 'salary' and reference = 'SALARY-2031-02'`, [lead.id])
  check('running it again never pays twice', febRows <= 1, String(febRows))
  const [sep] = await q(`select count(*)::int n from public.member_ledger where source = 'salary' and reference = 'SALARY-2026-09'`)
  await asKeep(admin.id, () => q(`select public.credit_monthly_salary('2026-09-01'::date)`))
  const [sepAfter] = await q(`select count(*)::int n from public.member_ledger where source = 'salary' and reference = 'SALARY-2026-09'`)
  check('September 2026 (already paid) is not paid again', sepAfter.n === sep.n, `${sep.n} -> ${sepAfter.n}`)
  let mine = ''
  try { await as(stranger.id, () => q(`select * from public.member_month_sales($1)`, [lead.id])) } catch (e) { mine = e.message }
  check("another member cannot see someone's monthly sales", /only see your own/.test(mine), mine || 'not refused')

  console.log('\nWho may look')
  check('the office can see any member\'s progress', !!(await progress(admin.id, lead.id)))
  let refused = ''
  try { await progress(stranger.id, lead.id) } catch (e) { refused = e.message }
  check('another member cannot see it', /only see your own/.test(refused), refused || 'not refused')
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  await db.query('rollback').catch(() => {})
  const [p] = await q(`select value from public.site_settings where key = 'sponsor.rewards'`)
  check('nothing was changed (rolled back)', p?.value?.start === '2026-09-01', JSON.stringify(p?.value))
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
