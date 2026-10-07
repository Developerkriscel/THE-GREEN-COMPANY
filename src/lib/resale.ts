import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tone } from '@/components/ui'

/**
 * Plot resale (migration 20260201005400). An owner asks to resell a
 * confirmed plot in the customer panel; the office reviews it on the Resale
 * desk, lists it (for sponsors, and on the website if chosen), collects
 * buyers' enquiries and finally transfers the booking to the buyer.
 * Seller identity never leaves the office: the public and sponsor lists come
 * from definer functions that return the plot, never the owner.
 */
export type ResaleStatus = 'submitted' | 'listed' | 'buyer_found' | 'transferred' | 'rejected' | 'withdrawn'

export const RESALE_STATUS: Record<ResaleStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Under review', tone: 'amber' },
  listed: { label: 'Listed for resale', tone: 'green' },
  buyer_found: { label: 'Buyer found', tone: 'blue' },
  transferred: { label: 'Transferred', tone: 'gold' },
  rejected: { label: 'Not approved', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}
export const OPEN_RESALE: ResaleStatus[] = ['submitted', 'listed', 'buyer_found']

/* ------------------------------------------------------------------ seller */

export interface MyResale {
  id: string
  reference: string
  booking_id: string
  status: ResaleStatus
  asking_price: number
  negotiable: boolean
  reason: string | null
  listed_price: number | null
  transfer_fee: number
  show_on_website: boolean
  office_note: string | null
  sold_price: number | null
  created_at: string
  reviewed_at: string | null
  listed_at: string | null
  transferred_at: string | null
  closed_at: string | null
  inquiries: number
}

export function useMyResales() {
  return useQuery({
    queryKey: ['my-resales'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customer_my_resales', {})
      if (error) throw new Error(error.message)
      return (data ?? []) as MyResale[]
    },
  })
}

export function useRequestResale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { bookingId: string; askingPrice: number; negotiable: boolean; reason: string }) => {
      const { data, error } = await supabase.rpc('customer_request_resale', {
        p_booking_id: v.bookingId, p_asking_price: v.askingPrice, p_negotiable: v.negotiable, p_reason: v.reason || null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-resales'] }) },
  })
}

export function useWithdrawResale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('customer_withdraw_resale', { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-resales'] }) },
  })
}

/* ------------------------------------------------------------------ office */

export interface AdminResale {
  id: string
  reference: string
  booking_id: string
  seller_id: string
  status: ResaleStatus
  asking_price: number
  negotiable: boolean
  reason: string | null
  listed_price: number | null
  transfer_fee: number
  show_on_website: boolean
  office_note: string | null
  sold_price: number | null
  buyer_id: string | null
  created_at: string
  reviewed_at: string | null
  listed_at: string | null
  transferred_at: string | null
  booking: {
    id: string; reference: string; sale_value: number; status: string
    plot: { number: string; size: number | null; size_unit: string; facing: string | null } | null
    project: { name: string; price_from: number | null; price_to: number | null } | null
  } | null
  seller: { full_name: string; user_code: string | null; phone: string | null } | null
  buyer: { full_name: string; user_code: string | null } | null
}

export function useAdminResales() {
  return useQuery({
    queryKey: ['admin-resales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resale_listings')
        .select(`*,
          booking:bookings!resale_listings_booking_id_fkey ( id, reference, sale_value, status,
            plot:plots ( number, size, size_unit, facing ), project:projects ( name, price_from, price_to ) ),
          seller:profiles!resale_listings_seller_id_fkey ( full_name, user_code, phone ),
          buyer:profiles!resale_listings_buyer_id_fkey ( full_name, user_code )`)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as AdminResale[]
    },
  })
}

export interface ResaleInquiry {
  id: string
  listing_id: string
  name: string
  phone: string
  message: string | null
  source: 'website' | 'sponsor' | 'office'
  sponsor_id: string | null
  status: 'new' | 'contacted' | 'closed'
  created_at: string
  sponsor?: { full_name: string; member_code: string | null } | null
}

/** Enquiries: all of them for the office; a sponsor's own for a sponsor (RLS). */
export function useResaleInquiries() {
  return useQuery({
    queryKey: ['resale-inquiries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resale_inquiries')
        .select('*, sponsor:profiles!resale_inquiries_sponsor_id_fkey ( full_name, member_code )')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as ResaleInquiry[]
    },
  })
}

function invalidateResale(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['admin-resales', 'resale-inquiries', 'resale-market', 'public-resale', 'my-resales']) {
    void qc.invalidateQueries({ queryKey: [k] })
  }
}

export function useAdminSetResale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: ResaleStatus; listedPrice?: number | null; transferFee?: number | null; showOnWebsite?: boolean | null; note?: string | null }) => {
      const { error } = await supabase.rpc('admin_set_resale', {
        p_id: v.id, p_status: v.status, p_listed_price: v.listedPrice ?? null, p_transfer_fee: v.transferFee ?? null,
        p_show_on_website: v.showOnWebsite ?? null, p_note: v.note ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateResale(qc),
  })
}

export function useAdminCompleteResale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; buyerId: string; soldPrice: number; note?: string | null }) => {
      const { error } = await supabase.rpc('admin_complete_resale', {
        p_id: v.id, p_buyer_id: v.buyerId, p_sold_price: v.soldPrice, p_note: v.note ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      invalidateResale(qc)
      void qc.invalidateQueries({ queryKey: ['customer-bookings'] })
    },
  })
}

export function useSetInquiryStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: ResaleInquiry['status'] }) => {
      const { error } = await supabase.rpc('admin_set_inquiry_status', { p_id: v.id, p_status: v.status })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['resale-inquiries'] }) },
  })
}

/* ----------------------------------------------------- website & sponsors */

export interface ResalePlot {
  id: string
  reference: string
  project_name: string | null
  project_slug: string | null
  location: string | null
  city: string | null
  plot_number: string | null
  size: number | null
  size_unit: string | null
  facing: string | null
  dimensions: string | null
  price: number
  negotiable: boolean
  listed_at: string | null
  hero_image?: string | null
  on_website?: boolean
  my_inquiries?: number
}

export function usePublicResale() {
  return useQuery({
    queryKey: ['public-resale'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_resale_listings', {})
      if (error) throw new Error(error.message)
      return (data ?? []) as ResalePlot[]
    },
  })
}

export function useResaleMarket() {
  return useQuery({
    queryKey: ['resale-market'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resale_market', {})
      if (error) throw new Error(error.message)
      return (data ?? []) as ResalePlot[]
    },
  })
}

export function useResaleInquire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { listingId: string; name: string; phone: string; message?: string }) => {
      const { data, error } = await supabase.rpc('resale_inquire', {
        p_listing_id: v.listingId, p_name: v.name, p_phone: v.phone, p_message: v.message || null,
      })
      if (error) throw new Error(error.message)
      return data as 'received' | 'already'
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['resale-market'] })
      void qc.invalidateQueries({ queryKey: ['resale-inquiries'] })
    },
  })
}

/** "Symo City · Plot 101 · 200 sq yd" */
export function resalePlotLabel(p: Pick<ResalePlot, 'project_name' | 'plot_number' | 'size' | 'size_unit'>) {
  return [p.project_name ?? 'Plot', p.plot_number ? `Plot ${p.plot_number}` : null, p.size ? `${Number(p.size)} ${p.size_unit === 'sqyd' ? 'sq yd' : p.size_unit ?? ''}`.trim() : null]
    .filter(Boolean).join(' · ')
}
