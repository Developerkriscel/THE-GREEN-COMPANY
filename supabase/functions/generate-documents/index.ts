/**
 * generate-documents
 *
 * Creates the welcome letter and booking form for a confirmed booking, stores
 * them in the private `documents` bucket and registers them in `documents`.
 *
 * This is a privileged operation and runs with the service-role key: the
 * customer must never be able to author their own welcome letter, and the rep
 * must never be able to alter the terms after approval. The function refuses to
 * run unless the booking is actually `confirmed`.
 *
 * Invoke:  POST /functions/v1/generate-documents  { "booking_id": "<uuid>" }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, preflight } from '../_shared/cors.ts'
import { buildPdf, day, money } from '../_shared/pdf.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const { booking_id } = await req.json()
    if (!booking_id) return json({ error: 'booking_id is required' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: booking, error } = await admin
      .from('bookings')
      .select(`
        *,
        project:projects ( name, location ),
        plot:plots ( number, size, size_unit, dimensions, facing ),
        customer:profiles!bookings_customer_id_fkey ( full_name, user_code, phone, email, address ),
        rep:profiles!bookings_rep_id_fkey ( full_name, user_code, phone )
      `)
      .eq('id', booking_id)
      .maybeSingle()

    if (error) return json({ error: error.message }, 500)
    if (!booking) return json({ error: 'Booking not found' }, 404)

    // Paperwork is a post-approval artefact. Refuse anything else.
    if (booking.status !== 'confirmed') {
      return json({ error: 'Documents are generated only for confirmed bookings' }, 409)
    }

    const company = 'Royal Green Developers'
    const created: string[] = []

    /* ------------------------------------------------------ welcome letter */
    const welcome = buildPdf([
      { text: company, size: 18, bold: true },
      { text: 'Welcome Letter', size: 13, bold: true, gap: 12 },
      { text: `Date: ${day(new Date().toISOString())}`, size: 10 },
      { text: `Booking reference: ${booking.reference}`, size: 10, gap: 14 },
      { text: `Dear ${booking.customer?.full_name ?? 'Customer'},`, size: 11, gap: 8 },
      {
        text:
          `We are delighted to confirm your purchase at ${booking.project?.name ?? 'our project'}` +
          `${booking.project?.location ? `, ${booking.project.location}` : ''}. ` +
          'Your booking has completed our full approval process and is now confirmed.',
        size: 11,
        gap: 10,
      },
      { text: 'Your plot', size: 12, bold: true, gap: 4 },
      { text: `Plot number: ${booking.plot?.number ?? '-'}`, size: 11 },
      {
        text: `Size: ${booking.plot?.size ?? '-'} ${booking.plot?.size_unit ?? ''}${booking.plot?.dimensions ? ` (${booking.plot.dimensions})` : ''}`,
        size: 11,
      },
      { text: `Facing: ${booking.plot?.facing ?? '-'}`, size: 11, gap: 10 },
      { text: 'Commercials', size: 12, bold: true, gap: 4 },
      { text: `Total consideration: ${money(Number(booking.sale_value))}`, size: 11 },
      { text: `Token received: ${money(Number(booking.token_amount))}`, size: 11 },
      {
        text:
          booking.payment_plan === 'emi'
            ? `Payment plan: ${booking.emi_count} installments of ${money(Number(booking.emi_amount))}, starting ${day(booking.emi_start)}`
            : 'Payment plan: Full payment',
        size: 11,
        gap: 10,
      },
      { text: 'Your customer portal', size: 12, bold: true, gap: 4 },
      { text: `User ID: ${booking.customer?.user_code ?? '-'}`, size: 11 },
      {
        text:
          'Sign in to the customer portal with your User ID to track payments, upload payment slips and download your receipts and registry copy.',
        size: 11,
        gap: 12,
      },
      { text: `Your sales partner: ${booking.rep?.full_name ?? '-'} (${booking.rep?.phone ?? '-'})`, size: 10, gap: 16 },
      { text: 'With warm regards,', size: 11 },
      { text: company, size: 11, bold: true },
    ])

    const welcomePath = `${booking.id}/welcome-letter-${Date.now()}.pdf`
    const up1 = await admin.storage.from('documents').upload(welcomePath, welcome, {
      contentType: 'application/pdf',
    })
    if (up1.error) return json({ error: up1.error.message }, 500)

    await admin.from('documents').insert({
      booking_id: booking.id,
      owner_id: booking.customer_id,
      type: 'welcome_letter',
      title: `Welcome letter — ${booking.reference}`,
      storage_path: welcomePath,
      size_bytes: welcome.byteLength,
    })
    created.push('welcome_letter')

    /* -------------------------------------------------------- booking form */
    const form = buildPdf([
      { text: company, size: 18, bold: true },
      { text: 'Booking Form', size: 13, bold: true, gap: 12 },
      { text: `Reference: ${booking.reference}`, size: 10 },
      { text: `Confirmed on: ${day(booking.step3_at)}`, size: 10, gap: 14 },
      { text: 'Purchaser', size: 12, bold: true, gap: 4 },
      { text: `Name: ${booking.customer?.full_name ?? '-'}`, size: 11 },
      { text: `User ID: ${booking.customer?.user_code ?? '-'}`, size: 11 },
      { text: `Phone: ${booking.customer?.phone ?? '-'}`, size: 11 },
      { text: `Address: ${booking.customer?.address ?? '-'}`, size: 11, gap: 10 },
      { text: 'Property', size: 12, bold: true, gap: 4 },
      { text: `Project: ${booking.project?.name ?? '-'}`, size: 11 },
      { text: `Location: ${booking.project?.location ?? '-'}`, size: 11 },
      { text: `Plot: ${booking.plot?.number ?? '-'}`, size: 11 },
      { text: `Size: ${booking.plot?.size ?? '-'} ${booking.plot?.size_unit ?? ''}`, size: 11, gap: 10 },
      { text: 'Consideration', size: 12, bold: true, gap: 4 },
      { text: `Total: ${money(Number(booking.sale_value))}`, size: 11 },
      { text: `Token: ${money(Number(booking.token_amount))}`, size: 11 },
      {
        text: `Balance: ${money(Number(booking.sale_value) - Number(booking.token_amount))}`,
        size: 11,
        gap: 10,
      },
      { text: 'Approval record', size: 12, bold: true, gap: 4 },
      { text: `Step 1 — raised by sales partner: ${day(booking.step1_at)}`, size: 10 },
      { text: `Step 2 — reviewed: ${day(booking.step2_at)}`, size: 10 },
      { text: `Step 3 — final approval: ${day(booking.step3_at)}`, size: 10, gap: 10 },
      {
        text: `Terms & Conditions accepted by purchaser: ${booking.terms_accepted_customer ? 'Yes' : 'No'} · by sales partner: ${booking.terms_accepted_rep ? 'Yes' : 'No'}`,
        size: 10,
        gap: 18,
      },
      { text: '_______________________            _______________________', size: 11 },
      { text: 'Purchaser                                    For ' + company, size: 9 },
    ])

    const formPath = `${booking.id}/booking-form-${Date.now()}.pdf`
    const up2 = await admin.storage.from('documents').upload(formPath, form, {
      contentType: 'application/pdf',
    })
    if (up2.error) return json({ error: up2.error.message }, 500)

    await admin.from('documents').insert({
      booking_id: booking.id,
      owner_id: booking.customer_id,
      type: 'booking_form',
      title: `Booking form — ${booking.reference}`,
      storage_path: formPath,
      size_bytes: form.byteLength,
    })
    created.push('booking_form')

    /* -------------------------------------------------------- notification */
    if (booking.customer_id) {
      await admin.from('notifications').insert({
        user_id: booking.customer_id,
        type: 'document',
        title: 'Your documents are ready',
        body: 'Your welcome letter and booking form are available to download.',
        link: '/portal/documents',
      })
    }

    // Fire the email without blocking the response — a failed email must not
    // roll back paperwork that already exists in storage.
    if (booking.customer?.email) {
      fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          to: booking.customer.email,
          template: 'booking_confirmed',
          data: { name: booking.customer.full_name, reference: booking.reference },
        }),
      }).catch((err) => console.error('[generate-documents] email dispatch failed', err))
    }

    return json({ ok: true, created, booking: booking.reference })
  } catch (err) {
    console.error('[generate-documents]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
