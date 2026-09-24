#!/usr/bin/env node
/**
 * Seed demonstration data for the Sponsor Panel.
 *
 *   node scripts/seed-sponsor-demo.mjs          # seed (skips if already seeded)
 *   node scripts/seed-sponsor-demo.mjs --force  # clear previous demo data, reseed
 *   node scripts/seed-sponsor-demo.mjs --clear  # remove demo data and stop
 *
 * What it does, and why it does it this way: it creates confirmed plot bookings
 * for members spread across the sponsor tree and then calls the real
 * distribute_sale_income() RPC for each one. The wallet, income, rank and reward
 * numbers the panel shows are therefore produced by the actual engine, not
 * written by hand — so seeing them on screen is evidence the engine works.
 *
 * Every row it creates is tagged (bookings.reject_remark = 'demo-seed'), so
 * --clear removes exactly what it added and nothing else.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAG = 'demo-seed'
const RATE_PER_SQYD = 8000

const argv = new Set(process.argv.slice(2))
const FORCE = argv.has('--force')
const CLEAR_ONLY = argv.has('--clear')

function envFileValue(key) {
  const envPath = path.join(ROOT, '.env')
  if (!existsSync(envPath)) return undefined
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    if (line.slice(0, eq).trim() !== key) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value || undefined
  }
}

const connectionString = process.env.DATABASE_URL ?? envFileValue('DATABASE_URL')
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

/**
 * Run as a signed-in user, exactly as the gateway does on every request.
 * The claim is transaction-scoped, so it clears itself on commit/rollback —
 * deliberately not reset in a finally block, which would otherwise run against
 * an already-aborted transaction and mask the error that aborted it.
 */
async function asUser(userId, fn) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
  return fn()
}

async function clearDemo() {
  const { rows } = await client.query(`select id from public.bookings where reject_remark = $1`, [TAG])
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    await client.query(`delete from public.member_ledger where booking_id = any($1::uuid[])`, [ids])
    await client.query(`delete from public.commissions where booking_id = any($1::uuid[])`, [ids])
    await client.query(`delete from public.sale_confirmations where booking_id = any($1::uuid[])`, [ids])
    await client.query(`delete from public.bookings where id = any($1::uuid[])`, [ids])
  }
  await client.query(`delete from public.member_ledger where reference like 'SALARY-%'`)
  await client.query(`delete from public.withdrawals where note = $1`, [TAG])
  await client.query(`delete from public.referral_requests where full_name like 'Demo %'`)
  await client.query(`delete from public.plots where notes = $1`, [TAG])
  console.log(`cleared ${ids.length} demo booking(s) and everything derived from them`)
}

