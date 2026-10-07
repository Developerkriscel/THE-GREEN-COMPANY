import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Check, X, FileText, Bell, Plus, CalendarClock } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import {
  Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, RecordCard, Responsive, Select, Spinner,
  StatTile, Table, Td, Textarea, Th, Badge, useToast, type Tone,
} from '@/components/ui'
import { date, money, moneyShort, num } from '@/lib/format'
import {
  useAgeOverdueEmis, useCollectionQueue, useRecordPayment, type CollectionQueueRow,
} from '@/lib/queries'
import { itemLabel, PAY_MODES } from '@/lib/plot-sale'
import { NewPlotSale } from '@/components/NewPlotSale'
import { useRunRemindersNow } from '@/lib/reminders'

interface CrmEmi {
  id: string
  booking_id: string
  seq: number
  kind: string | null
  label: string | null
  due_date: string
  amount: number
  status: string
  slip_path: string | null
  slip_uploaded_at: string | null
  slip_mode: string | null
  slip_paid_on: string | null
  reference: string | null
  reject_reason: string | null
  paid_at: string | null
  booking?: {
    id: string
    reference: string
    status: string
    customer_name: string | null
    customer?: { full_name: string } | null
    rep?: { full_name: string; member_code: string | null } | null
    project?: { name: string } | null
    plot?: { number: string } | null
  } | null
}

const EMI_SELECT = `
  id, booking_id, seq, kind, label, due_date, amount, status, slip_path, slip_uploaded_at, slip_mode, slip_paid_on,
  reference, reject_reason, paid_at,
  booking:bookings (
    id, reference, status, customer_name,
    customer:profiles!bookings_customer_id_fkey ( full_name ),
    rep:profiles!bookings_rep_id_fkey ( full_name, member_code ),
    project:projects ( name ),
    plot:plots ( number )
  )
`

function useCrmEmis() {
  return useQuery({
    queryKey: ['crm-emis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('emis').select(EMI_SELECT).order('due_date')
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as CrmEmi[]
    },
  })
}

const STATUS_TONE: Record<string, Tone> = {
  paid: 'green', awaiting_verification: 'amber', pending: 'neutral', overdue: 'red', rejected: 'red',
}
const STATUS_LABEL: Record<string, string> = {
  paid: 'Verified', awaiting_verification: 'To verify', pending: 'Pending', overdue: 'Overdue', rejected: 'Sent back',
}
const modeLabel = (m: string | null) => PAY_MODES.find((x) => x.value === m)?.label ?? (m ? m.replace(/_/g, ' ') : '—')
const buyer = (e: CrmEmi) => e.booking?.customer?.full_name ?? e.booking?.customer_name ?? '—'

type Tab = 'collections' | 'pending' | 'all'

