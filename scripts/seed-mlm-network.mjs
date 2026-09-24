// Seeds the MLM network: applies the migration, assigns member codes to the
// existing accounts, and builds a realistic multi-level genealogy so the
// Members / Member Tree / Genealogy screens look like the production panel.
//
//   node scripts/seed-mlm-network.mjs
//
// Idempotent-ish: it clears previously seeded members (email domain
// @members.rgc.local) before re-seeding, so it can be run repeatedly.

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { hashPassword } from '../server/jwt.mjs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1]
if (!dbUrl) throw new Error('DATABASE_URL not found in .env')

const client = new Client({ connectionString: dbUrl })
await client.connect()

const MEMBER_DOMAIN = '@members.rgc.local'
const DEFAULT_PASSWORD = 'Member@123'
const pwHash = hashPassword(DEFAULT_PASSWORD)

// --- name pools -------------------------------------------------------------
const FIRST = [
  'Rajesh', 'Sunita', 'Amit', 'Pooja', 'Vikram', 'Neha', 'Sanjay', 'Kavita',
  'Deepak', 'Anjali', 'Manoj', 'Ritu', 'Suresh', 'Meena', 'Arun', 'Priya',
  'Rakesh', 'Seema', 'Ashok', 'Geeta', 'Naveen', 'Shalini', 'Vinod', 'Rekha',
  'Pankaj', 'Nisha', 'Yogesh', 'Divya', 'Harish', 'Preeti', 'Mukesh', 'Sonia',
  'Rohit', 'Anita', 'Gaurav', 'Swati', 'Nitin', 'Payal', 'Vishal', 'Jyoti',
  'Alok', 'Rani', 'Sachin', 'Manju', 'Dinesh', 'Komal', 'Vivek', 'Poonam',
  'Ramesh', 'Lakshmi', 'Kapil', 'Bhavna', 'Sandeep', 'Usha', 'Tarun', 'Renu',
]
const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Yadav', 'Singh', 'Kumar', 'Mishra', 'Pandey',
  'Tiwari', 'Chauhan', 'Jain', 'Agarwal', 'Rana', 'Bhandari', 'Saxena', 'Joshi',
  'Nair', 'Reddy', 'Patel', 'Shukla', 'Dubey', 'Rawat', 'Negi', 'Bisht',
]
const CITIES = [
  ['Gurugram', 'Haryana', '122001'], ['Delhi', 'Delhi', '110001'],
  ['Noida', 'Uttar Pradesh', '201301'], ['Lucknow', 'Uttar Pradesh', '226001'],
  ['Jaipur', 'Rajasthan', '302001'], ['Ayodhya', 'Uttar Pradesh', '224001'],
  ['Kanpur', 'Uttar Pradesh', '208001'], ['Faridabad', 'Haryana', '121001'],
]

let seed = 20260201
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1))

// --- ranks ------------------------------------------------------------------
const { rows: ranks } = await client.query('select id, name, seniority from public.ranks order by seniority')
const rankBySen = Object.fromEntries(ranks.map((r) => [r.seniority, r.id]))
// rank for a given depth in the tree (root deepest rank, leaves lowest)
const rankForDepth = (depth) => {
  if (depth === 0) return rankBySen[12] // Crown
  if (depth === 1) return rankBySen[pick([11, 10, 8, 8])] // Diamond / Gold / Core
  if (depth === 2) return rankBySen[pick([8, 5, 5, 4, 3])] // Core / Team Mgr / AGM / Sr Mgr
  return rankBySen[pick([2, 1, 1, 1])] // Manager / Channel Partner
}

console.log('Disabling triggers for seed…')
await client.query('alter table public.profiles disable trigger user')
await client.query('alter table auth.users disable trigger user')

