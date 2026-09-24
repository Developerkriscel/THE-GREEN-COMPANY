import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AuditEntry,
  Booking,
  Commission,
  DocumentRow,
  Emi,
  Kyc,
  Lead,
  LeadActivity,
  Message,
  MessageThread,
  Plot,
  Profile,
  Project,
  Rank,
  SaleConfirmation,
  TeamCommissionTotal,
} from '@/lib/types'

/* ------------------------------------------------------------ selects */

const BOOKING_SELECT = `
  *,
  plot:plots ( id, number, size, size_unit ),
  project:projects ( id, name ),
  rep:profiles!bookings_rep_id_fkey ( id, full_name, user_code ),
  customer:profiles!bookings_customer_id_fkey ( id, full_name, user_code, phone )
`

const LEAD_SELECT = `
  *,
  project:projects ( id, name ),
  owner:profiles!leads_owner_id_fkey ( id, full_name )
`

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return (data ?? []) as T
}

/* ------------------------------------------------------------ projects */

export function useProjects(opts: { publishedOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ['projects', opts],
    queryFn: async () => {
      let q = supabase.from('projects').select('*').is('deleted_at', null).order('sort_order')
      if (opts.publishedOnly) q = q.eq('published', true)
      return unwrap<Project[]>(await q)
    },
  })
}

export function useProject(slugOrId: string | undefined) {
  return useQuery({
    queryKey: ['project', slugOrId],
    enabled: Boolean(slugOrId),
    queryFn: async () => {
      const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId!)
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq(isUuid ? 'id' : 'slug', slugOrId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as Project | null
    },
  })
}

export function usePlots(projectId?: string) {
  return useQuery({
    queryKey: ['plots', projectId],
    queryFn: async () => {
      let q = supabase
        .from('plots')
        .select('*, project:projects ( id, name, slug )')
        .is('deleted_at', null)
        .order('number')
      if (projectId) q = q.eq('project_id', projectId)
      return unwrap<Plot[]>(await q)
    },
  })
}

/** Anonymous-safe availability view — omits the internal notes column. */
export function usePublicPlots(projectId: string | undefined) {
  return useQuery({
    queryKey: ['public-plots', projectId],
    enabled: Boolean(projectId),
    queryFn: async () =>
      unwrap<
        { id: string; number: string; size: number | null; size_unit: string; dimensions: string | null; facing: string | null; price: number; availability: string }[]
      >(await supabase.from('v_public_plots').select('*').eq('project_id', projectId!).order('number')),
  })
}

/* --------------------------------------------------------------- leads */

export function useLeads(filters: { status?: string; ownerId?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      let q = supabase.from('leads').select(LEAD_SELECT).is('deleted_at', null).order('created_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.ownerId) q = q.eq('owner_id', filters.ownerId)
      if (filters.search) q = q.or(`name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`)
      return unwrap<Lead[]>(await q)
    },
  })
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id!).maybeSingle()
      if (error) throw new Error(error.message)
      return data as Lead | null
    },
  })
}

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    enabled: Boolean(leadId),
    queryFn: async () =>
      unwrap<LeadActivity[]>(
        await supabase
          .from('lead_activities')
          .select('*, actor:profiles ( id, full_name )')
          .eq('lead_id', leadId!)
          .order('created_at', { ascending: false }),
      ),
  })
}

export function useSaveLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lead: Partial<Lead> & { id?: string }) => {
      const { id, project, owner, ...payload } = lead as Record<string, unknown> & { id?: string }
      if (id) {
        const { error } = await supabase.from('leads').update(payload).eq('id', id)
        if (error) throw new Error(error.message)
        return id
      }
      const { data, error } = await supabase.from('leads').insert(payload).select('id').single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['lead'] })
    },
  })
}

/* ------------------------------------------------------------ bookings */

