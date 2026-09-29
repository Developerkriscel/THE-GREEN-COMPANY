import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * The announcement bar: sale / offer lines across the top of the website and
 * the panels, written by the office in Website CMS → Announcement bar.
 */

export type AnnouncementTheme = 'gold' | 'sale' | 'festive' | 'leaf' | 'midnight' | 'royal'
export type AnnouncementPlace = 'website' | 'sponsor' | 'customer'

export interface Announcement {
  id: string
  message: string
  badge: string | null
  emoji: string | null
  coupon_code: string | null
  cta_label: string | null
  cta_link: string | null
  theme: AnnouncementTheme
  show_countdown: boolean
  show_website: boolean
  show_sponsor: boolean
  show_customer: boolean
  starts_at: string | null
  ends_at: string | null
  active: boolean
  sort_order: number
}

export const THEMES: { value: AnnouncementTheme; label: string }[] = [
  { value: 'gold', label: 'Royal gold' },
  { value: 'sale', label: 'Hot sale (red)' },
  { value: 'festive', label: 'Festive' },
  { value: 'leaf', label: 'Green' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'royal', label: 'Royal purple' },
]

/** Inside its display window? An unparseable date counts as "no bound". */
export function announcementIsLive(a: Pick<Announcement, 'active' | 'starts_at' | 'ends_at'>, now = Date.now()) {
  if (!a.active) return false
  const s = a.starts_at ? Date.parse(a.starts_at) : NaN
  const e = a.ends_at ? Date.parse(a.ends_at) : NaN
  if (!Number.isNaN(s) && now < s) return false
  if (!Number.isNaN(e) && now > e) return false
  return true
}

const COLUMN: Record<AnnouncementPlace, 'show_website' | 'show_sponsor' | 'show_customer'> = {
  website: 'show_website', sponsor: 'show_sponsor', customer: 'show_customer',
}

/** Live items for one place. Re-read every two minutes so a sale switched on shows up without a reload. */
export function useAnnouncements(place: AnnouncementPlace) {
  return useQuery({
    queryKey: ['announcements', place],
    queryFn: async () => {
      const { data, error } = await supabase.from('cms_announcements').select('*')
        .eq('active', true).eq(COLUMN[place], true).order('sort_order')
      if (error) throw new Error(error.message)
      return (data ?? []) as Announcement[]
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  })
}

/* ---------------------------------------------------------------- office */

export function useAllAnnouncements() {
  return useQuery({
    queryKey: ['announcements', 'admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cms_announcements').select('*').order('sort_order').order('created_at')
      if (error) throw new Error(error.message)
      return (data ?? []) as Announcement[]
    },
  })
}

export function useSaveAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Partial<Announcement> & { message: string }) => {
      const { id, ...rest } = a
      const res = id
        ? await supabase.from('cms_announcements').update(rest).eq('id', id)
        : await supabase.from('cms_announcements').insert(rest)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cms_announcements').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}
