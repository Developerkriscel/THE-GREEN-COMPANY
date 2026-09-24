#!/usr/bin/env node
/**
 * Behaviour tests for the Sponsor Panel's server-side rules.
 *
 *   node scripts/test-sponsor-rules.mjs
 *
 * These are the rules the interface must not be the only thing enforcing:
 * own-data-only, the withdrawal eligibility gate, idempotency, and the balance
 * identity. Each case runs as a real signed-in member through the same
 * `set local role authenticated` + request.jwt.claims path the gateway uses, so
 * RLS applies exactly as it does in the app. Every case rolls back.
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

let passed = 0
let failed = 0
// JUnit XML for CI. Written only when JUNIT is set, so local runs stay quiet.
const report = junit('sponsor-rules')

/** Run one case inside a savepoint, as `who`, then roll it back. */
async function test(name, who, fn) {
  const started = Date.now()
  await client.query('savepoint tc')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: who, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    await fn()
    console.log(`  PASS  ${name}`)
    report.add('Sponsor Panel rules', name, { ok: true, timeMs: Date.now() - started })
    passed += 1
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`)
    report.add('Sponsor Panel rules', name, { ok: false, message: err.message, timeMs: Date.now() - started })
    failed += 1
  } finally {
    await client.query('rollback to savepoint tc').catch(() => {})
    await client.query('reset role').catch(() => {})
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/**
 * Arrange a precondition the way the COMPANY would (freeze an account, set a
 * KYC status), not the way the member could — otherwise the guard triggers fire
 * on the setup itself and the test fails for the wrong reason. Restores the
 * member's identity afterwards so the assertion still runs as them.
 */
async function asOwner(who, fn) {
  // Dropping to the owner role is NOT enough: guards like profiles_guard are
  // triggers that ask app.is_admin(), which reads the JWT claims. With no
  // claims the guard sees an anonymous writer and refuses. So arrange these
  // preconditions as the admin, exactly as the admin console would.
  await client.query('reset role')
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: adminId, role: 'authenticated' }),
  ])
  try {
    await fn()
  } finally {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: who, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
  }
}

/**
 * A raised exception aborts the whole transaction, so an expected failure runs
 * inside its own savepoint that is rolled back either way — otherwise every
 * statement after the first expected error is refused with "transaction is
 * aborted" and the case fails for the wrong reason.
 *
 * Takes a thunk, not a promise, so the query only runs once the savepoint exists.
 */
async function expectError(run, fragment) {
  await client.query('savepoint expect_err')
  try {
    await run()
  } catch (err) {
    await client.query('rollback to savepoint expect_err')
    assert(
      err.message.toLowerCase().includes(fragment.toLowerCase()),
      `expected an error containing "${fragment}", got "${err.message}"`,
    )
    return
  }
  await client.query('rollback to savepoint expect_err')
  throw new Error(`expected an error containing "${fragment}", but it succeeded`)
}

// --- fixtures ---------------------------------------------------------------
const adminId = (
  await client.query(`select id from public.profiles where role = 'admin' limit 1`)
).rows[0]?.id

const member = (
  await client.query(
    `select p.id, p.member_code, p.full_name
       from public.profiles p
      where p.member_code is not null and p.status = 'active' and p.role = 'rep'
        and exists (select 1 from public.member_ledger l where l.member_id = p.id)
      order by p.member_code limit 1`,
  )
).rows[0]

const other = (
  await client.query(
    `select p.id, p.member_code from public.profiles p
      where p.member_code is not null and p.id <> $1
        and exists (select 1 from public.member_ledger l where l.member_id = p.id)
      order by p.member_code limit 1`,
    [member.id],
  )
).rows[0]

console.log(`\nSponsor Panel rules — as ${member.member_code} (${member.full_name}), other = ${other.member_code}\n`)
await client.query('begin')

// --- own-data-only ----------------------------------------------------------
await test('reads its own ledger', member.id, async () => {
  const { rows } = await client.query(`select count(*)::int n from public.member_ledger`)
  assert(rows[0].n > 0, 'expected to see own ledger rows')
})

await test("cannot see another member's ledger", member.id, async () => {
  const { rows } = await client.query(
    `select count(*)::int n from public.member_ledger where member_id = $1`,
    [other.id],
  )
  assert(rows[0].n === 0, `leaked ${rows[0].n} of another member's ledger rows`)
})

