#!/usr/bin/env node
/**
 * Sponsor income (slab difference, deck slide 7) and Board Member income
 * (1% of team turnover for Diamond / Crown, slide 6).
 *
 *   node scripts/test-income-plan.mjs
 *
 * Everything runs inside ONE transaction that is rolled back: local and live
 * share a database, and this test changes nothing.
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
const report = junit('income-plan')
function check(label, ok, detail) {
  report.add('Income plan', label, { ok: Boolean(ok), message: detail })
  if (ok) { console.log(`  \x1b[32mok\x1b[0m   ${label}`); passed++ } else { console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}
const q = async (sql, args) => (await db.query(sql, args)).rows
const asAdmin = async (adminId, fn) => {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: adminId, role: 'authenticated' })])
  try { return await fn() } finally { await db.query(`select set_config('request.jwt.claims', '', true)`) }
}
const money = (v) => Math.round(Number(v) * 100) / 100

try {
  await db.query('begin')
  const [admin] = await q(`select id from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1`)
  const rank = Object.fromEntries((await q(`select seniority, id, own_sale_rate::numeric r from public.ranks`)).map((r) => [r.seniority, r]))

  // A seller with at least three people above them.
  const [line] = await q(`
    select s.id seller, u1.id u1, u2.id u2, u3.id u3
      from public.profiles s
      join public.profiles u1 on u1.id = s.referrer_id
      join public.profiles u2 on u2.id = u1.referrer_id
      join public.profiles u3 on u3.id = u2.referrer_id
     where s.deleted_at is null and s.role = 'rep' limit 1`)
  check('found a sponsor line four deep', !!line)

  console.log('\nSponsor income — the slab difference')
  // Seller 5%, U1 7%, U2 5%, U3 20%.
  await asAdmin(admin.id, async () => {
    await q(`update public.profiles set rank_id = $2 where id = $1`, [line.seller, rank[1].id])
    await q(`update public.profiles set rank_id = $2 where id = $1`, [line.u1, rank[2].id])
    await q(`update public.profiles set rank_id = $2 where id = $1`, [line.u2, rank[1].id])
    await q(`update public.profiles set rank_id = $2 where id = $1`, [line.u3, rank[12].id])
  })
  const [sale] = await q(`select b.id, b.sale_value::numeric v from public.bookings b where b.status = 'confirmed' and b.deleted_at is null and b.sale_value > 0 limit 1`)
  await q(`alter table public.bookings disable trigger user`)
  await q(`update public.bookings set rep_id = $2 where id = $1`, [sale.id, line.seller])
  await q(`alter table public.bookings enable trigger user`)
  await q(`delete from public.member_ledger where booking_id = $1`, [sale.id])
  await q(`select app.distribute_sale_income($1)`, [sale.id])
  const rows = await q(`select member_id, source, rate_applied::numeric r, gross::numeric g, status from public.member_ledger where booking_id = $1`, [sale.id])
  const of = (who, src) => rows.find((r) => r.member_id === who && r.source === src)
  const v = Number(sale.v)
  check('the seller earns their own 5% direct income', of(line.seller, 'direct_income') && money(of(line.seller, 'direct_income').g) === money(v * 0.05))
  check('the 7% upline earns the 2% difference', of(line.u1, 'sponsor_income') && Number(of(line.u1, 'sponsor_income').r) === 2 && money(of(line.u1, 'sponsor_income').g) === money(v * 0.02),
    JSON.stringify(of(line.u1, 'sponsor_income')))
  check('a 5% member in between earns no sponsor income', !of(line.u2, 'sponsor_income'))
  check('the 20% Crown above earns 20% − 7% = 13%', of(line.u3, 'sponsor_income') && Number(of(line.u3, 'sponsor_income').r) === 13 && money(of(line.u3, 'sponsor_income').g) === money(v * 0.13),
    JSON.stringify(of(line.u3, 'sponsor_income')))
  const sponsorTotal = rows.filter((r) => r.source === 'sponsor_income').reduce((t, r) => t + Number(r.r), 0)
  check('direct + sponsor never exceed the top slab (20%)', 5 + sponsorTotal === 20, `5 + ${sponsorTotal}`)
  check('level income is still paid alongside', rows.some((r) => r.source === 'level_income'))
  await q(`select app.distribute_sale_income($1)`, [sale.id])
  const [{ n: again }] = await q(`select count(*)::int n from public.member_ledger where booking_id = $1`, [sale.id])
  check('distributing again pays nothing twice', again === rows.length, `${rows.length} → ${again}`)
  await asAdmin(admin.id, () => q(`update public.bookings set status = 'cancelled' where id = $1`, [sale.id]))
  const after = await q(`select status from public.member_ledger where booking_id = $1 and source = 'sponsor_income'`, [sale.id])
  check('cancelling the sale reverses the sponsor income', after.length > 0 && after.every((r) => r.status === 'reversed'), JSON.stringify(after))

  console.log('\nBoard Member income — 1% of team turnover')
  const ranks = await q(`select seniority, board_pct::numeric b from public.ranks where board_pct > 0 order by seniority`)
  check('Diamond and Crown carry 1%', ranks.map((r) => `${r.seniority}:${Number(r.b)}`).join(' ') === '11:1 12:1', JSON.stringify(ranks))
  // U3 is Crown; put their team's confirmed sales into May 2031.
  await q(`alter table public.bookings disable trigger user`)
  await q(`
    with recursive team as (select id from public.profiles where referrer_id = $1 union select p.id from public.profiles p join team t on p.referrer_id = t.id)
    update public.bookings set booking_date = '2031-05-10' where rep_id in (select id from team) and status = 'confirmed' and deleted_at is null`, [line.u3])
  await q(`alter table public.bookings enable trigger user`)
  const [{ t: turnover }] = await q(`
    with recursive team as (select id from public.profiles where referrer_id = $1 union select p.id from public.profiles p join team t on p.referrer_id = t.id)
    select coalesce(sum(sale_value), 0)::numeric t from public.bookings
     where rep_id in (select id from team) and status = 'confirmed' and deleted_at is null and booking_date between '2031-05-01' and '2031-05-31'`, [line.u3])
  check('the Crown\'s team has turnover that month', Number(turnover) > 0, String(turnover))
  await asAdmin(admin.id, () => q(`select public.credit_board_income('2031-05-01'::date)`))
  const [board] = await q(`select gross::numeric g from public.member_ledger where member_id = $1 and source = 'board_income' and reference = 'BOARD-2031-05'`, [line.u3])
  check('the Crown is credited 1% of the team turnover', board && money(board.g) === money(Number(turnover) * 0.01), `${board?.g} vs ${Number(turnover) * 0.01}`)
  const [notBoard] = await q(`select count(*)::int n from public.member_ledger where member_id = $1 and source = 'board_income' and reference = 'BOARD-2031-05'`, [line.u1])
  check('a Team Coordinator gets no board income', notBoard.n === 0)
  await asAdmin(admin.id, () => q(`select public.credit_board_income('2031-05-01'::date)`))
  const [{ n: boardRows }] = await q(`select count(*)::int n from public.member_ledger where member_id = $1 and source = 'board_income' and reference = 'BOARD-2031-05'`, [line.u3])
  check('running it again never pays twice', boardRows === 1, String(boardRows))
  let refused = ''
  try { await q(`select public.credit_board_income('2031-05-01'::date)`) } catch (e) { refused = e.message }
  check('only the office can run it', /Only an administrator/.test(refused), refused || 'not refused')
} catch (err) {
  check('run completed', false, err.stack)
} finally {
  await db.query('rollback').catch(() => {})
  const [{ n }] = await q(`select count(*)::int n from public.member_ledger where reference like 'BOARD-2031-%'`)
  check('nothing was kept (rolled back)', n === 0, String(n))
  await db.end()
  if (process.env.JUNIT) report.write(process.env.JUNIT)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