export function useBookings(filters: { status?: string; repId?: string; customerId?: string } = {}) {
  return useQuery({
    queryKey: ['bookings', filters],
    queryFn: async () => {
      let q = supabase.from('bookings').select(BOOKING_SELECT).is('deleted_at', null).order('created_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.repId) q = q.eq('rep_id', filters.repId)
      if (filters.customerId) q = q.eq('customer_id', filters.customerId)
      return unwrap<Booking[]>(await q)
    },
  })
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: ['booking', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id!).maybeSingle()
      if (error) throw new Error(error.message)
      return data as Booking | null
    },
  })
}

/**
 * Advance or reject a booking. The server decides whether the caller is
 * allowed to make this move — this only names the intended transition.
 */
export function useBookingTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      remark,
      terms,
    }: {
      id: string
      status: 'step1_done' | 'step2_approved' | 'confirmed' | 'rejected' | 'cancelled'
      remark?: string
      terms?: boolean
    }) => {
      const payload: Record<string, unknown> = { status }
      if (remark !== undefined) payload.reject_remark = remark
      if (terms !== undefined) payload.terms_accepted_rep = terms
      const { error } = await supabase.from('bookings').update(payload).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] })
      void qc.invalidateQueries({ queryKey: ['booking'] })
      void qc.invalidateQueries({ queryKey: ['plots'] })
    },
  })
}

/* --------------------------------------------------------------- sales */

export function useSales(filters: { status?: string; repId?: string } = {}) {
  return useQuery({
    queryKey: ['sales', filters],
    queryFn: async () => {
      let q = supabase
        .from('sale_confirmations')
        .select(`*, booking:bookings ( ${'id, reference, plot_id, project_id, customer_id, sale_value'} )`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.repId) q = q.eq('rep_id', filters.repId)
      return unwrap<SaleConfirmation[]>(await q)
    },
  })
}

export function useSaleTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      remark,
      terms,
      bookingId,
    }: {
      id: string
      status: 'step1_done' | 'step2_approved' | 'confirmed' | 'rejected'
      remark?: string
      terms?: boolean
      bookingId?: string
    }) => {
      const payload: Record<string, unknown> = { status }
      if (remark !== undefined) payload.reject_remark = remark
      if (terms !== undefined) payload.terms_accepted_rep = terms
      const { error } = await supabase.from('sale_confirmations').update(payload).eq('id', id)
      if (error) throw new Error(error.message)

      // Paperwork is generated server-side once the sale is confirmed. A failed
      // PDF run must not undo the confirmation, so this is best-effort and the
      // admin can re-run it from the booking screen.
      if (status === 'confirmed' && bookingId) {
        const { error: fnError } = await supabase.functions.invoke('generate-documents', {
          body: { booking_id: bookingId },
        })
        if (fnError) console.error('[sales] document generation failed', fnError.message)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales'] })
      void qc.invalidateQueries({ queryKey: ['commissions'] })
      void qc.invalidateQueries({ queryKey: ['emis'] })
      void qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

/* --------------------------------------------------------- commissions */

export function useCommissions(filters: { repId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['commissions', filters],
    queryFn: async () => {
      let q = supabase
        .from('commissions')
        .select('*, booking:bookings ( id, reference ), rep:profiles!commissions_rep_id_fkey ( id, full_name, user_code )')
        .order('created_at', { ascending: false })
      if (filters.repId) q = q.eq('rep_id', filters.repId)
      if (filters.status) q = q.eq('status', filters.status)
      return unwrap<Commission[]>(await q)
    },
  })
}

/** Manager-facing aggregate. Read-only — a manager never earns from these. */
export function useTeamCommissionTotals() {
  return useQuery({
    queryKey: ['team-commission-totals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_commission_totals')
      if (error) throw new Error(error.message)
      return (data ?? []) as TeamCommissionTotal[]
    },
  })
}

/* ---------------------------------------------------------------- emis */

