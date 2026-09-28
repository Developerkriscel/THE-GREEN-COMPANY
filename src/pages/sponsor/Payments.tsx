import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, FileText, IndianRupee, Plus, Receipt, Upload, Wallet,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMySales } from '@/lib/sponsor'
import {
  collectionTotals, collectionsOf, dayStart, saleStage, useMyEmis, useMyPayments,
  type CollectionRow, type EmiRow,
} from '@/lib/sponsor-crm'
import { itemLabel, PAY_MODES, useUploadReceipt } from '@/lib/plot-sale'
import { openPrivateFile } from '@/lib/supabase'
import { NewPlotSale } from '@/components/NewPlotSale'
import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatTile, useToast,
} from '@/components/ui'
import { Notice, ProgressBar, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { date, money, moneyShort } from '@/lib/format'

/**
 * Payments CRM — every sale the member filed, its schedule (booking amount,
 * EMIs, milestones) and where each item stands.
 *
 * The member uploads the receipt when a payment comes in; the office checks
 * it against the bank and verifies it, and only then does it count as
 * collected (trg_emis_on_paid writes the payment). Collected = verified money,
 * outstanding = total − collected, overdue = unpaid items past their date.
 */

function ItemStatus({ e, late }: { e: EmiRow; late: boolean }) {
  if (e.status === 'paid') return <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Verified</Badge>
  if (e.status === 'awaiting_verification') return <Badge tone="blue"><Clock className="h-3 w-3" /> Under review</Badge>
  if (e.status === 'rejected') return <Badge tone="red">Sent back</Badge>
  if (late) return <Badge tone="red"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>
  return <Badge tone="amber">Pending</Badge>
}

type Filter = 'all' | 'overdue' | 'review' | 'unverified'

export function SponsorPayments() {
  const { profile } = useAuth()
  const me = profile?.id
  const { data: sales = [], isLoading: salesLoading } = useMySales(me)

  // Rejected and cancelled sales carry no schedule worth chasing.
  const live = useMemo(() => sales.filter((s) => !['cancelled', 'rejected'].includes(s.status)), [sales])
  const ids = useMemo(() => live.map((s) => s.id), [live])
  const { data: emis = [], isLoading: emisLoading } = useMyEmis(ids)
  const { data: payments = [], isLoading: paymentsLoading } = useMyPayments(ids)

  const rows = useMemo(() => collectionsOf(live, emis, payments), [live, emis, payments])
  const totals = useMemo(() => collectionTotals(rows), [rows])
  const underReview = emis.filter((e) => e.status === 'awaiting_verification').length

  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [uploadFor, setUploadFor] = useState<{ item: EmiRow; row: CollectionRow } | null>(null)

  const loading = salesLoading || (ids.length > 0 && (emisLoading || paymentsLoading))
  const shown = rows.filter((r) =>
    filter === 'overdue' ? r.overdue.length > 0
      : filter === 'review' ? r.emis.some((e) => e.status === 'awaiting_verification')
      : filter === 'unverified' ? saleStage(r.booking.status) === 'pending'
      : true)

  return (
    <>
      <PageHeader
        title="Payments CRM"
        description="Track plot sale payments, EMIs and milestones. Upload the receipt when a payment is received — admin verifies it."
        action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New plot sale</Button>}
      />

      {totals.overdueCount > 0 && (
        <div className="mb-5">
          <Notice tone="warn" title={`${totals.overdueCount} payment${totals.overdueCount === 1 ? '' : 's'} overdue.`}>
            {money(totals.overdueAmount)} is past its due date. Collect it and upload the receipt — your area only counts toward rewards once half a sale is collected.
          </Notice>
        </div>
      )}

      {loading ? <SkeletonTiles count={4} /> : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Collected" value={moneyShort(totals.collected)} tone="green" icon={<Wallet className="h-4 w-4" />}
            hint={`${totals.collectedPct}% of ${moneyShort(totals.saleValue)}`} />
          <StatTile label="Outstanding" value={moneyShort(totals.outstanding)} icon={<IndianRupee className="h-4 w-4" />}
            hint={`${totals.bookings} sale${totals.bookings === 1 ? '' : 's'}`} />
          <StatTile label="Overdue" value={moneyShort(totals.overdueAmount)} tone={totals.overdueCount ? 'red' : 'neutral'}
            icon={<AlertTriangle className="h-4 w-4" />} hint={`${totals.overdueCount} item${totals.overdueCount === 1 ? '' : 's'}`} />
          <StatTile label="Receipts under review" value={String(underReview)} tone={underReview ? 'amber' : 'neutral'}
            icon={<Receipt className="h-4 w-4" />} hint="Waiting for the office" />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {([['all', 'All sales'], ['overdue', 'Overdue'], ['review', 'Under review'], ['unverified', 'Sale not yet verified']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={clsx('rounded-full px-3 py-1.5 text-sm font-medium transition',
                filter === k ? 'bg-gold-metal text-brand-darker shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-gold/10')}>
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? <Card><SkeletonRows rows={4} /></Card> : shown.length === 0 ? (
        <Card>
          <EmptyState
            title={rows.length === 0 ? 'No plot sales yet' : 'Nothing here'}
            description={rows.length === 0 ? 'Add one to start tracking payments.' : 'No sale matches this filter.'}
            action={rows.length === 0 ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New plot sale</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {shown.map((r) => (
            <SaleCard key={r.booking.id} row={r} open={openId === r.booking.id}
              onToggle={() => setOpenId((x) => (x === r.booking.id ? null : r.booking.id))}
              onUpload={(item) => setUploadFor({ item, row: r })} />
          ))}
        </div>
      )}

      {adding && <NewPlotSale onClose={() => setAdding(false)} onCreated={(id) => setOpenId(id)} />}
      {uploadFor && <UploadReceipt item={uploadFor.item} row={uploadFor.row} onClose={() => setUploadFor(null)} />}
    </>
  )
}

function SaleCard({ row: r, open, onToggle, onUpload }: {
  row: CollectionRow; open: boolean; onToggle: () => void; onUpload: (item: EmiRow) => void
}) {
  const { push } = useToast()
  const stage = saleStage(r.booking.status)
  const lateIds = new Set(r.overdue.map((e) => e.id))
  const today = dayStart(new Date().toISOString())
  const covered = coveredByItem(r)
  const nextLeft = r.nextDue ? Number(r.nextDue.amount) - (covered.get(r.nextDue.id) ?? 0) : 0

  return (
    <Card>
      <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-brand-darker">{r.booking.customer_name ?? 'Customer'}</p>
            <Badge tone={stage === 'verified' ? 'green' : 'amber'}>{stage === 'verified' ? 'Sale verified' : 'Sale pending verification'}</Badge>
            {r.overdue.length > 0 && <Badge tone="red">{r.overdue.length} overdue</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {r.booking.reference} · {r.booking.project?.name ?? '—'} · Plot {r.booking.plot?.number ?? '—'}
            {r.booking.customer_phone ? ` · ${r.booking.customer_phone}` : ''}
          </p>
        </div>
        <div className="w-full sm:w-64">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span><b className="text-emerald-700">{money(r.collected)}</b> of {money(r.booking.sale_value)}</span>
            <span>{r.collectedPct}%</span>
          </div>
          <ProgressBar percent={r.collectedPct} />
          <p className="mt-1 text-xs text-slate-500">
            {r.nextDue ? <>Next: {itemLabel(r.nextDue)} · {money(nextLeft)}{nextLeft < Number(r.nextDue.amount) ? ' left' : ''} on {date(r.nextDue.due_date)}</> : r.emis.length ? 'Fully collected' : 'No schedule'}
          </p>
        </div>
        <ChevronDown className={clsx('h-5 w-5 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-brand-gold/15">
          {r.emis.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">No schedule on this sale.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {r.emis.map((e) => {
                const late = lateIds.has(e.id) || (e.status !== 'paid' && dayStart(e.due_date) < today)
                const part = e.status !== 'paid' ? (covered.get(e.id) ?? 0) : 0
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-[140px] flex-1">
                      <p className="font-semibold text-brand-darker">{itemLabel(e)}</p>
                      <p className={clsx('text-xs', late && e.status !== 'paid' ? 'font-medium text-rose-600' : 'text-slate-500')}>Due {date(e.due_date)}</p>
                      {part > 0 && <p className="text-xs text-emerald-700">{money(part)} received · {money(Number(e.amount) - part)} left</p>}
                    </div>
                    <p className="w-28 text-right font-semibold text-brand-darker">{money(e.amount)}</p>
                    <div className="w-32"><ItemStatus e={e} late={late} /></div>
                    <div className="flex min-w-[150px] justify-end gap-1.5">
                      {e.slip_path && (
                        <Button size="sm" variant="ghost" onClick={() => void openPrivateFile('emi-slips', e.slip_path!).catch((err) => push('error', (err as Error).message))}>
                          <FileText className="h-3.5 w-3.5" /> Receipt
                        </Button>
                      )}
                      {['pending', 'overdue', 'rejected'].includes(e.status) && (
                        <Button size="sm" variant="outline" onClick={() => onUpload(e)}><Upload className="h-3.5 w-3.5" /> Upload receipt</Button>
                      )}
                    </div>
                    {e.status === 'rejected' && e.reject_reason && <p className="w-full text-xs text-rose-600">Office: {e.reject_reason}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          {r.payments.length > 0 && (
            <div className="border-t border-brand-gold/15 bg-brand-gold/[0.04] px-5 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Verified payments</p>
              <ul className="space-y-1 text-sm">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-slate-600">{date(p.paid_on)} · {p.mode.replace(/_/g, ' ')}{p.receipt_no ? ` · ${p.receipt_no}` : ''}</span>
                    <span className="font-semibold text-emerald-700">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * Collected money spread over the schedule oldest-first — the same order
 * record_payment() settles in — so a part payment shows against the item it
 * actually reduced.
 */
function coveredByItem(r: CollectionRow): Map<string, number> {
  const out = new Map<string, number>()
  let left = r.collected
  for (const e of [...r.emis].sort((a, z) => dayStart(a.due_date) - dayStart(z.due_date) || a.seq - z.seq)) {
    const take = Math.min(Number(e.amount), Math.max(0, left))
    out.set(e.id, take)
    left -= take
  }
  return out
}

function UploadReceipt({ item, row, onClose }: { item: EmiRow; row: CollectionRow; onClose: () => void }) {
  const upload = useUploadReceipt()
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState('bank_transfer')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')

  return (
    <Modal open onClose={onClose} title={`Upload receipt — ${itemLabel(item)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={upload.isPending} disabled={!file}
            onClick={() => file && upload.mutate({ item, file, mode, paidOn, reference }, {
              onSuccess: () => { push('success', 'Receipt sent. The office will verify it.'); onClose() },
              onError: (e) => push('error', (e as Error).message),
            })}>Send for verification</Button>
        </div>
      }>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          <b>{money(item.amount)}</b> due {date(item.due_date)} from {row.booking.customer_name ?? 'the customer'} ({row.booking.reference}).
        </p>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-brand-gold/40 px-4 py-6 text-sm text-slate-600 hover:bg-brand-gold/5">
          <Upload className="mb-2 h-5 w-5 text-brand-gold-dark" />
          {file ? <span className="font-semibold text-brand-darker">{file.name}</span> : 'Choose the receipt (PDF, JPG or PNG, up to 5 MB)'}
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid by">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Paid on"><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="UTR / cheque / receipt no."><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field></div>
        </div>
      </div>
    </Modal>
  )
}