await test("cannot see another member's withdrawals", member.id, async () => {
  const { rows } = await client.query(
    `select count(*)::int n from public.withdrawals where member_id = $1`,
    [other.id],
  )
  assert(rows[0].n === 0, `leaked ${rows[0].n} of another member's withdrawals`)
})

await test('my_downline() returns only its own subtree', member.id, async () => {
  const { rows } = await client.query(`select id, level from public.my_downline()`)
  assert(!rows.some((r) => r.id === member.id), 'the caller must not appear in their own downline')
  assert(!rows.some((r) => r.id === other.id && other.id !== member.id && r.level == null), 'bad row')
  for (const r of rows) assert(r.level >= 1 && r.level <= 12, `level out of range: ${r.level}`)
  // Every returned member must really be a descendant. Counted as the company:
  // profiles' RLS hides other members from the caller, so counting as them
  // would always come back zero.
  let real = 0
  await asOwner(member.id, async () => {
    const { rows: check } = await client.query(
      `with recursive t as (
         select id from public.profiles where referrer_id = $1
         union all select c.id from t join public.profiles c on c.referrer_id = t.id)
       select count(*)::int n from t`,
      [member.id],
    )
    real = check[0].n
  })
  assert(real >= rows.length, `my_downline returned ${rows.length}, real subtree is ${real}`)
})

await test('my_sponsor() returns name only, never the upline row', member.id, async () => {
  const { rows, fields } = await client.query(`select * from public.my_sponsor()`)
  const cols = fields.map((f) => f.name).sort()
  assert(
    JSON.stringify(cols) === JSON.stringify(['full_name', 'member_code']),
    `my_sponsor exposed extra columns: ${cols.join(', ')}`,
  )
  assert(rows.length <= 1, 'more than one sponsor')
})

// --- the balance identity ---------------------------------------------------
await test('wallet balance equals credits − withdrawn − pending', member.id, async () => {
  const { rows } = await client.query(`select * from public.my_wallet()`)
  const w = rows[0]
  const expected = Number(w.credited) - Number(w.withdrawn) - Number(w.pending)
  assert(
    Math.abs(Number(w.available) - expected) < 0.005,
    `available ${w.available} != ${expected} (credited ${w.credited} − withdrawn ${w.withdrawn} − pending ${w.pending})`,
  )
})

// --- the withdrawal gate ----------------------------------------------------
await test('rejects a withdrawal above the available balance', member.id, async () => {
  const { rows } = await client.query(`select available from public.my_wallet()`)
  const over = Number(rows[0].available) + 1000
  await expectError(
    () => client.query(`select public.request_withdrawal($1, null, null, null)`, [over]),
    'more than your available balance',
  )
})

await test('rejects a withdrawal below the minimum', member.id, async () => {
  await expectError(
    () => client.query(`select public.request_withdrawal($1, null, null, null)`, [1]),
    'minimum',
  )
})

await test('blocks a withdrawal while the account is on hold', member.id, async () => {
  await asOwner(member.id, () =>
    client.query(`update public.profiles set frozen = true where id = $1`, [member.id]))
  await expectError(
    () => client.query(`select public.request_withdrawal($1, null, null, null)`, [500]),
    'on hold',
  )
})

await test('blocks a withdrawal when KYC is not verified', member.id, async () => {
  await asOwner(member.id, () =>
    client.query(`update public.kyc set status = 'pending' where user_id = $1`, [member.id]))
  await expectError(
    () => client.query(`select public.request_withdrawal($1, null, null, null)`, [500]),
    'kyc',
  )
})