export function useEmis(filters: { bookingId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['emis', filters],
    queryFn: async () => {
      let q = supabase
        .from('emis')
        .select('*, booking:bookings ( id, reference, customer_id, rep_id )')
        .order('due_date')
      if (filters.bookingId) q = q.eq('booking_id', filters.bookingId)
      if (filters.status) q = q.eq('status', filters.status)
      return unwrap<Emi[]>(await q)
    },
  })
}

/* ----------------------------------------------------------- documents */

export function useDocuments(bookingId?: string) {
  return useQuery({
    queryKey: ['documents', bookingId],
    queryFn: async () => {
      let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
      if (bookingId) q = q.eq('booking_id', bookingId)
      return unwrap<DocumentRow[]>(await q)
    },
  })
}

/* ----------------------------------------------------------------- kyc */

export function useMyKyc(userId: string | undefined) {
  return useQuery({
    queryKey: ['kyc', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('kyc').select('*').eq('user_id', userId!).maybeSingle()
      if (error) throw new Error(error.message)
      return data as Kyc | null
    },
  })
}

export function useKycQueue(status?: string) {
  return useQuery({
    queryKey: ['kyc-queue', status],
    queryFn: async () => {
      let q = supabase
        .from('kyc')
        .select('*, user:profiles!kyc_user_id_fkey ( id, full_name, user_code, role )')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      return unwrap<Kyc[]>(await q)
    },
  })
}

/* -------------------------------------------------------------- people */

export function useProfiles(filters: { role?: string; status?: string; managerId?: string } = {}) {
  return useQuery({
    queryKey: ['profiles', filters],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('*, rank:ranks!profiles_rank_id_fkey ( id, name, seniority, own_sale_rate, active, description )')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (filters.role) q = q.eq('role', filters.role)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.managerId) q = q.eq('manager_id', filters.managerId)
      return unwrap<Profile[]>(await q)
    },
  })
}

export function useRanks() {
  return useQuery({
    queryKey: ['ranks'],
    queryFn: async () =>
      unwrap<Rank[]>(await supabase.from('ranks').select('*').order('seniority')),
  })
}

/* --------------------------------------------------- CMS content tables */

export type CmsTable = 'team_members' | 'achievers' | 'events' | 'news_posts' | 'rewards' | 'plan_ranks' | 'plan_levels'

/** Read a CMS content table. `activeOnly` for the public site; full list for admin. */
export function useCmsContent<T = Record<string, unknown>>(table: CmsTable, opts: { activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ['cms-content', table, opts],
    queryFn: async () => {
      let q = supabase.from(table).select('*').order('sort_order').order('created_at')
      if (opts.activeOnly) q = q.eq('is_active', true)
      return unwrap<T[]>(await q)
    },
  })
}

export function useCmsUpsert(table: CmsTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Record<string, unknown> & { id?: string }) => {
      const { id, created_at, ...rest } = row as Record<string, unknown> & { id?: string }
      void created_at
      const res = id
        ? await supabase.from(table).update(rest).eq('id', id)
        : await supabase.from(table).insert(rest)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cms-content', table] }),
  })
}

export function useCmsDelete(table: CmsTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cms-content', table] }),
  })
}

export function useCmsBulkInsert(table: CmsTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const { error } = await supabase.from(table).insert(rows)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cms-content', table] }),
  })
}

export type BannerAudience = 'public' | 'sponsor' | 'both'
export type BannerTone = 'info' | 'success' | 'warn' | 'offer'

export interface Banner {
  id: string
  title: string
  subtitle: string | null
  image_url: string | null
  cta_label: string | null
  cta_link: string | null
  sort_order: number
  active: boolean
  audience: BannerAudience
  tone: BannerTone
  dismissible: boolean
  starts_at: string | null
  ends_at: string | null
}

/** Active promotional banners for the public home page. */
export function useBanners() {
  return useQuery({
    queryKey: ['banners', 'public'],
    queryFn: async () =>
      unwrap<Banner[]>(
        await supabase
          .from('cms_banners')
          .select('*')
          .eq('active', true)
          .in('audience', ['public', 'both'])
          .order('sort_order'),
      ),
  })
}

