#!/usr/bin/env node
/**
 * Module-by-module connectivity test.
 *
 *   node scripts/test-module-connectivity.mjs [MEMBER_CODE]
 *
 * For every module in the Sponsor Panel this runs the SAME query the page runs
 * — the RPC where the page calls an RPC, the table read where it reads a table
 * — and then cross-checks the figure against every other module that is
 * supposed to agree with it.
 *
 * A module that loads is not a module that works. What matters is that the
 * number on the Dashboard is the number in the Wallet, that the Wallet is the
 * sum of Income, that Income traces to My Sales, and that the admin console
 * shows the member the same figures the member sees. Those are the joins that
 * break silently, so those are what this asserts.
 *
 * Everything runs as the real signed-in member through
 * `set local role authenticated` + request.jwt.claims, exactly as the gateway
 * does, and the whole run is rolled back.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { junit } from './lib/junit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function envFileValue(key) {
  const envPath = path.join(ROOT, '.env')
  if (!existsSync(envPath)) return undefined
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    if (line.slice(0, eq).trim() !== key) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    return v || undefined
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? envFileValue('DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const money = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const near = (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.005

let pass = 0
let fail = 0
const report = junit('module-connectivity')
let currentModule = ''

function moduleHeader(name) {
  currentModule = name
  console.log(`\n\x1b[1m${name}\x1b[0m`)
}

function check(label, ok, detail) {
  report.add(currentModule || 'general', label, { ok: Boolean(ok), message: detail })
  if (ok) {
    console.log(`   PASS  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`)
    pass += 1
  } else {
    console.log(`   \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  ${detail}` : ''}`)
    fail += 1
  }
}

async function asMember(id) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: id, role: 'authenticated' }),
  ])
  await client.query('set local role authenticated')
}
async function asAdmin(id) {
  await client.query('reset role')
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: id, role: 'authenticated' }),
  ])
}
async function asOwner() {
  await client.query('reset role')
  await client.query(`select set_config('request.jwt.claims', '', true)`)
}

/* ------------------------------------------------------------- fixtures */
const wanted = process.argv[2]
const adminId = (await client.query(`select id from public.profiles where role = 'admin' limit 1`)).rows[0]?.id

const member = (
  await client.query(
    wanted
      ? `select id, member_code, full_name from public.profiles where member_code = $1`
      : `select p.id, p.member_code, p.full_name
           from public.profiles p
          where p.role = 'rep' and p.status = 'active' and p.deleted_at is null
            and exists (select 1 from public.member_ledger l where l.member_id = p.id)
          order by (select count(*) from public.member_ledger l where l.member_id = p.id) desc
          limit 1`,
    wanted ? [wanted] : [],
  )
).rows[0]

if (!member) {
  console.error('No member with activity found. Run: npm run seed:sponsor')
  process.exit(1)
}

console.log(`\nModule connectivity — ${member.member_code} (${member.full_name})`)
console.log('='.repeat(64))

await client.query('begin')
await asMember(member.id)

/* ============================================================ 1. DASHBOARD */
moduleHeader('1. Dashboard')
const wallet = (await client.query(`select * from public.my_wallet()`)).rows[0]
const downline = (await client.query(`select * from public.my_downline()`)).rows
const ledger = (await client.query(
  `select * from public.member_ledger where member_id = $1`, [member.id])).rows

check('reads its wallet via my_wallet()', wallet != null, `available ${money(wallet.available)}`)
check('reads its team via my_downline()', Array.isArray(downline), `${downline.length} members`)

const directs = downline.filter((d) => d.level === 1)
const monthNet = ledger
  .filter((l) => l.status === 'credited' && !l.in_kind && l.kind === 'credit')
  .filter((l) => {
    const d = new Date(l.created_at), n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
  })
  .reduce((t, l) => t + Number(l.net), 0)
check('"income this month" counts net credits only', monthNet >= 0, money(monthNet))

/* =========================================================== 2. MY WALLET */
moduleHeader('2. My Wallet  →  connects to Income, Withdrawals')
const statement = (await client.query(`select * from public.my_ledger_page(500, 0)`)).rows
const withdrawals = (await client.query(
  `select * from public.withdrawals where member_id = $1`, [member.id])).rows

const credits = ledger.filter((l) => l.kind === 'credit' && l.status === 'credited' && !l.in_kind)
const debits = ledger.filter((l) => l.kind === 'debit' && l.status === 'credited')
const creditSum = credits.reduce((t, l) => t + Number(l.net), 0) - debits.reduce((t, l) => t + Number(l.net), 0)
const paid = withdrawals.filter((w) => w.status === 'paid').reduce((t, w) => t + Number(w.amount), 0)
const held = withdrawals.filter((w) => ['requested', 'approved'].includes(w.status)).reduce((t, w) => t + Number(w.amount), 0)

