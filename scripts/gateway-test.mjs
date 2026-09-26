#!/usr/bin/env node
/**
 * End-to-end test of the API gateway, over HTTP, as the browser would.
 *
 *   node server/index.mjs &        # gateway must be running
 *   node scripts/gateway-test.mjs
 *
 * The pgTAP suites prove the policies are correct inside the database. This
 * proves the gateway actually carries a caller's identity into them — that
 * `set local role` + `request.jwt.claims` really happen on every request, and
 * that the PostgREST dialect the app speaks is translated faithfully.
 *
 * Creates test users prefixed `gwtest-` and removes them at the end.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { junit } from './lib/junit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
const ANON = env.VITE_SUPABASE_ANON_KEY
const TAG = `gwtest-${Date.now()}`

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

let passed = 0
let failed = 0

// Set JUNIT=<path> to also write a JUnit XML report; run-all-tests.mjs does.
const j = junit('gateway')
let suite = 'gateway'

/** Group the checks that follow under a named suite in the XML. */
function section(name) {
  suite = name
  console.log(c.bold(`
${name}`))
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ${c.green('ok')}   ${label}`)
    passed++
  } else {
    console.log(`  ${c.red('FAIL')} ${label}`)
    if (detail !== undefined) console.log(`       ${c.dim(JSON.stringify(detail).slice(0, 300))}`)
    failed++
  }
  j.add(suite, label, {
    ok: Boolean(condition),
    message: condition ? undefined : JSON.stringify(detail ?? null).slice(0, 300),
  })
}

async function api(pathname, { token = ANON, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data, headers: res.headers }
}

const signUp = (email, password, data) =>
  api('/auth/v1/signup', { method: 'POST', body: { email, password, data } })

const signIn = (email, password) =>
  api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })

/* ------------------------------------------------------------------ main */

const db = new pg.Client({ connectionString: env.DATABASE_URL })

async function main() {
  console.log(`\n${c.bold('Gateway integration test')}`)
  console.log(`${c.dim('base:')} ${BASE}\n`)

  const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null)
  if (!health?.ok) {
    console.error(c.red('Gateway is not responding. Start it with: npm run api\n'))
    process.exit(1)
  }

  await db.connect()

  // ---------------------------------------------------------- anonymous
  console.log(c.bold('Anonymous'))
  const ranks = await api('/rest/v1/ranks?select=name,seniority,own_sale_rate&order=seniority.asc')
  // The ladder is plan data -- 12 ranks, 5% to 20% (plan deck slide 5). These
  // two checks assert the plan; everything below that touches `ranks` only
  // exercises gateway mechanics and derives its expectations from here.
  check('can read the ranks ladder', Array.isArray(ranks.data) && ranks.data.length === 12, ranks.data)
  check('rank rates come back intact', ranks.data?.[0]?.own_sale_rate === '5.00', ranks.data?.[0])
  const RANK_COUNT = ranks.data?.length ?? 0
  const TOP_RANK = ranks.data?.[RANK_COUNT - 1] ?? {}
  const ENTRY_RANK = ranks.data?.[0] ?? {}

  const anonLeads = await api('/rest/v1/leads?select=*')
  check('sees zero leads', Array.isArray(anonLeads.data) && anonLeads.data.length === 0, anonLeads.data)

  const anonAudit = await api('/rest/v1/audit_log?select=*')
  check('sees zero audit entries', Array.isArray(anonAudit.data) && anonAudit.data.length === 0)

  const enquiry = await api('/rest/v1/rpc/submit_enquiry', {
    method: 'POST',
    body: { p_name: `${TAG} enquiry`, p_mobile: '9998887777', p_message: 'via gateway test' },
  })
  check('can submit an enquiry through the RPC', enquiry.status === 200, enquiry.data)

  const leaked = await api('/rest/v1/leads?select=*&name=eq.' + encodeURIComponent(`${TAG} enquiry`))
  check('cannot read back the lead it just created', leaked.data?.length === 0, leaked.data)

  // ------------------------------------------------------------ sign-up
  console.log(`\n${c.bold('Registration and activation')}`)
  const repA = await signUp(`${TAG}-a@test.local`, 'supersecret123', { full_name: 'GW Rep A' })
  const repB = await signUp(`${TAG}-b@test.local`, 'supersecret123', { full_name: 'GW Rep B' })
  const adm = await signUp(`${TAG}-admin@test.local`, 'supersecret123', { full_name: 'GW Admin' })

  // --- email confirmation ------------------------------------------------
  // Sign-up used to auto-confirm, so any address -- somebody else's -- could
  // be registered and signed in. It now withholds the session until the
  // six-digit code mailed to the address comes back.
  check('sign-up withholds the session until the email is confirmed',
    repA.status === 200 && !repA.data?.access_token && Boolean(repA.data?.id), repA.data)

  const early = await signIn(`${TAG}-a@test.local`, 'supersecret123')
  check('an unconfirmed address cannot sign in',
    early.status === 400 && early.data?.code === 'email_not_confirmed', early.data)

  const earlyWrong = await signIn(`${TAG}-a@test.local`, 'not-the-password')
  check('a wrong password still says wrong password, not unconfirmed',
    earlyWrong.data?.code === 'invalid_credentials', earlyWrong.data)

  const { rows: otpRows } = await db.query(
    `select o.id, o.user_id, o.code_hash from auth.email_otps o
       join auth.users u on u.id = o.user_id
      where u.email = $1 and not o.used order by o.created_at desc limit 1`,
    [`${TAG}-a@test.local`],
  )
  check('a code is issued at sign-up', otpRows.length === 1, otpRows)
  check('the code is stored hashed, never in the clear',
    otpRows[0] && /^[0-9a-f]{64}$/.test(otpRows[0].code_hash), otpRows[0]?.code_hash)

  // The real code only exists in the mail. Plant a known one the same way the
  // gateway would -- sha256(user:code:secret) -- to drive /verify end to end.
  const KNOWN = '246810'
  const planted = createHash('sha256')
    .update(`${otpRows[0].user_id}:${KNOWN}:${env.API_JWT_SECRET}`)
    .digest('hex')
  await db.query(`update auth.email_otps set code_hash = $1 where id = $2`, [planted, otpRows[0].id])

  const wrongCode = await api('/auth/v1/verify', {
    method: 'POST', body: { type: 'signup', email: `${TAG}-a@test.local`, token: '000000' },
  })
  check('a wrong code is refused', wrongCode.status === 403, wrongCode.data)

  const verified = await api('/auth/v1/verify', {
    method: 'POST', body: { type: 'signup', email: `${TAG}-a@test.local`, token: KNOWN },
  })
  check('the right code confirms the address and signs the member in',
    verified.status === 200 && Boolean(verified.data?.access_token), verified.data)

  const reused = await api('/auth/v1/verify', {
    method: 'POST', body: { type: 'signup', email: `${TAG}-a@test.local`, token: KNOWN },
  })
  check('a code works only once', reused.status >= 400, reused.data)

  // Five wrong guesses burn the code, so it cannot be brute-forced in time.
  // Stamped a second after B's sign-up code so it is unambiguously the
  // newest: now() is the transaction's start time and two rows made moments
  // apart can otherwise sort either way.
  await db.query(
    `insert into auth.email_otps (user_id, code_hash, expires_at, created_at)
     select u.id, $2, now() + interval '10 minutes',
            coalesce((select max(created_at) from auth.email_otps where user_id = u.id), now()) + interval '1 second'
       from auth.users u where u.email = $1`,
    [`${TAG}-b@test.local`, createHash('sha256').update('unguessable').digest('hex')],
  )
  for (let i = 0; i < 5; i++) {
    await api('/auth/v1/verify', {
      method: 'POST', body: { type: 'signup', email: `${TAG}-b@test.local`, token: String(111110 + i) },
    })
  }
  const { rows: burned } = await db.query(
    `select o.used, o.attempts from auth.email_otps o
       join auth.users u on u.id = o.user_id
      where u.email = $1 order by o.created_at desc limit 1`,
    [`${TAG}-b@test.local`],
  )
  check('five wrong guesses burn the code', burned[0]?.used === true && burned[0]?.attempts === 5, burned[0])

  // B still holds the code issued at sign-up, older and never used. Once the
  // newest is burned, that older one must NOT become the target instead.
  const { rows: stillLive } = await db.query(
    `select count(*)::int n from auth.email_otps o join auth.users u on u.id = o.user_id
      where u.email = $1 and not o.used and o.expires_at > now()`,
    [`${TAG}-b@test.local`],
  )
  // Give that older code a value we know. With the old query ("newest code
  // that is not used") this exact code would now be accepted.
  const OLDER = '135790'
  await db.query(
    `update auth.email_otps o set code_hash = $2
       from auth.users u
      where u.id = o.user_id and u.email = $1 and not o.used`,
    [`${TAG}-b@test.local`, createHash('sha256').update(
      `${(await db.query(`select id from auth.users where email = $1`, [`${TAG}-b@test.local`])).rows[0].id}:${OLDER}:${env.API_JWT_SECRET}`,
    ).digest('hex')],
  )
  const fallback = await api('/auth/v1/verify', {
    method: 'POST', body: { type: 'signup', email: `${TAG}-b@test.local`, token: OLDER },
  })
  check('a burned code never falls back to an older live one',
    stillLive[0].n >= 1 && fallback.status === 403, { olderLiveCodes: stillLive[0].n, status: fallback.status })

  const unknownResend = await api('/auth/v1/resend', {
    method: 'POST', body: { type: 'signup', email: `${TAG}-nobody@test.local` },
  })
  check('resend answers the same for an unknown address (no enumeration)',
    unknownResend.status === 200, unknownResend.data)

  // The other two accounts are confirmed directly; the flow is proven above.
  await db.query(
    `update auth.users set email_confirmed_at = now() where email in ($1, $2)`,
    [`${TAG}-b@test.local`, `${TAG}-admin@test.local`],
  )

  const { rows: created } = await db.query(
    `select id, role, status from public.profiles where email like $1 order by email`,
    [`${TAG}%`],
  )
  check('sign-up creates exactly 3 profiles', created.length === 3, created)
  check(
    'every new account is role=rep, status=pending (never admin)',
    created.every((p) => p.role === 'rep' && p.status === 'pending'),
    created,
  )

  // A pending rep must read nothing — status is ANDed into every staff policy.
  const pendingRead = await api('/rest/v1/ranks?select=name', { token: verified.data.access_token })
  const pendingLeads = await api('/rest/v1/leads?select=*', { token: verified.data.access_token })
  check('a pending rep sees no leads', pendingLeads.data?.length === 0, pendingLeads.data)

  // Activate out-of-band, exactly as the README documents for the first admin.
  await db.query(`alter table public.profiles disable trigger trg_profiles_guard`)
  await db.query(`update public.profiles set status='active' where email like $1`, [`${TAG}%`])
  await db.query(`update public.profiles set role='admin' where email = $1`, [`${TAG}-admin@test.local`])
  await db.query(
    `update public.profiles set rank_id = (select id from public.ranks where seniority=1)
      where email like $1 and role='rep'`,
    [`${TAG}%`],
  )
  await db.query(`alter table public.profiles enable trigger trg_profiles_guard`)

  const aSession = await signIn(`${TAG}-a@test.local`, 'supersecret123')
  const bSession = await signIn(`${TAG}-b@test.local`, 'supersecret123')
  const admSession = await signIn(`${TAG}-admin@test.local`, 'supersecret123')
  check('sign-in works after activation', Boolean(aSession.data?.access_token), aSession.data)
  check('wrong password is rejected', (await signIn(`${TAG}-a@test.local`, 'wrong')).status === 400)

  const A = aSession.data.access_token
  const B = bSession.data.access_token
  const ADMIN = admSession.data.access_token

  // ---------------------------------------------------- the isolation rule
  console.log(`\n${c.bold('Rep isolation — through HTTP, not just SQL')}`)
  const aProfile = await api('/rest/v1/profiles?select=id,full_name&limit=1', { token: A })
  const aId = aProfile.data?.[0]?.id

  const madeLead = await api('/rest/v1/leads', {
    token: A,
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { name: `${TAG} lead of A`, mobile: '9111111111', remark: 'private to A', owner_id: aId },
  })
  check('rep A can create a lead', madeLead.status === 201, madeLead.data)

  const aSees = await api('/rest/v1/leads?select=name,mobile,remark', { token: A })
  check('rep A sees their own lead', aSees.data?.some((l) => l.name === `${TAG} lead of A`), aSees.data)

  const bSees = await api('/rest/v1/leads?select=name,mobile,remark', { token: B })
  check('rep B sees NONE of rep A\'s leads', bSees.data?.length === 0, bSees.data)

  const bTargeted = await api(`/rest/v1/leads?select=*&owner_id=eq.${aId}`, { token: B })
  check('rep B gets nothing when filtering for rep A explicitly', bTargeted.data?.length === 0, bTargeted.data)

  const adminSees = await api('/rest/v1/leads?select=name', { token: ADMIN })
  check(
    'admin sees the lead',
    adminSees.data?.some((l) => l.name === `${TAG} lead of A`),
    adminSees.data?.length,
  )

  const escalate = await api(`/rest/v1/profiles?id=eq.${aId}`, {
    token: A,
    method: 'PATCH',
    body: { role: 'admin' },
  })
  check('rep A cannot promote itself to admin (403)', escalate.status === 403, escalate.data)

  const mintCommission = await api('/rest/v1/commissions', {
    token: A,
    method: 'POST',
    body: { booking_id: null, rep_id: aId, sale_value: 1, rate_applied: 99, gross_amount: 1, net_amount: 1 },
  })
  check('rep A cannot mint a commission', mintCommission.status >= 400, mintCommission.data)

  // ------------------------------------------- PostgREST dialect coverage
  console.log(`\n${c.bold('PostgREST dialect the app actually uses')}`)

  const embedded = await api(
    '/rest/v1/profiles?select=id,full_name,rank:ranks!profiles_rank_id_fkey(id,name,own_sale_rate)&limit=1',
    { token: A },
  )
  check(
    'embedded belongs-to resource resolves (profiles -> ranks)',
    // A fresh sign-up is on the entry rank, so that is what must come back.
    embedded.data?.[0]?.rank?.name === ENTRY_RANK.name,
    embedded.data,
  )

  const selfJoin = await api(
    '/rest/v1/profiles?select=id,manager:profiles!profiles_manager_id_fkey(id,full_name)&limit=1',
    { token: A },
  )
  check('self-referencing embed with FK hint parses', selfJoin.status === 200, selfJoin.data)

  const counted = await api('/rest/v1/ranks?select=*', { headers: { Prefer: 'count=exact' } })
  check(
    'count=exact returns a Content-Range',
    counted.headers.get('content-range')?.endsWith(`/${RANK_COUNT}`),
    counted.headers.get('content-range'),
  )

  const single = await api(`/rest/v1/ranks?select=name&seniority=eq.${TOP_RANK.seniority}`, {
    headers: { Accept: 'application/vnd.pgrst.object+json' },
  })
  check('single-object accept returns an object', single.data?.name === TOP_RANK.name, single.data)

  const noRows = await api('/rest/v1/ranks?select=name&seniority=eq.999', {
    headers: { Accept: 'application/vnd.pgrst.object+json' },
  })
  check('maybeSingle with no rows gives PGRST116', noRows.data?.code === 'PGRST116', noRows.data)

  const inFilter = await api('/rest/v1/ranks?select=name&seniority=in.(1,2,3)&order=seniority.asc')
  check('in.() filter works', inFilter.data?.length === 3, inFilter.data)

  const notFilter = await api('/rest/v1/ranks?select=name&seniority=not.in.(1,2)')
  check('not.in.() filter works', notFilter.data?.length === RANK_COUNT - 2, notFilter.data?.length)

  // Two branches, each matching exactly one rank in the Symo ladder.
  const orFilter = await api(
    '/rest/v1/ranks?select=name&or=(name.ilike.*diamond*,name.ilike.*crown*)',
  )
  check('or=() with ilike works', orFilter.data?.length === 2, orFilter.data)

  const isNull = await api('/rest/v1/leads?select=name&deleted_at=is.null', { token: A })
  check('is.null filter works', Array.isArray(isNull.data), isNull.data)

  const ordered = await api('/rest/v1/ranks?select=seniority&order=seniority.desc&limit=1')
  check('order desc + limit works', ordered.data?.[0]?.seniority === TOP_RANK.seniority, ordered.data)

  // ----------------------------------------------------------- workflow
  console.log(`\n${c.bold('Business workflow through the API')}`)

  const project = await api('/rest/v1/projects', {
    token: ADMIN,
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { slug: `${TAG}-proj`, name: `${TAG} Project`, location: 'Testville', published: true },
  })
  check('admin can create a project', project.status === 201, project.data)
  const projectId = project.data?.[0]?.id

  const plot = await api('/rest/v1/plots', {
    token: ADMIN,
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { project_id: projectId, number: 'GW-1', price: 1000000, status: 'available' },
  })
  const plotId = plot.data?.[0]?.id
  check('admin can create a plot', plot.status === 201, plot.data)

  const repCreatesProject = await api('/rest/v1/projects', {
    token: A,
    method: 'POST',
    body: { slug: `${TAG}-nope`, name: 'Should fail' },
  })
  check('a rep cannot create a project', repCreatesProject.status >= 400, repCreatesProject.data)

  const booking = await api('/rest/v1/bookings', {
    token: A,
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      plot_id: plotId,
      project_id: projectId,
      rep_id: aId,
      status: 'draft',
      sale_value: 1000000,
      payment_plan: 'full',
    },
  })
  check('rep A can raise a draft booking', booking.status === 201, booking.data)
  const bookingId = booking.data?.[0]?.id

  const selfApprove = await api(`/rest/v1/bookings?id=eq.${bookingId}`, {
    token: A,
    method: 'PATCH',
    body: { status: 'confirmed' },
  })
  check(
    'rep A cannot self-approve to confirmed',
    selfApprove.status === 204 || selfApprove.status >= 400,
    selfApprove.data,
  )
  const stillDraft = await api(`/rest/v1/bookings?select=status&id=eq.${bookingId}`, { token: A })
  check('…and the booking really is still a draft', stillDraft.data?.[0]?.status === 'draft', stillDraft.data)

  await api(`/rest/v1/bookings?id=eq.${bookingId}`, {
    token: A,
    method: 'PATCH',
    body: { terms_accepted_rep: true, status: 'step1_done' },
  })
  const afterStep1 = await api(`/rest/v1/plots?select=status&id=eq.${plotId}`, { token: ADMIN })
  check('step 1 moves the plot to token', afterStep1.data?.[0]?.status === 'token', afterStep1.data)

  await api(`/rest/v1/bookings?id=eq.${bookingId}`, {
    token: ADMIN,
    method: 'PATCH',
    body: { status: 'step2_approved' },
  })
  await api(`/rest/v1/bookings?id=eq.${bookingId}`, {
    token: ADMIN,
    method: 'PATCH',
    body: { status: 'confirmed' },
  })
  const afterConfirm = await api(`/rest/v1/plots?select=status&id=eq.${plotId}`, { token: ADMIN })
  check('admin final approval books the plot', afterConfirm.data?.[0]?.status === 'booked', afterConfirm.data)

  // Sale -> commission
  const sale = await api('/rest/v1/sale_confirmations', {
    token: A,
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { booking_id: bookingId, rep_id: aId, status: 'draft', sale_value: 1000000 },
  })
  const saleId = sale.data?.[0]?.id
  await api(`/rest/v1/sale_confirmations?id=eq.${saleId}`, {
    token: A,
    method: 'PATCH',
    body: { terms_accepted_rep: true, status: 'step1_done' },
  })
  await api(`/rest/v1/sale_confirmations?id=eq.${saleId}`, {
    token: ADMIN,
    method: 'PATCH',
    body: { status: 'step2_approved' },
  })
  await api(`/rest/v1/sale_confirmations?id=eq.${saleId}`, {
    token: ADMIN,
    method: 'PATCH',
    body: { status: 'confirmed' },
  })

  const aCommission = await api('/rest/v1/commissions?select=rep_id,rate_applied,gross_amount,net_amount', {
    token: A,
  })
  check('confirming the sale accrued commission for rep A', aCommission.data?.length === 1, aCommission.data)
  // A new sign-up sits on the entry rank -- Channel Partner, 5% (slide 5) --
  // so a 10,00,000 sale accrues 50,000 gross.
  check('rate is the entry rank rate (5%)', aCommission.data?.[0]?.rate_applied === '5.00', aCommission.data?.[0])
  check('gross is 50000', Number(aCommission.data?.[0]?.gross_amount) === 50000, aCommission.data?.[0])

  const bCommission = await api('/rest/v1/commissions?select=*', { token: B })
  check('rep B sees no commission from rep A\'s sale', bCommission.data?.length === 0, bCommission.data)

  // Documents via the in-process function
  const docs = await api('/functions/v1/generate-documents', {
    token: ADMIN,
    method: 'POST',
    body: { booking_id: bookingId },
  })
  check('generate-documents produced the paperwork', docs.data?.created?.length === 2, docs.data)

  const docRows = await api('/rest/v1/documents?select=type,title', { token: A })
  check('documents are visible to the booking party', docRows.data?.length >= 2, docRows.data)

  const bDocs = await api('/rest/v1/documents?select=type', { token: B })
  check('…but not to an unrelated rep', bDocs.data?.length === 0, bDocs.data)

  // --------------------------------------------------- business settings
  section('Business settings')
  const anonBrand = await api('/rest/v1/site_settings?key=eq.public.brand&select=value')
  check('the public site can read the company details',
    anonBrand.status === 200 && Boolean(anonBrand.data?.[0]?.value?.name), anonBrand.data)

  const anonWrite = await api('/rest/v1/site_settings?key=eq.public.brand', {
    method: 'PATCH', body: { value: { name: 'Hijacked' } },
  })
  const { rows: brandNow } = await db.query(`select value->>'name' n from site_settings where key = 'public.brand'`)
  check('…but cannot change them', brandNow[0]?.n !== 'Hijacked', { status: anonWrite.status, name: brandNow[0]?.n })

  const memberRates = await api('/rest/v1/site_settings?key=eq.sponsor.rates&select=value', { token: A })
  check('a member can read the payout deductions (TDS, admin charge)',
    memberRates.data?.[0]?.value?.tds_pct !== undefined, memberRates.data)

  const memberRatesWrite = await api('/rest/v1/site_settings?key=eq.sponsor.rates', {
    token: A, method: 'PATCH', body: { value: { tds_pct: '0', admin_pct: '0' } },
  })
  const { rows: ratesNow } = await db.query(`select value->>'tds_pct' t from site_settings where key = 'sponsor.rates'`)
  check('…but cannot change them', ratesNow[0]?.t !== '0' || memberRatesWrite.status >= 400, { status: memberRatesWrite.status, tds: ratesNow[0]?.t })

  const memberRankWrite = await api('/rest/v1/ranks?seniority=eq.1', {
    token: A, method: 'PATCH', body: { own_sale_rate: 99 },
  })
  const { rows: entryRate } = await db.query(`select own_sale_rate from ranks where seniority = 1`)
  check('a member cannot change a rank\'s percentages',
    Number(entryRate[0]?.own_sale_rate) !== 99, { status: memberRankWrite.status, rate: entryRate[0]?.own_sale_rate })

  // A throwaway rank far above the real ladder, so nothing real is at risk.
  const TEST_LEVEL = 900 + Math.floor(Math.random() * 90)
  const newRank = await api('/rest/v1/ranks', {
    token: ADMIN, method: 'POST', headers: { Prefer: 'return=representation' },
    body: { name: `${TAG}-rank`, seniority: TEST_LEVEL, own_sale_rate: 1, active: false },
  })
  const testRankId = newRank.data?.[0]?.id
  check('the office can add a rank', newRank.status === 201 && Boolean(testRankId), newRank.data)

  const dupLevel = await api('/rest/v1/ranks', {
    token: ADMIN, method: 'POST', body: { name: `${TAG}-dup`, seniority: TEST_LEVEL, own_sale_rate: 1, active: false },
  })
  check('two ranks cannot share a level', dupLevel.status >= 400, dupLevel.data)

  const held = await api(`/rest/v1/profiles?id=eq.${aId}`, { token: ADMIN, method: 'PATCH', body: { rank_id: testRankId } })
  check('the office can move a member onto the rank', held.status < 300, held.data)
  const delHeld = await api(`/rest/v1/ranks?id=eq.${testRankId}`, { token: ADMIN, method: 'DELETE' })
  const { rowCount: stillRank } = await db.query(`select 1 from ranks where id = $1`, [testRankId])
  check('a rank a member holds cannot be deleted', delHeld.status >= 400 && stillRank === 1, delHeld.data)

  await api(`/rest/v1/profiles?id=eq.${aId}`, { token: ADMIN, method: 'PATCH', body: { rank_id: null } })
  const delFree = await api(`/rest/v1/ranks?id=eq.${testRankId}`, { token: ADMIN, method: 'DELETE' })
  const { rowCount: goneRank } = await db.query(`select 1 from ranks where id = $1`, [testRankId])
  check('an unused rank can be deleted', delFree.status < 300 && goneRank === 0, delFree.data)

  // ------------------------------------------------------ profile photos
  // supabase-js posts a Blob as FormData, so these go up exactly that way:
  // a cacheControl field and the file appended under an empty name.
  section('Profile photos (storage)')
  const bId = bSession.data.user.id
  // Smallest valid JPEG header + filler; the bytes only need to round-trip.
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])])

  const putPhoto = (token, objectPath, bytes, type = 'image/jpeg') => {
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', new Blob([bytes], { type }))
    return fetch(`${BASE}/storage/v1/object/avatars/${objectPath}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'x-upsert': 'false' },
      body: form,
    }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }))
  }

  const own = await putPhoto(A, `${aId}/photo.jpg`, jpeg)
  check('a member can upload a photo into their own folder', own.status === 200, own.data)

  const { rows: stored } = await db.query(
    `select metadata from storage.objects where bucket_id = 'avatars' and name = $1`, [`${aId}/photo.jpg`],
  )
  check('the file is recorded with its own type, not multipart/form-data',
    stored[0]?.metadata?.mimetype === 'image/jpeg' && stored[0]?.metadata?.size === jpeg.length, stored[0])

  const signed = await api(`/storage/v1/object/sign/avatars/${aId}/photo.jpg`, {
    token: A, method: 'POST', body: { expiresIn: 60 },
  })
  const fetched = signed.data?.signedURL
    ? Buffer.from(await (await fetch(`${BASE}/storage/v1${signed.data.signedURL}`)).arrayBuffer())
    : Buffer.alloc(0)
  check('the bytes read back are exactly the file uploaded (no multipart envelope)',
    fetched.equals(jpeg), { got: fetched.length, want: jpeg.length, head: fetched.subarray(0, 4).toString('hex') })

  const intoB = await putPhoto(A, `${bId}/photo.jpg`, jpeg)
  check('a member cannot upload into another member\'s folder', intoB.status >= 400, intoB)

  const bSigns = await api(`/storage/v1/object/sign/avatars/${aId}/photo.jpg`, {
    token: B, method: 'POST', body: { expiresIn: 60 },
  })
  check('another member cannot get a link to someone\'s photo', bSigns.status === 404, bSigns.data)

  const admSigns = await api(`/storage/v1/object/sign/avatars/${aId}/photo.jpg`, {
    token: ADMIN, method: 'POST', body: { expiresIn: 60 },
  })
  check('the office can see a member\'s photo', admSigns.status === 200, admSigns.data)

  const big = await putPhoto(A, `${aId}/big.jpg`, Buffer.alloc(2 * 1024 * 1024 + 10, 1))
  check('a photo over the 2 MB bucket limit is refused (413)', big.status === 413, big)

  const html = await putPhoto(A, `${aId}/page.jpg`, Buffer.from('<script>alert(1)</script>'), 'text/html')
  check('an HTML file posing as a photo is refused (415)', html.status === 415, html)

  const pdf = await putPhoto(A, `${aId}/doc.jpg`, Buffer.from('%PDF-1.4'), 'application/pdf')
  check('a type the bucket does not allow is refused (415)', pdf.status === 415, pdf)

  const pointB = await api(`/rest/v1/profiles?id=eq.${aId}`, {
    token: A, method: 'PATCH', body: { avatar_path: `${bId}/photo.jpg` },
  })
  check('avatar_path cannot point at another member\'s file', pointB.status >= 400, pointB.data)

  const pointOwn = await api(`/rest/v1/profiles?id=eq.${aId}`, {
    token: A, method: 'PATCH', body: { avatar_path: `${aId}/photo.jpg` },
  })
  check('avatar_path can point at the member\'s own upload', pointOwn.status < 300, pointOwn.data)

  const bRemoves = await api('/storage/v1/object/avatars', {
    token: B, method: 'DELETE', body: { prefixes: [`${aId}/photo.jpg`] },
  })
  const { rowCount: stillThere } = await db.query(
    `select 1 from storage.objects where bucket_id = 'avatars' and name = $1`, [`${aId}/photo.jpg`],
  )
  check('another member cannot delete someone\'s photo',
    stillThere === 1 && Array.isArray(bRemoves.data) && bRemoves.data.length === 0, bRemoves.data)

  const aRemoves = await api('/storage/v1/object/avatars', {
    token: A, method: 'DELETE', body: { prefixes: [`${aId}/photo.jpg`] },
  })
  const { rowCount: gone } = await db.query(
    `select 1 from storage.objects where bucket_id = 'avatars' and name = $1`, [`${aId}/photo.jpg`],
  )
  check('a member can delete their own photo', aRemoves.status === 200 && gone === 0, aRemoves.data)

  // ------------------------------------------------------------- cleanup
  console.log(`\n${c.bold('Cleanup')}`)
  await db.query(`delete from storage.objects where bucket_id = 'avatars' and name like $1`, [`${aId}/%`])
  await db.query(`delete from public.sale_confirmations where booking_id = $1`, [bookingId])
  await db.query(`delete from public.bookings where id = $1`, [bookingId])
  await db.query(`delete from public.plots where project_id = $1`, [projectId])
  await db.query(`delete from public.projects where id = $1`, [projectId])
  await db.query(`delete from public.leads where name like $1`, [`${TAG}%`])
  await db.query(`delete from auth.users where email like $1`, [`${TAG}%`])
  await db.query(`delete from ranks where name like $1`, [`${TAG}%`])
  console.log(`  ${c.dim('test data removed')}`)

  await db.end()

  console.log(
    `\n${failed ? c.red(`${failed} failed`) : c.green('All checks passed')}  ${c.dim(`(${passed} passed)`)}\n`,
  )
  if (process.env.JUNIT) {
    const r = j.write(process.env.JUNIT)
    console.log(`  ${c.dim(`JUnit XML -> ${r.file} (${r.tests} tests, ${r.failures} failures)`)}`)
  }

  process.exit(failed ? 1 : 0)
}

main().catch(async (err) => {
  console.error(c.red('\nTest run crashed:'), err.message)
  console.error(err.stack?.split('\n').slice(1, 4).join('\n'))
  try {
    await db.query(`delete from auth.users where email like $1`, [`${TAG}%`])
    await db.query(`delete from ranks where name like $1`, [`${TAG}%`])
    await db.end()
  } catch {}
  process.exit(1)
})