export function AdminPaymentsCrm() {
  const { data: emis = [], isLoading, error } = useCrmEmis()
  const [params, setParams] = useSearchParams()
  const tab: Tab = (['collections', 'pending', 'all'] as const).find((t) => t === params.get('tab')) ?? 'collections'
  const setTab = (t: Tab) => setParams(t === 'collections' ? {} : { tab: t })
  const [rejecting, setRejecting] = useState<CrmEmi | null>(null)
  const [adding, setAdding] = useState(false)
  const [scheduleOf, setScheduleOf] = useState<CollectionQueueRow | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const { data: queue = [], isLoading: queueLoading } = useCollectionQueue()
  const recordPayment = useRecordPayment()
  const ageOverdue = useAgeOverdueEmis()
  const [paying, setPaying] = useState<CollectionQueueRow | null>(null)

  // Every figure is the sum of RECEIPTS — the same definition the member's
  // panel, the customer's panel and my_reward_area() use.
  const collected = queue.reduce((t, r) => t + Number(r.collected ?? 0), 0)
  const outstanding = queue.reduce((t, r) => t + Number(r.outstanding ?? 0), 0)
  const overdue = queue.reduce((t, r) => t + Number(r.overdue_amount ?? 0), 0)
  const awaiting = emis.filter((e) => e.status === 'awaiting_verification').length

  const rows = useMemo(
    () => (tab === 'pending' ? emis.filter((e) => e.status === 'awaiting_verification') : emis),
    [emis, tab],
  )
  const reminders = useMemo(
    () => emis.filter((e) => e.status === 'overdue' || e.status === 'pending').slice(0, 6),
    [emis],
  )

  const refresh = () => {
    for (const k of ['crm-emis', 'collection-queue', 'sponsor-emis', 'sponsor-payments', 'customer-emis', 'customer-payments', 'sponsor-reward-area']) {
      void qc.invalidateQueries({ queryKey: [k] })
    }
  }

  // Verifying writes the payment (trg_emis_on_paid) and tells the member and
  // the buyer; the PDF receipt is generated after.
  const verify = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from('emis').update({ status: 'paid' }).eq('id', id)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.functions.invoke('generate-receipt', { body: { emi_id: id } })
      if (e2) console.error('[crm] receipt failed', e2.message)
    },
    onSuccess: () => { push('success', 'Payment verified — it now counts as collected.'); refresh() },
    onError: (e: Error) => push('error', e.message),
  })

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from('emis').update({ status: 'rejected', reject_reason: reason }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { push('success', 'Receipt sent back with your reason.'); setRejecting(null); refresh() },
    onError: (e: Error) => push('error', e.message),
  })

  // The same pass the gateway runs every hour (marks overdue, sends the due
  // soon / due today / overdue reminders to customers and sponsors, once each).
  const runRemindersNow = useRunRemindersNow()
  const runReminders = {
    isPending: runRemindersNow.isPending,
    mutate: () => runRemindersNow.mutate(undefined, {
      onSuccess: (n) => { push('success', n ? `${n} reminder message(s) sent to customers and sponsors.` : 'Everyone due has already been reminded today.'); refresh() },
      onError: (e) => push('error', (e as Error).message),
    }),
  }

  const actions = (e: CrmEmi) => (
    <div className="flex justify-end gap-1.5">
      {e.slip_path && (
        <Button size="sm" variant="ghost"
          onClick={() => void openPrivateFile('emi-slips', e.slip_path!).catch((err) => push('error', err instanceof Error ? err.message : 'Could not open the receipt'))}>
          <FileText className="h-3.5 w-3.5" /> Receipt
        </Button>
      )}
      {e.status === 'awaiting_verification' && (
        <>
          <Button size="sm" loading={verify.isPending && verify.variables === e.id} onClick={() => verify.mutate(e.id)}>
            <Check className="h-3.5 w-3.5" /> Verify
          </Button>
          <Button size="sm" variant="danger" aria-label="Send back" onClick={() => setRejecting(e)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Payments CRM"
        description="Plot sale payment schedules, receipts to verify, collections and reminders."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={ageOverdue.isPending}
              onClick={() => ageOverdue.mutate(undefined, {
                onSuccess: (n) => { push('success', n ? `${n} instalment(s) marked overdue.` : 'Nothing is overdue.'); refresh() },
                onError: (e) => push('error', (e as Error).message),
              })}
            >
              <Bell className="h-4 w-4" /> Age overdue
            </Button>
            <Button variant="outline" loading={runReminders.isPending} onClick={() => runReminders.mutate()}>
              <Send className="h-4 w-4" /> Run reminders
            </Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New plot sale</Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Collected" value={moneyShort(collected)} tone="green" hint="Verified payments" />
        <StatTile label="Outstanding" value={moneyShort(outstanding)} hint="Total − collected" />
        <StatTile label="Overdue" value={moneyShort(overdue)} tone="red" hint="Unpaid items past due" />
        <StatTile label="Receipts to verify" value={num(awaiting)} tone="amber" />
      </div>

      <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-slate-200">
        {(['collections', 'pending', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'bg-gold-metal text-brand-darker shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {t === 'collections' ? 'Collections' : t === 'pending' ? `Receipts to verify${awaiting ? ` (${awaiting})` : ''}` : 'All items'}
          </button>
        ))}
      </div>

      {tab === 'collections' ? (
        <Card className="mb-6">
          {queueLoading ? (
            <Spinner />
          ) : queue.length === 0 ? (
            <EmptyState title="Nothing to collect" description="Verified sales and their payment schedules appear here." />
          ) : (
            <Responsive table={<Table>
              <thead>
                <tr>
                  <Th>Booking</Th><Th>Customer</Th><Th>Member</Th><Th>Sale value</Th>
                  <Th>Collected</Th><Th>Outstanding</Th><Th>Next due</Th><Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => {
                  const pct = Number(r.sale_value) > 0
                    ? Math.min(100, Math.round((Number(r.collected) / Number(r.sale_value)) * 100))
                    : 0
                  return (
                    <tr key={r.booking_id} className="hover:bg-slate-50">
                      <Td>
                        <button className="whitespace-nowrap text-left font-medium text-slate-900 hover:underline" onClick={() => setScheduleOf(r)}>{r.reference}</button>
                        <p className="text-xs text-slate-400">{r.project_name ?? '—'} · Plot {r.plot_number ?? '—'}</p>
                      </Td>
                      <Td>
                        {r.customer_name ?? '—'}
                        {r.customer_phone && <p className="text-xs text-slate-400">{r.customer_phone}</p>}
                      </Td>
                      <Td>
                        {r.rep_name ?? 'Office'}
                        <p className="text-xs text-slate-400">{r.rep_code ?? ''}</p>
                      </Td>
                      <Td>{money(r.sale_value)}</Td>
                      <Td>
                        <span className="font-medium text-emerald-700">{money(r.collected)}</span>
                        <p className="text-xs text-slate-400">
                          {pct}% {pct >= 50 && <span className="text-emerald-600">· reward-eligible</span>}
                        </p>
                      </Td>
                      <Td>{money(r.outstanding)}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          {r.emi_overdue > 0 ? <><span className="whitespace-nowrap"><Badge tone="red">{r.emi_overdue} overdue</Badge></span><span className="whitespace-nowrap text-xs font-medium text-rose-600">{money(r.overdue_amount)}</span></>
                            : r.next_due ? date(r.next_due) : <Badge tone="green">Cleared</Badge>}
                          {r.awaiting > 0 && <span className="whitespace-nowrap"><Badge tone="amber">{r.awaiting} to verify</Badge></span>}
                        </div>
                      </Td>
                      <Td className="text-right">
                        <div className="flex flex-col items-stretch gap-1.5">
                          <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => setScheduleOf(r)}><CalendarClock className="h-3.5 w-3.5" /> Schedule</Button>
                          <Button size="sm" className="whitespace-nowrap" onClick={() => setPaying(r)}>Record payment</Button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>} cards={
              <div>
                {queue.map((r) => {
                  const pct = Number(r.sale_value) > 0 ? Math.min(100, Math.round((Number(r.collected) / Number(r.sale_value)) * 100)) : 0
                  return (
                    <RecordCard
                      key={r.booking_id}
                      onClick={() => setScheduleOf(r)}
                      title={<>{r.reference} <span className="text-xs font-normal text-slate-500">· {r.customer_name ?? '—'}</span></>}
                      subtitle={`${r.project_name ?? '—'} · Plot ${r.plot_number ?? '—'} · ${r.rep_name ?? 'Office'}`}
                      amount={<span className="text-sm font-semibold text-emerald-700">{money(r.collected)}</span>}
                      badge={r.emi_overdue > 0 ? <Badge tone="red">{r.emi_overdue} overdue</Badge> : r.awaiting > 0 ? <Badge tone="amber">{r.awaiting} to verify</Badge> : undefined}
                      rows={[
                        { label: 'Sale value', value: money(r.sale_value) },
                        { label: 'Collected', value: `${pct}%` },
                        { label: 'Outstanding', value: money(r.outstanding) },
                        { label: 'Next due', value: r.emi_overdue > 0 ? money(r.overdue_amount) + ' late' : r.next_due ? date(r.next_due) : 'Cleared' },
                      ]}
                      actions={<>
                        <Button size="sm" variant="outline" onClick={() => setScheduleOf(r)}><CalendarClock className="h-3.5 w-3.5" /> Schedule</Button>
                        <Button size="sm" onClick={() => setPaying(r)}>Record payment</Button>
                      </>}
                    />
                  )
                })}
              </div>
            } />
          )}
        </Card>
      ) : (
      <Card className="mb-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing here" description={tab === 'pending' ? 'No receipts waiting for verification.' : 'No schedule items yet.'} />
        ) : (
          <Responsive table={<Table>
            <thead>
              <tr>
                <Th>Customer / Booking</Th><Th>Sponsor</Th><Th>Item</Th>
                <Th>Amount</Th><Th>{tab === 'pending' ? 'Receipt' : 'Status'}</Th><Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{buyer(e)}</p>
                    <p className="text-xs text-slate-400">
                      {e.booking?.reference ?? '—'} · {e.booking?.project?.name ?? '—'}{e.booking?.plot?.number ? ` · Plot ${e.booking.plot.number}` : ''}
                      {e.booking && e.booking.status !== 'confirmed' && <span className="ml-1 text-amber-600">(sale not yet verified)</span>}
                    </p>
                  </Td>
                  <Td className="text-slate-600">
                    {e.booking?.rep?.full_name ?? 'Office'}
                    {e.booking?.rep?.member_code && <span className="text-xs text-slate-400"> ({e.booking.rep.member_code})</span>}
                  </Td>
                  <Td className="text-slate-600">
                    {itemLabel(e)}
                    <p className="text-xs text-slate-400">Due {date(e.due_date)}</p>
                  </Td>
                  <Td className="font-medium text-slate-800">{money(e.amount)}</Td>
                  <Td>
                    {tab === 'pending' ? (
                      <div className="text-xs text-slate-600">
                        <p>{modeLabel(e.slip_mode)}{e.slip_paid_on ? ` · paid ${date(e.slip_paid_on)}` : ''}</p>
                        {e.reference && <p className="font-mono">{e.reference}</p>}
                        {e.slip_uploaded_at && <p className="text-slate-400">uploaded {date(e.slip_uploaded_at)}</p>}
                      </div>
                    ) : <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>}
                  </Td>
                  <Td>{actions(e)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>} cards={
            <div>
              {rows.map((e) => (
                <RecordCard
                  key={e.id}
                  title={<>{buyer(e)} <span className="text-xs font-normal text-slate-500">· {itemLabel(e)}</span></>}
                  subtitle={`${e.booking?.reference ?? '—'} · ${e.booking?.project?.name ?? '—'}${e.booking?.plot?.number ? ` · Plot ${e.booking.plot.number}` : ''}`}
                  amount={<span className="text-sm font-semibold text-slate-800">{money(e.amount)}</span>}
                  badge={<Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>}
                  rows={[
                    { label: 'Due', value: date(e.due_date) },
                    { label: 'Sponsor', value: e.booking?.rep?.full_name ?? 'Office' },
                    ...(e.status === 'awaiting_verification' ? [
                      { label: 'Paid by', value: `${modeLabel(e.slip_mode)}${e.slip_paid_on ? ` · ${date(e.slip_paid_on)}` : ''}` },
                      { label: 'UTR / ref', value: e.reference ?? '—' },
                    ] : []),
                  ]}
                  actions={(e.slip_path || e.status === 'awaiting_verification') ? actions(e) : undefined}
                />
              ))}
            </div>
          } />
        )}
      </Card>
      )}

      <Card>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Bell className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900">Notification log</h3>
        </div>
        {reminders.length === 0 ? (
          <EmptyState title="No reminders pending" description="Overdue and upcoming installments will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {reminders.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <p className="text-sm font-medium text-slate-800">
                  {e.status === 'overdue' ? 'Overdue payment' : 'Upcoming payment'} — {buyer(e)}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  "{itemLabel(e)}" of {money(e.amount)} for{' '}
                  {e.booking?.project?.name ?? e.booking?.reference ?? 'a plot'} is due on {date(e.due_date)}
                  {e.status === 'overdue' ? ' and is still pending.' : '.'}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">email not sent · SMS not sent</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Send this receipt back"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" type="submit" form="crm-reject" loading={reject.isPending}>Send back</Button>
          </>
        }
      >
        <form id="crm-reject" onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? ''); if (rejecting) reject.mutate({ id: rejecting.id, reason }) }}>
          <Field label="Reason" hint="The sponsor and the customer both see it, so they can correct it." required>
            <Textarea name="reason" required rows={3} placeholder="e.g. The amount on the receipt does not match this item." />
          </Field>
        </form>
      </Modal>

      {scheduleOf && (
        <ScheduleModal row={scheduleOf} items={emis.filter((e) => e.booking_id === scheduleOf.booking_id)} actions={actions}
          onClose={() => setScheduleOf(null)} onRecord={() => { setPaying(scheduleOf); setScheduleOf(null) }} />
      )}

      <RecordPaymentModal
        row={paying}
        busy={recordPayment.isPending}
        onClose={() => setPaying(null)}
        onSave={(input) =>
          paying &&
          recordPayment.mutate(
            { bookingId: paying.booking_id, ...input },
            {
              onSuccess: () => { push('success', 'Payment recorded.'); setPaying(null); refresh() },
              onError: (e) => push('error', (e as Error).message),
            },
          )
        }
      />

      {adding && <NewPlotSale office onClose={() => setAdding(false)} />}
    </div>
  )
}