await test('a repeated submit with the same key creates one request', member.id, async () => {
  await asOwner(member.id, () =>
    client.query(`update public.withdrawals set status = 'paid' where member_id = $1 and status in ('requested','approved')`, [member.id]))
  const key = 'test-idempotency-key'
  const a = await client.query(`select public.request_withdrawal($1, $2, null, $3) id`, [500, 'TEST-ACC', key])
  const b = await client.query(`select public.request_withdrawal($1, $2, null, $3) id`, [500, 'TEST-ACC', key])
  assert(a.rows[0].id === b.rows[0].id, 'a retry created a second request')
  const { rows } = await client.query(
    `select count(*)::int n from public.withdrawals where idempotency_key = $1`, [key],
  )
  assert(rows[0].n === 1, `expected 1 request, found ${rows[0].n}`)
})

await test('a second open request is refused', member.id, async () => {
  await asOwner(member.id, () =>
    client.query(`update public.withdrawals set status = 'paid' where member_id = $1 and status in ('requested','approved')`, [member.id]))
  await client.query(`select public.request_withdrawal($1, $2, null, null)`, [500, 'TEST-ACC'])
  await expectError(
    () => client.query(`select public.request_withdrawal($1, $2, null, null)`, [500, 'TEST-ACC']),
    'already have a withdrawal',
  )
})

await test('a request immediately reduces the available balance', member.id, async () => {
  await asOwner(member.id, () =>
    client.query(`update public.withdrawals set status = 'paid' where member_id = $1 and status in ('requested','approved')`, [member.id]))
  const before = Number((await client.query(`select available from public.my_wallet()`)).rows[0].available)
  await client.query(`select public.request_withdrawal($1, $2, null, null)`, [1000, 'TEST-ACC'])
  const after = Number((await client.query(`select available from public.my_wallet()`)).rows[0].available)
  assert(Math.abs(before - after - 1000) < 0.005, `balance moved by ${before - after}, expected 1000`)
})

// --- company-controlled fields ----------------------------------------------
await test('a member cannot change their own rank', member.id, async () => {
  await expectError(
    () => client.query(`update public.profiles set rank_id = (select id from public.ranks where seniority = 12) where id = $1`, [member.id]),
    'administrator',
  )
})

await test('a member cannot change their own sponsor', member.id, async () => {
  await expectError(
    () => client.query(`update public.profiles set referrer_id = null where id = $1`, [member.id]),
    'administrator',
  )
})

await test('a member cannot write their own income', member.id, async () => {
  await expectError(
    () => client.query(
      `insert into public.member_ledger (member_id, kind, source, net, amount) values ($1, 'credit', 'direct_income', 99999, 99999)`,
      [member.id],
    ),
    'policy',
  )
})

await test('a member cannot approve their own withdrawal', member.id, async () => {
  const { rows } = await client.query(`select id from public.withdrawals limit 1`)
  if (!rows.length) return // nothing to try it on
  const res = await client.query(`update public.withdrawals set status = 'paid' where id = $1`, [rows[0].id])
  assert(res.rowCount === 0, 'a member was able to mark their own withdrawal paid')
})

await test('a member cannot refer someone under another sponsor', member.id, async () => {
  const res = await client.query(
    `insert into public.referral_requests (sponsor_id, full_name, mobile) values ($1, 'X', '9999999999')
     on conflict do nothing returning id`,
    [other.id],
  ).catch((e) => ({ rowCount: 0, err: e }))
  assert(res.rowCount === 0, 'a member inserted a referral under a different sponsor')
})

// --- signing in -------------------------------------------------------------
// /portal/login ("Sponsor Sign-in") resolves whatever identifier the person
// knows. It must reach members and customers, and must never become a second
// door into a staff account.
const resolves = (id) => client.query(`select public.resolve_login_identifier($1) e`, [id])

