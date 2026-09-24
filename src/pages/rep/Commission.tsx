import { Download, Info } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCommissions } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, PageHeader, Spinner, StatTile, Table, Td, Th,
} from '@/components/ui'
import { CommissionBadge, RankBadge } from '@/components/status'
import { date, downloadCsv, money, moneyShort, num, pct } from '@/lib/format'

/**
 * The rep's own commission statement. RLS restricts `commissions` to
 * `rep_id = auth.uid()`, so nobody else's sale can appear here — there is no
 * team total, no downline, no wallet fed by another person's deal.
 */
export function RepCommission() {
  const { profile } = useAuth()
  const { data = [], isLoading } = useCommissions({})

  if (isLoading) return <Spinner />

  const total = (status: string) =>
    data.filter((c) => c.status === status).reduce((t, c) => t + Number(c.net_amount), 0)

  const rate = profile?.commission_rate ?? profile?.rank?.own_sale_rate ?? 0

  return (
    <>
      <PageHeader
        title="My commission"
        description="Earnings on the plots you personally sold."
        action={profile?.rank?.name ? <RankBadge name={profile.rank.name} /> : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Accrued" value={moneyShort(total('accrued'))} hint="Awaiting admin approval" tone="amber" />
        <StatTile label="Approved" value={moneyShort(total('approved'))} hint="Awaiting payout" tone="blue" />
        <StatTile label="Paid" value={moneyShort(total('paid'))} hint="All time" tone="green" />
        <StatTile label="My rate" value={pct(rate)} hint={profile?.rank?.name ?? 'No rank assigned'} tone="gold" />
      </div>

      <Card>
        <CardHeader
          title={`${num(data.length)} statements`}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  'my-commission',
                  data.map((c) => ({
                    booking: c.booking?.reference ?? '',
                    sale_value: c.sale_value,
                    rate: c.rate_applied,
                    rank_at_sale: c.rank_at_sale,
                    gross: c.gross_amount,
                    deductions: c.deductions,
                    net: c.net_amount,
                    status: c.status,
                    paid_at: c.paid_at,
                    payout_reference: c.payout_reference,
                  })),
                )
              }
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
          }
        />

        {data.length === 0 ? (
          <EmptyState
            title="No commission yet"
            description="A record is created when an administrator confirms a sale you made."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Sale value</Th>
                <Th>Rate</Th>
                <Th>Gross</Th>
                <Th>Deductions</Th>
                <Th>Net</Th>
                <Th>Status</Th>
                <Th>Paid</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{c.booking?.reference ?? '—'}</Td>
                  <Td>{money(c.sale_value)}</Td>
                  <Td className="text-xs">
                    {pct(c.rate_applied)}
                    {c.rank_at_sale && <span className="block text-slate-400">{c.rank_at_sale}</span>}
                  </Td>
                  <Td>{money(c.gross_amount)}</Td>
                  <Td className="text-xs text-slate-500">−{money(c.deductions)}</Td>
                  <Td className="font-medium text-slate-900">{money(c.net_amount)}</Td>
                  <Td><CommissionBadge status={c.status} /></Td>
                  <Td className="text-xs">
                    {c.paid_at ? date(c.paid_at) : '—'}
                    {c.payout_reference && <span className="block text-slate-400">{c.payout_reference}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="flex items-start gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Your rate is locked in at the moment each sale is confirmed, so a later promotion never changes a
          past statement. Deductions shown are the company's configured statutory and admin charges.
        </div>
      </Card>
    </>
  )
}