/* ------------------------------------------------------- one booking */

function ScheduleModal({ row, items, actions, onClose, onRecord }: {
  row: CollectionQueueRow
  items: CrmEmi[]
  actions: (e: CrmEmi) => React.ReactNode
  onClose: () => void
  onRecord: () => void
}) {
  const sorted = [...items].sort((a, z) => a.due_date.localeCompare(z.due_date) || a.seq - z.seq)
  return (
    <Modal open onClose={onClose} size="lg" title={`${row.reference} — payment schedule`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={onRecord}>Record payment</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
          {[
            ['Customer', row.customer_name ?? '—'],
            ['Sale value', money(row.sale_value)],
            ['Collected', money(row.collected)],
            ['Outstanding', money(row.outstanding)],
          ].map(([k, v]) => (
            <div key={k}><p className="text-xs text-slate-400">{k}</p><p className="font-medium text-slate-800">{v}</p></div>
          ))}
        </div>
        {sorted.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No schedule on this booking.</p> : (
          <Table>
            <thead><tr><Th>Item</Th><Th>Due</Th><Th>Amount</Th><Th>Status</Th><Th className="text-right" /></tr></thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium">{itemLabel(e)}</Td>
                  <Td>{date(e.due_date)}</Td>
                  <Td>{money(e.amount)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                    {e.status === 'rejected' && e.reject_reason && <p className="mt-1 text-xs text-rose-600">{e.reject_reason}</p>}
                  </Td>
                  <Td>{actions(e)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------- record a receipt */

/**
 * Money received at the office without an uploaded receipt. The RPC writes
 * the payment AND settles items oldest-first in one transaction.
 */
function RecordPaymentModal({
  row, busy, onClose, onSave,
}: {
  row: CollectionQueueRow | null
  busy: boolean
  onClose: () => void
  onSave: (input: { amount: number; mode: string; reference?: string; paidOn?: string; receiptNo?: string }) => void
}) {
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [receiptNo, setReceiptNo] = useState('')
  const [paidOn, setPaidOn] = useState('')

  if (!row) return null

  const value = Number(amount || 0)
  const outstanding = Number(row.outstanding ?? 0)
  const after = Number(row.collected ?? 0) + value
  const pctAfter = Number(row.sale_value) > 0
    ? Math.min(100, Math.round((after / Number(row.sale_value)) * 100))
    : 0
  const crossesHalf = pctAfter >= 50 && Number(row.collected) < Number(row.sale_value) / 2

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payment — ${row.reference}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={value <= 0 || busy}
            onClick={() => onSave({
              amount: value,
              mode,
              reference: reference.trim() || undefined,
              receiptNo: receiptNo.trim() || undefined,
              paidOn: paidOn || undefined,
            })}
          >
            {busy ? 'Recording…' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
          {[
            ['Customer', row.customer_name ?? '—'],
            ['Sale value', money(row.sale_value)],
            ['Collected', money(row.collected)],
            ['Outstanding', money(row.outstanding)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-slate-400">{k}</p>
              <p className="font-medium text-slate-800">{v}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Amount received (₹)"
            required
            hint={value > outstanding && outstanding > 0 ? 'More than the outstanding balance.' : undefined}
          >
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Reference / UTR"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Company receipt no." hint="Leave blank to number it automatically.">
            <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
          </Field>
          <Field label="Received on" hint="Leave blank for today.">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>

        {value > 0 && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            After this, {money(after)} of {money(row.sale_value)} collected ({pctAfter}%). Items are settled oldest first.
            {crossesHalf && (
              <> This crosses 50%, so <strong>{row.rep_name ?? 'the member'}</strong>'s area on this
              sale starts counting toward their reward tier.</>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
