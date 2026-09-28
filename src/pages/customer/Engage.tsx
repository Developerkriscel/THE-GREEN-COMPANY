import { useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Gift, Send, Star, UserPlus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  useCustomerOffers, useFeedback, useMyReferrals, useReferSomeone, useSendFeedback,
} from '@/lib/customers'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Textarea, useToast } from '@/components/ui'
import { SkeletonRows } from '@/components/sponsor'
import { date } from '@/lib/format'
import { ContactCards, useMyPortfolio } from './common'

/* ---------------------------------------------------------------- offers */

export function CustomerOffers() {
  const { data: offers = [], isLoading } = useCustomerOffers()
  return (
    <>
      <PageHeader title="Offers" description="Current offers from the company for our customers." />
      {isLoading ? <Card><SkeletonRows rows={3} /></Card> : offers.length === 0 ? (
        <Card><EmptyState title="No offers right now" description="New offers appear here — check back soon." /></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((o) => (
            <div key={o.id} className="card-luxe overflow-hidden rounded-2xl border border-brand-gold/20 bg-white shadow-luxe">
              {o.image_url ? <img src={o.image_url} alt="" className="h-44 w-full object-cover" />
                : <div className="bg-leaf-deep flex h-28 items-center justify-center"><Gift className="h-10 w-10 text-brand-gold-light" /></div>}
              <div className="p-5">
                <p className="text-lg font-bold text-brand-darker">{o.title}</p>
                {o.body && <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{o.body}</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  {o.valid_until ? <Badge tone="gold">Valid till {date(o.valid_until)}</Badge> : <span />}
                  {o.cta_link && <a href={o.cta_link} target="_blank" rel="noopener noreferrer" className="btn-gold rounded-lg px-4 py-2 text-sm">{o.cta_label || 'Know more'}</a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------------- referrals */

export function CustomerRefer() {
  const refer = useReferSomeone()
  const { data: mine = [] } = useMyReferrals()
  const [f, setF] = useState({ name: '', mobile: '', note: '' })
  const { push } = useToast()

  function submit(e: FormEvent) {
    e.preventDefault()
    refer.mutate(f, {
      onSuccess: (r) => {
        push('success', r.duplicate ? 'You have already referred this number — we have it.' : 'Thank you! Our team will get in touch with them.')
        setF({ name: '', mobile: '', note: '' })
      },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <>
      <PageHeader title="Refer a friend" description="Know someone looking for a plot? Give us their name and number and your relationship manager will call them." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Their details" />
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" /></Field>
              <Field label="Mobile number" required><Input inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} placeholder="10-digit number" /></Field>
              <Field label="Anything we should know? (optional)"><Textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Looking for a 100 sq yd plot near Sohna" /></Field>
              <Button type="submit" loading={refer.isPending} disabled={f.name.trim().length < 2 || f.mobile.replace(/\D/g, '').length < 10}>
                <UserPlus className="h-4 w-4" /> Send referral
              </Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="People you referred" subtitle={`${mine.length} so far`} />
          {mine.length === 0 ? <EmptyState title="No referrals yet" /> : (
            <ul className="divide-y divide-slate-100">
              {mine.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div><p className="font-semibold text-brand-darker">{r.name}</p><p className="text-xs text-slate-500">{r.mobile} · {date(r.created_at)}</p></div>
                  <Badge tone={r.status === 'Bought a plot' ? 'green' : r.status === 'Not interested' ? 'neutral' : 'gold'}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

/* --------------------------------------------------------------- feedback */

export function CustomerFeedbackPage() {
  const { profile } = useAuth()
  const send = useSendFeedback()
  const { data: past = [] } = useFeedback(profile?.id)
  const { bookings } = useMyPortfolio()
  const [rating, setRating] = useState<number>(0)
  const [message, setMessage] = useState('')
  const [bookingId, setBookingId] = useState('')
  const { push } = useToast()

  function submit(e: FormEvent) {
    e.preventDefault()
    send.mutate({ rating: rating || null, message, booking_id: bookingId || null }, {
      onSuccess: () => { push('success', 'Thank you — your feedback has reached the office.'); setRating(0); setMessage('') },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <>
      <PageHeader title="Feedback" description="Tell us how we are doing. The office reads every message and replies here." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Your feedback" />
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-700">How was your experience?</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`}>
                      <Star className={clsx('h-8 w-8 transition', n <= rating ? 'fill-brand-gold text-brand-gold-dark' : 'text-slate-300 hover:text-brand-gold')} />
                    </button>
                  ))}
                </div>
              </div>
              {bookings.length > 1 && (
                <Field label="About which plot? (optional)">
                  <select value={bookingId} onChange={(e) => setBookingId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">General</option>
                    {bookings.map((b) => <option key={b.id} value={b.id}>{b.project?.name} · Plot {b.plot?.number}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Message" required><Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your experience, a suggestion or a problem…" /></Field>
              <Button type="submit" loading={send.isPending} disabled={message.trim().length < 2}><Send className="h-4 w-4" /> Send feedback</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Earlier feedback" />
          {past.length === 0 ? <EmptyState title="Nothing yet" /> : (
            <ul className="divide-y divide-slate-100">
              {past.map((f) => (
                <li key={f.id} className="space-y-2 px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-brand-gold-dark">{f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : ''}</span>
                    <span className="text-xs text-slate-400">{date(f.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-700">{f.message}</p>
                  {f.admin_reply && (
                    <div className="rounded-xl bg-brand-gold/[0.08] px-3 py-2 text-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-gold-deep">Reply from the office</p>
                      <p className="mt-0.5 whitespace-pre-line text-brand-darker">{f.admin_reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- contact */

export function CustomerContact() {
  return (
    <>
      <PageHeader title="Contact" description="Your relationship manager and the company's contact details." />
      <ContactCards />
    </>
  )
}
