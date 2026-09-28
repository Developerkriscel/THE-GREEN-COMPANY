import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Customers: plot buyers, their panel, and the office's Customers module.
 *
 * Everything a customer sees is scoped by row security: their bookings
 * (bookings_select_customer), the instalments, payments and documents on
 * those bookings (owns_booking), their own details, offers and feedback.
 */

export type GuardianRelation = 'S/O' | 'D/O' | 'W/O' | 'C/O'
export type StageStatus = 'pending' | 'in_progress' | 'done'

export const STAGE_LABEL: Record<StageStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
}

export interface CustomerDetails {
  customer_id: string
  guardian_relation: GuardianRelation | null
  guardian_name: string | null
  alt_phone: string | null
  rm_id: string | null
  rm_name: string | null
  rm_phone: string | null
  referred_by_name: string | null
  referred_by_phone: string | null
  created_at: string
}

export interface CustomerProfile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  user_code: string | null
  status: string
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  notes: string | null
  avatar_path: string | null
  created_at: string
}

export interface CustomerBooking {
  id: string
  reference: string
  status: string
  sale_value: number
  token_amount: number
  payment_plan: string | null
  emi_count: number | null
  emi_start: string | null
  registry_status: StageStatus
  registry_at: string | null
  mutation_status: StageStatus
  mutation_at: string | null
  possession_status: StageStatus
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  created_at: string
  plot: { id: string; number: string; size: number | null; size_unit: string | null; dimensions: string | null; facing: string | null } | null
  project: { id: string; name: string; location: string | null; city: string | null; hero_image: string | null } | null
  rep: { id: string; full_name: string; member_code: string | null; phone: string | null } | null
}

export interface CustomerEmi {
  id: string
  booking_id: string
  seq: number
  due_date: string
  amount: number
  status: 'pending' | 'awaiting_verification' | 'paid' | 'overdue' | 'rejected'
  slip_path: string | null
  slip_uploaded_at: string | null
  paid_at: string | null
  reject_reason: string | null
}

export interface CustomerPayment {
  id: string
  booking_id: string
  emi_id: string | null
  amount: number
  mode: string
  reference: string | null
  paid_on: string
  receipt_no: string | null
}

export interface CustomerDocument {
  id: string
  booking_id: string | null
  owner_id: string | null
  type: string
  title: string
  storage_path: string
  size_bytes: number | null
  created_at: string
}

export interface CustomerOffer {
  id: string
  title: string
  body: string | null
  image_url: string | null
  cta_label: string | null
  cta_link: string | null
  valid_until: string | null
  active: boolean
  customer_id: string | null
  created_at: string
}

export interface CustomerFeedback {
  id: string
  customer_id: string
  booking_id: string | null
  rating: number | null
  message: string
  status: 'new' | 'seen' | 'replied'
  admin_reply: string | null
  replied_at: string | null
  created_at: string
  customer?: { full_name: string; user_code: string | null; phone: string | null } | null
}

/** Papers the office uploads to the registry bucket; everything else was generated into `documents`. */
export const UPLOAD_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'registry', label: 'Registry' },
  { value: 'mutation', label: 'Mutation' },
  { value: 'plot_photo', label: 'Plot photo' },
  { value: 'allotment_letter', label: 'Allotment letter' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'possession_letter', label: 'Possession letter' },
  { value: 'other', label: 'Other' },
]
export const DOC_LABEL: Record<string, string> = {
  ...Object.fromEntries(UPLOAD_DOC_TYPES.map((d) => [d.value, d.label])),
  welcome_letter: 'Welcome letter',
  booking_form: 'Booking form',
  receipt: 'Payment receipt',
  brochure: 'Brochure',
}
const GENERATED = new Set(['welcome_letter', 'booking_form', 'receipt'])
export const docBucket = (type: string) => (GENERATED.has(type) ? 'documents' : 'registry')

const BOOKING_SELECT = `
  id, reference, status, sale_value, token_amount, payment_plan, emi_count, emi_start,
  registry_status, registry_at, mutation_status, mutation_at, possession_status,
  customer_id, customer_name, customer_phone, created_at,
  plot:plots ( id, number, size, size_unit, dimensions, facing ),
  project:projects ( id, name, location, city, hero_image ),
  rep:profiles!bookings_rep_id_fkey ( id, full_name, member_code, phone )
`