try {
  // --- clear previously seeded members -------------------------------------
  await client.query(
    `delete from auth.users where email like '%' || $1`,
    [MEMBER_DOMAIN],
  )
  // (profiles cascade-delete with auth.users via FK on delete cascade)

  // --- reset member sequence -----------------------------------------------
  await client.query(`select setval('public.member_code_seq', 100000, true)`)
  const nextCode = async () => {
    const { rows } = await client.query(`select 'RGC' || nextval('public.member_code_seq')::text as c`)
    return rows[0].c
  }

  // --- wire the existing accounts ------------------------------------------
  // Root = admin. manager + reps become directs under the root.
  const { rows: existing } = await client.query(
    `select id, role, full_name from public.profiles where role <> 'customer' order by
       case role when 'admin' then 0 when 'manager' then 1 else 2 end, created_at`,
  )
  const admin = existing.find((p) => p.role === 'admin')
  if (!admin) throw new Error('No admin profile found')

  // admin → root
  const adminCode = await nextCode() // RGC100001
  await client.query(
    `update public.profiles
        set member_code = $2, rank_id = $3, referrer_id = null, placement_parent_id = null,
            status = 'active'
      where id = $1`,
    [admin.id, adminCode, rankBySen[12]],
  )

  // other existing staff → level-1 under admin
  const rootChildren = [{ id: admin.id, code: adminCode, depth: 0 }]
  for (const p of existing.filter((e) => e.id !== admin.id)) {
    const code = await nextCode()
    const rank = rankForDepth(1)
    await client.query(
      `update public.profiles
          set member_code = $2, rank_id = $3, referrer_id = $4, placement_parent_id = $4
        where id = $1`,
      [p.id, code, rank, admin.id],
    )
    rootChildren.push({ id: p.id, code, depth: 1, parent: admin.id })
  }

  // --- helper to create a fresh member -------------------------------------
  let created = 0
  const makeMember = async (parentId, depth) => {
    const code = await nextCode()
    const fn = pick(FIRST)
    const ln = pick(LAST)
    const full = `${fn} ${ln}`
    const email = `${fn}.${ln}.${code}${MEMBER_DOMAIN}`.toLowerCase()
    const phone = `9${randInt(100000000, 999999999)}`
    const [city, state, pin] = pick(CITIES)
    const rank = rankForDepth(depth)
    const joinedDaysAgo = randInt(5, 300)

    const { rows } = await client.query(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), $3) returning id`,
      [email, pwHash, JSON.stringify({ full_name: full })],
    )
    const id = rows[0].id
    await client.query(
      `insert into public.profiles
         (id, role, status, full_name, email, phone, user_code, member_code, rank_id,
          referrer_id, placement_parent_id, city, state, pincode, created_at)
       values ($1,'rep','active',$2,$3,$4,$5,$5,$6,$7,$7,$8,$9,$10, now() - ($11 || ' days')::interval)`,
      [id, full, email, phone, code, rank, parentId, city, state, pin, joinedDaysAgo],
    )
    created++
    return { id, code, depth }
  }

  // --- build the tree ------------------------------------------------------
  // Ensure the root has 8 directs total (existing staff count toward this).
  const level1 = rootChildren.filter((c) => c.depth === 1)
  while (level1.length < 8) {
    level1.push(await makeMember(admin.id, 1))
  }

  // Level 2 under each level-1, level 3 under some level-2.
  const level2 = []
  for (const p of level1) {
    const n = randInt(2, 4)
    for (let i = 0; i < n; i++) level2.push(await makeMember(p.id, 2))
  }
  for (const p of level2) {
    if (rnd() < 0.5) {
      const n = randInt(1, 3)
      for (let i = 0; i < n; i++) await makeMember(p.id, 3)
    }
  }

  console.log(`Seeded ${created} new members (+${existing.length} existing accounts wired).`)

  // --- recompute denormalised counts ---------------------------------------
  await client.query(`
    update public.profiles p set direct_count = coalesce(d.n, 0)
      from (select referrer_id, count(*) n from public.profiles where referrer_id is not null group by referrer_id) d
     where d.referrer_id = p.id;
  `)
  await client.query(`
    update public.profiles p set direct_count = 0
     where not exists (select 1 from public.profiles c where c.referrer_id = p.id);
  `)
  await client.query(`
    with recursive tree as (
      select id as root, id as node from public.profiles
      union all
      select t.root, c.id from tree t join public.profiles c on c.referrer_id = t.node
    )
    update public.profiles p set team_count = coalesce(t.n, 0)
      from (select root, count(*) - 1 n from tree group by root) t
     where t.root = p.id;
  `)
} finally {
  console.log('Re-enabling triggers…')
  await client.query('alter table public.profiles enable trigger user')
  await client.query('alter table auth.users enable trigger user')
}

const { rows: [stats] } = await client.query(
  `select count(*) filter (where role <> 'customer' and member_code is not null) as members,
          count(*) filter (where referrer_id is null and role <> 'customer' and member_code is not null) as roots,
          max(direct_count) as max_direct
     from public.profiles`,
)
console.log('Network:', stats)
await client.end()
console.log('Done.')