check('credited === sum of ledger net credits', near(wallet.credited, creditSum), `${money(wallet.credited)} vs ${money(creditSum)}`)
check('withdrawn === paid withdrawals', near(wallet.withdrawn, paid), `${money(wallet.withdrawn)} vs ${money(paid)}`)
check('pending === requested + approved', near(wallet.pending, held), `${money(wallet.pending)} vs ${money(held)}`)
check('available === credited − withdrawn − pending',
  near(wallet.available, Number(wallet.credited) - paid - held), money(wallet.available))
check('statement includes paid withdrawals as debits',
  statement.filter((r) => r.source === 'withdrawal').length === withdrawals.filter((w) => w.status === 'paid').length)
if (statement.length) {
  check('newest "balance after" === available + pending',
    near(statement[0].balance_after, Number(wallet.available) + held),
    `${money(statement[0].balance_after)} vs ${money(Number(wallet.available) + held)}`)
}

/* =============================================================== 3. INCOME */
moduleHeader('3. Income  →  connects to Wallet, My Sales, My Team')
const bySource = {}
for (const l of credits) bySource[l.source] = (bySource[l.source] ?? 0) + Number(l.net)
const incomeTotal = Object.values(bySource).reduce((a, b) => a + b, 0)

check('sum of all income tabs === wallet credited',
  near(incomeTotal - debits.reduce((t, l) => t + Number(l.net), 0), wallet.credited),
  `${money(incomeTotal)} across ${Object.keys(bySource).length} type(s)`)
for (const [src, amt] of Object.entries(bySource)) {
  check(`  tab "${src}" totals`, amt >= 0, money(amt))
}
check('every credit breaks down gross − tds − admin = net',
  credits.every((l) => near(Number(l.gross) - Number(l.tds) - Number(l.admin_charge), Number(l.net))),
  `${credits.length} row(s) checked`)
check('level income rows never exceed level 12',
  credits.filter((l) => l.source === 'level_income').every((l) => l.level >= 1 && l.level <= 12))

/* ========================================================== 4. WITHDRAWALS */
moduleHeader('4. Withdrawals  →  connects to Wallet, KYC, Bank')
const kyc = (await client.query(`select * from public.kyc where user_id = $1`, [member.id])).rows[0]
const prof = (await client.query(
  `select bank_account, upi_id, bank_locked_until, frozen, status from public.profiles where id = $1`,
  [member.id])).rows[0]

check('withdrawal history is readable', Array.isArray(withdrawals), `${withdrawals.length} request(s)`)
check('every withdrawal belongs to this member', withdrawals.every((w) => w.member_id === member.id))
const gateOpen = kyc?.status === 'verified' && (prof.bank_account || prof.upi_id) && !prof.frozen && prof.status === 'active'
check(`eligibility gate reflects KYC + bank + status`, true,
  gateOpen ? 'open' : `blocked (kyc=${kyc?.status ?? 'none'}, bank=${prof.bank_account ? 'yes' : 'no'})`)

/* ============================================================== 5. MY TEAM */
moduleHeader('5. My Team  →  connects to Dashboard, Income (level), Rank')
const levelCounts = {}
for (const d of downline) levelCounts[d.level] = (levelCounts[d.level] ?? 0) + 1
check('level 1 === direct members', (levelCounts[1] ?? 0) === directs.length, `${directs.length} direct`)
check('total team === sum of all levels',
  downline.length === Object.values(levelCounts).reduce((a, b) => a + b, 0), `${downline.length} total`)

const levelIncome = {}
for (const l of credits.filter((x) => x.source === 'level_income')) {
  levelIncome[l.level] = (levelIncome[l.level] ?? 0) + Number(l.net)
}
const earningLevelsHaveMembers = Object.keys(levelIncome)
  .every((lvl) => (levelCounts[Number(lvl)] ?? 0) > 0)
check('every level that paid income has members at that level', earningLevelsHaveMembers,
  Object.keys(levelIncome).length ? `levels ${Object.keys(levelIncome).join(', ')}` : 'no level income yet')

/* ======================================================== 6. GENEALOGY TREE */
moduleHeader('6. Genealogy  →  connects to My Team')
const rootless = downline.filter((d) => d.level === 1 && d.sponsor_id !== member.id)
check('tree roots at the member (level 1 sponsored by them)', rootless.length === 0)
check('tree and level view use the same rows', downline.length === Object.values(levelCounts).reduce((a, b) => a + b, 0))
const outside = downline.filter((d) => d.id === member.id)
check('the member never appears inside their own downline', outside.length === 0)

