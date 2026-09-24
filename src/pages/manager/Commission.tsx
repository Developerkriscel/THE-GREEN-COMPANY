import { Info } from 'lucide-react'
import { useTeamCommissionTotals } from '@/lib/queries'
import {
  Card, CardBody, CardHeader, EmptyState, PageHeader, Spinner, Table, Td, Th,
} from '@/components/ui'
import { money, num } from '@/lib/format'

/**
 * Aggregate totals only, served by the `team_commission_totals` RPC. A manager
 * has no row access to `commissions` at all — and no policy, view or function
 * anywhere credits a manager from a rep's sale.
 */
export function TeamCommission() {
  const { data = [], isLoading } = useTeamCommissionTotals()

  if (isLoading) return <Spinner />

  const grand = data.reduce(
    (acc, r) => ({
      accrued: acc.accrued + Number(r.accrued),
      approved: acc.approved + Number(r.approved),
      paid: acc.paid + Number(r.paid),
      deals: acc.deals + Number(r.deals),
    }),
    { accrued: 0, approved: 0, paid: 0, deals: 0 },
  )

  return (
    <>
      <PageHeader
        title="Team totals"
        description="What your reps have earned on their own sales. For coordination only."
      />

      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardBody className="flex items-start gap-3 text-sm text-blue-900">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <p className="font-semibold">You earn nothing from these figures.</p>
            <p className="mt-1 text-blue-800">
              Commission is single-level: each amount below belongs entirely to the rep who personally made
              that sale. This page exists so you can coordinate and support your team, not to compute a
              share for yourself.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${num(data.length)} reps`}
          subtitle={`${num(grand.deals)} commission records in total`}
        />
        {data.length === 0 ? (
          <EmptyState title="No commission yet" description="Your reps have no confirmed sales so far." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Rep</Th>
                <Th>Deals</Th>
                <Th>Accrued</Th>
                <Th>Approved</Th>
                <Th>Paid</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.rep_id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{r.rep_name}</Td>
                  <Td>{num(r.deals)}</Td>
                  <Td>{money(r.accrued)}</Td>
                  <Td>{money(r.approved)}</Td>
                  <Td>{money(r.paid)}</Td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <Td>Total</Td>
                <Td>{num(grand.deals)}</Td>
                <Td>{money(grand.accrued)}</Td>
                <Td>{money(grand.approved)}</Td>
                <Td>{money(grand.paid)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