/**
 * The announcement strip across the top of the sponsor panel.
 *
 * `active` and the audience are filtered in the database; the date window is
 * applied in the browser so a banner that starts or ends while the panel is
 * open appears or disappears on the next render rather than needing a reload.
 */
export function useSponsorBanners() {
  return useQuery({
    queryKey: ['banners', 'sponsor'],
    queryFn: async () =>
      unwrap<Banner[]>(
        await supabase
          .from('cms_banners')
          .select('*')
          .eq('active', true)
          .in('audience', ['sponsor', 'both'])
          .order('sort_order'),
      ),
    // A promotion switched on by the office should show up without the member
    // reloading, but not at the cost of a request every few seconds.
    refetchInterval: 120_000,
  })
}

/** Is this banner inside its display window? `ref` keeps the tests honest. */
export function bannerIsLive(b: Banner, ref = new Date()): boolean {
  const now = ref.getTime()
  const starts = b.starts_at ? new Date(b.starts_at).getTime() : null
  const ends = b.ends_at ? new Date(b.ends_at).getTime() : null
  // An unparseable date is treated as "no bound" rather than hiding the banner:
  // a typo in the CMS should not silently suppress an announcement.
  if (starts !== null && !Number.isNaN(starts) && now < starts) return false
  if (ends !== null && !Number.isNaN(ends) && now > ends) return false
  return true
}

/** A single public CMS setting blob (home.hero, welcome.letter, public.contact…). */
export function useSiteSetting(key: string) {
  return useQuery({
    queryKey: ['site-settings', key],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle()
      if (error) throw new Error(error.message)
      return (data?.value ?? null) as Record<string, string> | null
    },
  })
}

/* ------------------------------------------------------- MLM network */

const MEMBER_SELECT = `
  *,
  rank:ranks!profiles_rank_id_fkey ( id, name, seniority, own_sale_rate, active, description ),
  referrer:profiles!profiles_referrer_id_fkey ( id, full_name, member_code ),
  placement_parent:profiles!profiles_placement_parent_id_fkey ( id, full_name, member_code )
`

/** Every network member (excludes pure customers). Used by Members / Tree / Genealogy. */
export function useMembers() {
  return useQuery({
    queryKey: ['members'],
    queryFn: async () =>
      unwrap<Profile[]>(
        await supabase
          .from('profiles')
          .select(MEMBER_SELECT)
          .is('deleted_at', null)
          .not('member_code', 'is', null)
          .order('member_code'),
      ),
  })
}

/** One member by their public member_code, with rank + referrer + placement. */
export function useMemberByCode(code: string | undefined) {
  return useQuery({
    queryKey: ['member', code],
    enabled: Boolean(code),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select(MEMBER_SELECT).eq('member_code', code!).maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as Profile | null
    },
  })
}

/** One member by their profile id (with rank + referrer + placement + welcome_letter). */
export function useMemberById(id: string | undefined) {
  return useQuery({
    queryKey: ['member-by-id', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select(MEMBER_SELECT).eq('id', id!).maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as Profile | null
    },
  })
}

export interface LedgerEntry { id: string; member_id: string; kind: string; source: string | null; reference: string | null; amount: number; note: string | null; created_at: string }
export interface Withdrawal { id: string; member_id: string; amount: number; account: string | null; utr: string | null; status: string; requested_at: string; processed_at: string | null; note: string | null }

export function useMemberLedger(memberId: string | undefined) {
  return useQuery({
    queryKey: ['member-ledger', memberId],
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<LedgerEntry[]>(await supabase.from('member_ledger').select('*').eq('member_id', memberId!).order('created_at', { ascending: false })),
  })
}

