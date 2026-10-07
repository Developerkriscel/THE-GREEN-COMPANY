import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Globe, MessageCircle, Phone, Repeat, XCircle } from 'lucide-react'
import {
  OPEN_RESALE, RESALE_STATUS, useAdminCompleteResale, useAdminResales, useAdminSetResale, useResaleInquiries, useSetInquiryStatus,
  type AdminResale, type ResaleInquiry, type ResaleStatus,
} from '@/lib/resale'
import { useBookingEmis, useBookingPayments, useCustomers } from '@/lib/customers'
import { intlPhone } from '@/lib/reminders'
import {
  Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, StatTile, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { Notice, SkeletonRows } from '@/components/sponsor'
import { date, money, moneyShort, num } from '@/lib/format'

/**
 * Resale desk — plot owners' resale requests from the customer panel.
 * Review (listed price, transfer fee, website or sponsors only), follow the
 * buyers' enquiries (website and sponsors), mark a buyer found, and transfer
 * the booking to the buyer's customer account.
 */
type Tab = 'requests' | 'listed' | 'closed' | 'enquiries'

export function AdminResale() {
  const { data: listings = [], isLoading } = useAdminResales()
  const { data: inquiries = [] } = useResaleInquiries()
  const [tab, setTab] = useState<Tab>('requests')
  const [openId, setOpenId] = useState<string | null>(null)
  const ids = useMemo(() => listings.filter((l) => OPEN_RESALE.includes(l.status)).map((l) => l.booking_id), [listings])
  const { data: emis = [] } = useBookingEmis(ids)
  const { data: payments = [] } = useBookingPayments(ids)

  const position = (bookingId: string, value: number) => {
    const paid = payments.filter((p) => p.booking_id === bookingId).reduce((t, p) => t + Number(p.amount), 0)
    const today = new Date().toISOString().slice(0, 10)
    const late = emis.filter((e) => e.booking_id === bookingId && ['pending', 'overdue', 'rejected'].includes(e.status) && e.due_date.slice(0, 10) < today)
    return { paid, outstanding: Math.max(0, value - paid), late: late.length, lateAmount: late.reduce((t, e) => t + Number(e.amount), 0) }
  }

  const byTab: Record<Exclude<Tab, 'enquiries'>, AdminResale[]> = {
    requests: listings.filter((l) => l.status === 'submitted'),
    listed: listings.filter((l) => l.status === 'listed' || l.status === 'buyer_found'),
    closed: listings.filter((l) => !OPEN_RESALE.includes(l.status)),
  }
  const newEnquiries = inquiries.filter((i) => i.status === 'new').length
  const open = listings.find((l) => l.id === openId) ?? null

  return (
    <>
      <PageHeader title="Resale desk" description="Plot owners ask to resell from their customer panel. Review each request, list it for sponsors and the website, follow up buyers, and transfer the plot when the deal is done." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="New requests" value={byTab.requests.length} hint="Waiting for review" tone={byTab.requests.length ? 'amber' : 'neutral'} icon={<Repeat className="h-4 w-4" />} />
        <StatTile label="On resale" value={byTab.listed.length} hint={`${listings.filter((l) => l.status === 'listed' && l.show_on_website).length} on the website`} icon={<Globe className="h-4 w-4" />} />
        <StatTile label="New enquiries" value={newEnquiries} hint={`${inquiries.length} in all`} tone={newEnquiries ? 'amber' : 'neutral'} icon={<Phone className="h-4 w-4" />} />
        <StatTile label="Transferred" value={listings.filter((l) => l.status === 'transferred').length}
          hint={moneyShort(listings.filter((l) => l.status === 'transferred').reduce((t, l) => t + Number(l.sold_price ?? 0), 0)) + ' resold'} icon={<ArrowRightLeft className="h-4 w-4" />} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {([['requests', `Requests (${byTab.requests.length})`], ['listed', `On resale (${byTab.listed.length})`], ['enquiries', `Buyer enquiries (${inquiries.length})`], ['closed', `Closed (${byTab.closed.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold ring-1', tab === k ? 'bg-brand-darker text-brand-gold-light ring-brand-darker' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-gold')}>
            {label}
          </button>
        ))}
      </div>

      <Card className="mt-4">
        {isLoading ? <SkeletonRows rows={4} /> : tab === 'enquiries' ? (
          <EnquiryTable inquiries={inquiries} listings={listings} onOpen={setOpenId} />
        ) : byTab[tab].length === 0 ? (
          <EmptyState title={tab === 'requests' ? 'No requests waiting' : tab === 'listed' ? 'Nothing on resale' : 'Nothing closed yet'} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead><tr><Th>Ref</Th><Th>Plot</Th><Th>Owner</Th><Th className="text-right">Asking</Th><Th className="text-right">Listed</Th><Th>Payments</Th><Th>Enquiries</Th><Th>Status</Th></tr></thead>
              <tbody>
                {byTab[tab].map((l) => {
                  const pos = position(l.booking_id, Number(l.booking?.sale_value ?? 0))
                  return (
                    <tr key={l.id} className="cursor-pointer hover:bg-brand-gold/[0.04]" onClick={() => setOpenId(l.id)}>
                      <Td className="font-mono text-xs">{l.reference}<span className="block font-sans text-[11px] text-slate-400">{date(l.created_at)}</span></Td>
                      <Td>{l.booking?.project?.name ?? '—'} · Plot {l.booking?.plot?.number ?? '—'}<span className="block text-xs text-slate-500">{l.booking?.plot?.size ? `${num(l.booking.plot.size)} sq yd` : ''}</span></Td>
                      <Td>{l.seller?.full_name ?? '—'}<span className="block text-xs text-slate-500">{l.seller?.user_code}</span></Td>
                      <Td className="text-right">{money(l.asking_price)}</Td>
                      <Td className="text-right">{l.listed_price ? money(l.listed_price) : '—'}</Td>
                      <Td className="text-xs">{OPEN_RESALE.includes(l.status) ? (pos.late ? <span className="font-semibold text-red-700">{pos.late} overdue · {money(pos.lateAmount)}</span> : `${money(pos.outstanding)} to pay`) : '—'}</Td>
                      <Td>{inquiries.filter((i) => i.listing_id === l.id).length}</Td>
                      <Td><Badge tone={RESALE_STATUS[l.status].tone}>{RESALE_STATUS[l.status].label}</Badge>{l.status === 'listed' && l.show_on_website && <Globe className="ml-1 inline h-3.5 w-3.5 text-blue-600" />}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {open && <ResaleModal l={open} pos={position(open.booking_id, Number(open.booking?.sale_value ?? 0))}
        inquiries={inquiries.filter((i) => i.listing_id === open.id)} onClose={() => setOpenId(null)} />}
    </>
  )
}

function EnquiryTable({ inquiries, listings, onOpen }: { inquiries: ResaleInquiry[]; listings: AdminResale[]; onOpen: (id: string) => void }) {
  const setStatus = useSetInquiryStatus()
  if (inquiries.length === 0) return <EmptyState title="No buyer enquiries yet" description="Website visitors and sponsors' buyers appear here." />
  return (
    <div className="overflow-x-auto">
      <Table>
        <thead><tr><Th>When</Th><Th>Buyer</Th><Th>Plot</Th><Th>From</Th><Th>Message</Th><Th>Status</Th></tr></thead>
        <tbody>
          {inquiries.map((i) => {
            const l = listings.find((x) => x.id === i.listing_id)
            return (
              <tr key={i.id}>
                <Td className="text-xs">{date(i.created_at)}</Td>
                <Td>{i.name}<ContactLinks phone={i.phone} /></Td>
                <Td><button className="text-left text-brand-gold-dark hover:underline" onClick={() => l && onOpen(l.id)}>{l?.reference ?? '—'}</button>
                  <span className="block text-xs text-slate-500">{l?.booking?.project?.name} · Plot {l?.booking?.plot?.number}</span></Td>
                <Td className="text-xs">{i.source === 'sponsor' ? `Sponsor ${i.sponsor?.full_name ?? ''} ${i.sponsor?.member_code ?? ''}` : i.source === 'website' ? 'Website' : 'Office'}</Td>
                <Td className="max-w-[240px] text-xs text-slate-600">{i.message ?? '—'}</Td>
                <Td>
                  <Select value={i.status} onChange={(e) => setStatus.mutate({ id: i.id, status: e.target.value as ResaleInquiry['status'] })} className="h-8 text-xs">
                    <option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option>
                  </Select>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}

function ContactLinks({ phone }: { phone: string | null }) {
  const p = intlPhone(phone)
  return (
    <span className="mt-0.5 flex items-center gap-2 font-mono text-xs text-slate-500">
      {phone ?? '—'}
      {p && <a href={`tel:+${p}`} className="text-brand-gold-dark" title="Call"><Phone className="h-3.5 w-3.5" /></a>}
      {p && <a href={`https://wa.me/${p}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600" title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></a>}
    </span>
  )
}

function ResaleModal({ l, pos, inquiries, onClose }: {
  l: AdminResale; pos: { paid: number; outstanding: number; late: number; lateAmount: number }; inquiries: ResaleInquiry[]; onClose: () => void
}) {
  const set = useAdminSetResale()
  const complete = useAdminCompleteResale()
  const { data: customers = [] } = useCustomers()
  const { push } = useToast()
  const [price, setPrice] = useState(String(l.listed_price ?? l.asking_price))
  const [fee, setFee] = useState(String(l.transfer_fee ?? 0))
  const [web, setWeb] = useState(l.show_on_website)
  const [note, setNote] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [sold, setSold] = useState(String(l.listed_price ?? l.asking_price))
  const [transferNote, setTransferNote] = useState('')
  useEffect(() => { setPrice(String(l.listed_price ?? l.asking_price)); setWeb(l.show_on_website); setFee(String(l.transfer_fee ?? 0)) }, [l])
  const isOpen = OPEN_RESALE.includes(l.status)
  const rate = Number(l.booking?.project?.price_to || l.booking?.project?.price_from || 0)
  const size = Number(l.booking?.plot?.size ?? 0)

  const move = (status: ResaleStatus, done: string) => set.mutate(
    { id: l.id, status, listedPrice: Number(price) || null, transferFee: Number(fee) || 0, showOnWebsite: web, note: note.trim() || null },
    { onSuccess: () => { push('success', done); setNote('') }, onError: (e) => push('error', (e as Error).message) },
  )

  return (
    <Modal open onClose={onClose} size="lg" title={<span>{l.reference} · <Badge tone={RESALE_STATUS[l.status].tone}>{RESALE_STATUS[l.status].label}</Badge></span>}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ['Plot', `${l.booking?.project?.name ?? '—'} · ${l.booking?.plot?.number ?? '—'}${size ? ` · ${num(size)} sq yd` : ''}`],
            ['Owner', `${l.seller?.full_name ?? '—'} (${l.seller?.user_code ?? '—'})`],
            ['Booking', `${l.booking?.reference ?? '—'} · ${money(l.booking?.sale_value)}`],
            ['Paid so far', `${money(pos.paid)} · ${money(pos.outstanding)} left`],
            ['Asking', `${money(l.asking_price)}${l.negotiable ? ' · negotiable' : ''}`],
            ['Guide value', rate && size ? `${money(rate * size)} (${money(rate)}/sq yd)` : '—'],
            ['Requested', date(l.created_at)],
            ['Reason', l.reason ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-brand-gold/[0.07] px-3 py-2"><dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-medium text-brand-darker">{v}</dd></div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ContactLinks phone={l.seller?.phone ?? null} />
          <Link to={`/admin/customers/${l.seller_id}`} className="font-semibold text-brand-gold-dark hover:underline">Open owner's customer page →</Link>
        </div>
        {pos.late > 0 && isOpen && <Notice tone="warn" title={`${pos.late} instalment${pos.late === 1 ? ' is' : 's are'} overdue (${money(pos.lateAmount)})`}>Clear or settle them with the buyer before completing the transfer.</Notice>}

        {isOpen && (
          <Card>
            <CardHeader title={l.status === 'submitted' ? 'Review the request' : 'Listing'} subtitle="The owner sees the listed price, fee and note in their panel." />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Listed price (₹)" required><Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="Transfer fee (₹)" hint="Charged at transfer; 0 for none."><Input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))} /></Field>
              </div>
              <Checkbox checked={web} onChange={(e) => setWeb(e.target.checked)} label="Show on the website's Resale Plots page (owner's name and number are never shown)" />
              <Field label="Note to the owner (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <div className="flex flex-wrap justify-end gap-2">
                {l.status === 'submitted' && <>
                  <Button variant="ghost" loading={set.isPending} onClick={() => move('rejected', 'Request rejected — the owner has been told.')}><XCircle className="h-4 w-4" /> Reject</Button>
                  <Button loading={set.isPending} disabled={!(Number(price) > 0)} onClick={() => move('listed', 'Listed — sponsors can now offer it.')}><CheckCircle2 className="h-4 w-4" /> Approve &amp; list</Button>
                </>}
                {l.status === 'listed' && <>
                  <Button variant="ghost" loading={set.isPending} onClick={() => move('withdrawn', 'Taken off resale.')}>Take off resale</Button>
                  <Button variant="outline" loading={set.isPending} onClick={() => move('listed', 'Listing updated.')}>Save changes</Button>
                  <Button loading={set.isPending} onClick={() => move('buyer_found', 'Marked buyer found — off the lists while you close the deal.')}>Buyer found</Button>
                </>}
                {l.status === 'buyer_found' && <>
                  <Button variant="ghost" loading={set.isPending} onClick={() => move('withdrawn', 'Taken off resale.')}>Take off resale</Button>
                  <Button variant="outline" loading={set.isPending} onClick={() => move('listed', 'Back on resale.')}>Deal fell through — list again</Button>
                </>}
              </div>
            </CardBody>
          </Card>
        )}

        {(l.status === 'listed' || l.status === 'buyer_found') && (
          <Card>
            <CardHeader title="Transfer to the buyer" subtitle="Moves the booking, its paid history and remaining instalments to the buyer's customer account." />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Buyer (customer account)" required hint="Not listed? Add them in Customers first.">
                  <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                    <option value="">Choose…</option>
                    {customers.filter((c) => c.id !== l.seller_id && c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.full_name} · {c.user_code}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                  </Select>
                </Field>
                <Field label="Sold for (₹)" required><Input inputMode="numeric" value={sold} onChange={(e) => setSold(e.target.value.replace(/\D/g, ''))} /></Field>
              </div>
              <Field label="Transfer note"><Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="e.g. Agreement signed, NOC issued, fee received" /></Field>
              <div className="flex items-center justify-between gap-2">
                <Link to="/admin/customers" className="text-xs font-semibold text-brand-gold-dark hover:underline">+ Add the buyer as a customer</Link>
                <Button disabled={!buyerId || !(Number(sold) > 0)} loading={complete.isPending}
                  onClick={() => complete.mutate({ id: l.id, buyerId, soldPrice: Number(sold), note: transferNote.trim() || null }, {
                    onSuccess: () => { push('success', 'Plot transferred — both customers have been told.'); onClose() },
                    onError: (e) => push('error', (e as Error).message),
                  })}>
                  <ArrowRightLeft className="h-4 w-4" /> Transfer plot
                </Button>
              </div>
              {pos.late > 0 && <p className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Overdue instalments move to the buyer with the plot.</p>}
            </CardBody>
          </Card>
        )}

        {l.status === 'transferred' && (
          <Notice title={`Transferred ${date(l.transferred_at)} to ${l.buyer?.full_name ?? 'the buyer'} (${l.buyer?.user_code ?? ''})`}>Sold for {money(l.sold_price)}{l.transfer_fee ? ` · transfer fee ${money(l.transfer_fee)}` : ''}.</Notice>
        )}
        {l.office_note && <p className="text-xs text-slate-500">Last note to the owner: {l.office_note}</p>}

        <div>
          <p className="mb-2 text-sm font-semibold text-brand-darker">Buyer enquiries ({inquiries.length})</p>
          {inquiries.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : (
            <ul className="space-y-2">
              {inquiries.map((i) => (
                <li key={i.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-brand-darker">{i.name}</span>
                    <Badge tone={i.status === 'new' ? 'amber' : i.status === 'contacted' ? 'blue' : 'neutral'}>{i.status}</Badge>
                  </div>
                  <ContactLinks phone={i.phone} />
                  <p className="text-xs text-slate-500">{i.source === 'sponsor' ? `Via sponsor ${i.sponsor?.full_name ?? ''}` : 'From the website'} · {date(i.created_at)}{i.message ? ` · ${i.message}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
