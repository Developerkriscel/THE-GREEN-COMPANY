import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SaleRow } from '@/lib/sponsor'

/**
 * The member-facing CRM: prospects they are chasing, and the instalment
 * position of the sales they closed.
 *
 * Both sit on tables that already existed for the admin panel — `leads`,
 * `lead_activities`, `emis`, `payments` — and on policies that already name
 * the rep (leads_select_owner, leads_insert_rep, leads_update_owner,
 * app.owns_booking). Nothing here needed a migration; the sponsor panel
 * simply never showed any of it.
 */

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return (data ?? []) as T
}

/**
 * Collapse a date-ish value to local midnight, as a timestamp.
 *
 * A Postgres `date` column does not arrive in one shape: PostgREST hands back
 * a bare 'YYYY-MM-DD', while this gateway serialises through a JS Date and so
 * returns a full ISO timestamp ('2026-09-23T18:30:00.000Z' is midnight IST on
 * the 24th). Appending 'T00:00:00' to the second form yields Invalid Date, and
 * every comparison against NaN is false -- a due instalment silently stops
 * being due. Both forms have to be accepted.
 *
 * Returns NaN for anything unparseable, so callers can filter it out.
 */
export function dayStart(value: string | null | undefined): number {
  if (!value) return NaN
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return NaN
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/* ===================================================================== *
 * Payout cycle
 *
 * The office pays on a fortnightly rhythm keyed to the day of the month a
 * member joined, not to when the income was earned:
 *
 *   joined on day 1-15  -> paid on the 15th of the following month
 *   joined on day 16-31 -> paid on the 30th of the following month
 *
 * A member who joined on the 5th therefore always collects on the 15th.
 * February has no 30th, so the "30th" cycle clamps to the last day of the
 * month rather than rolling into March.
 * ===================================================================== */

export interface PayoutCycle {
  joinDay: number
  /** Which fortnight of the month the member belongs to. */
  cycle: '1-15' | '16-30'
  /** Nominal day of the month money lands on. */
  payoutDay: 15 | 30
  /** The next payout date on or after `ref`. */
  next: Date
  /** Whole days until `next`; 0 means it lands today. */
  daysAway: number
}

/** Number of days in the month `d` falls in. */
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export function payoutCycle(
  joinedIso: string | null | undefined,
  ref = new Date(),
): PayoutCycle | null {
  if (!joinedIso) return null
  const joined = new Date(joinedIso)
  if (Number.isNaN(joined.getTime())) return null

  const joinDay = joined.getDate()
  const payoutDay: 15 | 30 = joinDay <= 15 ? 15 : 30
  const cycle: '1-15' | '16-30' = joinDay <= 15 ? '1-15' : '16-30'

  // Walk forward from the current month to the first payout date that has not
  // already passed. Two iterations is always enough; the third is slack.
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  let next: Date | null = null
  for (let i = 0; i < 3 && !next; i++) {
    const probe = new Date(ref.getFullYear(), ref.getMonth() + i, 1)
    const day = Math.min(payoutDay, endOfMonth(probe))
    const candidate = new Date(probe.getFullYear(), probe.getMonth(), day)
    if (candidate >= today) next = candidate
  }
  if (!next) return null

  return {
    joinDay,
    cycle,
    payoutDay,
    next,
    daysAway: Math.round((next.getTime() - today.getTime()) / 86_400_000),
  }
}

/* ===================================================================== *
 * Lead follow-up
 *
 * RLS scopes every row to the member who owns it, so these queries carry no
 * ownership filter beyond the one that makes the index useful. A converted or
 * lost lead is read-only by policy (leads_update_owner excludes both), which
 * the UI mirrors rather than discovers.
 * ===================================================================== */

export type LeadStatus =
  | 'new' | 'contacted' | 'visit_planned' | 'visited' | 'negotiation' | 'converted' | 'lost'

export const LEAD_STATUSES: LeadStatus[] = [
  'new', 'contacted', 'visit_planned', 'visited', 'negotiation', 'converted', 'lost',
]

export const LEAD_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  visit_planned: 'Visit planned',
  visited: 'Visited',
  negotiation: 'Negotiation',
  converted: 'Converted',
  lost: 'Lost',
}

/** Statuses the member may no longer edit — leads_update_owner blocks them. */
export const LEAD_CLOSED: LeadStatus[] = ['converted', 'lost']

export const LEAD_SOURCES = ['website', 'referral', 'walk_in', 'call', 'social', 'other']

export interface LeadRow {
  id: string
  owner_id: string | null
  name: string
  mobile: string
  email: string | null
  project_id: string | null
  category: string | null
  budget: number | null
  visit_date: string | null
  token_amount: number | null
  plot_number: string | null
  source: string
  remark: string | null
  status: LeadStatus
  next_follow_up: string | null
  converted_booking_id: string | null
  created_at: string
  updated_at: string
  project?: { id: string; name: string } | null
}