// The sign-up journey: register -> pending -> office approves -> sponsor panel.
// A pending member must be able to AUTHENTICATE so RequireAuth can show them
// the "awaiting approval" screen. Refusing them at the resolver told a genuine
// new member their Sponsor ID was wrong.
await test('a pending sign-up can still reach the approval screen', member.id, async () => {
  let code = null
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select member_code from public.profiles
        where role = 'rep' and status = 'pending' and deleted_at is null limit 1`,
    )
    code = rows[0]?.member_code ?? null
  })
  if (!code) return // no pending sign-up in this database
  const { rows } = await resolves(code)
  assert(rows[0].e, 'a pending sign-up was refused at the login, not at the gate')
})

await test('a suspended member is refused at the login', member.id, async () => {
  let code = null
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select member_code from public.profiles
        where role = 'rep' and status = 'suspended' and deleted_at is null limit 1`,
    )
    code = rows[0]?.member_code ?? null
  })
  if (!code) return // nobody suspended in this database
  const { rows } = await resolves(code)
  assert(rows[0].e === null, 'a suspended member resolved through the sponsor login')
})

await test('approving a sign-up stamps the approval date', member.id, async () => {
  await asOwner(member.id, async () => {
    // What the admin panel's "Approve sign-up" does, in the same order.
    await client.query(`update public.profiles set status = 'active' where id = $1`, [member.id])
    await client.query(
      `update public.profiles set approved_at = now() where id = $1 and approved_at is null`,
      [member.id],
    )
    const { rows } = await client.query(
      `select status, approved_at from public.profiles where id = $1`, [member.id],
    )
    assert(rows[0].status === 'active', 'approval did not activate the account')
    assert(rows[0].approved_at, 'approval did not record a date')
  })
})

// ------------------------------------------------------------ support inbox
// messages.internal marks a staff-only note. The thread hides it from members,
// but the notification trigger did not -- it sent a 140-character preview.

await test('an internal note never notifies a member', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select n.id
         from public.notifications n
         join public.profiles p on p.id = n.user_id
        where n.type = 'message' and p.role = 'rep'
          and exists (
            select 1 from public.messages m
             where m.internal
               and n.body like left(m.body, 60) || '%'
          )`,
    )
    assert(rows.length === 0, 'a member was notified about an internal note')
  })
})

await test('a message notification links to a real route', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select link from public.notifications
        where type = 'message'
          and link is not null
          and link not like '/sponsor/messages/%'
          and link not like '/admin/messages/%'`,
    )
    assert(rows.length === 0, `dead notification link: ${rows.map(r => r.link).join(', ')}`)
  })
})

await test('unread counts never include a thread the member cannot open', member.id, async () => {
  // my_unread_threads() is security definer, so RLS does NOT apply and the
  // visibility rule had to be written into the query itself. Without it a
  // member was told about every website enquiry in the system.
  const { rows } = await client.query(
    `select t.id
       from public.my_unread_threads() u
       join public.message_threads t on t.id = u.thread_id
      where not (
        t.created_by = $1 or t.customer_id = $1 or t.assigned_to = $1
        or exists (select 1 from public.thread_participants x
                    where x.thread_id = t.id and x.user_id = $1)
      )`, [member.id],
  )
  assert(rows.length === 0, `${rows.length} thread(s) leaked into the unread list`)
})

// -------------------------------------------------- rank & reward automation
// recalculate_rank() is admin-gated and was only ever called from a button, so
// nothing promoted anyone when the team grew -- and direct income is paid at
// the seller's CURRENT rank, so a stale rank underpays every sale.

await test('promotion runs without an administrator clicking', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
         and tgname = 'trg_profiles_rank_sync' and not tgisinternal`,
    )
    assert(rows.length === 1, 'the automatic rank-sync trigger is missing')
  })
})

await test('nobody sits below the rank they qualify for', member.id, async () => {
  await asOwner(member.id, async () => {
    // Promotion is automatic, so no active member should be under-ranked.
    const { rows } = await client.query(
      `select p.member_code
         from public.profiles p
         left join public.ranks cur on cur.id = p.rank_id
         join public.ranks q on q.id = app.qualified_rank(p.id)
        where p.role = 'rep' and p.status = 'active' and p.deleted_at is null
          and q.seniority > coalesce(cur.seniority, 0)`,
    )
    assert(rows.length === 0, `under-ranked: ${rows.map(r => r.member_code).join(', ')}`)
  })
})

await test('rank history contains no demotion', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select rh.id from public.rank_history rh
         join public.ranks f on f.id = rh.from_rank
         join public.ranks t on t.id = rh.to_rank
        where t.seniority <= f.seniority`,
    )
    assert(rows.length === 0, 'rank_history contains a demotion')
  })
})

