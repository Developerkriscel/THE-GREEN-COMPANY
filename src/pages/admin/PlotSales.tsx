import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BadgeCheck, Check, Clock, IndianRupee, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader,
  RecordCard, Responsive, Select, StatTile, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { date, money, moneyShort, num } from '@/lib/format'

/**
 * Plot Sales Verification — the office's side of the member's "Add sale".
 *
 * A member files a sale and it lands here as pending. Verifying it sets the
 * booking to `confirmed`, and `trg_bookings_income_sync` then distributes the
 * direct and level income server-side. That is why there is no "credit
 * income" button: the money follows the status, so the two can never drift
 * apart. Rejecting sends it back to the member with the reason.
 */

interface PendingSale {
  id: string
  reference: string
  status: string
  sale_value: number
  token_amount: number
  customer_name: string | null
  customer_phone: string | null
  reject_remark: string | null
  created_at: string
  step1_at: string | null
  step3_at: string | null
  plot: { id: string; number: string; size: number | null; size_unit: string } | null
  project: { id: string; name: string } | null
  rep: { id: string; full_name: string; member_code: string | null; rank_id: string | null } | null
}

const FILTERS = [
  { key: 'pending', label: 'Awaiting verification' },
  { key: 'confirmed', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All statuses' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

/** Statuses that mean "with the office", matching what the member is told. */
const PENDING = ['draft', 'step1_done', 'step2_approved']

function useSubmittedSales() {
  return useQuery({
    queryKey: ['admin-plot-sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, reference, status, sale_value, token_amount, customer_name, customer_phone, ' +
          'reject_remark, created_at, step1_at, step3_at, ' +
          'plot:plots ( id, number, size, size_unit ), project:projects ( id, name ), ' +
          'rep:profiles!bookings_rep_id_fkey ( id, full_name, member_code, rank_id )',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as PendingSale[]
    },
  })
}

export function AdminPlotSales() {
  const qc = useQueryClient()
  const { push } = useToast()
  const { data: sales = [], isLoading } = useSubmittedSales()

  const [filter, setFilter] = useState<FilterKey>('pending')
  const [rejecting, setRejecting] = useState<PendingSale | null>(null)

  const verify = useMutation({
    mutationFn: async (id: string) => {
      // One update. The transition guard stamps the review and approval, and
      // the income trigger fires off the same status change.
      const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Sale verified. Direct and level income credited to the network.')
      void qc.invalidateQueries({ queryKey: ['admin-plot-sales'] })
      void qc.invalidateQueries({ queryKey: ['network-totals'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const reject = useMutation({
    mutationFn: async ({ id, remark }: { id: string; remark: string }) => {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'rejected', reject_remark: remark })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Sale rejected. The member can see the reason.')
      setRejecting(null)
      void qc.invalidateQueries({ queryKey: ['admin-plot-sales'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const counts = useMemo(() => {
    const live = sales.filter((s) => s.status !== 'cancelled')
    const pending = live.filter((s) => PENDING.includes(s.status))
    const verified = live.filter((s) => s.status === 'confirmed')
    return {
      pending: pending.length,
      pendingValue: pending.reduce((n, s) => n + Number(s.sale_value ?? 0), 0),
      verified: verified.length,
      verifiedValue: verified.reduce((n, s) => n + Number(s.sale_value ?? 0), 0),
      rejected: live.filter((s) => s.status === 'rejected').length,
    }
  }, [sales])

  const shown = sales.filter((s) => {
    if (filter === 'all') return true
    if (filter === 'pending') return PENDING.includes(s.status)
    return s.status === filter
  })

  const canVerify = (s: PendingSale) => PENDING.includes(s.status)

  return (
    <>
      <PageHeader
        title="Plot Sales Verification"
        description="Verify sales filed by members. On verification the direct and level income is credited and the sale appears in the member's panel."
      />

      {counts.pending > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{counts.pending}</strong> sale{counts.pending === 1 ? '' : 's'} worth{' '}
            {money(counts.pendingValue)} waiting on you. No income is credited until you verify.
          </span>
        </div>
      )}

      {isLoading ? (
        <SkeletonTiles count={4} />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Awaiting verification" value={num(counts.pending)}
            hint={moneyShort(counts.pendingValue)} tone={counts.pending ? 'amber' : 'neutral'}
            icon={<Clock className="h-4 w-4" />} />
          <StatTile label="Verified" value={num(counts.verified)}
            hint={moneyShort(counts.verifiedValue)} tone="green"
            icon={<BadgeCheck className="h-4 w-4" />} />
          <StatTile label="Rejected" value={num(counts.rejected)} hint="Sent back to the member"
            tone={counts.rejected ? 'red' : 'neutral'} icon={<X className="h-4 w-4" />} />
          <StatTile label="Verified value" value={moneyShort(counts.verifiedValue)}
            hint="Lifetime, all members" tone="gold" icon={<IndianRupee className="h-4 w-4" />} />
        </div>
      )}

      <Card>
        <CardHeader
          title={`${shown.length} sale${shown.length === 1 ? '' : 's'}`}
          action={
            <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} className="w-56">
              {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          }
        />
        {isLoading ? (
          <SkeletonRows rows={5} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={filter === 'pending' ? 'Nothing waiting' : 'No sales here'}
            description={
              filter === 'pending'
                ? 'Every sale filed by a member has been dealt with.'
                : 'Members file sales from Plot Sales in their panel.'
            }
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th>Ref</Th><Th>Member</Th><Th>Project / Plot</Th><Th>Customer</Th>
                    <Th>Area</Th><Th>Amount</Th><Th>Status</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id}>
                      <Td>
                        <span className="font-medium text-slate-900">{s.reference}</span>
                        <p className="text-xs text-slate-400">{date(s.created_at)}</p>
                      </Td>
                      <Td>
                        {s.rep?.full_name ?? '—'}
                        <p className="text-xs text-slate-400">{s.rep?.member_code ?? ''}</p>
                      </Td>
                      <Td>
                        {s.project?.name ?? '—'}
                        <p className="text-xs text-slate-400">Plot {s.plot?.number ?? '—'}</p>
                      </Td>
                      <Td>
                        {s.customer_name ?? '—'}
                        {s.customer_phone && <p className="text-xs text-slate-400">{s.customer_phone}</p>}
                      </Td>
                      <Td>{s.plot?.size ? `${num(s.plot.size)} ${s.plot.size_unit}` : '—'}</Td>
                      <Td>{money(s.sale_value)}</Td>
                      <Td><StatusBadge status={s.status} remark={s.reject_remark} /></Td>
                      <Td className="text-right">
                        {canVerify(s) && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate(s.id)}>
                              <Check className="h-3.5 w-3.5" /> Verify
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejecting(s)}>Reject</Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {shown.map((s) => (
                  <RecordCard
                    key={s.id}
                    title={s.reference}
                    subtitle={`${s.rep?.member_code ?? '—'} · ${s.project?.name ?? '—'} Plot ${s.plot?.number ?? '—'}`}
                    badge={<StatusBadge status={s.status} remark={s.reject_remark} />}
                    amount={<span className="text-sm font-semibold">{money(s.sale_value)}</span>}
                    rows={[
                      { label: 'Member', value: s.rep?.full_name ?? '—' },
                      { label: 'Customer', value: s.customer_name ?? '—' },
                      { label: 'Area', value: s.plot?.size ? `${num(s.plot.size)} ${s.plot.size_unit}` : '—' },
                      {
                        label: 'Action',
                        value: canVerify(s) ? (
                          <button className="font-medium text-emerald-700" onClick={() => verify.mutate(s.id)}>
                            Verify
                          </button>
                        ) : '—',
                      },
                    ]}
                  />
                ))}
              </div>
            }
          />
        )}
      </Card>

      <RejectModal
        sale={rejecting}
        busy={reject.isPending}
        onClose={() => setRejecting(null)}
        onReject={(remark) => rejecting && reject.mutate({ id: rejecting.id, remark })}
      />
    </>
  )
}

function StatusBadge({ status, remark }: { status: string; remark: string | null }) {
  if (status === 'confirmed') return <Badge tone="green">Verified</Badge>
  if (status === 'rejected') {
    return (
      <>
        <Badge tone="red">Rejected</Badge>
        {remark && <p className="mt-0.5 max-w-[14rem] text-xs text-rose-600">{remark}</p>}
      </>
    )
  }
  if (status === 'cancelled') return <Badge tone="neutral">Cancelled</Badge>
  return <Badge tone="amber">Awaiting verification</Badge>
}

function RejectModal({
  sale, busy, onClose, onReject,
}: {
  sale: PendingSale | null
  busy: boolean
  onClose: () => void
  onReject: (remark: string) => void
}) {
  const [remark, setRemark] = useState('')
  if (!sale) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${sale.reference}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!remark.trim() || busy} onClick={() => onReject(remark.trim())}>
            {busy ? 'Rejecting…' : 'Reject sale'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {sale.rep?.full_name} filed this sale for {money(sale.sale_value)}. The reason you give is
          shown to them on their Plot Sales screen, so write it for them, not for the file.
        </p>
        <Field label="Reason" required>
          <Textarea
            rows={3}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="e.g. Customer mobile is wrong — please check and file again."
          />
        </Field>
      </div>
    </Modal>
  )
}