const unwrap = <T,>(r: { data: unknown; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as T
}

/* =================================================================== admin */

export interface CustomerListRow extends CustomerProfile {
  details: CustomerDetails | null
  bookings: { id: string; sale_value: number; status: string }[]
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const [people, details, bookings] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, email, phone, user_code, status, address, city, state, pincode, notes, avatar_path, created_at')
          .eq('role', 'customer').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('customer_details').select('*'),
        supabase.from('bookings').select('id, customer_id, sale_value, status').not('customer_id', 'is', null).is('deleted_at', null),
      ])
      const ps = unwrap<CustomerProfile[]>(people)
      const ds = new Map(unwrap<CustomerDetails[]>(details).map((d) => [d.customer_id, d]))
      const bs = unwrap<{ id: string; customer_id: string; sale_value: number; status: string }[]>(bookings)
      return ps.map((p) => ({
        ...p,
        details: ds.get(p.id) ?? null,
        bookings: bs.filter((b) => b.customer_id === p.id),
      })) as CustomerListRow[]
    },
  })
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customer', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [p, d] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, email, phone, user_code, status, address, city, state, pincode, notes, avatar_path, created_at')
          .eq('id', id!).maybeSingle(),
        supabase.from('customer_details').select('*').eq('customer_id', id!).maybeSingle(),
      ])
      if (p.error) throw new Error(p.error.message)
      return { profile: p.data as CustomerProfile | null, details: (d.data ?? null) as CustomerDetails | null }
    },
  })
}

export interface NewCustomer {
  full_name: string
  phone: string
  email?: string
  password: string
  guardian_relation?: GuardianRelation | ''
  guardian_name?: string
  alt_phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  rm_id?: string
  rm_name?: string
  rm_phone?: string
  referred_by_name?: string
  referred_by_phone?: string
  notes?: string
}

async function invokeFn<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.message ?? detail?.error ?? error.message)
  }
  return data as T
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: NewCustomer) => invokeFn<{ id: string; user_code: string }>('create-customer', c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useSaveCustomer(id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { profile: Partial<CustomerProfile>; details: Partial<CustomerDetails> }) => {
      if (!id) throw new Error('No customer')
      const { error: pe } = await supabase.from('profiles').update(v.profile).eq('id', id)
      if (pe) throw new Error(pe.message)
      const { error: de } = await supabase.from('customer_details')
        .upsert({ customer_id: id, ...v.details, updated_at: new Date().toISOString() }, { onConflict: 'customer_id' })
      if (de) throw new Error(de.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customer', id] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useSetCustomerPassword() {
  return useMutation({
    mutationFn: (v: { member_id: string; password: string }) => invokeFn('set-member-password', v),
  })
}

/** Bookings of one customer (admin) or of the signed-in customer (panel). */
export function useCustomerBookings(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-bookings', customerId],
    enabled: Boolean(customerId),
    queryFn: async () =>
      unwrap<CustomerBooking[]>(
        await supabase.from('bookings').select(BOOKING_SELECT)
          .eq('customer_id', customerId!).is('deleted_at', null).order('created_at', { ascending: false }),
      ),
  })
}

/** Bookings not yet tied to a customer account, for the office to link. */
export function useUnlinkedBookings(enabled: boolean) {
  return useQuery({
    queryKey: ['unlinked-bookings'],
    enabled,
    queryFn: async () =>
      unwrap<CustomerBooking[]>(
        await supabase.from('bookings').select(BOOKING_SELECT)
          .is('customer_id', null).is('deleted_at', null).neq('status', 'cancelled')
          .order('created_at', { ascending: false }).limit(300),
      ),
  })
}

