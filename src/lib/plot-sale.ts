import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * "New plot sale" and receipts — the Payments CRM's write side.
 *
 * The schedule itself is built in the database (app.build_emi_schedule) the
 * moment a sale is filed. previewSchedule() is the same rule in TypeScript so
 * the form can show it before anything is saved; if the two ever disagree,
 * the SQL is the authority.
 */

export type ItemKind = 'booking' | 'emi' | 'milestone' | 'balance'

export interface Milestone {
  label: string
  due_date: string
  amount: number
}

export interface PlanInput {
  total: number
  bookingAmount: number
  emiCount: number
  /** Blank / 0 = split the balance evenly. */
  emiAmount?: number | null
  /** Booking date, YYYY-MM-DD. */
  start: string
  /** First EMI date; defaults to a month after the start. */
  firstEmi?: string | null
  milestones: Milestone[]
}

export interface PlannedItem {
  seq: number
  kind: ItemKind
  label: string
  due_date: string
  amount: number
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Add calendar months the way Postgres does: 31 Jan + 1 month = 28/29 Feb. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  const target = new Date(y, m - 1 + months, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return iso(new Date(target.getFullYear(), target.getMonth(), Math.min(d, last)))
}

export interface PlanCheck {
  items: PlannedItem[]
  /** What the EMIs (and any balance) have to cover. */
  balance: number
  error: string | null
}

export function previewSchedule(p: PlanInput): PlanCheck {
  const total = Math.max(0, Number(p.total) || 0)
  const token = Math.max(0, Number(p.bookingAmount) || 0)
  const n = Math.max(0, Math.floor(Number(p.emiCount) || 0))
  const ms = p.milestones.filter((m) => m.label.trim() || Number(m.amount) > 0 || m.due_date)
  const msSum = ms.reduce((t, m) => t + (Number(m.amount) || 0), 0)
  const rest = total - token - msSum
  const each = Number(p.emiAmount) || 0
  const items: PlannedItem[] = []

  if (total <= 0) return { items, balance: 0, error: 'Enter the total amount (area × rate, or type it).' }
  if (ms.some((m) => !m.label.trim() || !m.due_date || !(Number(m.amount) > 0))) {
    return { items, balance: rest, error: 'Each milestone needs a label, a date and an amount.' }
  }
  if (rest < 0) return { items, balance: rest, error: 'The booking amount and milestones come to more than the total.' }
  if (each > 0 && n === 0) return { items, balance: rest, error: 'Enter the number of EMIs for that EMI amount.' }
  if (each > 0 && each * n > rest) {
    return { items, balance: rest, error: `${n} EMIs of ${each.toLocaleString('en-IN')} come to more than the balance.` }
  }

  const start = p.start || iso(new Date())
  const first = p.firstEmi || addMonths(start, 1)

  if (token > 0) items.push({ seq: 0, kind: 'booking', label: 'Booking amount', due_date: start, amount: token })
  if (rest > 0) {
    if (n > 0) {
      if (each > 0) {
        for (let i = 1; i <= n; i++) items.push({ seq: i, kind: 'emi', label: `EMI ${i}`, due_date: addMonths(first, i - 1), amount: each })
        const left = rest - each * n
        if (left > 0) items.push({ seq: n + 1, kind: 'balance', label: 'Balance', due_date: addMonths(first, n), amount: left })
      } else {
        const even = Math.floor(rest / n)
        for (let i = 1; i <= n; i++) {
          items.push({ seq: i, kind: 'emi', label: `EMI ${i}`, due_date: addMonths(first, i - 1), amount: i === 1 ? rest - even * (n - 1) : even })
        }
      }
    } else {
      items.push({ seq: 1, kind: 'balance', label: 'Balance', due_date: first, amount: rest })
    }
  }
  ;[...ms]
    .sort((a, z) => a.due_date.localeCompare(z.due_date))
    .forEach((m, i) => items.push({ seq: 100 + i, kind: 'milestone', label: m.label.trim(), due_date: m.due_date, amount: Number(m.amount) }))

  items.sort((a, z) => a.due_date.localeCompare(z.due_date) || a.seq - z.seq)
  return { items, balance: rest, error: null }
}

/** How an item reads to a person. Rows written before labels existed have none. */
export function itemLabel(e: { seq: number; label?: string | null; kind?: string | null }) {
  if (e.label) return e.label
  return e.seq === 0 ? 'Booking amount' : `EMI ${e.seq}`
}

/* ------------------------------------------------------------------ writes */

export interface NewPlotSale {
  plotId: string
  customerName: string
  customerPhone?: string
  customerEmail?: string
  customerAddress?: string
  area?: number | null
  rate?: number | null
  total?: number | null
  bookingAmount: number
  emiCount: number
  emiAmount?: number | null
  start: string
  firstEmi?: string | null
  notes?: string
  milestones: Milestone[]
  /** Office only. */
  repId?: string | null
  customerId?: string | null
  confirm?: boolean
  bookingPaid?: boolean
}

export function useCreatePlotSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: NewPlotSale) => {
      const { data, error } = await supabase.rpc('create_plot_sale', {
        p_plot_id: s.plotId,
        p_customer_name: s.customerName,
        p_customer_phone: s.customerPhone || null,
        p_customer_email: s.customerEmail || null,
        p_customer_address: s.customerAddress || null,
        p_area: s.area || null,
        p_rate: s.rate || null,
        p_total: s.total || null,
        p_booking_amount: s.bookingAmount || 0,
        p_emi_count: s.emiCount || 0,
        p_emi_amount: s.emiAmount || null,
        p_start_date: s.start || null,
        p_notes: s.notes || null,
        p_milestones: s.milestones.filter((m) => m.label.trim()),
        p_first_emi: s.firstEmi || null,
        p_rep_id: s.repId ?? null,
        p_customer_id: s.customerId ?? null,
        p_confirm: Boolean(s.confirm),
        p_booking_paid: Boolean(s.bookingPaid),
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      for (const key of ['sponsor-sales', 'sponsor-emis', 'sponsor-payments', 'available-plots', 'crm-emis', 'collection-queue', 'admin-bookings', 'customers']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export const PAY_MODES: { value: string; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
]

/**
 * Upload the receipt for one schedule item and send it for verification.
 * Works for the member who sold the plot and for the buyer; the database
 * decides which of them may (emis_update_rep / emis_update_customer).
 */
export function useUploadReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      item: { id: string; booking_id: string; seq: number }
      file: File
      reference?: string
      mode?: string
      paidOn?: string
    }) => {
      if (v.file.size > 5 * 1024 * 1024) throw new Error('That file is over 5 MB.')
      if (!/^(application\/pdf|image\/(png|jpeg))$/.test(v.file.type)) throw new Error('Upload a PDF, JPG or PNG.')
      const ext = v.file.type === 'application/pdf' ? 'pdf' : v.file.type === 'image/png' ? 'png' : 'jpg'
      const path = `${v.item.booking_id}/item-${v.item.seq}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('emi-slips').upload(path, v.file, { contentType: v.file.type })
      if (upErr) throw new Error(upErr.message)
      const { error } = await supabase.from('emis').update({
        slip_path: path,
        status: 'awaiting_verification',
        reference: v.reference?.trim() || null,
        slip_mode: v.mode || null,
        slip_paid_on: v.paidOn || null,
      }).eq('id', v.item.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      for (const key of ['sponsor-emis', 'customer-emis', 'crm-emis', 'collection-queue']) void qc.invalidateQueries({ queryKey: [key] })
    },
  })
}
