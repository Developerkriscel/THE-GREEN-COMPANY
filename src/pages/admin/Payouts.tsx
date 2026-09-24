import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Download, Search, Wallet } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal,
  PageHeader, Select, StatTile, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import {
  usePayoutBatch, useUpdateWithdrawal, useWithdrawalQueue, type QueuedWithdrawal,
} from '@/lib/queries'
import { SkeletonRows, WithdrawalBadge, maskAccount } from '@/components/sponsor'
import { date, dateTime, downloadCsv, money, num } from '@/lib/format'

/**
 * The payouts queue.
 *
 * Payout requests used to be visible only inside an individual member's page,
 * so finding who was waiting to be paid meant opening every member in turn.
 * This is the office's actual working screen: everything waiting, oldest first,
 * decided in place.
 */
export function AdminPayouts() {
  const [status, setStatus] = useState('requested')
  const [search, setSearch] = useState('')
  const { data: rows = [], isLoading, error } = useWithdrawalQueue(status || undefined)

  const update = useUpdateWithdrawal()
  const toast = useToast()
  const [paying, setPaying] = useState<QueuedWithdrawal | null>(null)
  const [rejecting, setRejecting] = useState<QueuedWithdrawal | null>(null)
  const [utr, setUtr] = useState('')
  const [reason, setReason] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.member_code, r.member_name, r.account, r.utr, r.payout_reference]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [rows, search])

  const waiting = rows.filter((r) => r.status === 'requested')
  const approved = rows.filter((r) => r.status === 'approved')
  const owed = [...waiting, ...approved].reduce((t, r) => t + Number(r.amount), 0)
  const { data: batch } = usePayoutBatch()

  const act = (w: QueuedWithdrawal, next: 'approved' | 'paid', extra?: Record<string, string>) =>
    update.mutate(
      { id: w.id, member_id: w.member_id, status: next, ...extra },
      {
        onSuccess: () => toast.push('success', `Withdrawal ${next}`),
        onError: (e) => toast.push('error', (e as Error).message),
      },
    )

  return (
    <div>
      <PageHeader
        title="Payouts"
        description="Every withdrawal request across the network, in one queue."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv('payouts', filtered.map((r) => ({
                Requested: dateTime(r.requested_at),
                Member: r.member_name,
                'Member ID': r.member_code ?? '',
                Amount: r.amount,
                Account: r.account ?? '',
                Status: r.status,
                KYC: r.kyc_status,
                Reference: r.payout_reference ?? r.utr ?? '',
                Reason: r.reject_reason ?? '',
              })))
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Waiting for review" value={num(waiting.length)} tone="amber" icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Approved, unpaid" value={num(approved.length)} tone="blue" />
        <StatTile label="Amount owed now" value={money(owed)} tone="red" icon={<Banknote className="h-4 w-4" />} />
        <StatTile
          label="Paid today"
          value={money(batch?.paid_today_amount ?? 0)}
          hint={`${num(batch?.paid_today_count ?? 0)} released`}
          tone="green"
          icon={<Banknote className="h-4 w-4" />}
        />
      </div>

      {/* The batch the office is about to release, and anything holding it up. */}
      {batch && (batch.approved_count > 0 || batch.blocked_no_kyc > 0) && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200">
          <span className="text-slate-700">
            Next bank run: <strong>{money(batch.approved_amount)}</strong> across{' '}
            {num(batch.approved_count)} approved request{batch.approved_count === 1 ? '' : 's'}.
          </span>
          {batch.requested_count > 0 && (
            <span className="text-slate-500">
              {num(batch.requested_count)} more ({money(batch.requested_amount)}) still to review.
            </span>
          )}
          {batch.blocked_no_kyc > 0 && (
            <span className="font-medium text-amber-700">
              {num(batch.blocked_no_kyc)} open request{batch.blocked_no_kyc === 1 ? '' : 's'} held by unverified KYC.
            </span>
          )}
        </div>
      )}

      <Card className="overflow-visible">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search member, ID, account or UTR…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="requested">Waiting</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="">All</option>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={rows.length ? 'Nothing matches that search' : 'Nothing waiting'}
            description={rows.length ? 'Try a different term.' : 'Requests members make appear here for review.'}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Requested</Th>
                <Th>Member</Th>
                <Th className="text-right">Amount</Th>
                <Th>To</Th>
                <Th>KYC</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{date(w.requested_at)}</Td>
                  <Td>
                    <Link
                      to={`/admin/members/${w.member_code}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {w.member_name}
                    </Link>
                    <span className="ml-1 font-mono text-[11px] text-slate-400">{w.member_code}</span>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{money(w.amount)}</Td>
                  <Td className="text-xs text-slate-600">{maskAccount(w.account)}</Td>
                  <Td>
                    <Badge tone={w.kyc_status === 'verified' ? 'green' : w.kyc_status === 'rejected' ? 'red' : 'amber'}>
                      {w.kyc_status}
                    </Badge>
                  </Td>
                  <Td className="text-right text-xs tabular-nums text-slate-500">{money(w.available)}</Td>
                  <Td>
                    <WithdrawalBadge status={w.status} />
                    {w.reject_reason && <p className="mt-1 text-[11px] text-red-700">{w.reject_reason}</p>}
                    {w.payout_reference && (
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{w.payout_reference}</p>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {w.status === 'requested' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => act(w, 'approved')}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={() => { setRejecting(w); setReason('') }}>Reject</Button>
                        </>
                      )}
                      {w.status === 'approved' && (
                        <>
                          <Button size="sm" onClick={() => { setPaying(w); setUtr('') }}>Mark paid</Button>
                          <Button size="sm" variant="danger" onClick={() => { setRejecting(w); setReason('') }}>Reject</Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Record this payment"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button
              loading={update.isPending}
              onClick={() => {
                if (!paying || !utr.trim()) return
                act(paying, 'paid', { payout_reference: utr.trim(), utr: utr.trim() })
                setPaying(null)
              }}
            >
              Mark as paid
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Paying <strong>{money(paying?.amount ?? 0)}</strong> to {paying?.member_name} (
          {maskAccount(paying?.account)}). The member sees this reference, and the amount moves from
          pending to withdrawn.
        </p>
        <Field label="Payment reference (UTR)" required>
          <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR…" />
        </Field>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this withdrawal"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={() => {
                if (!rejecting) return
                update.mutate(
                  { id: rejecting.id, member_id: rejecting.member_id, status: 'rejected', reject_reason: reason },
                  {
                    onSuccess: () => { toast.push('success', 'Withdrawal rejected'); setRejecting(null) },
                    onError: (e) => toast.push('error', (e as Error).message),
                  },
                )
              }}
            >
              Reject and return the money
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          {rejecting?.member_name} sees this reason on their Withdrawals screen, and the held amount
          returns to their available balance.
        </p>
        <Field label="Reason" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
