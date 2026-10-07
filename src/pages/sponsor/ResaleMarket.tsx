import { useState, type FormEvent } from 'react'
import { Compass, Globe, MapPin, MessageCircle, Repeat, Ruler, Send } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { useResaleInquiries, useResaleInquire, useResaleMarket, resalePlotLabel, type ResalePlot } from '@/lib/resale'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Textarea, useToast } from '@/components/ui'
import { SkeletonRows } from '@/components/sponsor'
import { date, money, num } from '@/lib/format'

/**
 * Resale plots — plots their owners have asked the office to resell, for the
 * member to offer their prospects. The member shares a plot on WhatsApp or
 * registers an interested buyer; the office takes the deal from there. The
 * owner's identity is never shown.
 */
export function SponsorResaleMarket() {
  const { data: plots = [], isLoading } = useResaleMarket()
  const { data: mine = [] } = useResaleInquiries()
  const [registerFor, setRegisterFor] = useState<ResalePlot | null>(null)

  return (
    <>
      <PageHeader title="Resale Plots" description="Plots their owners want to sell, listed by the office. Share them with your prospects and register anyone interested — the office arranges the visit, agreement and transfer." />

      {isLoading ? <Card><SkeletonRows rows={3} /></Card> : plots.length === 0 ? (
        <Card><EmptyState title="No resale plots right now" description="When the office lists a plot for resale it appears here." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plots.map((p) => {
            const share = [
              `🏡 Resale plot available — ${BRAND.short}`,
              resalePlotLabel(p),
              [p.location, p.city].filter(Boolean).join(', '),
              p.facing ? `Facing ${p.facing}` : '',
              `Price: ${money(p.price)}${p.negotiable ? ' (negotiable)' : ''}`,
              `Ref ${p.reference}. Reply to book a site visit.`,
            ].filter(Boolean).join('\n')
            return (
              <Card key={p.id}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-brand-darker">{p.project_name ?? 'Plot'}{p.plot_number ? ` · Plot ${p.plot_number}` : ''}</p>
                      <p className="text-xs text-slate-500">{p.reference} · listed {date(p.listed_at)}</p>
                    </div>
                    <Badge tone="gold">{money(p.price)}</Badge>
                  </div>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    {(p.location || p.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-brand-gold-dark" />{[p.location, p.city].filter(Boolean).join(', ')}</span>}
                    {p.size && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5 text-brand-gold-dark" />{num(p.size)} {p.size_unit === 'sqyd' ? 'sq yd' : p.size_unit}{p.dimensions ? ` (${p.dimensions})` : ''}</span>}
                    {p.facing && <span className="inline-flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-brand-gold-dark" />{p.facing}</span>}
                  </p>
                  <p className="flex flex-wrap gap-2 text-xs">
                    {p.negotiable && <Badge tone="green">Negotiable</Badge>}
                    {p.size ? <Badge tone="neutral">{money(Math.round(p.price / Number(p.size)))} / sq yd</Badge> : null}
                    {p.on_website && <Badge tone="blue"><Globe className="h-3 w-3" /> On website</Badge>}
                    {(p.my_inquiries ?? 0) > 0 && <Badge tone="violet">You registered {p.my_inquiries}</Badge>}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                      <MessageCircle className="h-4 w-4" /> Share on WhatsApp
                    </a>
                    <Button size="sm" variant="outline" onClick={() => setRegisterFor(p)}><Send className="h-4 w-4" /> Register a buyer</Button>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {mine.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Buyers you registered" subtitle="The office calls them; the status shows how far it has gone." />
          <CardBody className="divide-y divide-slate-100 py-0">
            {mine.map((i) => {
              const p = plots.find((x) => x.id === i.listing_id)
              return (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium text-brand-darker">{i.name} · <span className="font-mono text-xs">{i.phone}</span></p>
                    <p className="text-xs text-slate-500">{p ? resalePlotLabel(p) : 'Plot no longer listed'} · {date(i.created_at)}{i.message ? ` · ${i.message}` : ''}</p>
                  </div>
                  <Badge tone={i.status === 'new' ? 'amber' : i.status === 'contacted' ? 'blue' : 'neutral'}>{i.status === 'new' ? 'With the office' : i.status === 'contacted' ? 'Office contacted' : 'Closed'}</Badge>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {registerFor && <RegisterBuyer plot={registerFor} onClose={() => setRegisterFor(null)} />}
    </>
  )
}

function RegisterBuyer({ plot, onClose }: { plot: ResalePlot; onClose: () => void }) {
  const inquire = useResaleInquire()
  const { push } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const ok = name.trim() && phone.replace(/\D/g, '').length >= 10

  function submit(e: FormEvent) {
    e.preventDefault()
    inquire.mutate({ listingId: plot.id, name: name.trim(), phone, message: message.trim() }, {
      onSuccess: (r) => { push('success', r === 'already' ? 'This buyer is already registered for this plot today.' : 'Buyer registered — the office will call them.'); onClose() },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <Modal open onClose={onClose} title={<span className="inline-flex items-center gap-2"><Repeat className="h-4 w-4" /> Register a buyer</span>}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="reg-buyer" loading={inquire.isPending} disabled={!ok}>Register</Button></div>}>
      <form id="reg-buyer" onSubmit={submit} className="space-y-3">
        <p className="rounded-xl bg-brand-gold/[0.07] px-3 py-2 text-sm text-brand-darker">{resalePlotLabel(plot)} · {money(plot.price)}</p>
        <Field label="Buyer's name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Buyer's mobile" required><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" /></Field>
        <Field label="Note for the office"><Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Budget, visit date, anything useful" /></Field>
      </form>
    </Modal>
  )
}