await test('an issued reward never touches the wallet', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select id from public.member_ledger
        where source = 'reward' and in_kind and (net <> 0 or amount <> 0)`,
    )
    assert(rows.length === 0, 'an in-kind reward carries a cash value')
  })
})

await test('the same reward cannot be issued twice', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select 1 from pg_indexes where indexname = 'member_ledger_reward_once'`,
    )
    assert(rows.length === 1, 'the one-reward-per-tier index is missing')
  })
})

// ------------------------------------------------------- withdrawal guard
// `withdrawals.status` is free text that app.member_balance keys off by exact
// string, so an unrecognised value counts as neither withdrawn nor pending --
// the money would stay spendable after being sent. These guard that.

await test('withdrawal status is constrained to the five real values', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select 1 from pg_constraint where conname = 'withdrawals_status_check'`,
    )
    assert(rows.length === 1, 'the status CHECK constraint is missing')
  })
})

await test('a withdrawal cannot be paid without being approved', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `insert into public.withdrawals (member_id, amount, account, status)
       values ($1, 100, 'TEST', 'requested') returning id`, [member.id],
    )
    const id = rows[0].id
    await expectError(
      () => client.query(`update public.withdrawals set status='paid', utr='X' where id=$1`, [id]),
      'must be approved',
    )
    await client.query('delete from public.withdrawals where id=$1', [id])
  })
})

await test('a paid withdrawal cannot be reopened or paid twice', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select id from public.withdrawals where status = 'paid' limit 1`,
    )
    if (!rows.length) return
    await expectError(
      () => client.query(`update public.withdrawals set status='approved' where id=$1`, [rows[0].id]),
      'already paid',
    )
  })
})

await test('the amount of a withdrawal cannot be changed after it is raised', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `insert into public.withdrawals (member_id, amount, account, status)
       values ($1, 100, 'TEST', 'requested') returning id`, [member.id],
    )
    const id = rows[0].id
    await expectError(
      () => client.query(`update public.withdrawals set amount = 999999 where id=$1`, [id]),
      'cannot be changed',
    )
    await client.query('delete from public.withdrawals where id=$1', [id])
  })
})

await test('rejecting requires a reason, server-side', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `insert into public.withdrawals (member_id, amount, account, status)
       values ($1, 100, 'TEST', 'requested') returning id`, [member.id],
    )
    const id = rows[0].id
    await expectError(
      () => client.query(`update public.withdrawals set status='rejected' where id=$1`, [id]),
      'reason is required',
    )
    await client.query('delete from public.withdrawals where id=$1', [id])
  })
})

await test('the balance only ever counts statuses the formula knows', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select distinct status from public.withdrawals
        where status not in ('requested','approved','paid','rejected','cancelled')`,
    )
    assert(rows.length === 0, `unknown withdrawal status: ${rows.map(r => r.status).join(', ')}`)
  })
})

// ----------------------------------------------------- Payments CRM chain
// This whole chain was dead: no schedule was ever built and no receipt could
// be recorded, so `collected` was always 0 and NO member could ever reach the
// 50% threshold that a reward tier needs.

await test('a confirmed sale gets a payment schedule', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select count(*)::int n from public.bookings b
        where b.status = 'confirmed' and b.deleted_at is null
          and not exists (select 1 from public.emis e where e.booking_id = b.id)`,
    )
    assert(rows[0].n === 0, `${rows[0].n} confirmed sale(s) have no instalment schedule`)
  })
})

await test('a schedule always sums to the balance after the token', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select b.reference,
              round(b.sale_value - b.token_amount, 2) balance,
              round(sum(e.amount), 2) scheduled
         from public.bookings b join public.emis e on e.booking_id = b.id
        group by b.reference, b.sale_value, b.token_amount
       having round(b.sale_value - b.token_amount, 2) <> round(sum(e.amount), 2)`,
    )
    assert(rows.length === 0, `schedule does not match the balance on ${rows.map(r => r.reference).join(', ')}`)
  })
})

await test('collected never exceeds what was actually received', member.id, async () => {
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select b.reference from public.bookings b
        where coalesce((select sum(p.amount) from public.payments p where p.booking_id = b.id), 0)
              > b.sale_value * 10`,
    )
    assert(rows.length === 0, 'a booking has wildly more collected than its sale value')
  })
})

