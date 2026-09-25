import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, Banknote, CalendarClock, ClipboardCheck, Crown, Inbox, ListChecks,
  Network, ShieldCheck, TrendingUp, Users, UserPlus, Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, CardHeader, PageHeader, Spinner, StatTile, Table, Td, Th } from '@/components/ui'
import { useMembers, useNetworkTotals, useWithdrawalQueue } from '@/lib/queries'
import { rankTone, statusTone } from '@/lib/network'
import { date, moneyShort, num } from '@/lib/format'
import { BRAND } from '@/lib/brand'

async function count(table: string, build?: (q: any) => any) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (build) q = build(q)
  const { count: c, error } = await q
  if (error) throw new Error(error.message)
  return c ?? 0
}

function startOf(period: 'day' | 'week' | 'month') {
  const d = new Date()
  if (period === 'day') d.setHours(0, 0, 0, 0)
  if (period === 'week') d.setDate(d.getDate() - 7)
  if (period === 'month') d.setDate(d.getDate() - 30)
  return d.toISOString()
}

export function AdminDashboard() {
  const { data: members = [], isLoading: membersLoading } = useMembers()
  const { data: totals } = useNetworkTotals()
  const { data: payouts = [] } = useWithdrawalQueue()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const [
        kycPending, ranksActive, bookingsPending2, bookingsPending3, salesConfirmed,
        leadsOpen, emisOverdue, emisAwaiting, threadsOpen, staffPending,
      ] = await Promise.all([
        count('kyc', (q) => q.eq('status', 'pending')),
        count('ranks', (q) => q.eq('active', true)),
        count('bookings', (q) => q.eq('status', 'step1_done')),
        count('bookings', (q) => q.eq('status', 'step2_approved')),
        count('bookings', (q) => q.eq('status', 'confirmed').is('deleted_at', null)),
        count('leads', (q) => q.not('status', 'in', '("converted","lost")').is('deleted_at', null)),
        count('emis', (q) => q.eq('status', 'overdue')),
        count('emis', (q) => q.eq('status', 'awaiting_verification')),
        count('message_threads', (q) => q.eq('status', 'open')),
        count('profiles', (q) => q.eq('status', 'pending')),
      ])

      // Confirmed sales live on `bookings` — that is what the income engine
      // distributes from. `sale_confirmations` is the older paperwork table and
      // reading it here reported ₹0 while members held lakhs.
      const { data: saleRows } = await supabase
        .from('bookings').select('sale_value').eq('status', 'confirmed').is('deleted_at', null)
      const saleValue = (saleRows ?? []).reduce((s, r) => s + Number(r.sale_value ?? 0), 0)

      const { data: commissionRows } = await supabase.from('commissions').select('net_amount, status')
      const payoutPending = (commissionRows ?? [])
        .filter((c) => c.status !== 'paid' && c.status !== 'cancelled')
        .reduce((s, c) => s + Number(c.net_amount ?? 0), 0)

      return { kycPending, ranksActive, bookingsPending2, bookingsPending3, salesConfirmed, leadsOpen, emisOverdue, emisAwaiting, threadsOpen, staffPending, saleValue, payoutPending }
    },
  })

  // Network figures computed from the member list.
  const paidThisMonth = payouts
    .filter((w) => w.status === 'paid' && (w.processed_at ?? '') >= startOf('month'))
    .reduce((n, w) => n + Number(w.amount ?? 0), 0)

  const net = (() => {
    const total = members.length
    const active = members.filter((m) => m.status === 'active').length
    const newToday = members.filter((m) => m.created_at >= startOf('day')).length
    const newWeek = members.filter((m) => m.created_at >= startOf('week')).length
    const newMonth = members.filter((m) => m.created_at >= startOf('month')).length
    const roots = members.filter((m) => !m.referrer_id).length

    const byRank = new Map<string, number>()
    for (const m of members) {
      const r = m.rank?.name ?? 'Unranked'
      byRank.set(r, (byRank.get(r) ?? 0) + 1)
    }
    const rankDist = [...byRank.entries()]
      .map(([name, n]) => ({ name, n, seniority: members.find((m) => m.rank?.name === name)?.rank?.seniority ?? 0 }))
      .sort((a, b) => b.seniority - a.seniority)

    const topSponsors = [...members]
      .filter((m) => m.direct_count > 0)
      .sort((a, b) => (b.team_count - a.team_count) || (b.direct_count - a.direct_count))
      .slice(0, 6)

    const recent = [...members].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
    return { total, active, newToday, newWeek, newMonth, roots, rankDist, topSponsors, recent }
  })()

  if (isLoading || membersLoading || !stats) return <Spinner label="Building your dashboard…" />

  const maxRank = Math.max(1, ...net.rankDist.map((r) => r.n))

  return (
    <>
      <PageHeader title="Admin dashboard" description={`Your ${BRAND.short} network at a glance.`} />

      {/* Network */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total members" value={num(net.total)} hint={`${num(net.roots)} network root${net.roots === 1 ? '' : 's'}`} tone="blue" icon={<Network className="h-4 w-4" />} />
        <StatTile label="Active members" value={num(net.active)} hint={`${num(net.total - net.active)} inactive`} tone="green" icon={<Users className="h-4 w-4" />} />
        <StatTile
          label="New sign-ups"
          value={num(net.newWeek)}
          hint={`${num(net.newToday)} today · ${num(net.newMonth)} in last 30 days`}
          tone="violet"
          icon={<UserPlus className="h-4 w-4" />}
        />
        <StatTile label="Confirmed sale value" value={moneyShort(stats.saleValue)} hint={`${num(stats.salesConfirmed)} confirmed sales`} tone="gold" icon={<TrendingUp className="h-4 w-4" />} />
      </section>

      {/* Network money — what the company owes and what is waiting to be done. */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Wallet liability"
          value={moneyShort(totals?.liability ?? 0)}
          hint="Credited, not yet paid out"
          tone="red"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatTile
          label="Income credited"
          value={moneyShort(totals?.credited ?? 0)}
          hint={`${moneyShort(totals?.paid_out ?? 0)} paid out`}
          tone="green"
          icon={<Banknote className="h-4 w-4" />}
        />
        <Link to="/admin/payouts" className="block">
          <StatTile
            label="Payouts waiting"
            value={num(totals?.open_requests ?? 0)}
            hint={`${moneyShort(totals?.pending_payout ?? 0)} requested`}
            tone="amber"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </Link>
        <Link to="/admin/payouts" className="block">
          <StatTile
            label="Payouts paid"
            value={moneyShort(totals?.paid_out ?? 0)}
            hint={`${moneyShort(paidThisMonth)} in the last 30 days`}
            tone="green"
            icon={<Banknote className="h-4 w-4" />}
          />
        </Link>
        <StatTile
          label="Sales not distributed"
          value={num(totals?.undistributed_sales ?? 0)}
          hint={totals?.undistributed_sales ? 'Income not yet credited' : 'All caught up'}
          tone={totals?.undistributed_sales ? 'red' : 'neutral'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active ranks" value={num(stats.ranksActive)} hint="On the rank ladder" tone="gold" icon={<Crown className="h-4 w-4" />} />
        <StatTile label="Open leads" value={num(stats.leadsOpen)} hint="Not converted or lost" tone="violet" icon={<ListChecks className="h-4 w-4" />} />
        <StatTile label="KYC pending" value={num(stats.kycPending)} hint="Waiting for review" tone="amber" icon={<ShieldCheck className="h-4 w-4" />} />
        <StatTile label="Awaiting verification" value={num(stats.emisAwaiting)} hint="Payment slips to verify" tone="amber" icon={<CalendarClock className="h-4 w-4" />} />
      </section>

      {/* Rank distribution + top sponsors */}
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Rank distribution" subtitle="Members at each rank across the network" />
          <div className="space-y-2.5 p-5">
            {net.rankDist.map((r) => (
              <div key={r.name} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-600">{r.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.n / maxRank) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">{r.n}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Top sponsors"
            subtitle="Largest teams in the network"
            action={<Link to="/admin/tree" className="text-xs font-medium text-brand-700 hover:underline">View tree</Link>}
          />
          <Table>
            <thead>
              <tr><Th>Member</Th><Th>Rank</Th><Th className="text-right">Direct</Th><Th className="text-right">Team</Th></tr>
            </thead>
            <tbody>
              {net.topSponsors.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{m.full_name}</p>
                    <p className="font-mono text-xs text-slate-400">{m.member_code}</p>
                  </Td>
                  <Td><Badge tone={rankTone(m.rank?.name)}>{m.rank?.name ?? '—'}</Badge></Td>
                  <Td className="text-right font-semibold text-slate-700">{m.direct_count}</Td>
                  <Td className="text-right font-semibold text-slate-700">{m.team_count}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* Needs action */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Needs action</h2>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActionTile to="/admin/sales" label="Bookings awaiting final approval" value={stats.bookingsPending3} tone="amber" icon={<ClipboardCheck className="h-4 w-4" />} />
        <ActionTile to="/admin/sales" label="Sales awaiting review" value={stats.bookingsPending2} tone="blue" icon={<ClipboardCheck className="h-4 w-4" />} />
        <ActionTile to="/admin/crm" label="Payment slips to verify" value={stats.emisAwaiting} tone="amber" icon={<CalendarClock className="h-4 w-4" />} />
        <ActionTile to="/admin/crm" label="Overdue payments" value={stats.emisOverdue} tone="red" icon={<AlertTriangle className="h-4 w-4" />} />
        <ActionTile to="/admin/kyc" label="KYC pending verification" value={stats.kycPending} tone="violet" icon={<ShieldCheck className="h-4 w-4" />} />
        <ActionTile to="/admin/messages" label="Open message threads" value={stats.threadsOpen} tone="neutral" icon={<Inbox className="h-4 w-4" />} />
        <ActionTile to="/admin/members" label="Accounts pending approval" value={stats.staffPending} tone="amber" icon={<Users className="h-4 w-4" />} />
        <ActionTile to="/admin/leads" label="Open leads" value={stats.leadsOpen} tone="neutral" icon={<ListChecks className="h-4 w-4" />} />
      </section>

      {/* Recently joined members */}
      <div className="mt-8">
        <Card>
          <CardHeader
            title="Recently joined members"
            subtitle="Newest sponsors first"
            action={<Link to="/admin/members" className="text-xs font-medium text-brand-700 hover:underline">Manage members</Link>}
          />
          <Table>
            <thead>
              <tr><Th>Member</Th><Th>Sponsor ID</Th><Th>Rank</Th><Th>Status</Th><Th>Joined</Th></tr>
            </thead>
            <tbody>
              {net.recent.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{p.full_name || '—'}</Td>
                  <Td className="font-mono text-xs text-slate-500">{p.member_code}</Td>
                  <Td><Badge tone={rankTone(p.rank?.name)}>{p.rank?.name ?? '—'}</Badge></Td>
                  <Td><Badge tone={statusTone(p.status)}>{p.status}</Badge></Td>
                  <Td className="text-xs">{date(p.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  )
}

function ActionTile({
  to, label, value, tone, icon,
}: {
  to: string
  label: string
  value: number
  tone: 'neutral' | 'amber' | 'red' | 'blue' | 'violet'
  icon: React.ReactNode
}) {
  return (
    <Link to={to} className="block transition hover:-translate-y-0.5">
      <StatTile label={label} value={num(value)} tone={tone} icon={icon} />
    </Link>
  )
}
