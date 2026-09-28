import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { CustomerDetails } from '@/lib/customers'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { BRAND } from '@/lib/brand'
import { date } from '@/lib/format'

/** The customer's own record, as the office holds it. Changes go through the office. */
export function CustomerProfile() {
  const { profile } = useAuth()
  const { data: details } = useQuery({
    queryKey: ['my-customer-details', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data } = await supabase.from('customer_details').select('*').eq('customer_id', profile!.id).maybeSingle()
      return (data ?? null) as CustomerDetails | null
    },
  })
  const p = profile as (typeof profile & { address?: string | null; city?: string | null; state?: string | null; pincode?: string | null }) | null

  const rows: [string, string | null | undefined][] = [
    ['Customer ID', p?.user_code],
    ['Name', p?.full_name],
    [details?.guardian_relation ?? 'S/O', details?.guardian_name],
    ['Mobile', p?.phone],
    ['Alternate mobile', details?.alt_phone],
    ['E-mail', p?.email?.endsWith('@customers.symocity.app') ? null : p?.email],
    ['Address', [p?.address, p?.city, p?.state, p?.pincode].filter(Boolean).join(', ') || null],
    ['Customer since', p?.created_at ? date(p.created_at) : null],
  ]

  return (
    <>
      <PageHeader title="My profile" description="Your details as the office holds them." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Customer details" />
          <CardBody>
            <div className="mb-5 flex items-center gap-4">
              <span className="rounded-full bg-gold-metal p-[3px] shadow"><Avatar path={p?.avatar_path} name={p?.full_name} size={64} tone="brand" /></span>
              <div>
                <p className="text-lg font-bold text-brand-darker">{p?.full_name}</p>
                <p className="font-mono text-sm text-brand-gold-deep">{p?.user_code}</p>
              </div>
            </div>
            <dl className="divide-y divide-slate-100">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-3 py-2.5 text-sm">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium text-brand-darker">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-500">To change any of these, call the office on +91 {BRAND.phone} or tell your relationship manager.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sign-in" />
          <CardBody className="space-y-3 text-sm text-slate-600">
            <p>Sign in with your customer ID <b className="font-mono text-brand-darker">{p?.user_code}</b> or your mobile number.</p>
            <Link to="/customer/password" className="btn-gold rounded-lg px-4 py-2 text-sm"><KeyRound className="h-4 w-4" /> Change password</Link>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