export interface LeadActivityRow {
  id: string
  lead_id: string
  actor_id: string | null
  kind: string
  body: string
  created_at: string
}

const LEAD_COLUMNS =
  'id, owner_id, name, mobile, email, project_id, category, budget, visit_date, ' +
  'token_amount, plot_number, source, remark, status, next_follow_up, ' +
  'converted_booking_id, created_at, updated_at, project:projects ( id, name )'

export function useMyLeads(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-leads', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(LEAD_COLUMNS)
        .eq('owner_id', memberId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      // The embed comes back typed as an array by the client generic; the
      // gateway returns the single related row, as everywhere else here.
      return (data ?? []) as unknown as LeadRow[]
    },
  })
}

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-lead-activities', leadId],
    enabled: Boolean(leadId),
    queryFn: async () =>
      unwrap<LeadActivityRow[]>(
        await supabase
          .from('lead_activities')
          .select('id, lead_id, actor_id, kind, body, created_at')
          .eq('lead_id', leadId!)
          .order('created_at', { ascending: false }),
      ),
  })
}

export type LeadDraft = Partial<
  Omit<LeadRow, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'project'>
>

export function useCreateLead(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: LeadDraft) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({ ...draft, owner_id: memberId })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data as { id: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsor-leads', memberId] }),
  })
}

export function useUpdateLead(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: LeadDraft & { id: string }) => {
      const { error } = await supabase
        .from('leads')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsor-leads', memberId] }),
  })
}

export function useLogLeadActivity(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      leadId, body, kind = 'note',
    }: { leadId: string; body: string; kind?: string }) => {
      const { error } = await supabase
        .from('lead_activities')
        .insert({ lead_id: leadId, actor_id: memberId, kind, body })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['sponsor-lead-activities', vars.leadId] })
    },
  })
}

export interface LeadBuckets {
  total: number
  open: number
  converted: number
  lost: number
  /** Follow-up date has passed and the lead is still open. Soonest first. */
  overdue: LeadRow[]
  /** Follow-up falls today or within the next seven days. Soonest first. */
  dueSoon: LeadRow[]
  byStatus: Array<{ status: LeadStatus; label: string; count: number }>
  /** converted / (converted + lost), as a percentage. 0 when nothing closed. */
  conversionPct: number
}

/** Follow-up triage. `ref` is injectable so the tests are not calendar-bound. */
export function leadBuckets(leads: LeadRow[], ref = new Date()): LeadBuckets {
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime()
  const week = today + 7 * 86_400_000
  const isOpen = (l: LeadRow) => !LEAD_CLOSED.includes(l.status)
  const at = (l: LeadRow) => dayStart(l.next_follow_up)

  // A lead with an unparseable follow-up date is left out of both buckets
  // rather than being treated as overdue.
  const dated = leads.filter((l) => isOpen(l) && !Number.isNaN(at(l)))
  const converted = leads.filter((l) => l.status === 'converted').length
  const lost = leads.filter((l) => l.status === 'lost').length
  const closed = converted + lost

  return {
    total: leads.length,
    open: leads.filter(isOpen).length,
    converted,
    lost,
    overdue: dated.filter((l) => at(l) < today).sort((a, b) => at(a) - at(b)),
    dueSoon: dated.filter((l) => at(l) >= today && at(l) <= week).sort((a, b) => at(a) - at(b)),
    byStatus: LEAD_STATUSES.map((status) => ({
      status,
      label: LEAD_LABELS[status],
      count: leads.filter((l) => l.status === status).length,
    })),
    conversionPct: closed ? Math.round((converted / closed) * 100) : 0,
  }
}

/* ===================================================================== *
 * Payments CRM
 *
 * The instalment position of every booking the member sourced.
 * app.owns_booking already grants a rep read access to the emis and payments
 * of their own bookings, so no new policy was needed — only a screen.
 *
 * Writing is deliberately absent: payments_write_admin means only the office
 * may record a receipt. The member chases; the office confirms.
 * ===================================================================== */

export interface EmiRow {
  id: string
  booking_id: string
  seq: number
  due_date: string
  amount: number
  status: string
  paid_at: string | null
  reference: string | null
}

export interface PaymentRow {
  id: string
  booking_id: string
  emi_id: string | null
  amount: number
  mode: string
  reference: string | null
  paid_on: string
  receipt_no: string | null
}

