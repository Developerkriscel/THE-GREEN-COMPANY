/**
 * send-email
 *
 * Single transactional-email entry point. Templates live here rather than in the
 * client so wording is consistent and cannot be altered by whoever triggers the
 * send. Delivery goes through Resend; swapping providers means changing only
 * `deliver()`.
 *
 * Invoke:  POST /functions/v1/send-email
 *          { "to": "...", "template": "booking_confirmed", "data": { ... } }
 */

import { json, preflight } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Symocity <noreply@symocity.example>'
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5173'

type TemplateId =
  | 'account_pending'
  | 'account_activated'
  | 'booking_submitted'
  | 'booking_reviewed'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'sale_confirmed'
  | 'emi_slip_uploaded'
  | 'payment_verified'
  | 'kyc_status'
  | 'new_message'

interface Template {
  subject: string
  heading: string
  body: string[]
  cta?: { label: string; path: string }
}

function render(template: TemplateId, d: Record<string, string | number>): Template {
  switch (template) {
    case 'account_pending':
      return {
        subject: 'Your Symocity registration was received',
        heading: `Thanks for registering, ${d.name ?? 'there'}`,
        body: [
          'Your sales-partner account has been created and is awaiting activation by an administrator.',
          'You will get another email the moment it is approved. There is no joining fee at any stage.',
        ],
      }
    case 'account_activated':
      return {
        subject: 'Your Symocity account is active',
        heading: `You are all set, ${d.name ?? 'there'}`,
        body: [
          `Your account has been activated${d.user_code ? ` with member ID ${d.user_code}` : ''}.`,
          'Sign in to start adding leads and raising bookings.',
        ],
        cta: { label: 'Sign in', path: '/login' },
      }
    case 'booking_submitted':
      return {
        subject: `Booking ${d.reference} submitted for review`,
        heading: 'Booking submitted',
        body: [
          `Booking ${d.reference} has been submitted and is now with a reviewer (step 2 of 3).`,
          'You will be notified at each approval step.',
        ],
        cta: { label: 'View booking', path: '/app/bookings' },
      }
    case 'booking_reviewed':
      return {
        subject: `Booking ${d.reference} passed review`,
        heading: 'Review complete',
        body: [
          `Booking ${d.reference} has passed step 2 and is awaiting final administrator approval.`,
        ],
        cta: { label: 'View booking', path: '/app/bookings' },
      }
    case 'booking_confirmed':
      return {
        subject: `Your booking ${d.reference} is confirmed`,
        heading: `Congratulations, ${d.name ?? 'there'}`,
        body: [
          `Booking ${d.reference} has received final approval and is now confirmed.`,
          'Your welcome letter and booking form are ready to download from your portal.',
        ],
        cta: { label: 'Open my portal', path: '/portal/documents' },
      }
    case 'booking_rejected':
      return {
        subject: `Booking ${d.reference} needs changes`,
        heading: 'Returned for changes',
        body: [
          `Booking ${d.reference} was returned at step ${d.step ?? '-'}.`,
          `Remark: ${d.remark ?? 'No remark provided.'}`,
        ],
        cta: { label: 'Open booking', path: '/app/bookings' },
      }
    case 'sale_confirmed':
      return {
        subject: `Sale confirmed — ${d.reference}`,
        heading: 'Sale confirmed',
        body: [
          `The sale on ${d.reference} has been confirmed by an administrator.`,
          `Your commission of ${d.amount ?? '-'} has been accrued and will appear on your statement.`,
        ],
        cta: { label: 'View my commission', path: '/app/commission' },
      }
    case 'emi_slip_uploaded':
      return {
        subject: `Payment slip uploaded — ${d.reference}`,
        heading: 'Slip awaiting verification',
        body: [
          `A payment slip for installment #${d.seq} on ${d.reference} has been uploaded and needs verification.`,
        ],
        cta: { label: 'Verify now', path: '/admin/emis' },
      }
    case 'payment_verified':
      return {
        subject: `Payment received — ${d.reference}`,
        heading: `Thank you, ${d.name ?? 'there'}`,
        body: [
          `We have verified your payment of ${d.amount} for installment #${d.seq} on booking ${d.reference}.`,
          'Your receipt is available in your portal.',
        ],
        cta: { label: 'Download receipt', path: '/portal/documents' },
      }
    case 'kyc_status':
      return {
        subject: `Your KYC is ${d.status}`,
        heading: `KYC ${d.status}`,
        body: [
          d.status === 'verified'
            ? 'Your KYC has been verified. Nothing further is needed.'
            : `Your KYC was not accepted. Reason: ${d.reason ?? 'Not provided.'}`,
        ],
        cta: { label: 'Open my KYC', path: '/app/kyc' },
      }
    case 'new_message':
      return {
        subject: 'You have a new message',
        heading: 'New message',
        body: [String(d.preview ?? 'You have received a new message.')],
        cta: { label: 'Open inbox', path: String(d.path ?? '/app/messages') },
      }
  }
}

function html(t: Template) {
  const cta = t.cta
    ? `<p style="margin:28px 0 0"><a href="${APP_BASE_URL}${t.cta.path}" style="background:#15803d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">${t.cta.label}</a></p>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="font-size:20px;font-weight:700;color:#15803d;margin:0 0 24px">Symocity</p>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 14px">${t.heading}</h1>
      ${t.body.map((p) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px;color:#334155">${p}</p>`).join('')}
      ${cta}
    </div>
    <p style="font-size:11px;color:#94a3b8;margin:20px 0 0">
      You are receiving this because you have an account with Symocity.
    </p>
  </div>
</body></html>`
}

async function deliver(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    // In local development there is usually no mail provider configured.
    // Log and succeed rather than failing the workflow that triggered the send.
    console.log(`[send-email] (no RESEND_API_KEY) would send "${subject}" to ${to}`)
    return { skipped: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html: body }),
  })

  if (!res.ok) throw new Error(`Email provider returned ${res.status}: ${await res.text()}`)
  return await res.json()
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { to, template, data } = await req.json()
    if (!to || !template) return json({ error: 'to and template are required' }, 400)

    const rendered = render(template as TemplateId, data ?? {})
    if (!rendered) return json({ error: `Unknown template: ${template}` }, 400)

    const result = await deliver(to, rendered.subject, html(rendered))
    return json({ ok: true, result })
  } catch (err) {
    console.error('[send-email]', err)
    return json({ error: String(err) }, 500)
  }
})