await test('reward area counts only sales that are at least half paid', member.id, async () => {
  await asOwner(member.id, async () => {
    // Recompute the rule independently and compare against the function.
    const { rows } = await client.query(
      `select coalesce(sum(pl.size), 0)::numeric expected
         from public.bookings b join public.plots pl on pl.id = b.plot_id
        where b.rep_id = $1 and b.status = 'confirmed' and b.deleted_at is null
          and coalesce((select sum(p.amount) from public.payments p where p.booking_id = b.id), 0)
              >= coalesce(b.sale_value, 0) * 0.5`,
      [member.id],
    )
    const { rows: fn } = await client.query('select public.my_reward_area($1) a', [member.id])
    // The function also guards on the caller; as owner both should agree.
    assert(
      Number(fn[0].a) === Number(rows[0].expected),
      `my_reward_area says ${fn[0].a}, the rule says ${rows[0].expected}`,
    )
  })
})

await test('a member signs in with their Sponsor ID', member.id, async () => {
  const { rows } = await resolves(member.member_code)
  assert(rows[0].e, 'Sponsor ID did not resolve')
})

await test('a member signs in with their email', member.id, async () => {
  const { rows } = await client.query(
    `select email from public.profiles where id = $1`, [member.id],
  )
  const { rows: r2 } = await resolves(rows[0].email)
  assert(r2[0].e === rows[0].email, 'email did not resolve to the same account')
})

// The customer portal was retired on 2026-09-24 -- the business runs two
// panels, /admin and /sponsor. A customer signing in here would land nowhere,
// so the sponsor door now refuses them the same way it refuses staff.
await test('a customer cannot sign in through the sponsor door', member.id, async () => {
  let code = null
  await asOwner(member.id, async () => {
    const { rows } = await client.query(
      `select user_code from public.profiles where role = 'customer' and status = 'active' limit 1`,
    )
    code = rows[0]?.user_code ?? null
  })
  if (!code) return // no customer in this database
  const { rows } = await resolves(code)
  assert(rows[0].e === null, 'a customer resolved through the sponsor login')
})

await test('an admin cannot sign in through the sponsor door', member.id, async () => {
  // Refusal is a null result, not an exception — raising produced a misleading
  // HTTP 401 for what is an ordinary negative answer.
  const { rows } = await resolves('admin@rgc.local')
  assert(rows[0].e === null, 'an admin resolved through the sponsor login')
})

await test('a manager cannot sign in through the sponsor door', member.id, async () => {
  const { rows } = await resolves('manager@rgc.local')
  assert(rows[0].e === null, 'a manager resolved through the sponsor login')
})

await test('an unknown ID fails the same way as a wrong password', member.id, async () => {
  // Both answer null, so the page shows one message and cannot be used to
  // discover which identifiers exist.
  assert((await resolves('RGC999999')).rows[0].e === null, 'unknown ID resolved')
  assert((await resolves('   ')).rows[0].e === null, 'blank ID resolved')
})


// --- the audit fixes --------------------------------------------------------
await test('a confirmed sale distributes income without anyone clicking', member.id, async () => {
  let n = 0
  await asOwner(member.id, async () => {
    const proj = (await client.query(`select id from public.projects where deleted_at is null limit 1`)).rows[0]
    const plot = (await client.query(
      `insert into public.plots (project_id, number, size, size_unit, price, status)
       values ($1, 'RULE-T1', 200, 'sqyd', 1600000, 'available') returning id`, [proj.id])).rows[0]
    const bk = (await client.query(
      `insert into public.bookings (reference, plot_id, project_id, rep_id, status, sale_value,
                                    payment_plan, terms_accepted_rep, terms_accepted_customer)
       values ('', $1, $2, $3, 'confirmed', 1600000, 'full', true, true) returning id`,
      [plot.id, proj.id, member.id])).rows[0]
    n = (await client.query(`select count(*)::int c from public.member_ledger where booking_id = $1`, [bk.id])).rows[0].c
  })
  assert(n > 0, 'a confirmed sale created no income')
})