export function useMemberWithdrawals(memberId: string | undefined) {
  return useQuery({
    queryKey: ['member-withdrawals', memberId],
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<Withdrawal[]>(await supabase.from('withdrawals').select('*').eq('member_id', memberId!).order('requested_at', { ascending: false })),
  })
}

export function useAddLedgerEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { member_id: string; kind: string; source?: string; reference?: string; amount: number; note?: string }) => {
      const { error } = await supabase.from('member_ledger').insert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['member-ledger', v.member_id] }),
  })
}

export function useAddWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { member_id: string; amount: number; account?: string; status?: string; note?: string }) => {
      const { error } = await supabase.from('withdrawals').insert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['member-withdrawals', v.member_id] }),
  })
}

/**
 * Admin decision on a payout request. A rejection reason is mandatory — the
 * member always sees why, which is the single biggest driver of repeat calls
 * to the office when it is missing.
 */
export function useUpdateWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      member_id,
      status,
      utr,
      reject_reason,
      payout_reference,
    }: {
      id: string
      member_id: string
      status?: 'requested' | 'approved' | 'paid' | 'rejected'
      utr?: string
      reject_reason?: string
      payout_reference?: string
    }) => {
      void member_id
      if (status === 'rejected' && !reject_reason?.trim()) {
        throw new Error('A reason is required when rejecting a withdrawal')
      }
      // The stamps and the rules are the trigger's job now
      // (app.withdrawals_guard): it sets approved_at / paid_at / processed_at
      // / processed_by, refuses an illegal transition, and requires a reason
      // to reject and a reference to pay. The check above stays as a courtesy
      // so the office sees the message before the round trip.
      const patch: Record<string, unknown> = {}
      if (status) patch.status = status
      if (utr !== undefined) patch.utr = utr
      if (reject_reason !== undefined) patch.reject_reason = reject_reason
      if (payout_reference !== undefined) patch.payout_reference = payout_reference

      const { error } = await supabase.from('withdrawals').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['member-withdrawals', v.member_id] })
      void qc.invalidateQueries({ queryKey: ['sponsor-withdrawals', v.member_id] })
      void qc.invalidateQueries({ queryKey: ['sponsor-wallet', v.member_id] })
      void qc.invalidateQueries({ queryKey: ['withdrawal-queue'] })
      void qc.invalidateQueries({ queryKey: ['payout-batch'] })
      void qc.invalidateQueries({ queryKey: ['network-totals'] })
    },
  })
}

/**
 * Run the income engine for a confirmed booking: direct income to the seller
 * and level income up the sponsor chain, with TDS and the admin charge stored
 * on every row. Idempotent — a booking is only ever distributed once.
 */
export function useDistributeIncome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc('distribute_sale_income', { p_booking: bookingId })
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member-ledger'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-ledger'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-wallet'] })
    },
  })
}

/** Credit the monthly rank salary. Safe to re-run for the same month. */
export function useCreditSalary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('credit_monthly_salary', {})
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member-ledger'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-ledger'] })
    },
  })
}

/** Reverse everything a cancelled sale paid out. The original rows stay. */
export function useReverseIncome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc('reverse_sale_income', { p_booking: bookingId })
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member-ledger'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-ledger'] })
    },
  })
}

export function useSetMemberFrozen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, frozen }: { id: string; frozen: boolean; code?: string }) => {
      const { error } = await supabase.from('profiles').update({ frozen }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: ['member', v.code] }); void qc.invalidateQueries({ queryKey: ['members'] }) },
  })
}

export function useSaveWelcomeLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, letter }: { id: string; letter: Record<string, unknown> | null; code?: string }) => {
      const { error } = await supabase.from('profiles').update({ welcome_letter: letter }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['member', v.code] }),
  })
}

export function useRecalculateNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('recalculate_network')
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

