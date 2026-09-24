import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Check, X, FileText, Bell } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import {
  Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner,
  StatTile, Table, Td, Textarea, Th, Badge, useToast, type Tone,
} from '@/components/ui'
import { date, money, moneyShort, num } from '@/lib/format'
import {
  useAgeOverdueEmis, useCollectionQueue, useRecordPayment, type CollectionQueueRow,
} from '@/lib/queries'

interface CrmEmi {
  id: string
  seq: number
  due_date: string
  amount: number
  status: string
  slip_path: string | null
  reference: string | null
  paid_at: string | null
  booking?: {
    id: string
    reference: string
    customer?: { full_name: string } | null
    rep?: { full_name: string; member_code: string | null } | null
    project?: { name: string } | null
  } | null
}

const EMI_SELECT = `
  id, seq, due_date, amount, status, slip_path, reference, paid_at,
  booking:bookings (
    id, reference,
    customer:profiles!bookings_customer_id_fkey ( full_name ),
    rep:profiles!bookings_rep_id_fkey ( full_name, member_code ),
    project:projects ( name )
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

export function AdminPaymentsCrm() {
  const { data: emis = [], isLoading, error } = useCrmEmis()
  const [tab, setTab] = useState<'collections' | 'pending' | 'all'>('collections')
  const [rejecting, setRejecting] = useState<CrmEmi | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const { data: queue = [], isLoading: queueLoading } = useCollectionQueue()
  const recordPayment = useRecordPayment()
  const ageOverdue = useAgeOverdueEmis()
  const [paying, setPaying] = useState<CollectionQueueRow | null>(null)

  // Every figure here is the sum of RECEIPTS, not a count of instalments
  // flagged paid — the same definition the member's panel and
  // my_reward_area() use, so the office and the member never disagree.
  const collected = queue.reduce((t, r) => t + Number(r.collected ?? 0), 0)
  const outstanding = queue.reduce((t, r) => t + Number(r.outstanding ?? 0), 0)
  const overdue = queue.filter((r) => r.emi_overdue > 0).reduce((t, r) => t + Number(r.outstanding ?? 0), 0)
  const awaiting = emis.filter((e) => e.status === 'awaiting_verification').length

  const rows = useMemo(
    () => (tab === 'pending' ? emis.filter((e) => e.status === 'awaiting_verification') : emis),
    [emis, tab],
  )
  const reminders = useMemo(
    () => emis.filter((e) => e.status === 'overdue' || e.status === 'pending').slice(0, 6),
    [emis],
  )

  const verify = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from('emis').update({ status: 'paid' }).eq('id', id)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.functions.invoke('generate-receipt', { body: { emi_id: id } })
      if (e2) console.error('[crm] receipt failed', e2.message)
    },
    onSuccess: () => { push('success', 'Payment verified and receipt generated.'); void qc.invalidateQueries({ queryKey: ['crm-emis'] }) },
    onError: (e: Error) => push('error', e.message),
  })

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from('emis').update({ status: 'rejected', reject_reason: reason }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { push('success', 'Slip rejected.'); setRejecting(null); void qc.invalidateQueries({ queryKey: ['crm-emis'] }) },
    onError: (e: Error) => push('error', e.message),
  })

  const runReminders = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('flag-overdue-emis', { body: {} })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { push('success', 'Reminders processed for overdue installments.'); void qc.invalidateQueries({ queryKey: ['crm-emis'] }) },
    onError: (e: Error) => push('error', e.message),
  })

  return (
    <div>
      <PageHeader
        title="Payments CRM"
        description="Plot sale payment schedules, EMI reminders and receipt verification."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={ageOverdue.isPending}
              onClick={() => ageOverdue.mutate(undefined, {
                onSuccess: (n) => push('success', n ? `${n} instalment(s) marked overdue.` : 'Nothing is overdue.'),
                onError: (e) => push('error', (e as Error).message),
              })}
            >
              <Bell className="h-4 w-4" /> Age overdue
            </Button>
            <Button loading={runReminders.isPending} onClick={() => runReminders.mutate()}>
              <Send className="h-4 w-4" /> Run reminders
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Collected" value={moneyShort(collected)} tone="green" />
        <StatTile label="Outstanding" value={moneyShort(outstanding)} />
        <StatTile label="Overdue" value={moneyShort(overdue)} tone="red" />
        <StatTile label="Awaiting verification" value={num(awaiting)} tone="amber" />
      </div>

      <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-slate-200">
        {(['collections', 'pending', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {t === 'collections' ? 'Collections' : t === 'pending' ? 'Slips to verify' : 'All instalments'}
          </button>
        ))}
      </div>

      {tab === 'collections' ? (
        <Card className="mb-6">
          {queueLoading ? (
            <Spinner />
          ) : queue.length === 0 ? (
            <EmptyState
              title="Nothing to collect"
              description="Verified sales and their payment schedules appear here."
            />
          ) : (
            <Table>
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
                        <p className="font-medium text-slate-900">{r.reference}</p>
                        <p className="text-xs text-slate-400">
                          {r.project_name ?? '—'} · Plot {r.plot_number ?? '—'}
                        </p>
                      </Td>
                      <Td>
                        {r.customer_name ?? '—'}
                        {r.customer_phone && <p className="text-xs text-slate-400">{r.customer_phone}</p>}
                      </Td>
                      <Td>
                        {r.rep_name ?? '—'}
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
                        {r.emi_overdue > 0 ? (
                          <Badge tone="red">{r.emi_overdue} overdue</Badge>
                        ) : r.next_due ? (
                          date(r.next_due)
                        ) : (
                          <Badge tone="green">Cleared</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        <Button size="sm" onClick={() => setPaying(r)}>Record payment</Button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
      <Card className="mb-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing here" description={tab === 'pending' ? 'No receipts awaiting verification.' : 'No installments yet.'} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer / Project</Th><Th>Sponsor</Th><Th>Instalment</Th>
                <Th>Amount</Th><Th>{tab === 'pending' ? 'Uploaded' : 'Status'}</Th><Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{e.booking?.customer?.full_name ?? '—'}</p>
                    <p className="text-xs text-slate-400">{e.booking?.project?.name ?? e.booking?.reference ?? '—'}</p>
                  </Td>
                  <Td className="text-slate-600">
                    {e.booking?.rep?.full_name ?? '—'}
                    {e.booking?.rep?.member_code && <span className="text-xs text-slate-400"> ({e.booking.rep.member_code})</span>}
                  </Td>
                  <Td className="text-slate-600">{e.seq === 0 ? 'Booking amount' : `EMI ${e.seq}`}</Td>
                  <Td className="font-medium text-slate-800">{money(e.amount)}</Td>
                  <Td>
                    {tab === 'pending'
                      ? <span className="text-xs text-slate-500">{date(e.due_date)}</span>
                      : <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{e.status.replace(/_/g, ' ')}</Badge>}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {e.slip_path && (
                        <Button size="sm" variant="ghost"
                          onClick={() => void openPrivateFile('emi-slips', e.slip_path!).catch((err) => push('error', err instanceof Error ? err.message : 'Could not open slip'))}>
                          <FileText className="h-3.5 w-3.5" /> Receipt
                        </Button>
                      )}
                      {e.status === 'awaiting_verification' && (
                        <>
                          <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate(e.id)}>
                            <Check className="h-3.5 w-3.5" /> Verify
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setRejecting(e)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
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
                  {e.status === 'overdue' ? 'Overdue payment' : 'Upcoming payment'} — {e.booking?.customer?.full_name ?? 'customer'}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Instalment {e.seq === 0 ? '"Booking amount"' : `"EMI ${e.seq}"`} of {money(e.amount)} for{' '}
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
        title="Reject this payment slip"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" type="submit" form="crm-reject" loading={reject.isPending}>Reject slip</Button>
          </>
        }
      >
        <form id="crm-reject" onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? ''); if (rejecting) reject.mutate({ id: rejecting.id, reason }) }}>
          <Field label="Reason" hint="Shown to the customer so they can correct it." required>
            <Textarea name="reason" required rows={3} placeholder="e.g. The amount on the slip does not match the installment." />
          </Field>
        </form>
      </Modal>

      <RecordPaymentModal
        row={paying}
        busy={recordPayment.isPending}
        onClose={() => setPaying(null)}
        onSave={(input) =>
          paying &&
          recordPayment.mutate(
            { bookingId: paying.booking_id, ...input },
            {
              onSuccess: () => { push('success', 'Payment recorded.'); setPaying(null) },
              onError: (e) => push('error', (e as Error).message),
            },
          )
        }
      />
    </div>
  )
}

/* ------------------------------------------------------- record a receipt */

/**
 * Recording money is the office's job alone (payments_write_admin). The RPC
 * writes the receipt AND settles instalments oldest-first in one transaction,
 * so the schedule can never drift from the money.
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
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </Select>
          </Field>
          <Field label="Reference / UTR"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Company receipt no." hint="The slip number, per the terms.">
            <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
          </Field>
          <Field label="Received on" hint="Leave blank for today.">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>

        {value > 0 && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            After this, {money(after)} of {money(row.sale_value)} collected ({pctAfter}%).
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