export function useMyEmis(bookingIds: string[]) {
  const key = [...bookingIds].sort().join(',')
  return useQuery({
    queryKey: ['sponsor-emis', key],
    enabled: bookingIds.length > 0,
    queryFn: async () =>
      unwrap<EmiRow[]>(
        await supabase
          .from('emis')
          .select('id, booking_id, seq, due_date, amount, status, paid_at, reference')
          .in('booking_id', bookingIds)
          .order('due_date', { ascending: true }),
      ),
  })
}

export function useMyPayments(bookingIds: string[]) {
  const key = [...bookingIds].sort().join(',')
  return useQuery({
    queryKey: ['sponsor-payments', key],
    enabled: bookingIds.length > 0,
    queryFn: async () =>
      unwrap<PaymentRow[]>(
        await supabase
          .from('payments')
          .select('id, booking_id, emi_id, amount, mode, reference, paid_on, receipt_no')
          .in('booking_id', bookingIds)
          .order('paid_on', { ascending: false }),
      ),
  })
}

export interface CollectionRow {
  booking: SaleRow
  emis: EmiRow[]
  payments: PaymentRow[]
  /** Sum of every payment recorded against the booking. */
  collected: number
  /** Sale value less collected; never negative. */
  outstanding: number
  /** Instalments past their due date and still unsettled. Soonest first. */
  overdue: EmiRow[]
  /** The soonest unsettled instalment, overdue or not. */
  nextDue: EmiRow | null
  collectedPct: number
}

/** An instalment in one of these states needs no more chasing. */
const EMI_SETTLED = ['paid', 'verified', 'waived']

/** Roll EMIs and payments up per booking. `ref` keeps the tests deterministic. */
export function collectionsOf(
  sales: SaleRow[],
  emis: EmiRow[],
  payments: PaymentRow[],
  ref = new Date(),
): CollectionRow[] {
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime()

  return sales.map((booking) => {
    const mine = emis
      .filter((e) => e.booking_id === booking.id)
      .sort((a, b) => dayStart(a.due_date) - dayStart(b.due_date))
    const paid = payments.filter((p) => p.booking_id === booking.id)
    const collected = paid.reduce((n, p) => n + Number(p.amount ?? 0), 0)
    const value = Number(booking.sale_value ?? 0)
    const unpaid = mine.filter((e) => !EMI_SETTLED.includes(e.status))

    return {
      booking,
      emis: mine,
      payments: paid,
      collected,
      outstanding: Math.max(0, value - collected),
      overdue: unpaid.filter((e) => dayStart(e.due_date) < today),
      nextDue: unpaid[0] ?? null,
      collectedPct: value > 0 ? Math.min(100, Math.round((collected / value) * 100)) : 0,
    }
  })
}

export interface CollectionTotals {
  saleValue: number
  collected: number
  outstanding: number
  overdueAmount: number
  overdueCount: number
  bookings: number
  collectedPct: number
}

export function collectionTotals(rows: CollectionRow[]): CollectionTotals {
  const saleValue = rows.reduce((n, r) => n + Number(r.booking.sale_value ?? 0), 0)
  const collected = rows.reduce((n, r) => n + r.collected, 0)
  const overdue = rows.flatMap((r) => r.overdue)

  return {
    saleValue,
    collected,
    outstanding: rows.reduce((n, r) => n + r.outstanding, 0),
    overdueAmount: overdue.reduce((n, e) => n + Number(e.amount ?? 0), 0),
    overdueCount: overdue.length,
    bookings: rows.length,
    collectedPct: saleValue > 0 ? Math.min(100, Math.round((collected / saleValue) * 100)) : 0,
  }
}

/* ===================================================================== *
 * Reward-qualifying area
 *
 * Slide 7 of the plan deck: "Reward Count After 50% payment". Area only
 * counts toward a reward tier once at least half the sale value has been
 * received, so a confirmed booking with nothing collected earns no reward
 * progress.
 *
 * The sum lives in `public.my_reward_area()` rather than here, because the
 * member cannot read payments for a booking they do not own and because one
 * definition shared with any report is worth more than a faster round trip.
 * ===================================================================== */

export function useMyRewardArea(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-reward-area', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_reward_area', { p_member: memberId })
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    },
  })
}

/**
 * The same rule in TypeScript, for a screen that already holds both lists.
 * If this and `my_reward_area()` ever disagree, that is a defect -- the SQL
 * is the authority.
 */
export function rewardQualifyingArea(
  sales: SaleRow[],
  payments: PaymentRow[],
  minPaidPct = 50,
): number {
  return sales
    .filter((s) => {
      if (s.status !== 'confirmed') return false
      const value = Number(s.sale_value ?? 0)
      // A booking with no sale value on it cannot be half paid.
      if (value <= 0) return false
      const collected = payments
        .filter((p) => p.booking_id === s.id)
        .reduce((n, p) => n + Number(p.amount ?? 0), 0)
      return collected >= (value * minPaidPct) / 100
    })
    .reduce((n, s) => n + Number(s.plot?.size ?? 0), 0)
}