export function useLinkBooking(customerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.from('bookings').update({ customer_id: customerId }).eq('id', bookingId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customer-bookings', customerId] })
      void qc.invalidateQueries({ queryKey: ['unlinked-bookings'] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useCreateCustomerBooking(customerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      plotId: string; saleValue: number; tokenAmount: number; emiCount: number; emiStart: string | null; repId: string | null
    }) => {
      const { data, error } = await supabase.rpc('admin_create_customer_booking', {
        p_customer_id: customerId,
        p_plot_id: v.plotId,
        p_sale_value: v.saleValue,
        p_token_amount: v.tokenAmount,
        p_payment_plan: v.emiCount > 0 ? 'emi' : 'full',
        p_emi_count: v.emiCount || null,
        p_emi_amount: null,
        p_emi_start: v.emiStart,
        p_rep_id: v.repId,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customer-bookings', customerId] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['available-plots'] })
    },
  })
}

export function useUpdateBookingStages(customerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; registry_status?: StageStatus; mutation_status?: StageStatus; possession_status?: StageStatus }) => {
      const { id, ...patch } = v
      const stamp: Record<string, string | null> = {}
      if (patch.registry_status) stamp.registry_at = patch.registry_status === 'done' ? new Date().toISOString() : null
      if (patch.mutation_status) stamp.mutation_at = patch.mutation_status === 'done' ? new Date().toISOString() : null
      const { error } = await supabase.from('bookings').update({ ...patch, ...stamp }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-bookings', customerId] }),
  })
}

/* ============================================= instalments, payments, papers */

export function useBookingEmis(bookingIds: string[]) {
  return useQuery({
    queryKey: ['customer-emis', bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () =>
      unwrap<CustomerEmi[]>(
        await supabase.from('emis')
          .select('id, booking_id, seq, due_date, amount, status, slip_path, slip_uploaded_at, paid_at, reject_reason')
          .in('booking_id', bookingIds).order('seq'),
      ),
  })
}

export function useBookingPayments(bookingIds: string[]) {
  return useQuery({
    queryKey: ['customer-payments', bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () =>
      unwrap<CustomerPayment[]>(
        await supabase.from('payments')
          .select('id, booking_id, emi_id, amount, mode, reference, paid_on, receipt_no')
          .in('booking_id', bookingIds).order('paid_on', { ascending: false }),
      ),
  })
}

export function useBookingDocuments(bookingIds: string[]) {
  return useQuery({
    queryKey: ['customer-docs', bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () =>
      unwrap<CustomerDocument[]>(
        await supabase.from('documents')
          .select('id, booking_id, owner_id, type, title, storage_path, size_bytes, created_at')
          .in('booking_id', bookingIds).order('created_at', { ascending: false }),
      ),
  })
}

/** The office uploads a paper (registry, mutation, plot photo…) for a booking. */
export function useUploadCustomerDoc(customerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { bookingId: string; type: string; title: string; file: File }) => {
      if (v.file.size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB.')
      if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(v.file.type)) {
        throw new Error('Upload a PDF or a photo (JPG, PNG, WebP).')
      }
      const ext = v.file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
      const path = `${v.bookingId}/${v.type}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('registry').upload(path, v.file, { contentType: v.file.type })
      if (upErr) throw new Error(upErr.message)
      const { error } = await supabase.from('documents').insert({
        booking_id: v.bookingId,
        owner_id: customerId ?? null,
        type: v.type,
        title: v.title.trim() || DOC_LABEL[v.type] || 'Document',
        storage_path: path,
        size_bytes: v.file.size,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-docs'] }),
  })
}

export function useDeleteCustomerDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: CustomerDocument) => {
      const { error } = await supabase.from('documents').delete().eq('id', d.id)
      if (error) throw new Error(error.message)
      await supabase.storage.from(docBucket(d.type)).remove([d.storage_path]).catch(() => {})
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-docs'] }),
  })
}

/** The customer uploads a payment slip for an instalment; the office verifies it in Payments CRM. */
export function useUploadEmiSlip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { emi: CustomerEmi; file: File; reference?: string }) => {
      if (v.file.size > 5 * 1024 * 1024) throw new Error('That file is over 5 MB.')
      if (!/^(application\/pdf|image\/(png|jpeg))$/.test(v.file.type)) throw new Error('Upload a PDF, JPG or PNG.')
      const ext = v.file.type === 'application/pdf' ? 'pdf' : v.file.type === 'image/png' ? 'png' : 'jpg'
      const path = `${v.emi.booking_id}/emi-${v.emi.seq}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('emi-slips').upload(path, v.file, { contentType: v.file.type })
      if (upErr) throw new Error(upErr.message)
      const { error } = await supabase.from('emis').update({
        slip_path: path,
        slip_uploaded_at: new Date().toISOString(),
        status: 'awaiting_verification',
        reference: v.reference?.trim() || null,
      }).eq('id', v.emi.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-emis'] }),
  })
}

/* ================================================================= offers */

export function useCustomerOffers(opts: { all?: boolean } = {}) {
  return useQuery({
    queryKey: ['customer-offers', opts.all ?? false],
    queryFn: async () =>
      unwrap<CustomerOffer[]>(
        await supabase.from('customer_offers').select('*').order('created_at', { ascending: false }),
      ),
  })
}

export function useSaveOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: Partial<CustomerOffer> & { title: string }) => {
      const { id, ...rest } = o
      const res = id
        ? await supabase.from('customer_offers').update(rest).eq('id', id)
        : await supabase.from('customer_offers').insert(rest)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-offers'] }),
  })
}