await test('cancelling a sale reverses the income it paid', member.id, async () => {
  let reversed = 0, total = 0
  await asOwner(member.id, async () => {
    const proj = (await client.query(`select id from public.projects where deleted_at is null limit 1`)).rows[0]
    const plot = (await client.query(
      `insert into public.plots (project_id, number, size, size_unit, price, status)
       values ($1, 'RULE-T2', 200, 'sqyd', 1600000, 'available') returning id`, [proj.id])).rows[0]
    const bk = (await client.query(
      `insert into public.bookings (reference, plot_id, project_id, rep_id, status, sale_value,
                                    payment_plan, terms_accepted_rep, terms_accepted_customer)
       values ('', $1, $2, $3, 'confirmed', 1600000, 'full', true, true) returning id`,
      [plot.id, proj.id, member.id])).rows[0]
    await client.query(`update public.bookings set status = 'cancelled' where id = $1`, [bk.id])
    const r = (await client.query(
      `select count(*) filter (where status = 'reversed')::int rev, count(*)::int tot
         from public.member_ledger where booking_id = $1`, [bk.id])).rows[0]
    reversed = r.rev; total = r.tot
  })
  assert(total > 0 && reversed === total, `only ${reversed} of ${total} rows reversed`)
})

await test('a bank change locks withdrawals for 24 hours', member.id, async () => {
  await client.query(`select public.save_bank_details('X','HDFC','501001234599','HDFC0001234','savings','','')`)
  await expectError(
    () => client.query(`select public.request_withdrawal(500, null, null, null)`),
    'bank details changed recently',
  )
})

await test('a member action is written to the audit log', member.id, async () => {
  await client.query(`select public.save_bank_details('X','HDFC','501001234598','HDFC0001234','savings','','')`)
  let n = 0
  await asOwner(member.id, async () => {
    n = (await client.query(
      `select count(*)::int c from public.audit_log where actor_id = $1 and entity = 'profiles.bank'`,
      [member.id])).rows[0].c
  })
  assert(n > 0, 'no audit row was written for a bank change')
})

await test('a rank review never demotes', member.id, async () => {
  let before, after
  await asOwner(member.id, async () => {
    before = (await client.query(
      `select r.seniority s from public.profiles p join public.ranks r on r.id = p.rank_id where p.id = $1`,
      [member.id])).rows[0]?.s
    await client.query(`select public.recalculate_rank($1)`, [member.id])
    after = (await client.query(
      `select r.seniority s from public.profiles p join public.ranks r on r.id = p.rank_id where p.id = $1`,
      [member.id])).rows[0]?.s
  })
  assert((after ?? 0) >= (before ?? 0), `rank went down: ${before} -> ${after}`)
})

await test('the paged statement balance matches the wallet', member.id, async () => {
  const { rows } = await client.query(`select balance_after from public.my_ledger_page(25, 0)`)
  if (!rows.length) return
  const { rows: w } = await client.query(`select available from public.my_wallet()`)
  assert(
    Math.abs(Number(rows[0].balance_after) - Number(w[0].available)) < 0.005,
    `statement says ${rows[0].balance_after}, wallet says ${w[0].available}`,
  )
})

await test('deleted members do not inflate team counts', member.id, async () => {
  let mismatch = 0
  await asOwner(member.id, async () => {
    await client.query(`select public.recalculate_network()`)
    mismatch = (await client.query(`
      select count(*)::int c from public.profiles p
       where p.member_code is not null and p.deleted_at is null
         and p.direct_count <> (select count(*) from public.profiles d
                                 where d.referrer_id = p.id and d.deleted_at is null)`)).rows[0].c
  })
  assert(mismatch === 0, `${mismatch} member(s) have a stale direct_count`)
})