/* ===================================================================== *
 * Plot sales the member files themselves
 *
 * "Add Sale": the member records a sale they closed, it sits as pending
 * until the office verifies it, and on verification the direct income is
 * credited automatically by trg_bookings_income_sync.
 *
 * Creation goes through submit_plot_sale() rather than an insert from here:
 * a booking that is created but never submitted holds the plot (see
 * bookings_one_live_per_plot) while appearing in nobody's queue.
 * ===================================================================== */

export interface AvailablePlot {
  id: string
  number: string
  size: number | null
  size_unit: string
  price: number
  project_id: string
  project_name: string
}

export function useAvailablePlots() {
  return useQuery({
    queryKey: ['available-plots'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('available_plots')
      if (error) throw new Error(error.message)
      return (data ?? []) as AvailablePlot[]
    },
  })
}

export interface PlotSaleDraft {
  plotId: string
  customerName: string
  customerPhone?: string
  saleValue?: number
  tokenAmount?: number
  paymentPlan?: 'full' | 'emi'
}

export function useSubmitPlotSale(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: PlotSaleDraft) => {
      const { data, error } = await supabase.rpc('submit_plot_sale', {
        p_plot_id: d.plotId,
        p_customer_name: d.customerName,
        p_customer_phone: d.customerPhone ?? null,
        p_sale_value: d.saleValue ?? null,
        p_token_amount: d.tokenAmount ?? 0,
        p_payment_plan: d.paymentPlan ?? 'full',
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsor-sales', memberId] })
      // The plot is no longer available to anyone once it is on a live booking.
      qc.invalidateQueries({ queryKey: ['available-plots'] })
    },
  })
}

/** Where a submitted sale has got to, in the words the member sees. */
export type SaleStage = 'pending' | 'verified' | 'rejected' | 'cancelled'

export function saleStage(status: string): SaleStage {
  if (status === 'confirmed') return 'verified'
  if (status === 'rejected') return 'rejected'
  if (status === 'cancelled') return 'cancelled'
  // draft, step1_done and step2_approved are all "with the office" as far as
  // the member is concerned; the internal review step is not their business.
  return 'pending'
}

export interface SalesSummary {
  verified: number
  verifiedValue: number
  pending: number
  pendingValue: number
  submitted: number
  /** Area on verified sales, in sq yd. */
  verifiedArea: number
}

export function salesSummary(sales: SaleRow[]): SalesSummary {
  const live = sales.filter((s) => saleStage(s.status) !== 'cancelled')
  const verified = live.filter((s) => saleStage(s.status) === 'verified')
  const pending = live.filter((s) => saleStage(s.status) === 'pending')
  const sum = (rows: SaleRow[]) => rows.reduce((n, s) => n + Number(s.sale_value ?? 0), 0)

  return {
    verified: verified.length,
    verifiedValue: sum(verified),
    pending: pending.length,
    pendingValue: sum(pending),
    submitted: live.length,
    verifiedArea: verified.reduce((n, s) => n + Number(s.plot?.size ?? 0), 0),
  }
}

/* ===================================================================== *
 * Reward fulfilment
 *
 * Earning a tier and being GIVEN the goods are different facts. The panel
 * used to say "the office will contact you about delivery" and then had no
 * way to answer "did we actually send it?". An issued reward is written as
 * an in_kind ledger row, which `member_balance` and `isCounted()` both
 * exclude, so it shows on the statement without ever touching the wallet.
 * ===================================================================== */

export interface IssuedReward {
  reference: string
  note: string | null
  area_sqyd: number | null
  issued_at: string
}

export function useIssuedRewards(memberId: string | undefined) {
  return useQuery({
    queryKey: ['issued-rewards', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_issued_rewards', { p_member: memberId })
      if (error) throw new Error(error.message)
      return (data ?? []) as IssuedReward[]
    },
  })
}

/** The reference award_reward() builds, so a tier can be matched to its row. */
export function rewardReference(title: string, sqyd: number): string {
  return `REWARD-${title.toUpperCase().replace(/ /g, '-')}-${Math.trunc(sqyd)}`
}

export function useAwardReward(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rankId, note }: { rankId: string; note?: string }) => {
      const { data, error } = await supabase.rpc('award_reward', {
        p_member: memberId,
        p_rank: rankId,
        p_note: note ?? null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issued-rewards', memberId] })
      qc.invalidateQueries({ queryKey: ['member-ledger', memberId] })
      qc.invalidateQueries({ queryKey: ['sponsor-ledger', memberId] })
    },
  })
}
