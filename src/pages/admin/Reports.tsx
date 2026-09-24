import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookings, useCommissions, useEmis, useLeads, useProjects } from '@/lib/queries'
import {
  Button, Card, CardBody, CardHeader, PageHeader, Select, Spinner, StatTile,
  Table, Td, Th,
} from '@/components/ui'
import { downloadCsv, money, moneyShort, num, pct } from '@/lib/format'

const CHART_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2']

export function AdminReports() {
  const [days, setDays] = useState('90')
  const { data: bookings = [], isLoading } = useBookings({})
  const { data: leads = [] } = useLeads({})
  const { data: commissions = [] } = useCommissions({})
  const { data: emis = [] } = useEmis({})
  const { data: projects = [] } = useProjects()

  const since = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - Number(days))
    return d
  }, [days])

  const inPeriod = bookings.filter((b) => new Date(b.created_at) >= since)
  const confirmed = inPeriod.filter((b) => b.status === 'confirmed')
  const saleValue = confirmed.reduce((t, b) => t + Number(b.sale_value), 0)

  const funnel = [
    { stage: 'Draft', count: inPeriod.filter((b) => b.status === 'draft').length },
    { stage: 'Awaiting review', count: inPeriod.filter((b) => b.status === 'step1_done').length },
    { stage: 'Awaiting admin', count: inPeriod.filter((b) => b.status === 'step2_approved').length },
    { stage: 'Confirmed', count: confirmed.length },
    { stage: 'Rejected', count: inPeriod.filter((b) => b.status === 'rejected').length },
  ]

  const leadsInPeriod = leads.filter((l) => new Date(l.created_at) >= since)
  const convertedLeads = leadsInPeriod.filter((l) => l.status === 'converted').length
  const conversionRate = leadsInPeriod.length ? (convertedLeads / leadsInPeriod.length) * 100 : 0

  const byProject = projects
    .map((p) => ({
      name: p.name,
      bookings: confirmed.filter((b) => b.project_id === p.id).length,
      value: confirmed.filter((b) => b.project_id === p.id).reduce((t, b) => t + Number(b.sale_value), 0),
    }))
    .filter((r) => r.bookings > 0)
    .sort((a, b) => b.value - a.value)

  const byRep = useMemo(() => {
    const map = new Map<string, { name: string; deals: number; value: number; commission: number }>()
    for (const b of confirmed) {
      const key = b.rep_id ?? 'unassigned'
      const row = map.get(key) ?? { name: b.rep?.full_name ?? 'Unassigned', deals: 0, value: 0, commission: 0 }
      row.deals += 1
      row.value += Number(b.sale_value)
      map.set(key, row)
    }
    for (const c of commissions) {
      const row = map.get(c.rep_id)
      if (row) row.commission += Number(c.net_amount)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [confirmed, commissions])

  const aging = [
    { bucket: 'Not due', amount: emis.filter((e) => e.status === 'pending').reduce((t, e) => t + Number(e.amount), 0) },
    { bucket: 'Awaiting verification', amount: emis.filter((e) => e.status === 'awaiting_verification').reduce((t, e) => t + Number(e.amount), 0) },
    { bucket: 'Overdue', amount: emis.filter((e) => e.status === 'overdue').reduce((t, e) => t + Number(e.amount), 0) },
    { bucket: 'Collected', amount: emis.filter((e) => e.status === 'paid').reduce((t, e) => t + Number(e.amount), 0) },
  ]

  if (isLoading) return <Spinner />

  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales, funnel, collections and commission — every export is scoped by your role."
        action={
          <Select className="w-40" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last 12 months</option>
            <option value="3650">All time</option>
          </Select>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Confirmed sales" value={num(confirmed.length)} hint={`of ${num(inPeriod.length)} bookings raised`} tone="green" />
        <StatTile label="Sale value" value={moneyShort(saleValue)} hint="Confirmed bookings in period" tone="blue" />
        <StatTile label="Lead conversion" value={pct(conversionRate)} hint={`${num(convertedLeads)} of ${num(leadsInPeriod.length)} leads`} tone="violet" />
        <StatTile label="Collected" value={moneyShort(aging[3].amount)} hint={`${moneyShort(aging[2].amount)} overdue`} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Booking funnel" subtitle="Where bookings sit in the approval chain" />
          <CardBody>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="EMI aging" subtitle="Collection position across all bookings" />
          <CardBody>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={aging} dataKey="amount" nameKey="bucket" outerRadius={90} label={false}>
                  {aging.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Sales by rep"
          subtitle="Commission shown is each rep's own single-level earning on their own sales"
          action={
            <Button variant="outline" size="sm" onClick={() => downloadCsv('sales-by-rep', byRep)}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          }
        />
        {byRep.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No confirmed sales in this period.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Rep</Th>
                <Th>Confirmed deals</Th>
                <Th>Sale value</Th>
                <Th>Own commission (net)</Th>
              </tr>
            </thead>
            <tbody>
              {byRep.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{r.name}</Td>
                  <Td>{num(r.deals)}</Td>
                  <Td>{money(r.value)}</Td>
                  <Td>{money(r.commission)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Sales by project"
          action={
            <Button variant="outline" size="sm" onClick={() => downloadCsv('sales-by-project', byProject)}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          }
        />
        {byProject.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No confirmed sales in this period.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Confirmed bookings</Th>
                <Th>Sale value</Th>
              </tr>
            </thead>
            <tbody>
              {byProject.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{r.name}</Td>
                  <Td>{num(r.bookings)}</Td>
                  <Td>{money(r.value)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
