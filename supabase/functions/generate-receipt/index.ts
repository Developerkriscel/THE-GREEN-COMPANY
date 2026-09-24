/**
 * generate-receipt
 *
 * Issues the payment receipt for a verified EMI. Runs with the service-role key
 * and refuses to produce a receipt for anything that is not already `paid` —
 * a receipt is evidence of a verified payment, so the check is the whole point.
 *
 * Invoke:  POST /functions/v1/generate-receipt  { "emi_id": "<uuid>" }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'
import { buildPdf, day, money } from '../_shared/pdf.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { emi_id } = await req.json()
    if (!emi_id) return json({ error: 'emi_id is required' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: emi, error } = await admin
      .from('emis')
      .select(`
        *,
        booking:bookings (
          id, reference, sale_value, customer_id,
          project:projects ( name ),
          plot:plots ( number ),
          customer:profiles!bookings_customer_id_fkey ( full_name, user_code, email )
        )
      `)
      .eq('id', emi_id)
      .maybeSingle()

    if (error) return json({ error: error.message }, 500)
    if (!emi) return json({ error: 'Installment not found' }, 404)
    if (emi.status !== 'paid') {
      return json({ error: 'A receipt can only be issued for a verified payment' }, 409)
    }

    const { data: payment } = await admin
      .from('payments')
      .select('receipt_no, paid_on, mode, reference')
      .eq('emi_id', emi.id)
      .maybeSingle()

    const booking = emi.booking as Record<string, any>

    const pdf = buildPdf([
      { text: 'Royal Green Developers', size: 18, bold: true },
      { text: 'Payment Receipt', size: 13, bold: true, gap: 12 },
      { text: `Receipt number: ${payment?.receipt_no ?? '-'}`, size: 10 },
      { text: `Date: ${day(payment?.paid_on ?? emi.paid_at)}`, size: 10, gap: 14 },
      { text: 'Received from', size: 12, bold: true, gap: 4 },
      { text: `${booking?.customer?.full_name ?? '-'} (${booking?.customer?.user_code ?? '-'})`, size: 11, gap: 10 },
      { text: 'Against', size: 12, bold: true, gap: 4 },
      { text: `Booking: ${booking?.reference ?? '-'}`, size: 11 },
      { text: `Project: ${booking?.project?.name ?? '-'} · Plot ${booking?.plot?.number ?? '-'}`, size: 11 },
      { text: `Installment: #${emi.seq}, due ${day(emi.due_date)}`, size: 11, gap: 10 },
      { text: 'Amount received', size: 12, bold: true, gap: 4 },
      { text: money(Number(emi.amount)), size: 16, bold: true, gap: 10 },
      { text: `Mode: ${payment?.mode ?? 'EMI'}`, size: 10 },
      { text: `Reference: ${payment?.reference ?? emi.reference ?? '-'}`, size: 10 },
      { text: `Verified on: ${day(emi.verified_at)}`, size: 10, gap: 18 },
      {
        text: 'This is a computer-generated receipt and is valid without a signature.',
        size: 9,
      },
    ])

    const path = `${booking?.id}/receipt-${emi.seq}-${Date.now()}.pdf`
    const upload = await admin.storage.from('documents').upload(path, pdf, {
      contentType: 'application/pdf',
    })
    if (upload.error) return json({ error: upload.error.message }, 500)

    await admin.from('documents').insert({
      booking_id: booking?.id,
      owner_id: booking?.customer_id,
      type: 'receipt',
      title: `Receipt ${payment?.receipt_no ?? `#${emi.seq}`} — ${booking?.reference}`,
      storage_path: path,
      size_bytes: pdf.byteLength,
    })

    if (booking?.customer?.email) {
      fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          to: booking.customer.email,
          template: 'payment_verified',
          data: {
            name: booking.customer.full_name,
            amount: money(Number(emi.amount)),
            reference: booking.reference,
            seq: emi.seq,
          },
        }),
      }).catch((err) => console.error('[generate-receipt] email dispatch failed', err))
    }

    return json({ ok: true, receipt_no: payment?.receipt_no, path })
  } catch (err) {
    console.error('[generate-receipt]', err)
    return json({ error: String(err) }, 500)
  }
})