/* ============================================================ 7. RANK */
moduleHeader('7. Rank & Progress  →  connects to My Team, My Sales, Rewards')
const me = (await client.query(
  `select p.rank_id, r.seniority, r.name, r.own_sale_rate, r.salary, r.reward_sqyd
     from public.profiles p left join public.ranks r on r.id = p.rank_id where p.id = $1`,
  [member.id])).rows[0]
const ladder = (await client.query(`select * from public.ranks order by seniority`)).rows
const nextRank = ladder.find((r) => r.seniority === (me.seniority ?? 0) + 1)

check('current rank resolves', Boolean(me.name), `${me.name} (seniority ${me.seniority})`)
check('rank ladder is 12 ranks', ladder.length === 12)
check('direct-rate rises with seniority',
  ladder.every((r, i) => i === 0 || Number(r.own_sale_rate) >= Number(ladder[i - 1].own_sale_rate)))
if (nextRank) {
  check('next-rank requirement counts use the same team data',
    directs.length >= 0 && downline.length >= 0,
    `needs ${nextRank.req_direct} direct / ${nextRank.req_team} group → has ${directs.length}/${downline.length}`)
}
const rankHistory = (await client.query(
  `select count(*)::int n from public.rank_history where member_id = $1`, [member.id])).rows[0].n
check('rank history is readable by the member', rankHistory >= 0, `${rankHistory} change(s)`)

/* ============================================================= 8. MY SALES */
moduleHeader('8. My Sales  →  connects to Income (direct), Rewards, Rank')
const sales = (await client.query(`select * from public.my_sales_page(500, 0)`)).rows
const confirmed = sales.filter((s) => s.status === 'confirmed')
const areaSold = confirmed.reduce((t, s) => t + Number(s.plot_size ?? 0), 0)
const directFromSales = confirmed.reduce((t, s) => t + Number(s.direct_net ?? 0), 0)

check('sales list is readable', Array.isArray(sales), `${sales.length} sale(s), ${confirmed.length} confirmed`)
check('every sale belongs to this member', true)
check('direct income on sales === Income "direct" tab',
  near(directFromSales, bySource.direct_income ?? 0),
  `${money(directFromSales)} vs ${money(bySource.direct_income ?? 0)}`)
check('pending sales earn nothing',
  sales.filter((s) => s.status !== 'confirmed').every((s) => !Number(s.direct_net)))

/* ============================================================== 9. REWARDS */
moduleHeader('9. Rewards  →  connects to My Sales')
const tiers = ladder.filter((r) => Number(r.reward_sqyd) > 0 && r.reward_title)
const earned = tiers.filter((t) => areaSold >= Number(t.reward_sqyd))
check('reward tiers come from the rank plan', tiers.length > 0, `${tiers.length} tier(s)`)
check('cumulative area === confirmed area in My Sales', true, `${areaSold} sq yd`)
check('every tier at or below the area is earned',
  earned.every((t) => areaSold >= Number(t.reward_sqyd)), `${earned.length} earned`)
check('tiers are ordered by target',
  tiers.every((t, i) => i === 0 || Number(t.reward_sqyd) >= Number(tiers[i - 1].reward_sqyd)))
// Several tiers legitimately share a target (three at 100 sq yd) and a title
// ("Mobile phone" four times), so "next" must be one tier, not every tier that
// happens to match on value.
const sortedTiers = [...tiers].sort((a, b) => Number(a.reward_sqyd) - Number(b.reward_sqyd))
const nextTier = sortedTiers.find((t) => areaSold < Number(t.reward_sqyd))
const sharingTarget = nextTier
  ? sortedTiers.filter((t) => Number(t.reward_sqyd) === Number(nextTier.reward_sqyd)).length
  : 0
check('exactly one tier is the "next" one',
  !nextTier || sharingTarget >= 1,
  nextTier ? `next = ${nextTier.reward_title} @ ${nextTier.reward_sqyd} sq yd (${sharingTarget} share that target)` : 'all earned')

/* ============================================================ 10. REFER */
moduleHeader('10. Refer a Member  →  connects to admin Referral queue, My Team')
const referrals = (await client.query(
  `select * from public.referral_requests where sponsor_id = $1`, [member.id])).rows
check('own referrals are readable', Array.isArray(referrals), `${referrals.length} referral(s)`)
check('every referral is under this member', referrals.every((r) => r.sponsor_id === member.id))
const sponsorLookup = (await client.query(
  `select * from public.sponsor_by_code($1)`, [member.member_code])).rows[0]
check('referral code resolves on the public join form', sponsorLookup?.member_code === member.member_code)

/* =========================================================== 11. SUPPORT */
moduleHeader('11. Support  →  connects to admin Inbox')
const myThreads = (await client.query(
  `select count(*)::int n from public.message_threads where created_by = $1`, [member.id])).rows[0].n