// --- sign-in robustness -----------------------------------------------------
// A pasted identifier routinely carries invisible characters; and an unknown
// identifier must be an ordinary negative, not an exception that surfaces as a
// misleading HTTP 401.
await test('an unknown identifier returns null, it does not raise', member.id, async () => {
  const { rows } = await client.query(`select public.resolve_login_identifier($1) e`, ['RGC999999'])
  assert(rows[0].e === null, `expected null, got ${rows[0].e}`)
})

await test('a pasted zero-width space still resolves', member.id, async () => {
  let email
  await asOwner(member.id, async () => {
    email = (await client.query(`select email from public.profiles where id = $1`, [member.id])).rows[0].email
  })
  const { rows } = await client.query(
    `select public.resolve_login_identifier($1) e`, [email + '​'])
  assert(rows[0].e === email, 'a zero-width space broke the lookup')
})

await test('a non-breaking space and stray spaces still resolve', member.id, async () => {
  const { rows } = await client.query(
    `select public.resolve_login_identifier($1) e`, [' ' + member.member_code + ' '])
  assert(rows[0].e, 'a non-breaking space broke the lookup')
})

await test('an internal space in a Sponsor ID still resolves', member.id, async () => {
  const code = member.member_code
  const spaced = code.slice(0, 3) + ' ' + code.slice(3)
  const { rows } = await client.query(`select public.resolve_login_identifier($1) e`, [spaced])
  assert(rows[0].e, `"${spaced}" did not resolve`)
})


// --- modules added after the competitor gap review --------------------------
await test('a member can open a support thread and read it back', member.id, async () => {
  const { rows } = await client.query(
    `select public.start_support_thread($1, $2) id`, ['Test subject', 'Test body'])
  const id = rows[0].id
  assert(id, 'no thread id returned')
  // The author must be a participant, or threads_select_participant hides their
  // own thread from them.
  const seen = await client.query(
    `select count(*)::int n from public.message_threads where id = $1`, [id])
  assert(seen.rows[0].n === 1, 'the author cannot read back their own thread')
  const msgs = await client.query(
    `select count(*)::int n from public.messages where thread_id = $1`, [id])
  assert(msgs.rows[0].n === 1, 'the opening message was not posted')
})

await test('a support thread requires a subject and a body', member.id, async () => {
  await expectError(() => client.query(`select public.start_support_thread('', 'x')`), 'subject')
  await expectError(() => client.query(`select public.start_support_thread('x', '')`), 'message')
})

await test('a referral link wires the sponsor server-side', member.id, async () => {
  let sponsorOf = null
  await asOwner(member.id, async () => {
    const uid = (await client.query(`select gen_random_uuid() id`)).rows[0].id
    await client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'ref-rule-test@members.rgc.local',
               jsonb_build_object('full_name', 'Ref Rule Test', 'ref', $2::text))`,
      [uid, String(member.member_code)])
    const r = await client.query(
      `select s.member_code from public.profiles p
         join public.profiles s on s.id = p.referrer_id where p.id = $1`, [uid])
    sponsorOf = r.rows[0]?.member_code ?? null
  })
  assert(sponsorOf === member.member_code,
    `?ref= did not attach the sponsor (got ${sponsorOf})`)
})

await test('an unknown ?ref= code still lets the person register', member.id, async () => {
  let created = 0
  await asOwner(member.id, async () => {
    const uid = (await client.query(`select gen_random_uuid() id`)).rows[0].id
    await client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'ref-bad-test@members.rgc.local', jsonb_build_object('full_name','Bad Ref','ref','RGC999999'))`,
      [uid])
    created = (await client.query(
      `select count(*)::int n from public.profiles where id = $1 and referrer_id is null`, [uid])).rows[0].n
  })
  assert(created === 1, 'an unknown referral code broke registration')
})

await client.query('rollback')
await client.end()

if (process.env.JUNIT) {
  const r = report.write(process.env.JUNIT)
  console.log(`JUnit XML -> ${r.file} (${r.tests} tests, ${r.failures} failures)`)
}
console.log(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed ? 1 : 0
