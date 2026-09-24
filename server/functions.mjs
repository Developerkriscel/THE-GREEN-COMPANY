import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.mjs'
import { withOwner } from './db.mjs'
import { hashPassword } from './jwt.mjs'

/*
 * The edge functions, running in-process.
 *
 * The Deno originals under supabase/functions/ stay the deployment target for a
 * real Supabase project; these are the same logic for the Neon setup, where
 * there is no edge runtime. They run with owner privileges, which is the
 * equivalent of the service-role key the Deno versions use — and they enforce
 * the same precondition the originals do: paperwork is only ever generated for
 * something already approved.
 */

/* ------------------------------------------------------------ PDF writer */

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

function wrap(text, size, maxWidth) {
  const maxChars = Math.max(20, Math.floor(maxWidth / (size * 0.5)))
  const out = []
  let line = ''
  for (const word of String(text).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars) {
      if (line) out.push(line.trim())
      line = word
    } else line = (line + ' ' + word).trim()
  }
  if (line) out.push(line.trim())
  return out.length ? out : ['']
}

function buildPdf(lines) {
  const chunks = []
  let y = PAGE_H - MARGIN

  for (const line of lines) {
    const size = line.size ?? 11
    const font = line.bold ? '/F2' : '/F1'
    for (const piece of wrap(line.text, size, PAGE_W - MARGIN * 2)) {
      if (y < MARGIN + 40) break
      chunks.push(`BT ${font} ${size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${esc(piece)}) Tj ET`)
      y -= size * 1.55
    }
    y -= line.gap ?? 0
  }

  const content = chunks.join('\n')
  const enc = new TextEncoder()
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((obj, i) => {
    offsets.push(enc.encode(pdf).length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = enc.encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`

  return Buffer.from(pdf, 'binary')
}

const money = (n) => 'INR ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n ?? 0))
const day = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

/** Bytes to disk + a row in storage.objects, so signed URLs can find it. */
async function store(client, bucket, objectPath, bytes, ownerId) {
  const target = path.resolve(config.storageDir, bucket, objectPath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
  await client.query(
    `insert into storage.objects (bucket_id, name, owner, metadata)
     values ($1, $2, $3, $4)
     on conflict do nothing`,
    [bucket, objectPath, ownerId, { mimetype: 'application/pdf', size: bytes.length }],
  )
}

/* ------------------------------------------------------ generate-documents */

async function generateDocuments({ booking_id }) {
  if (!booking_id) throw Object.assign(new Error('booking_id is required'), { status: 400 })

  return withOwner(async (client) => {
    const { rows } = await client.query(
      `select b.*,
              pj.name as project_name, pj.location as project_location,
              pl.number as plot_number, pl.size as plot_size, pl.size_unit, pl.facing, pl.dimensions,
              cu.full_name as customer_name, cu.user_code as customer_code,
              cu.phone as customer_phone, cu.address as customer_address,
              rp.full_name as rep_name, rp.phone as rep_phone
         from public.bookings b
         left join public.projects pj on pj.id = b.project_id
         left join public.plots    pl on pl.id = b.plot_id
         left join public.profiles cu on cu.id = b.customer_id
         left join public.profiles rp on rp.id = b.rep_id
        where b.id = $1`,
      [booking_id],
    )
    const b = rows[0]
    if (!b) throw Object.assign(new Error('Booking not found'), { status: 404 })
    if (b.status !== 'confirmed') {
      throw Object.assign(new Error('Documents are generated only for confirmed bookings'), {
        status: 409,
      })
    }

    const company = 'Royal Green Developers'
    const stamp = Date.now()
    const created = []

    const welcome = buildPdf([
      { text: company, size: 18, bold: true },
      { text: 'Welcome Letter', size: 13, bold: true, gap: 12 },
      { text: `Date: ${day(new Date())}`, size: 10 },
      { text: `Booking reference: ${b.reference}`, size: 10, gap: 14 },
      { text: `Dear ${b.customer_name ?? 'Customer'},`, size: 11, gap: 8 },
      {
        text: `We are delighted to confirm your purchase at ${b.project_name ?? 'our project'}${b.project_location ? `, ${b.project_location}` : ''}. Your booking has completed our full approval process and is now confirmed.`,
        size: 11,
        gap: 10,
      },
      { text: 'Your plot', size: 12, bold: true, gap: 4 },
      { text: `Plot number: ${b.plot_number ?? '-'}`, size: 11 },
      { text: `Size: ${b.plot_size ?? '-'} ${b.size_unit ?? ''}${b.dimensions ? ` (${b.dimensions})` : ''}`, size: 11 },
      { text: `Facing: ${b.facing ?? '-'}`, size: 11, gap: 10 },
      { text: 'Commercials', size: 12, bold: true, gap: 4 },
      { text: `Total consideration: ${money(b.sale_value)}`, size: 11 },
      { text: `Token received: ${money(b.token_amount)}`, size: 11 },
      {
        text:
          b.payment_plan === 'emi'
            ? `Payment plan: ${b.emi_count} installments of ${money(b.emi_amount)}, starting ${day(b.emi_start)}`
            : 'Payment plan: Full payment',
        size: 11,
        gap: 10,
      },
      { text: 'Your customer portal', size: 12, bold: true, gap: 4 },
      { text: `User ID: ${b.customer_code ?? '-'}`, size: 11 },
      {
        text: 'Sign in with your User ID to track payments, upload payment slips and download your receipts and registry copy.',
        size: 11,
        gap: 12,
      },
      { text: `Your sales partner: ${b.rep_name ?? '-'} (${b.rep_phone ?? '-'})`, size: 10, gap: 16 },
      { text: 'With warm regards,', size: 11 },
      { text: company, size: 11, bold: true },
    ])

    const welcomePath = `${b.id}/welcome-letter-${stamp}.pdf`
    await store(client, 'documents', welcomePath, welcome, b.customer_id)
    await client.query(
      `insert into public.documents (booking_id, owner_id, type, title, storage_path, size_bytes)
       values ($1, $2, 'welcome_letter', $3, $4, $5)`,
      [b.id, b.customer_id, `Welcome letter — ${b.reference}`, welcomePath, welcome.length],
    )
    created.push('welcome_letter')

    const form = buildPdf([
      { text: company, size: 18, bold: true },
      { text: 'Booking Form', size: 13, bold: true, gap: 12 },
      { text: `Reference: ${b.reference}`, size: 10 },
      { text: `Confirmed on: ${day(b.step3_at)}`, size: 10, gap: 14 },
      { text: 'Purchaser', size: 12, bold: true, gap: 4 },
      { text: `Name: ${b.customer_name ?? '-'}`, size: 11 },
      { text: `User ID: ${b.customer_code ?? '-'}`, size: 11 },
      { text: `Phone: ${b.customer_phone ?? '-'}`, size: 11 },
      { text: `Address: ${b.customer_address ?? '-'}`, size: 11, gap: 10 },
      { text: 'Property', size: 12, bold: true, gap: 4 },
      { text: `Project: ${b.project_name ?? '-'}`, size: 11 },
      { text: `Location: ${b.project_location ?? '-'}`, size: 11 },
      { text: `Plot: ${b.plot_number ?? '-'}`, size: 11 },
      { text: `Size: ${b.plot_size ?? '-'} ${b.size_unit ?? ''}`, size: 11, gap: 10 },
      { text: 'Consideration', size: 12, bold: true, gap: 4 },
      { text: `Total: ${money(b.sale_value)}`, size: 11 },
      { text: `Token: ${money(b.token_amount)}`, size: 11 },
      { text: `Balance: ${money(Number(b.sale_value) - Number(b.token_amount))}`, size: 11, gap: 10 },
      { text: 'Approval record', size: 12, bold: true, gap: 4 },
      { text: `Step 1 — raised by sales partner: ${day(b.step1_at)}`, size: 10 },
      { text: `Step 2 — reviewed: ${day(b.step2_at)}`, size: 10 },
      { text: `Step 3 — final approval: ${day(b.step3_at)}`, size: 10, gap: 10 },
      {
        text: `Terms & Conditions accepted by purchaser: ${b.terms_accepted_customer ? 'Yes' : 'No'} · by sales partner: ${b.terms_accepted_rep ? 'Yes' : 'No'}`,
        size: 10,
        gap: 18,
      },
      { text: '_______________________            _______________________', size: 11 },
      { text: `Purchaser                                    For ${company}`, size: 9 },
    ])

    const formPath = `${b.id}/booking-form-${stamp}.pdf`
    await store(client, 'documents', formPath, form, b.customer_id)
    await client.query(
      `insert into public.documents (booking_id, owner_id, type, title, storage_path, size_bytes)
       values ($1, $2, 'booking_form', $3, $4, $5)`,
      [b.id, b.customer_id, `Booking form — ${b.reference}`, formPath, form.length],
    )
    created.push('booking_form')

    if (b.customer_id) {
      await client.query(
        `insert into public.notifications (user_id, type, title, body, link)
         values ($1, 'document', 'Your documents are ready',
                 'Your welcome letter and booking form are available to download.', '/portal/documents')`,
        [b.customer_id],
      )
    }

    return { ok: true, created, booking: b.reference }
  })
}

/* -------------------------------------------------------- generate-receipt */

async function generateReceipt({ emi_id }) {
  if (!emi_id) throw Object.assign(new Error('emi_id is required'), { status: 400 })

  return withOwner(async (client) => {
    const { rows } = await client.query(
      `select e.*, b.id as b_id, b.reference, b.customer_id,
              pj.name as project_name, pl.number as plot_number,
              cu.full_name as customer_name, cu.user_code as customer_code,
              p.receipt_no, p.paid_on, p.mode, p.reference as payment_reference
         from public.emis e
         join public.bookings b on b.id = e.booking_id
         left join public.projects pj on pj.id = b.project_id
         left join public.plots    pl on pl.id = b.plot_id
         left join public.profiles cu on cu.id = b.customer_id
         left join public.payments p  on p.emi_id = e.id
        where e.id = $1`,
      [emi_id],
    )
    const e = rows[0]
    if (!e) throw Object.assign(new Error('Installment not found'), { status: 404 })
    if (e.status !== 'paid') {
      throw Object.assign(new Error('A receipt can only be issued for a verified payment'), {
        status: 409,
      })
    }

    const pdf = buildPdf([
      { text: 'Royal Green Developers', size: 18, bold: true },
      { text: 'Payment Receipt', size: 13, bold: true, gap: 12 },
      { text: `Receipt number: ${e.receipt_no ?? '-'}`, size: 10 },
      { text: `Date: ${day(e.paid_on ?? e.paid_at)}`, size: 10, gap: 14 },
      { text: 'Received from', size: 12, bold: true, gap: 4 },
      { text: `${e.customer_name ?? '-'} (${e.customer_code ?? '-'})`, size: 11, gap: 10 },
      { text: 'Against', size: 12, bold: true, gap: 4 },
      { text: `Booking: ${e.reference ?? '-'}`, size: 11 },
      { text: `Project: ${e.project_name ?? '-'} · Plot ${e.plot_number ?? '-'}`, size: 11 },
      { text: `Installment: #${e.seq}, due ${day(e.due_date)}`, size: 11, gap: 10 },
      { text: 'Amount received', size: 12, bold: true, gap: 4 },
      { text: money(e.amount), size: 16, bold: true, gap: 10 },
      { text: `Mode: ${e.mode ?? 'EMI'}`, size: 10 },
      { text: `Reference: ${e.payment_reference ?? e.reference ?? '-'}`, size: 10 },
      { text: `Verified on: ${day(e.verified_at)}`, size: 10, gap: 18 },
      { text: 'This is a computer-generated receipt and is valid without a signature.', size: 9 },
    ])

    const objectPath = `${e.b_id}/receipt-${e.seq}-${Date.now()}.pdf`
    await store(client, 'documents', objectPath, pdf, e.customer_id)
    await client.query(
      `insert into public.documents (booking_id, owner_id, type, title, storage_path, size_bytes)
       values ($1, $2, 'receipt', $3, $4, $5)`,
      [e.b_id, e.customer_id, `Receipt ${e.receipt_no ?? `#${e.seq}`} — ${e.reference}`, objectPath, pdf.length],
    )

    return { ok: true, receipt_no: e.receipt_no, path: objectPath }
  })
}