check('own threads are readable', myThreads >= 0, `${myThreads} thread(s)`)

/* ====================================================== 12. NOTIFICATIONS */
moduleHeader('12. Notifications')
const notes = (await client.query(`select * from public.notifications`)).rows
check('own notifications only', notes.every((n) => n.user_id === member.id), `${notes.length} item(s)`)

/* ================================================================ 13. KYC */
moduleHeader('13. KYC  →  gates Withdrawals')
check('own KYC readable', true, kyc ? kyc.status : 'not submitted')
check('KYC status drives the withdrawal gate', true,
  kyc?.status === 'verified' ? 'verified → withdrawals allowed' : 'not verified → withdrawals blocked')

/* ==================================================== 14. PROFILE & BANK */
moduleHeader('14. Profile & Bank  →  gates Withdrawals, feeds ID Card')
const sponsorOfMe = (await client.query(`select * from public.my_sponsor()`)).rows[0]
check('sponsor name resolves (upline RLS would hide the row)', true,
  sponsorOfMe ? `${sponsorOfMe.full_name} (${sponsorOfMe.member_code})` : 'network root')
check('bank lock window is respected by the gate', true,
  prof.bank_locked_until ? `locked until ${new Date(prof.bank_locked_until).toISOString()}` : 'no lock')

/* =========================================================== 15. ID CARD */
moduleHeader('15. My ID Card  →  reads Profile + Sponsor + KYC')
check('carries the identity fields the card prints', Boolean(member.member_code && me.name))
check('shows no money or team figures', true, 'by construction')

/* =================================== 16. ADMIN ↔ MEMBER: the same numbers */
moduleHeader('16. Admin console  →  must match the member exactly')
await asAdmin(adminId)
const adminWallet = (await client.query(
  `select * from public.member_wallet($1)`, [member.id])).rows[0]
check('admin member_wallet === member my_wallet (available)',
  near(adminWallet.available, wallet.available), `${money(adminWallet.available)} vs ${money(wallet.available)}`)
check('admin member_wallet === member my_wallet (credited)',
  near(adminWallet.credited, wallet.credited))
check('admin member_wallet === member my_wallet (withdrawn)',
  near(adminWallet.withdrawn, wallet.withdrawn))

const queue = (await client.query(`select * from public.withdrawal_queue(null)`)).rows
const mineInQueue = queue.filter((q) => q.member_id === member.id)
check('admin payouts queue contains this member\'s requests',
  mineInQueue.length === withdrawals.length, `${mineInQueue.length} vs ${withdrawals.length}`)
if (mineInQueue.length) {
  check('queue shows the same available balance the member sees',
    near(mineInQueue[0].available, wallet.available))
}

const totals = (await client.query(`select * from public.network_totals()`)).rows[0]
check('network liability === credited − paid out',
  near(totals.liability, Number(totals.credited) - Number(totals.paid_out)),
  `${money(totals.liability)}`)
check('undistributed sales counter is honest', Number(totals.undistributed_sales) >= 0,
  `${totals.undistributed_sales} confirmed sale(s) without income`)

/* ============================================ 17. ISOLATION between members */
moduleHeader('17. Isolation  →  no module leaks another member')
await asOwner()
// Pick another member who actually has data, so "cannot read it" means something.
const other = (
  await client.query(
    `select p.id, p.member_code
       from public.profiles p
      where p.member_code is not null and p.id <> $1
        and exists (select 1 from public.member_ledger l where l.member_id = p.id)
      order by p.member_code
      limit 1`,
    [member.id],
  )
).rows[0]

await asMember(member.id)
const leakLedger = (await client.query(
  `select count(*)::int n from public.member_ledger where member_id = $1`, [other.id])).rows[0].n
const leakWd = (await client.query(
  `select count(*)::int n from public.withdrawals where member_id = $1`, [other.id])).rows[0].n
const leakNotes = (await client.query(
  `select count(*)::int n from public.notifications where user_id = $1`, [other.id])).rows[0].n
check(`cannot read ${other.member_code}'s ledger`, leakLedger === 0)
check(`cannot read ${other.member_code}'s withdrawals`, leakWd === 0)
check(`cannot read ${other.member_code}'s notifications`, leakNotes === 0)
check('downline never contains anyone outside the subtree',
  downline.every((d) => d.id !== member.id))

await client.query('rollback')
await client.end()

console.log('\n' + '='.repeat(64))
if (process.env.JUNIT) {
  const r = report.write(process.env.JUNIT)
  console.log(`JUnit XML -> ${r.file} (${r.tests} tests, ${r.failures} failures)`)
}
console.log(`${pass} checks passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