export function useDeleteOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customer_offers').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-offers'] }),
  })
}

/* =============================================================== feedback */

export function useFeedback(customerId?: string) {
  return useQuery({
    queryKey: ['customer-feedback', customerId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('customer_feedback')
        .select('*, customer:profiles!customer_feedback_customer_id_fkey ( full_name, user_code, phone )')
        .order('created_at', { ascending: false })
      if (customerId) q = q.eq('customer_id', customerId)
      return unwrap<CustomerFeedback[]>(await q)
    },
  })
}

export function useSendFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { rating: number | null; message: string; booking_id?: string | null }) => {
      const { error } = await supabase.from('customer_feedback').insert({
        rating: v.rating, message: v.message.trim(), booking_id: v.booking_id ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-feedback'] }),
  })
}

export function useReplyFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; reply: string }) => {
      const { error } = await supabase.from('customer_feedback').update({
        admin_reply: v.reply.trim(), status: 'replied', replied_at: new Date().toISOString(),
      }).eq('id', v.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customer-feedback'] }),
  })
}

/* ======================================================== customer's own */

export function useMyContacts() {
  return useQuery({
    queryKey: ['my-customer-contacts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_customer_contacts')
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as { rm_name: string | null; rm_phone: string | null; rm_code: string | null }[]
      return rows[0] ?? null
    },
  })
}

export function useMyReferrals() {
  return useQuery({
    queryKey: ['my-customer-referrals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_customer_referrals')
      if (error) throw new Error(error.message)
      return (data ?? []) as { name: string; mobile: string; status: string; created_at: string }[]
    },
  })
}

export function useReferSomeone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { name: string; mobile: string; note?: string }) => {
      const { data, error } = await supabase.rpc('customer_refer', { p_name: v.name, p_mobile: v.mobile, p_note: v.note ?? null })
      if (error) throw new Error(error.message)
      return data as { ok: boolean; duplicate: boolean }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-customer-referrals'] }),
  })
}

/** Referral leads a customer brought in (office view). */
export function useCustomerReferralLeads(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-referral-leads', customerId],
    enabled: Boolean(customerId),
    queryFn: async () =>
      unwrap<{ id: string; name: string; mobile: string; status: string; created_at: string; owner: { full_name: string } | null }[]>(
        await supabase.from('leads')
          .select('id, name, mobile, status, created_at, owner:profiles!leads_owner_id_fkey ( full_name )')
          .eq('referred_by_customer', customerId!).is('deleted_at', null).order('created_at', { ascending: false }),
      ),
  })
}

/* ================================================================ totals */

export function bookingMoney(b: CustomerBooking, emis: CustomerEmi[], payments: CustomerPayment[]) {
  const mine = emis.filter((e) => e.booking_id === b.id)
  const paid = payments.filter((p) => p.booking_id === b.id).reduce((t, p) => t + Number(p.amount), 0)
    + Number(b.token_amount ?? 0)
  const value = Number(b.sale_value ?? 0)
  const today = new Date().toISOString().slice(0, 10)
  const open = mine.filter((e) => e.status !== 'paid')
  const overdue = open.filter((e) => e.due_date < today)
  const next = open.filter((e) => e.status !== 'awaiting_verification').sort((a, z) => a.due_date.localeCompare(z.due_date))[0] ?? null
  return {
    value,
    paid: Math.min(paid, value),
    outstanding: Math.max(0, value - paid),
    pct: value > 0 ? Math.min(100, Math.round((paid / value) * 100)) : 0,
    overdue,
    next,
    emis: mine,
  }
}
