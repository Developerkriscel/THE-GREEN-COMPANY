import { useMemo, useState } from 'react'
import { AlertTriangle, IndianRupee, Receipt, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMySales } from '@/lib/sponsor'
import {
  collectionTotals, collectionsOf, useMyEmis, useMyPayments,
  type CollectionRow, type EmiRow,
} from '@/lib/sponsor-crm'
import {
  Badge, Card, CardHeader, EmptyState, Modal, PageHeader, RecordCard,
  Responsive, StatTile, Table, Td, Th,
} from '@/components/ui'
import { Notice, ProgressBar, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { date, money, moneyShort } from '@/lib/format'

/**
 * Payments CRM — the instalment position of every sale the member sourced.
 *
 * Read-only by design. payments_write_admin means only the office may record
 * a receipt, so this screen tells the member who owes what and when, and stops
 * there. Recording money against a booking stays with the people who can see
 * the bank statement.
 */

const EMI_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  paid: 'green',
  verified: 'green',
  waived: 'neutral',
  awaiting_verification: 'blue',
  pending: 'amber',
  overdue: 'red',
  rejected: 'red',
}

function EmiBadge({ emi, overdue }: { emi: EmiRow; overdue: boolean }) {
  const label = overdue && emi.status === 'pending' ? 'Overdue' : emi.status.replace(/_/g, ' ')
  const tone = overdue && emi.status === 'pending' ? 'red' : (EMI_TONE[emi.status] ?? 'neutral')
  return <Badge tone={tone}>{label.replace(/^\w/, (c) => c.toUpperCase())}</Badge>
}

export function SponsorPayments() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: sales = [], isLoading: salesLoading } = useMySales(me)

  // Only bookings that are actually live carry an instalment plan; cancelled
  // ones would drag dead EMIs into every total.
  const live = useMemo(() => sales.filter((s) => s.status !== 'cancelled'), [sales])
  const ids = useMemo(() => live.map((s) => s.id), [live])

  const { data: emis = [], isLoading: emisLoading } = useMyEmis(ids)
  const { data: payments = [], isLoading: paymentsLoading } = useMyPayments(ids)

  const rows = useMemo(() => collectionsOf(live, emis, payments), [live, emis, payments])
  const totals = useMemo(() => collectionTotals(rows), [rows])

  const [open, setOpen] = useState<CollectionRow | null>(null)
  const [onlyOverdue, setOnlyOverdue] = useState(false)

  const loading = salesLoading || emisLoading || paymentsLoading
  const shown = onlyOverdue ? rows.filter((r) => r.overdue.length > 0) : rows

  return (
    <>
      <PageHeader
        title="Payments"
        description="What your customers have paid, what is still due, and what has slipped."
      />

      {totals.overdueCount > 0 && (
        <div className="mb-5">
          <Notice tone="warn" title={`${totals.overdueCount} instalment${totals.overdueCount === 1 ? '' : 's'} overdue.`}>
            {money(totals.overdueAmount)} is past its due date across your bookings.
            Chasing these is the fastest way to move your own commission along.
          </Notice>
        </div>
      )}

      {loading ? (
        <SkeletonTiles count={4} />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Sale value" value={moneyShort(totals.saleValue)} icon={<IndianRupee className="h-4 w-4" />}
            hint={`${totals.bookings} booking${totals.bookings === 1 ? '' : 's'}`} />
          <StatTile label="Collected" value={moneyShort(totals.collected)} tone="green" icon={<Wallet className="h-4 w-4" />}
            hint={`${totals.collectedPct}% of sale value`} />
          <StatTile label="Outstanding" value={moneyShort(totals.outstanding)} tone="amber" icon={<Receipt className="h-4 w-4" />}
            hint="Still to come in" />
          <StatTile label="Overdue" value={moneyShort(totals.overdueAmount)}
            tone={totals.overdueCount ? 'red' : 'neutral'} icon={<AlertTriangle className="h-4 w-4" />}
            hint={`${totals.overdueCount} instalment${totals.overdueCount === 1 ? '' : 's'}`} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
              checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
            Show only bookings with something overdue
          </label>
        </div>
      )}

      <Card>
        <CardHeader title="Collection by booking" subtitle={`${shown.length} shown`} />
        {loading ? (
          <SkeletonRows rows={5} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'No bookings yet' : 'Nothing overdue'}
            description={
              rows.length === 0
                ? 'Once a sale you sourced is booked, its payment schedule appears here.'
                : 'Every instalment on your bookings is on time.'
            }
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th>Booking</Th><Th>Plot</Th><Th>Sale value</Th><Th>Collected</Th>
                    <Th>Outstanding</Th><Th>Next due</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.booking.id}>
                      <Td>
                        <button className="text-left font-medium text-slate-900 hover:underline" onClick={() => setOpen(r)}>
                          {r.booking.reference}
                        </button>
                        <p className="text-xs text-slate-400">{r.booking.project?.name ?? '—'}</p>
                      </Td>
                      <Td>{r.booking.plot?.number ?? '—'}</Td>
                      <Td>{money(r.booking.sale_value)}</Td>
                      <Td>
                        <span className="font-medium text-emerald-700">{money(r.collected)}</span>
                        <div className="mt-1 w-24"><ProgressBar percent={r.collectedPct} /></div>
                      </Td>
                      <Td>{money(r.outstanding)}</Td>
                      <Td>
                        {r.nextDue ? (
                          <span className={r.overdue.length ? 'font-medium text-rose-600' : ''}>
                            {date(r.nextDue.due_date)}
                            {r.overdue.length > 0 && <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />}
                          </span>
                        ) : r.emis.length === 0 ? (
                          <Badge tone="neutral">No plan</Badge>
                        ) : (
                          <Badge tone="green">Cleared</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setOpen(r)}>
                          Schedule
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {shown.map((r) => (
                  <RecordCard
                    key={r.booking.id}
                    title={<button className="text-left hover:underline" onClick={() => setOpen(r)}>{r.booking.reference}</button>}
                    subtitle={`${r.booking.project?.name ?? '—'} · Plot ${r.booking.plot?.number ?? '—'}`}
                    amount={<span className="text-sm font-semibold text-emerald-700">{money(r.collected)}</span>}
                    badge={r.overdue.length > 0 ? <Badge tone="red">{r.overdue.length} overdue</Badge> : undefined}
                    rows={[
                      { label: 'Sale value', value: money(r.booking.sale_value) },
                      { label: 'Outstanding', value: money(r.outstanding) },
                      { label: 'Collected', value: `${r.collectedPct}%` },
                      {
                        label: 'Next due',
                        value: r.nextDue
                          ? date(r.nextDue.due_date)
                          : r.emis.length === 0 ? 'No plan' : 'Cleared',
                      },
                    ]}
                  />
                ))}
              </div>
            }
          />
        )}
      </Card>

      <ScheduleModal row={open} onClose={() => setOpen(null)} />
    </>
  )
}

