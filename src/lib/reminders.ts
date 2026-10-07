import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'
import { money } from '@/lib/format'

/**
 * Payment reminders (migration 20260201005400). The gateway's hourly run
 * sends the automatic ones (due in 3 days, due today, overdue) to the
 * customer and their sponsor; a sponsor or the office can also remind a
 * customer themselves. Every reminder is logged in payment_reminders.
 */
export type ReminderChannel = 'panel' | 'whatsapp' | 'call' | 'sms' | 'visit' | 'other'
export type ReminderKind = 'auto_due_soon' | 'auto_due_today' | 'auto_overdue' | 'manual'

export interface ReminderRow {
  id: string
  booking_id: string
  emi_id: string | null
  kind: ReminderKind
  channel: ReminderChannel
  sent_by: string | null
  note: string | null
  created_at: string
  sender?: { full_name: string | null; role: string | null } | null
}

export const CHANNEL_LABEL: Record<ReminderChannel, string> = {
  panel: 'Panel notification',
  whatsapp: 'WhatsApp',
  call: 'Phone call',
  sms: 'SMS',
  visit: 'Visit',
  other: 'Other',
}

export const KIND_LABEL: Record<ReminderKind, string> = {
  auto_due_soon: 'Automatic · due soon',
  auto_due_today: 'Automatic · due today',
  auto_overdue: 'Automatic · overdue',
  manual: 'Sent by hand',
}

/** The reminder log for these bookings (a sponsor sees their own sales'; the office all). */
export function useReminders(bookingIds: string[]) {
  const key = [...bookingIds].sort().join(',')
  return useQuery({
    queryKey: ['payment-reminders', key],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_reminders')
        .select('id, booking_id, emi_id, kind, channel, sent_by, note, created_at, sender:profiles!payment_reminders_sent_by_fkey ( full_name, role )')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as ReminderRow[]
    },
  })
}

/** Remind a customer and log it ('panel' also notifies them in their panel, once a day). */
export function useSendReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { bookingId: string; channel: ReminderChannel; note?: string | null }) => {
      const { data, error } = await supabase.rpc('send_payment_reminder', {
        p_booking_id: v.bookingId, p_channel: v.channel, p_note: v.note ?? null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payment-reminders'] }) },
  })
}

/** The office: run the reminder pass now instead of waiting for the hourly run. */
export function useRunRemindersNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_payment_reminders_now', {})
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payment-reminders'] })
      void qc.invalidateQueries({ queryKey: ['emis'] })
    },
  })
}

/** 10-digit Indian mobile -> wa.me / tel: form (91…). Null when unusable. */
export function intlPhone(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.length === 10 ? `91${d}` : d.replace(/^0+/, '')
}

/** A polite reminder, in English and Hindi, ready for WhatsApp. */
export function reminderMessage(o: {
  customer: string | null | undefined
  plot: string
  amount: number
  dueDate: string | null
  daysLate: number
  from?: string | null
}): string {
  const name = o.customer?.trim() || 'Sir/Madam'
  const when = o.daysLate > 0
    ? `was due on ${o.dueDate} (${o.daysLate} day${o.daysLate === 1 ? '' : 's'} ago)`
    : o.daysLate === 0 ? 'is due today' : `is due on ${o.dueDate}`
  return [
    `Namaste ${name} ji,`,
    '',
    `This is a reminder from ${BRAND.short}: your instalment of ${money(o.amount)} for ${o.plot} ${when}.`,
    'Please make the payment and share the receipt, or upload it in your customer panel.',
    '',
    `आपकी ${o.plot} की किस्त ${money(o.amount)} ${o.daysLate > 0 ? 'बकाया है' : 'देय है'}। कृपया भुगतान करके रसीद भेजें।`,
    '',
    o.from ? `— ${o.from}, ${BRAND.short}` : `— ${BRAND.short}`,
  ].join('\n')
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const p = intlPhone(phone)
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null
}