export function useRecalculateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('recalculate_member', { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

/** Admin toggles a member's account status (active / suspended). */
export function useSetMemberStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'suspended' }) => {
      const { error } = await supabase.from('profiles').update({ status }).eq('id', id)
      if (error) throw new Error(error.message)

      // Approving a sign-up is the first time an account goes active, and that
      // is the date worth keeping. `is('approved_at', null)` means re-activating
      // a suspended member leaves the original approval date alone.
      if (status === 'active') {
        const { error: stampError } = await supabase
          .from('profiles')
          .update({ approved_at: new Date().toISOString() })
          .eq('id', id)
          .is('approved_at', null)
        if (stampError) throw new Error(stampError.message)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })
}

export interface NewMemberInput {
  full_name: string
  email: string
  password: string
  phone?: string
  referrer_id?: string | null
  placement_parent_id?: string | null
  rank_id?: string | null
  city?: string
  state?: string
  pincode?: string
}

/** Admin adds a new member (creates the login + wires sponsor/placement). */
export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewMemberInput) => {
      const { data, error } = await supabase.functions.invoke('create-member', { body: input })
      if (error) throw new Error(error.message)
      if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error)
      return data as { member_code: string | null }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

/** Admin resets a member's login password. */
export function useSetMemberPassword() {
  return useMutation({
    mutationFn: async ({ memberId, password }: { memberId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke('set-member-password', {
        body: { member_id: memberId, password },
      })
      if (error) throw new Error(error.message)
      if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error)
    },
  })
}

/** Admin soft-deletes a member. */
export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
  })
}

/* --------------------------------------------------- referral requests */

export interface ReferralRequest {
  id: string
  sponsor_id: string
  full_name: string
  mobile: string
  email: string | null
  city: string | null
  state: string | null
  status: 'invited' | 'registered' | 'active' | 'rejected'
  reject_reason: string | null
  member_id: string | null
  created_at: string
  joined_at: string | null
  sponsor?: Pick<Profile, 'id' | 'full_name' | 'member_code'> | null
}

/**
 * The company side of "Refer a Member": everything members have submitted from
 * their own panel, waiting for the office to act on it.
 */
export function useReferralQueue(status?: string) {
  return useQuery({
    queryKey: ['referral-queue', status],
    queryFn: async () => {
      let q = supabase
        .from('referral_requests')
        .select('*, sponsor:profiles!referral_requests_sponsor_id_fkey ( id, full_name, member_code )')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      return unwrap<ReferralRequest[]>(await q)
    },
  })
}

/** Decide a referral. A rejection reason is mandatory — the member is shown it. */
export function useDecideReferral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reject_reason,
      member_id,
    }: {
      id: string
      status: 'registered' | 'active' | 'rejected'
      reject_reason?: string
      member_id?: string
    }) => {
      if (status === 'rejected' && !reject_reason?.trim()) {
        throw new Error('A reason is required when rejecting a referral')
      }
      const patch: Record<string, unknown> = { status }
      if (reject_reason !== undefined) patch.reject_reason = reject_reason
      if (member_id) patch.member_id = member_id
      if (status === 'active') patch.joined_at = new Date().toISOString()

      const { error } = await supabase.from('referral_requests').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referral-queue'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-referrals'] })
    },
  })
}

/* ------------------------------------------------- payouts & network ops */

export interface QueuedWithdrawal {
  id: string
  member_id: string
  member_code: string | null
  member_name: string
  amount: number
  account: string | null
  status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'
  utr: string | null
  payout_reference: string | null
  reject_reason: string | null
  requested_at: string
  processed_at: string | null
  kyc_status: string
  available: number
}

/** Every payout request across the network — the office's working queue. */
export function useWithdrawalQueue(status?: string) {
  return useQuery({
    queryKey: ['withdrawal-queue', status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('withdrawal_queue', { p_status: status ?? null })
      if (error) throw new Error(error.message)
      return (data ?? []) as QueuedWithdrawal[]
    },
  })
}