try {
  await client.query('begin')

  if (FORCE || CLEAR_ONLY) await clearDemo()
  if (CLEAR_ONLY) {
    await client.query('commit')
    console.log('done (clear only)')
    process.exit(0)
  }

  const existing = await client.query(
    `select count(*)::int n from public.member_ledger where source in ('direct_income','level_income')`,
  )
  if (existing.rows[0].n > 0) {
    await client.query('rollback')
    console.log(`income already present (${existing.rows[0].n} rows). Re-run with --force to rebuild.`)
    process.exit(0)
  }

  const admin = (await client.query(`select id from public.profiles where role = 'admin' limit 1`)).rows[0]
  if (!admin) throw new Error('no admin profile found')

  const project = (
    await client.query(`select id from public.projects where deleted_at is null order by sort_order limit 1`)
  ).rows[0]
  if (!project) throw new Error('no project found — run seed-projects.mjs first')

  // Sellers deep in the tree, so level income has an upline to travel through.
  const sellers = (
    await client.query(
      `select p.id, p.member_code, p.full_name
         from public.profiles p
        where p.member_code is not null and p.status = 'active'
          and p.deleted_at is null and p.referrer_id is not null
          and p.role = 'rep'
        order by p.member_code
        limit 14`,
    )
  ).rows
  if (!sellers.length) throw new Error('no downline members — run seed-mlm-network.mjs first')

  let made = 0
  let credits = 0

  await asUser(admin.id, async () => {
    for (const [i, seller] of sellers.entries()) {
      // A plot of its own per sale: `bookings_one_live_per_plot` allows only one
      // live booking against a plot, and the real inventory is already spoken for.
      const size = [100, 150, 200, 250, 300][i % 5]
      const plot = (
        await client.query(
          `insert into public.plots (project_id, number, size, size_unit, price, status, notes)
           values ($1, $2, $3, 'sqyd', $4, 'available', $5)
           on conflict (project_id, number) do update set notes = excluded.notes
           returning id, size`,
          [project.id, `DEMO-${seller.member_code}`, size, size * RATE_PER_SQYD, TAG],
        )
      ).rows[0]

      const value = Number(plot.size) * RATE_PER_SQYD
      const daysAgo = 5 + i * 6

      const { rows } = await client.query(
        `insert into public.bookings
           (reference, plot_id, project_id, rep_id, status, sale_value, token_amount,
            payment_plan, terms_accepted_rep, terms_accepted_customer,
            step1_at, step2_at, step3_at, reject_remark, created_at)
         values ('', $1, $2::uuid, $3, 'confirmed', $4, $5, 'full', true, true,
                 now() - make_interval(days => $6::int), now() - make_interval(days => $6::int),
                 now() - make_interval(days => $6::int), $7, now() - make_interval(days => $6::int))
         returning id, reference`,
        [plot.id, project.id, seller.id, value, Math.round(value * 0.1), daysAgo, TAG],
      )
      const booking = rows[0]
      made += 1

      const res = await client.query(`select public.distribute_sale_income($1) as n`, [booking.id])
      credits += Number(res.rows[0].n)
    }

    // One month of rank salary for the ranks that qualify.
    const sal = await client.query(`select public.credit_monthly_salary() as n`)
    credits += Number(sal.rows[0].n)
  })

  // Make one member fully payout-ready so the withdrawal flow can be exercised.
  const payoutMember = sellers[0]
  await client.query(
    `update public.profiles
        set bank_holder = full_name, bank_name = 'HDFC Bank', bank_account = '501001234521',
            bank_ifsc = 'HDFC0001234', bank_type = 'savings', upi_id = 'member@upi',
            pan_number = 'ABCDE1234F', bank_updated_at = now()
      where id = $1`,
    [payoutMember.id],
  )
  await client.query(
    `insert into public.kyc (user_id, id_type, id_last4, status, reviewed_at)
     values ($1, 'PAN', '234F', 'verified', now())
     on conflict (user_id) do update set status = 'verified', reviewed_at = now()`,
    [payoutMember.id],
  )

  // A settled payout and one still in flight, so history has something in it.
  await client.query(
    `insert into public.withdrawals (member_id, amount, account, status, note, requested_at, processed_at, paid_at, payout_reference)
     values ($1, 2500, 'HDFC ****4521', 'paid', $2, now() - interval '3 days', now() - interval '2 days', now() - interval '2 days', 'UTR7781200345')`,
    [payoutMember.id, TAG],
  )

  await client.query('commit')

  const summary = await client.query(
    `select source, count(*)::int rows, round(sum(gross),2) gross, round(sum(net),2) net
       from public.member_ledger group by source order by source`,
  )
  console.log(`\nseeded ${made} confirmed sales -> ${credits} income credits\n`)
  console.table(summary.rows)

  const top = await client.query(
    `select p.member_code, p.full_name, r.name rank,
            round((select credited from app.member_balance(p.id)),2) credited,
            round((select available from app.member_balance(p.id)),2) available
       from public.profiles p left join public.ranks r on r.id = p.rank_id
      where exists (select 1 from public.member_ledger l where l.member_id = p.id)
      order by credited desc nulls last limit 8`,
  )
  console.log('\nmembers now carrying a balance:')
  console.table(top.rows)
  console.log(`\npayout-ready demo member: ${payoutMember.member_code} (${payoutMember.full_name}) — KYC verified, bank saved`)
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error('seed failed:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
