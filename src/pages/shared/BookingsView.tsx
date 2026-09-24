import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { useBookings } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Select, Spinner,
  Table, Td, Th,
} from '@/components/ui'
import { ApprovalBadge } from '@/components/status'
import { date, downloadCsv, money, num } from '@/lib/format'
import type { ApprovalStatus } from '@/lib/types'

const STATUSES: ApprovalStatus[] = ['draft', 'step1_done', 'step2_approved', 'confirmed', 'rejected', 'cancelled']

/**
 * Shared bookings list. RLS decides which rows come back for each role:
 * a rep sees their own, a manager sees their reps', an admin sees all,
 * a customer sees their own.
 */
export function BookingsView({
  title,
  description,
  basePath,
  onNew,
  defaultStatus,
}: {
  title: string
  description?: string
  basePath: string
  onNew?: () => void
  defaultStatus?: ApprovalStatus
}) {
  const [status, setStatus] = useState<string>(defaultStatus ?? '')
  const { data = [], isLoading, error } = useBookings({ status: status || undefined })

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={
          onNew && (
            <Button onClick={onNew}>
              <Plus className="h-4 w-4" /> Raise a booking
            </Button>
          )
        }
      />

      {error && <ErrorState error={error} />}

      <Card>
        <CardHeader
          title={`${num(data.length)} bookings`}
          action={
            <div className="flex gap-2">
              <Select className="h-8 w-44 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    'bookings',
                    data.map((b) => ({
                      reference: b.reference,
                      project: b.project?.name ?? '',
                      plot: b.plot?.number ?? '',
                      customer: b.customer?.full_name ?? '',
                      rep: b.rep?.full_name ?? '',
                      sale_value: b.sale_value,
                      token: b.token_amount,
                      plan: b.payment_plan,
                      status: b.status,
                      created_at: b.created_at,
                    })),
                  )
                }
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title="No bookings" description="Bookings you raise or review will appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Project / plot</Th>
                <Th>Customer</Th>
                <Th>Rep</Th>
                <Th>Value</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Raised</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <Td>
                    <Link to={`${basePath}/${b.id}`} className="font-medium text-brand-700 hover:underline">
                      {b.reference}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {b.project?.name ?? '—'}
                    <span className="block text-slate-500">Plot {b.plot?.number ?? '—'}</span>
                  </Td>
                  <Td className="text-xs">{b.customer?.full_name ?? '—'}</Td>
                  <Td className="text-xs">{b.rep?.full_name ?? '—'}</Td>
                  <Td>{money(b.sale_value)}</Td>
                  <Td className="text-xs">
                    {b.payment_plan === 'emi' ? `EMI × ${b.emi_count}` : 'Full payment'}
                  </Td>
                  <Td><ApprovalBadge status={b.status} /></Td>
                  <Td className="text-xs">{date(b.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
