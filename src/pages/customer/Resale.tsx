import { useMemo, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { BadgeIndianRupee, CheckCircle2, Circle, Clock, Eye, Globe, Handshake, Info, Repeat, Users, XCircle } from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Textarea, useToast,
} from '@/components/ui'
import { Notice, SkeletonRows } from '@/components/sponsor'
import { date, money, num } from '@/lib/format'
import { OPEN_RESALE, RESALE_STATUS, useMyResales, useRequestResale, useWithdrawResale, type MyResale } from '@/lib/resale'
import type { CustomerBooking } from '@/lib/customers'
import { useMyPortfolio } from './common'

/**
 * Resell my plot. The owner asks to resell a confirmed plot; the office
 * reviews it, lists it for buyers (sponsors, and the website if it chooses)
 * and, once a buyer is settled, transfers the booking to them. The owner
 * follows every step here and sees how many buyers have enquired.
 */
export function CustomerResale() {
  const { money: rows, loading } = useMyPortfolio()
  const { data: resales = [], isLoading } = useMyResales()
  const [asking, setAsking] = useState<CustomerBooking | null>(null)

  const confirmed = rows.filter((r) => r.booking.status === 'confirmed')
  const openFor = (bookingId: string) => resales.find((r) => r.booking_id === bookingId && OPEN_RESALE.includes(r.status))
  const history = resales.filter((r) => !OPEN_RESALE.includes(r.status))

  return (
    <>
      <PageHeader title="Resell my plot" description="Want to sell your plot? Ask here — the office reviews it, finds buyers through our sponsors and website, and handles the transfer." />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          [<BadgeIndianRupee key="i" className="h-5 w-5" />, '1. You ask', 'Your price and reason.'],
          [<Eye key="i" className="h-5 w-5" />, '2. Office reviews', 'Checks dues and sets the listed price.'],
          [<Users key="i" className="h-5 w-5" />, '3. Buyers enquire', 'Sponsors and website visitors.'],
          [<Handshake key="i" className="h-5 w-5" />, '4. Transfer', 'The plot moves to the buyer.'],
        ].map(([icon, t, d]) => (
          <div key={String(t)} className="flex items-start gap-3 rounded-2xl border border-brand-gold/20 bg-white p-4 shadow-sm">
            <span className="rounded-xl bg-gold-metal p-2 text-brand-darker">{icon}</span>
            <div><p className="text-sm font-semibold text-brand-darker">{t}</p><p className="text-xs text-slate-500">{d}</p></div>
          </div>
        ))}
      </div>

      {loading || isLoading ? <Card><SkeletonRows rows={3} /></Card> : confirmed.length === 0 ? (
        <Card><EmptyState title="No plot to resell yet" description="Once your booking is confirmed by the office, you can put it up for resale here." /></Card>
      ) : (
        <div className="space-y-5">
          {confirmed.map((m) => {
            const b = m.booking
            const open = openFor(b.id)
            return (
              <Card key={b.id}>
                <CardHeader
                  title={`${b.project?.name ?? 'Plot'} · Plot ${b.plot?.number ?? '—'}`}
                  subtitle={`${b.plot?.size ? `${num(b.plot.size)} ${b.plot.size_unit === 'sqyd' ? 'sq yd' : b.plot.size_unit ?? ''} · ` : ''}Booking ${b.reference} · paid ${money(m.paid)} of ${money(m.value)}`}
                  action={open ? <Badge tone={RESALE_STATUS[open.status].tone}>{RESALE_STATUS[open.status].label}</Badge>
                    : <Button size="sm" onClick={() => setAsking(b)}><Repeat className="h-4 w-4" /> Resell this plot</Button>}
                />
                <CardBody>
                  {open ? <ResaleProgress r={open} /> : (
                    <p className="text-sm text-slate-500">
                      Not on resale. {m.overdue.length > 0
                        ? <span className="text-amber-700">You have {m.overdue.length} overdue instalment{m.overdue.length === 1 ? '' : 's'} — clear them so the transfer is not held up.</span>
                        : 'Ask any time; the office will call you before listing it.'}
                    </p>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {history.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Earlier resale requests" />
          <CardBody className="divide-y divide-slate-100 py-0">
            {history.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium text-brand-darker">{r.reference} · asked {money(r.asking_price)}</p>
                  <p className="text-xs text-slate-500">{date(r.created_at)}{r.closed_at ? ` → ${date(r.closed_at)}` : ''}{r.office_note ? ` · ${r.office_note}` : ''}</p>
                </div>
                <Badge tone={RESALE_STATUS[r.status].tone}>{RESALE_STATUS[r.status].label}{r.status === 'transferred' && r.sold_price ? ` · ${money(r.sold_price)}` : ''}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {asking && <RequestResale booking={asking} overdue={rows.find((m) => m.booking.id === asking.id)?.overdue.length ?? 0}
        outstanding={rows.find((m) => m.booking.id === asking.id)?.outstanding ?? 0} onClose={() => setAsking(null)} />}
    </>
  )
}

const STEPS: { key: 'submitted' | 'listed' | 'buyer_found' | 'transferred'; label: string }[] = [
  { key: 'submitted', label: 'Requested' },
  { key: 'listed', label: 'Listed' },
  { key: 'buyer_found', label: 'Buyer found' },
  { key: 'transferred', label: 'Transferred' },
]

function ResaleProgress({ r }: { r: MyResale }) {
  const withdraw = useWithdrawResale()
  const { push } = useToast()
  const [sure, setSure] = useState(false)
  const at = STEPS.findIndex((s) => s.key === r.status)
  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-4 gap-1">
        {STEPS.map((s, i) => {
          const done = i < at || r.status === 'transferred'
          const now = i === at && r.status !== 'transferred'
          return (
            <li key={s.key} className="relative flex flex-col items-center text-center">
              {i > 0 && <span className={clsx('absolute right-1/2 top-3 h-0.5 w-full', i <= at ? 'bg-brand-gold' : 'bg-slate-200')} aria-hidden />}
              <span className={clsx('relative z-10 flex h-6 w-6 items-center justify-center rounded-full', done ? 'bg-brand-gold text-white' : now ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-400')}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : now ? <Clock className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
              </span>
              <span className={clsx('mt-1 text-[11px] font-medium', done || now ? 'text-brand-darker' : 'text-slate-400')}>{s.label}</span>
            </li>
          )
        })}
      </ol>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ['Reference', r.reference],
          ['You asked', `${money(r.asking_price)}${r.negotiable ? ' (negotiable)' : ''}`],
          ['Listed at', r.listed_price ? money(r.listed_price) : 'After review'],
          ['Buyer enquiries', String(r.inquiries)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-brand-gold/[0.07] px-3 py-2"><dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-semibold text-brand-darker">{v}</dd></div>
        ))}
      </dl>

      {r.status !== 'submitted' && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {r.transfer_fee > 0 && <span>Transfer fee: <b className="text-brand-darker">{money(r.transfer_fee)}</b></span>}
          <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{r.show_on_website ? 'Shown on our website' : 'Offered through our sponsors'}</span>
        </p>
      )}
      {r.office_note && <Notice title="Note from the office">{r.office_note}</Notice>}
      {r.status === 'submitted' && <Notice title="The office is reviewing your request">They will call you to agree the listed price before it goes to buyers.</Notice>}
      {r.status === 'buyer_found' && <Notice title="A buyer has been found">The office will call you to arrange the agreement and transfer.</Notice>}

      <div className="flex justify-end">
        {sure ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Take your plot off resale?</span>
            <Button size="sm" variant="ghost" onClick={() => setSure(false)}>No</Button>
            <Button size="sm" variant="danger" loading={withdraw.isPending}
              onClick={() => withdraw.mutate(r.id, { onSuccess: () => push('success', 'Your plot is off resale.'), onError: (e) => push('error', (e as Error).message) })}>
              <XCircle className="h-4 w-4" /> Yes, withdraw
            </Button>
          </div>
        ) : <Button size="sm" variant="ghost" onClick={() => setSure(true)}>Withdraw from resale</Button>}
      </div>
    </div>
  )
}

function RequestResale({ booking: b, overdue, outstanding, onClose }: { booking: CustomerBooking; overdue: number; outstanding: number; onClose: () => void }) {
  const ask = useRequestResale()
  const { push } = useToast()
  const [price, setPrice] = useState('')
  const [negotiable, setNegotiable] = useState(true)
  const [reason, setReason] = useState('')
  const [agree, setAgree] = useState(false)
  const size = Number(b.plot?.size ?? 0)
  const rate = Number(b.project?.price_to || b.project?.price_from || 0)
  const guide = useMemo(() => (size > 0 && rate > 0 ? size * rate : 0), [size, rate])
  const priceN = Number(price) || 0

  function submit(e: FormEvent) {
    e.preventDefault()
    ask.mutate({ bookingId: b.id, askingPrice: priceN, negotiable, reason: reason.trim() }, {
      onSuccess: () => { push('success', 'Request sent — the office will call you to review it.'); onClose() },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <Modal open onClose={onClose} title={`Resell ${b.project?.name ?? 'plot'} · Plot ${b.plot?.number ?? ''}`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="resale-ask" loading={ask.isPending} disabled={priceN <= 0 || !agree}>Send request</Button></div>}>
      <form id="resale-ask" onSubmit={submit} className="space-y-4">
        <Field label="Your asking price (₹)" required hint={guide > 0 ? `Guide: ${num(size)} sq yd × current rate ${money(rate)} ≈ ${money(guide)}` : undefined}>
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 2500000" />
        </Field>
        {priceN > 0 && <p className="-mt-2 text-xs text-slate-500">{money(priceN)}{size > 0 ? ` · ${money(Math.round(priceN / size))} per sq yd` : ''}</p>}
        <Checkbox checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} label="The price is negotiable" />
        <Field label="Why are you selling? (optional)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. moving city, need funds" /></Field>
        {(outstanding > 0 || overdue > 0) && (
          <Notice tone={overdue > 0 ? 'warn' : 'info'} title={overdue > 0 ? `${overdue} instalment${overdue === 1 ? ' is' : 's are'} overdue` : `${money(outstanding)} is still to be paid`}>
            The balance is settled with the buyer at transfer; overdue instalments must be cleared before the office can complete it.
          </Notice>
        )}
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-dark" />
          <span>The office reviews every resale, may suggest a listed price, and charges the transfer fee it tells you before listing. Your name and number are never shown to buyers.</span>
        </div>
        <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label="I own this plot and want the office to find a buyer for it." />
      </form>
    </Modal>
  )
}
