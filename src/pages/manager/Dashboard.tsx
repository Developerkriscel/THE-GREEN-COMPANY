import { Link } from 'react-router-dom'
import { ClipboardCheck, Eye, ListChecks, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBookings, useLeads, useProfiles } from '@/lib/queries'
import {
  Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Spinner, StatTile,
  Table, Td, Th,
} from '@/components/ui'
import { ApprovalBadge, LeadBadge } from '@/components/status'
import { date, money, moneyShort, num } from '@/lib/format'

/**
 * Manager view. Read-only, for coordination. A manager can tick the step-2
 * review on their own reps' bookings — and that is the only write they have.
 * There is no earnings widget here because a manager earns nothing from a
 * rep's sale.
 */
export function TeamDashboard() {
  const { profile } = useAuth()
  const { data: reps = [], isLoading } = useProfiles({ managerId: profile?.id })
  const { data: bookings = [] } = useBookings({})
  const { data: leads = [] } = useLeads({})

  if (isLoading) return <Spinner />

  const awaiting = bookings.filter((b) => b.status === 'step1_done')
  const confirmed = bookings.filter((b) => b.status === 'confirmed')
  const openLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status))
  const pipelineValue = bookings
    .filter((b) => ['step1_done', 'step2_approved'].includes(b.status))
    .reduce((t, b) => t + Number(b.sale_value), 0)

  return (
    <>
      <PageHeader
        title="Team overview"
        description="Coordination view of your assigned reps. Read-only, with one exception: your step-2 review tick."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="My reps" value={num(reps.length)} hint="Assigned to you" tone="blue" icon={<Users className="h-4 w-4" />} />
        <StatTile label="Awaiting my review" value={num(awaiting.length)} hint="Step 2 of the chain" tone="amber" icon={<ClipboardCheck className="h-4 w-4" />} />
        <StatTile label="Open team leads" value={num(openLeads.length)} tone="violet" icon={<ListChecks className="h-4 w-4" />} />
        <StatTile label="Pipeline value" value={moneyShort(pipelineValue)} hint={`${num(confirmed.length)} confirmed`} icon={<Eye className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Awaiting your review"
            subtitle="Approve or reject with a remark — final approval rests with an administrator"
            action={<Link to="/mgr/approvals" className="text-xs font-medium text-brand-700 hover:underline">Open queue</Link>}
          />
          {awaiting.length === 0 ? (
            <EmptyState title="Nothing waiting" description="Your reps have no bookings at step 2." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Rep</Th>
                  <Th>Value</Th>
                  <Th>Raised</Th>
                </tr>
              </thead>
              <tbody>
                {awaiting.slice(0, 6).map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/team/bookings/${b.id}`} className="font-medium text-brand-700 hover:underline">
                        {b.reference}
                      </Link>
                    </Td>
                    <Td className="text-xs">{b.rep?.full_name ?? '—'}</Td>
                    <Td>{money(b.sale_value)}</Td>
                    <Td className="text-xs">{date(b.step1_at ?? b.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="My reps" subtitle="Rank is a title and an own-sale rate — it grants no authority" />
          {reps.length === 0 ? (
            <EmptyState title="No reps assigned" description="An administrator assigns reps to you." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Rep</Th>
                  <Th>Rank</Th>
                  <Th>Open leads</Th>
                  <Th>Bookings</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {reps.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <p className="font-medium text-slate-900">{r.full_name}</p>
                      <p className="text-xs text-slate-500">{r.user_code}</p>
                    </Td>
                    <Td className="text-xs">{r.rank?.name ?? '—'}</Td>
                    <Td className="text-xs">{num(openLeads.filter((l) => l.owner_id === r.id).length)}</Td>
                    <Td className="text-xs">{num(bookings.filter((b) => b.rep_id === r.id).length)}</Td>
                    <Td>
                      <Badge tone={r.status === 'active' ? 'green' : r.status === 'pending' ? 'amber' : 'red'}>
                        {r.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardBody className="text-xs text-slate-500">
          This view exists for coordination only. You cannot edit a rep's leads, and you do not earn any
          share of their sales — each rep earns solely on the plots they personally sell.
        </CardBody>
      </Card>
    </>
  )
}