export interface NetworkTotals {
  members: number
  active_members: number
  credited: number
  paid_out: number
  pending_payout: number
  liability: number
  open_requests: number
  undistributed_sales: number
}

/** What the company owes and what is waiting to be done. */
export function useNetworkTotals() {
  return useQuery({
    queryKey: ['network-totals'],
    queryFn: async (): Promise<NetworkTotals | null> => {
      const { data, error } = await supabase.rpc('network_totals')
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      if (!row) return null
      return {
        members: Number(row.members ?? 0),
        active_members: Number(row.active_members ?? 0),
        credited: Number(row.credited ?? 0),
        paid_out: Number(row.paid_out ?? 0),
        pending_payout: Number(row.pending_payout ?? 0),
        liability: Number(row.liability ?? 0),
        open_requests: Number(row.open_requests ?? 0),
        undistributed_sales: Number(row.undistributed_sales ?? 0),
      }
    },
  })
}

/** The one balance formula, server-side, for the admin member view. */
export function useMemberWallet(memberId: string | undefined) {
  return useQuery({
    queryKey: ['member-wallet', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('member_wallet', { p_member: memberId })
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      return {
        credited: Number(row?.credited ?? 0),
        withdrawn: Number(row?.withdrawn ?? 0),
        pending: Number(row?.pending ?? 0),
        available: Number(row?.available ?? 0),
      }
    },
  })
}

/** Promote everyone who now qualifies. Never demotes. */
export function useRankReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId?: string) => {
      if (memberId) {
        const { data, error } = await supabase.rpc('recalculate_rank', { p_member: memberId })
        if (error) throw new Error(error.message)
        return data as string | null
      }
      const { data, error } = await supabase.rpc('recalculate_all_ranks')
      if (error) throw new Error(error.message)
      return String(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members'] })
      void qc.invalidateQueries({ queryKey: ['member'] })
      void qc.invalidateQueries({ queryKey: ['rank-history'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-profile'] })
    },
  })
}

export interface RankChange {
  id: string
  created_at: string
  reason: string | null
  from_rank?: { name: string } | null
  to_rank?: { name: string } | null
}

export function useRankHistory(memberId: string | undefined) {
  return useQuery({
    queryKey: ['rank-history', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      // Two FKs to `ranks` on this table, so both embeds are named explicitly —
      // an ambiguous embed returns 300 Multiple Choices and silently empties the list.
      const { data, error } = await supabase
        .from('rank_history')
        .select('id, created_at, reason, from_rank:ranks!rank_history_from_rank_fkey ( name ), to_rank:ranks!rank_history_to_rank_fkey ( name )')
        .eq('member_id', memberId!)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as RankChange[]
    },
  })
}

/** Everything a member did that changed data — powers the History tab. */
export function useMemberAudit(memberId: string | undefined) {
  return useQuery({
    queryKey: ['member-audit', memberId],
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<AuditEntry[]>(
        await supabase
          .from('audit_log')
          .select('*')
          .eq('actor_id', memberId!)
          .order('at', { ascending: false })
          .limit(100),
      ),
  })
}

/* ------------------------------------------------------------ messages */

export function useThreads(filters: { status?: string } = {}) {
  return useQuery({
    queryKey: ['threads', filters],
    queryFn: async () => {
      let q = supabase.from('message_threads').select('*').order('last_message_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status)
      return unwrap<MessageThread[]>(await q)
    },
  })
}

export function useMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ['messages', threadId],
    enabled: Boolean(threadId),
    queryFn: async () =>
      unwrap<Message[]>(
        await supabase
          .from('messages')
          .select('*, sender:profiles ( id, full_name, role )')
          .eq('thread_id', threadId!)
          .order('created_at'),
      ),
  })
}

/* ----------------------------------------------------------- audit log */

export function useAuditLog(filters: { entity?: string; actorId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: async () => {
      let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(filters.limit ?? 200)
      if (filters.entity) q = q.eq('entity', filters.entity)
      if (filters.actorId) q = q.eq('actor_id', filters.actorId)
      return unwrap<AuditEntry[]>(await q)
    },
  })
}