/* --------------------------------------------------- flag-overdue-emis ---*/

async function flagOverdueEmis() {
  return withOwner(async (client) => {
    const { rows } = await client.query(`select public.flag_overdue_emis() as flagged`)
    return { ok: true, flagged: rows[0].flagged }
  })
}

/* ---------------------------------------------------------- send-email --- */

async function sendEmail(body) {
  // No mail provider in this setup. Log it rather than fail the workflow that
  // triggered the send — exactly what the Deno version does without RESEND_API_KEY.
  console.log(`[send-email] would send "${body.template}" to ${body.to}`, body.data ?? {})
  return { ok: true, skipped: true }
}

/* --------------------------------------------------------- create-member */
/*
 * Admin-only. Creates a brand-new network member: an auth.users row (so they
 * can log in) plus the profile the trigger derives from it, then wires the
 * sponsor / placement / rank the admin chose. Runs with owner privileges but
 * asserts the caller is an admin first, and impersonates that admin in the
 * transaction so the profiles_guard accepts the privileged column changes.
 */
async function createMember(body, ctx) {
  const callerId = ctx?.claims?.sub
  if (!callerId) throw Object.assign(new Error('Not authenticated'), { status: 401 })

  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.full_name ?? '').trim()
  if (!email || !password || !fullName) {
    throw Object.assign(new Error('Name, email and password are required'), { status: 400 })
  }
  if (password.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 })
  }

  return withOwner(async (client) => {
    const { rows: adminRows } = await client.query(
      `select role from public.profiles where id = $1`,
      [callerId],
    )
    if (adminRows[0]?.role !== 'admin') {
      throw Object.assign(new Error('Only an administrator can add members'), { status: 403 })
    }

    const { rows: dupe } = await client.query(`select 1 from auth.users where email = $1`, [email])
    if (dupe.length) throw Object.assign(new Error('That email is already registered'), { status: 409 })

    // Impersonate the admin so profiles_guard permits the privileged update.
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: callerId, role: 'authenticated' }),
    ])

    const { rows: userRows } = await client.query(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, now(), $3) returning id`,
      [email, hashPassword(password), JSON.stringify({ full_name: fullName, phone: body.phone ?? null })],
    )
    const id = userRows[0].id

    const sponsorId = body.referrer_id || null
    const placementId = body.placement_parent_id || sponsorId
    await client.query(
      `update public.profiles
          set full_name = $2, phone = $3, status = 'active',
              rank_id = coalesce($4, rank_id),
              referrer_id = $5, placement_parent_id = $6,
              city = $7, state = $8, pincode = $9
        where id = $1`,
      [id, fullName, body.phone ?? null, body.rank_id || null, sponsorId, placementId,
       body.city ?? null, body.state ?? null, body.pincode ?? null],
    )

    // Refresh denormalised counts across the network (cheap at this scale).
    await client.query(`
      update public.profiles p set direct_count = coalesce(d.n, 0)
        from (select referrer_id, count(*) n from public.profiles where referrer_id is not null group by referrer_id) d
       where d.referrer_id = p.id`)
    await client.query(`
      update public.profiles p set direct_count = 0
       where not exists (select 1 from public.profiles c where c.referrer_id = p.id)`)
    await client.query(`
      with recursive tree as (
        select id as root, id as node from public.profiles
        union all
        select t.root, c.id from tree t join public.profiles c on c.referrer_id = t.node
      )
      update public.profiles p set team_count = coalesce(t.n, 0)
        from (select root, count(*) - 1 n from tree group by root) t
       where t.root = p.id`)

    const { rows: created } = await client.query(
      `select member_code from public.profiles where id = $1`,
      [id],
    )
    return { ok: true, id, member_code: created[0]?.member_code ?? null }
  })
}

/* ---------------------------------------------------- set-member-password */
/* Admin-only: reset another member's login password. */
async function setMemberPassword(body, ctx) {
  const callerId = ctx?.claims?.sub
  if (!callerId) throw Object.assign(new Error('Not authenticated'), { status: 401 })
  const targetId = String(body.member_id ?? '')
  const password = String(body.password ?? '')
  if (!targetId || password.length < 6) {
    throw Object.assign(new Error('A member and a 6+ character password are required'), { status: 400 })
  }
  return withOwner(async (client) => {
    const { rows } = await client.query(`select role from public.profiles where id = $1`, [callerId])
    if (rows[0]?.role !== 'admin') {
      throw Object.assign(new Error('Only an administrator can reset passwords'), { status: 403 })
    }
    const { rowCount } = await client.query(
      `update auth.users set encrypted_password = $1, updated_at = now() where id = $2`,
      [hashPassword(password), targetId],
    )
    if (!rowCount) throw Object.assign(new Error('Member not found'), { status: 404 })
    return { ok: true }
  })
}

const FUNCTIONS = {
  'generate-documents': generateDocuments,
  'generate-receipt': generateReceipt,
  'flag-overdue-emis': flagOverdueEmis,
  'send-email': sendEmail,
  'create-member': createMember,
  'set-member-password': setMemberPassword,
}

export async function handleFunction(name, body, ctx) {
  const fn = FUNCTIONS[name]
  if (!fn) throw Object.assign(new Error(`No function named "${name}"`), { status: 404 })
  return fn(body ?? {}, ctx ?? {})
}
