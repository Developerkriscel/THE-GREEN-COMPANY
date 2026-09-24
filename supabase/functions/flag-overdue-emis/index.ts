/**
 * flag-overdue-emis
 *
 * Scheduled sweep. Marks pending installments whose due date has passed as
 * overdue and notifies the customer and the rep on the booking.
 *
 * Schedule it with pg_cron, or from any external scheduler:
 *   select cron.schedule('flag-overdue-emis', '0 2 * * *', $$
 *     select net.http_post(
 *       url := 'https://<project>.supabase.co/functions/v1/flag-overdue-emis',
 *       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
 *     );
 *   $$);
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const today = new Date().toISOString().slice(0, 10)

    const { data: newlyOverdue, error } = await admin
      .from('emis')
      .select('id, seq, amount, due_date, booking:bookings ( id, reference, customer_id, rep_id )')
      .eq('status', 'pending')
      .lt('due_date', today)

    if (error) return json({ error: error.message }, 500)
    if (!newlyOverdue?.length) return json({ ok: true, flagged: 0 })

    const ids = newlyOverdue.map((e) => e.id)
    const { error: updateError } = await admin.from('emis').update({ status: 'overdue' }).in('id', ids)
    if (updateError) return json({ error: updateError.message }, 500)

    const notifications = newlyOverdue.flatMap((e) => {
      const booking = e.booking as Record<string, any> | null
      const rows: Record<string, unknown>[] = []
      if (booking?.customer_id) {
        rows.push({
          user_id: booking.customer_id,
          type: 'emi',
          title: 'An installment is overdue',
          body: `Installment #${e.seq} on ${booking.reference} was due on ${e.due_date}.`,
          link: '/portal/emis',
        })
      }
      if (booking?.rep_id) {
        rows.push({
          user_id: booking.rep_id,
          type: 'emi',
          title: 'Customer installment overdue',
          body: `Installment #${e.seq} on ${booking.reference} is overdue — worth a follow-up call.`,
          link: '/app/bookings',
        })
      }
      return rows
    })

    if (notifications.length) await admin.from('notifications').insert(notifications)

    return json({ ok: true, flagged: ids.length })
  } catch (err) {
    console.error('[flag-overdue-emis]', err)
    return json({ error: String(err) }, 500)
  }
})