function ScheduleModal({ row, onClose }: { row: CollectionRow | null; onClose: () => void }) {
  if (!row) return null
  const overdueIds = new Set(row.overdue.map((e) => e.id))

  return (
    <Modal open onClose={onClose} title={`${row.booking.reference} — payment schedule`} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Sale value', money(row.booking.sale_value)],
            ['Collected', money(row.collected)],
            ['Outstanding', money(row.outstanding)],
            ['Progress', `${row.collectedPct}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-400">{k}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{v}</p>
            </div>
          ))}
        </div>
        <ProgressBar percent={row.collectedPct} />

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Instalments</h3>
          {row.emis.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No instalment plan has been set up for this booking yet.
            </p>
          ) : (
            <Table>
              <thead>
                <tr><Th>#</Th><Th>Due</Th><Th>Amount</Th><Th>Status</Th><Th>Paid on</Th></tr>
              </thead>
              <tbody>
                {row.emis.map((e) => (
                  <tr key={e.id}>
                    <Td>{e.seq}</Td>
                    <Td className={overdueIds.has(e.id) ? 'font-medium text-rose-600' : ''}>{date(e.due_date)}</Td>
                    <Td>{money(e.amount)}</Td>
                    <Td><EmiBadge emi={e} overdue={overdueIds.has(e.id)} /></Td>
                    <Td>{e.paid_at ? date(e.paid_at) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Receipts</h3>
          {row.payments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Nothing received yet.</p>
          ) : (
            <Table>
              <thead>
                <tr><Th>Date</Th><Th>Amount</Th><Th>Mode</Th><Th>Receipt</Th></tr>
              </thead>
              <tbody>
                {row.payments.map((p) => (
                  <tr key={p.id}>
                    <Td>{date(p.paid_on)}</Td>
                    <Td className="font-medium text-emerald-700">{money(p.amount)}</Td>
                    <Td>{p.mode.replace(/_/g, ' ')}</Td>
                    <Td>{p.receipt_no ?? p.reference ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Payments are recorded by the office. If a customer has paid and it is not shown here,
          raise it on the Support screen.
        </p>
      </div>
    </Modal>
  )
}
