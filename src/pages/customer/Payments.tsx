import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Upload } from 'lucide-react'
import { type CustomerEmi } from '@/lib/customers'
import { itemLabel, PAY_MODES, useUploadReceipt } from '@/lib/plot-sale'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Td, Th, useToast } from '@/components/ui'
import { Notice, ProgressBar, SkeletonRows } from '@/components/sponsor'
import { date, money } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { useMyPortfolio } from './common'

/**
 * Instalments and receipts. When the customer has paid an instalment they
 * upload the bank slip; the office checks it against the bank statement in
 * Payments CRM and marks it paid (or sends it back with a reason).
 */

function EmiStatus({ e }: { e: CustomerEmi }) {
  const today = new Date().toISOString().slice(0, 10)
  if (e.status === 'paid') return <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Paid</Badge>
  if (e.status === 'awaiting_verification') return <Badge tone="blue"><Clock className="h-3 w-3" /> Slip under review</Badge>
  if (e.status === 'rejected') return <Badge tone="red">Slip not accepted</Badge>
  if (e.due_date < today || e.status === 'overdue') return <Badge tone="red"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>
  return <Badge tone="amber">Due</Badge>
}

export function CustomerPayments() {
  const { money: rows, payments, loading } = useMyPortfolio()
  const late = rows.flatMap((r) => r.overdue.filter((e) => ['pending', 'overdue', 'rejected'].includes(e.status)))
  const lateAmount = late.reduce((t, e) => t + Number(e.amount), 0)
  const oldest = late.map((e) => e.due_date.slice(0, 10)).sort()[0]
  const daysLate = oldest ? Math.max(1, Math.round((Date.now() - new Date(`${oldest}T00:00:00`).getTime()) / 86_400_000)) : 0
  const [slipFor, setSlipFor] = useState<CustomerEmi | null>(null)

  return (
    <>
      <PageHeader title="EMI & payments" description="Your instalment schedule, what you have paid, and receipts. Paid an instalment? Upload the slip so the office can confirm it." />
      {late.length > 0 && (
        <div className="mb-5"><Notice tone="error" title={`${money(lateAmount)} is overdue${late.length > 1 ? ` (${late.length} instalments)` : ''} — ${daysLate} day${daysLate === 1 ? '' : 's'} late`}>
          Please pay and upload the receipt below. Already paid? Upload the slip so the office can confirm it and stop the reminders.
        </Notice></div>
      )}
      {loading ? <Card><SkeletonRows rows={5} /></Card> : rows.length === 0 ? (
        <Card><EmptyState title="No payment schedule yet" description="It appears once the office links your booking." /></Card>
      ) : (
        <div className="space-y-6">
          {rows.map(({ booking: b, emis, pct, paid, outstanding }) => (
            <Card key={b.id}>
              <CardHeader title={`${b.project?.name ?? 'Plot'} · Plot ${b.plot?.number ?? '—'}`} subtitle={`Booking ${b.reference} · plot value ${money(b.sale_value)}`} />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {[['Paid', money(paid)], ['Still to pay', money(outstanding)], ['Progress', `${pct}%`]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-brand-gold/[0.07] px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p><p className="font-bold text-brand-darker">{v}</p></div>
                  ))}
                </div>
                <ProgressBar percent={pct} />
              </CardBody>
              {emis.length === 0 ? (
                <p className="border-t border-brand-gold/15 px-5 py-6 text-center text-sm text-slate-500">The instalment schedule will appear here once the office sets it up.</p>
              ) : (
                <Table>
                  <thead><tr><Th>Payment</Th><Th>Due date</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr></thead>
                  <tbody>
                    {emis.map((e) => (
                      <tr key={e.id}>
                        <Td className="font-medium text-brand-darker">{itemLabel(e)}</Td>
                        <Td>{date(e.due_date)}</Td>
                        <Td className="text-right font-semibold text-brand-darker">{money(e.amount)}</Td>
                        <Td>
                          <EmiStatus e={e} />
                          {e.status === 'rejected' && e.reject_reason && <p className="mt-1 text-xs text-red-600">{e.reject_reason}</p>}
                          {e.status === 'paid' && e.paid_at && <p className="mt-1 text-xs text-slate-500">on {date(e.paid_at)}</p>}
                        </Td>
                        <Td className="text-right">
                          {['pending', 'overdue', 'rejected'].includes(e.status) && (
                            <Button size="sm" variant="outline" onClick={() => setSlipFor(e)}><Upload className="h-3.5 w-3.5" /> Upload slip</Button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <div className="border-t border-brand-gold/15 px-5 py-4">
                <p className="mb-2 text-sm font-semibold text-brand-darker">Receipts</p>
                {payments.filter((p) => p.booking_id === b.id).length === 0 ? (
                  <p className="text-sm text-slate-500">No receipts yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {payments.filter((p) => p.booking_id === b.id).map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="text-slate-600">{date(p.paid_on)} · {p.mode.replace(/_/g, ' ')}{p.receipt_no ? ` · Receipt ${p.receipt_no}` : ''}</span>
                        <span className="font-semibold text-emerald-700">{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))}
          <p className="text-xs text-slate-500">
            Pay only into the company account and keep the official company slip — payments are valid only against it.
            Questions? Call +91 {BRAND.phone}.
          </p>
        </div>
      )}
      {slipFor && <SlipUpload emi={slipFor} onClose={() => setSlipFor(null)} />}
    </>
  )
}

function SlipUpload({ emi, onClose }: { emi: CustomerEmi; onClose: () => void }) {
  const upload = useUploadReceipt()
  const [mode, setMode] = useState('bank_transfer')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [ref, setRef] = useState('')
  const { push } = useToast()
  return (
    <Modal
      open onClose={onClose} title={`Upload payment slip — ${itemLabel(emi)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={upload.isPending} disabled={!file}
            onClick={() => file && upload.mutate({ item: emi, file, reference: ref, mode, paidOn }, {
              onSuccess: () => { push('success', 'Slip uploaded. The office will confirm it shortly.'); onClose() },
              onError: (e) => push('error', (e as Error).message),
            })}>Upload</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Instalment of <b>{money(emi.amount)}</b> due {date(emi.due_date)}. Upload a photo or PDF of the bank slip or transfer receipt.</p>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-brand-gold/40 px-4 py-6 text-sm text-slate-600 hover:bg-brand-gold/5">
          <Upload className="mb-2 h-5 w-5 text-brand-gold-dark" />
          {file ? <span className="font-semibold text-brand-darker">{file.name}</span> : 'Choose the slip (PDF, JPG or PNG, up to 5 MB)'}
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid by">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Paid on"><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        </div>
        <Field label="Transaction / UTR number (optional)"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UTR 1234567890" /></Field>
      </div>
    </Modal>
  )
}