/* ------------------------------------------------- collections (Payments CRM) */

export interface CollectionQueueRow {
  booking_id: string
  reference: string
  sale_value: number
  token_amount: number
  collected: number
  outstanding: number
  emi_total: number
  emi_paid: number
  emi_overdue: number
  next_due: string | null
  customer_name: string | null
  customer_phone: string | null
  rep_name: string | null
  rep_code: string | null
  project_name: string | null
  plot_number: string | null
}

/**
 * What every confirmed sale still owes.
 *
 * "Collected" is the sum of `payments`, not a count of instalments marked
 * paid. The two used to disagree: the admin screen added up EMI rows while
 * the member's panel and my_reward_area() added up receipts, so a sale could
 * look settled to the office and unpaid to the member. One definition now,
 * server-side, shared by both.
 */
export function useCollectionQueue() {
  return useQuery({
    queryKey: ['collection-queue'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('collection_queue')
      if (error) throw new Error(error.message)
      return (data ?? []) as CollectionQueueRow[]
    },
  })
}

export interface RecordPaymentInput {
  bookingId: string
  amount: number
  mode?: string
  reference?: string
  paidOn?: string
  receiptNo?: string
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const { data, error } = await supabase.rpc('record_payment', {
        p_booking: input.bookingId,
        p_amount: input.amount,
        p_mode: input.mode ?? 'bank_transfer',
        p_reference: input.reference ?? null,
        p_paid_on: input.paidOn ?? null,
        p_emi_id: null,
        p_receipt: input.receiptNo ?? null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collection-queue'] })
      void qc.invalidateQueries({ queryKey: ['crm-emis'] })
      // The member's own screens and their reward progress both move on this.
      void qc.invalidateQueries({ queryKey: ['sponsor-payments'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-emis'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-reward-area'] })
    },
  })
}

/** Move pending instalments past their due date into `overdue`. */
export function useAgeOverdueEmis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('age_overdue_emis')
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collection-queue'] })
      void qc.invalidateQueries({ queryKey: ['crm-emis'] })
    },
  })
}

/** Totals for the office payout run: what is queued, what went out today. */
export interface PayoutBatch {
  approved_count: number
  approved_amount: number
  requested_count: number
  requested_amount: number
  paid_today_count: number
  paid_today_amount: number
  blocked_no_kyc: number
}

export function usePayoutBatch() {
  return useQuery({
    queryKey: ['payout-batch'],
    queryFn: async (): Promise<PayoutBatch | null> => {
      const { data, error } = await supabase.rpc('payout_batch')
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      if (!row) return null
      return {
        approved_count: Number(row.approved_count ?? 0),
        approved_amount: Number(row.approved_amount ?? 0),
        requested_count: Number(row.requested_count ?? 0),
        requested_amount: Number(row.requested_amount ?? 0),
        paid_today_count: Number(row.paid_today_count ?? 0),
        paid_today_amount: Number(row.paid_today_amount ?? 0),
        blocked_no_kyc: Number(row.blocked_no_kyc ?? 0),
      }
    },
  })
}

/* --------------------------------------------------------- support unread */

export interface UnreadThread {
  thread_id: string
  unread: number
  last_message_at: string
}

/**
 * Which conversations have something the caller has not seen.
 *
 * `read_at` existed on thread_participants from the start and nothing ever
 * wrote it, so there was no unread state anywhere in the product.
 */
export function useUnreadThreads() {
  return useQuery({
    queryKey: ['unread-threads'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_unread_threads')
      if (error) throw new Error(error.message)
      return (data ?? []) as UnreadThread[]
    },
    refetchInterval: 60_000,
  })
}

export function useMarkThreadRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase.rpc('mark_thread_read', { p_thread: threadId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['unread-threads'] }),
  })
}
