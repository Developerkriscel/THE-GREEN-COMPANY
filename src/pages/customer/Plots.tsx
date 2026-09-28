import { useState } from 'react'
import { FileText, Images, MapPin, Ruler } from 'lucide-react'
import { Card, CardBody, CardHeader, EmptyState, Modal, PageHeader } from '@/components/ui'
import { ProgressBar, SkeletonRows } from '@/components/sponsor'
import { date, money, num } from '@/lib/format'
import type { CustomerDocument } from '@/lib/customers'
import { DocumentList, PrivateImage, StageTimeline, useMyPortfolio } from './common'

/** Each plot the customer bought: the plot, its progress, photos and papers. */
export function CustomerPlots() {
  const { money: rows, documents, loading } = useMyPortfolio()
  const [photo, setPhoto] = useState<CustomerDocument | null>(null)

  return (
    <>
      <PageHeader title="My plots" description="Your plot, how the registry and mutation are going, photos and papers." />
      {loading ? <Card><SkeletonRows rows={4} /></Card> : rows.length === 0 ? (
        <Card><EmptyState title="No plot linked yet" description="Once the office links your booking, it appears here." /></Card>
      ) : (
        <div className="space-y-6">
          {rows.map(({ booking: b, pct, paid, outstanding }) => {
            const docs = documents.filter((d) => d.booking_id === b.id)
            const photos = docs.filter((d) => d.type === 'plot_photo')
            const papers = docs.filter((d) => d.type !== 'plot_photo')
            return (
              <Card key={b.id}>
                <div className="grid gap-0 md:grid-cols-[280px_1fr]">
                  <div className="relative min-h-[180px] overflow-hidden rounded-t-2xl bg-leaf-deep md:rounded-l-2xl md:rounded-tr-none">
                    {photos[0] ? (
                      <button onClick={() => setPhoto(photos[0])} className="block h-full w-full">
                        <PrivateImage doc={photos[0]} className="h-full min-h-[180px] w-full object-cover" />
                      </button>
                    ) : b.project?.hero_image ? (
                      <img src={b.project.hero_image} alt="" className="h-full min-h-[180px] w-full object-cover opacity-90" />
                    ) : (
                      <div className="flex h-full min-h-[180px] items-center justify-center text-brand-gold-light/70"><Images className="h-10 w-10" /></div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-gold-metal px-3 py-1 text-xs font-bold text-brand-darker shadow">Plot {b.plot?.number ?? '—'}</span>
                  </div>
                  <CardBody className="space-y-4">
                    <div>
                      <p className="text-lg font-bold text-brand-darker">{b.project?.name ?? 'Project'}</p>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                        {(b.project?.location || b.project?.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-brand-gold-dark" />{[b.project?.location, b.project?.city].filter(Boolean).join(', ')}</span>}
                        {b.plot?.size && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5 text-brand-gold-dark" />{num(b.plot.size)} {b.plot.size_unit ?? 'sq yd'}{b.plot.dimensions ? ` (${b.plot.dimensions})` : ''}</span>}
                        {b.plot?.facing && <span>Facing {b.plot.facing}</span>}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      {[['Booking', b.reference], ['Booked on', date(b.created_at)], ['Plot value', money(b.sale_value)], ['Paid', `${money(paid)} (${pct}%)`]].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-brand-gold/[0.07] px-3 py-2"><dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-semibold text-brand-darker">{v}</dd></div>
                      ))}
                    </dl>
                    <div><ProgressBar percent={pct} /><p className="mt-1 text-xs text-slate-500">{money(outstanding)} still to pay</p></div>
                    <StageTimeline booking={b} />
                  </CardBody>
                </div>

                {photos.length > 1 && (
                  <div className="border-t border-brand-gold/15 px-5 py-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-darker"><Images className="h-4 w-4 text-brand-gold-dark" /> Plot photos</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {photos.map((p) => (
                        <button key={p.id} onClick={() => setPhoto(p)} className="overflow-hidden rounded-xl ring-1 ring-brand-gold/20">
                          <PrivateImage doc={p} className="aspect-square w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-brand-gold/15 px-5 pb-2 pt-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-brand-darker"><FileText className="h-4 w-4 text-brand-gold-dark" /> Papers for this plot</p>
                  <DocumentList docs={papers} empty="The office will upload your registry, mutation and other papers here." />
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={Boolean(photo)} onClose={() => setPhoto(null)} title={photo?.title ?? 'Photo'} size="lg">
        {photo && <PrivateImage doc={photo} className="max-h-[70vh] w-full rounded-xl object-contain" />}
      </Modal>
    </>
  )
}

/** Every paper across all plots, newest first. */
export function CustomerDocuments() {
  const { documents, bookings, loading } = useMyPortfolio()
  return (
    <>
      <PageHeader title="Documents" description="Registry, mutation, allotment, receipts and every other paper the office has shared with you." />
      {loading ? <Card><SkeletonRows rows={4} /></Card> : bookings.length === 0 ? (
        <Card><EmptyState title="No documents yet" /></Card>
      ) : (
        <div className="space-y-5">
          {bookings.map((b) => (
            <Card key={b.id}>
              <CardHeader title={`${b.project?.name ?? 'Plot'} · Plot ${b.plot?.number ?? '—'}`} subtitle={`Booking ${b.reference}`} />
              <CardBody className="py-1"><DocumentList docs={documents.filter((d) => d.booking_id === b.id)} /></CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
