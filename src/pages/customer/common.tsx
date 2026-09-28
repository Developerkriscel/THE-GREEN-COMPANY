import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, Circle, Download, ExternalLink, FileText, Globe, Image as ImageIcon, Loader2, Mail, MapPin, MessageCircle, Phone, UserRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  DOC_LABEL, STAGE_LABEL, bookingMoney, docBucket, useBookingDocuments, useBookingEmis, useBookingPayments,
  useCustomerBookings, useMyContacts, type CustomerBooking, type CustomerDocument, type StageStatus,
} from '@/lib/customers'
import { signedUrl } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'
import { Card, CardBody, CardHeader } from '@/components/ui'
import { date } from '@/lib/format'

/** Everything the customer panel shows, loaded once and shared by its pages. */
export function useMyPortfolio() {
  const { profile } = useAuth()
  const me = profile?.id
  const { data: bookings = [], isLoading: bLoading } = useCustomerBookings(me)
  const live = useMemo(() => bookings.filter((b) => b.status !== 'cancelled'), [bookings])
  const ids = useMemo(() => live.map((b) => b.id), [live])
  const { data: emis = [], isLoading: eLoading } = useBookingEmis(ids)
  const { data: payments = [], isLoading: pLoading } = useBookingPayments(ids)
  const { data: documents = [], isLoading: dLoading } = useBookingDocuments(ids)
  const money = useMemo(() => live.map((b) => ({ booking: b, ...bookingMoney(b, emis, payments) })), [live, emis, payments])
  const totals = useMemo(() => ({
    value: money.reduce((t, m) => t + m.value, 0),
    paid: money.reduce((t, m) => t + m.paid, 0),
    outstanding: money.reduce((t, m) => t + m.outstanding, 0),
    overdue: money.flatMap((m) => m.overdue),
    next: money.map((m) => m.next).filter(Boolean).sort((a, z) => a!.due_date.localeCompare(z!.due_date))[0] ?? null,
  }), [money])
  return {
    profile, me, bookings: live, emis, payments, documents, money, totals,
    loading: bLoading || (ids.length > 0 && (eLoading || pLoading || dLoading)),
  }
}

/* ------------------------------------------------------ registry timeline */

const STAGES: { key: 'booked' | 'registry_status' | 'mutation_status' | 'possession_status'; label: string }[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'registry_status', label: 'Registry' },
  { key: 'mutation_status', label: 'Mutation' },
  { key: 'possession_status', label: 'Possession' },
]

export function StageTimeline({ booking }: { booking: CustomerBooking }) {
  const state = (k: (typeof STAGES)[number]['key']): StageStatus =>
    k === 'booked' ? (booking.status === 'confirmed' ? 'done' : 'in_progress') : booking[k]
  return (
    <ol className="grid grid-cols-4 gap-1">
      {STAGES.map((s, i) => {
        const st = state(s.key)
        return (
          <li key={s.key} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span className={clsx('absolute right-1/2 top-3 h-0.5 w-full', st === 'done' ? 'bg-brand-gold' : 'bg-slate-200')} aria-hidden />
            )}
            <span
              className={clsx(
                'relative z-10 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                st === 'done' ? 'bg-gold-metal text-brand-darker' : st === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400',
              )}
            >
              {st === 'done' ? <CheckCircle2 className="h-4 w-4" /> : st === 'in_progress' ? <Loader2 className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
            </span>
            <span className="mt-1.5 text-[11px] font-semibold text-brand-darker">{s.label}</span>
            <span className={clsx('text-[10px]', st === 'done' ? 'text-emerald-700' : st === 'in_progress' ? 'text-amber-700' : 'text-slate-400')}>
              {s.key === 'registry_status' && booking.registry_at && st === 'done' ? date(booking.registry_at)
                : s.key === 'mutation_status' && booking.mutation_at && st === 'done' ? date(booking.mutation_at)
                : s.key === 'booked' ? date(booking.created_at) : STAGE_LABEL[st]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------- documents */

export function openDocument(d: CustomerDocument) {
  return signedUrl(docBucket(d.type), d.storage_path, 300).then((url) => window.open(url, '_blank', 'noopener'))
}

export function DocumentList({ docs, empty = 'No papers yet.' }: { docs: CustomerDocument[]; empty?: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!docs.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>
  return (
    <ul className="divide-y divide-slate-100">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-metal text-brand-darker shadow-sm">
            {d.type === 'plot_photo' ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-brand-darker">{d.title}</p>
            <p className="text-xs text-slate-500">{DOC_LABEL[d.type] ?? d.type} · {date(d.created_at)}</p>
          </div>
          <button
            onClick={() => { setBusy(d.id); void openDocument(d).finally(() => setBusy(null)) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-gold/40 px-3 py-1.5 text-xs font-semibold text-brand-darker hover:bg-brand-gold/10"
          >
            {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Open
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A photo from the private registry bucket, through a short-lived link. */
export function PrivateImage({ doc, className }: { doc: CustomerDocument; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void signedUrl(docBucket(doc.type), doc.storage_path, 3600).then((u) => alive && setSrc(u)).catch(() => {})
    return () => { alive = false }
  }, [doc])
  return src
    ? <img src={src} alt={doc.title} className={className} loading="lazy" />
    : <div className={clsx('animate-pulse bg-slate-100', className)} />
}

/* --------------------------------------------------------------- contacts */

const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '').length === 10 ? '91' : ''}${phone.replace(/\D/g, '')}`

export function ContactCards() {
  const { data: rm } = useMyContacts()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Your relationship manager" subtitle="Your first call for anything about your plot" />
        <CardBody>
          {rm?.rm_name || rm?.rm_phone ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-metal text-brand-darker shadow"><UserRound className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-brand-darker">{rm.rm_name ?? 'Relationship manager'}</p>
                {rm.rm_phone && <p className="text-sm text-slate-600">{rm.rm_phone}</p>}
              </div>
              {rm.rm_phone && (
                <div className="flex gap-2">
                  <a href={`tel:${rm.rm_phone}`} className="btn-gold rounded-lg px-3 py-2 text-xs"><Phone className="h-3.5 w-3.5" /> Call</a>
                  <a href={waLink(rm.rm_phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">The office will assign your relationship manager shortly. Until then, call the company number.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={BRAND.legalName} subtitle="Company contact" />
        <CardBody className="space-y-2.5 text-sm">
          <a href={BRAND.phoneHref} className="flex items-center gap-2.5 text-brand-darker hover:underline"><Phone className="h-4 w-4 text-brand-gold-dark" /> +91 {BRAND.phone}</a>
          <a href={waLink(BRAND.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-brand-darker hover:underline"><MessageCircle className="h-4 w-4 text-brand-gold-dark" /> WhatsApp {BRAND.whatsapp}</a>
          <a href={`mailto:${BRAND.email}`} className="flex items-center gap-2.5 text-brand-darker hover:underline"><Mail className="h-4 w-4 text-brand-gold-dark" /> {BRAND.email}</a>
          <a href={BRAND.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-brand-darker hover:underline"><Globe className="h-4 w-4 text-brand-gold-dark" /> {BRAND.website} <ExternalLink className="h-3 w-3" /></a>
          <p className="flex items-start gap-2.5 text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-dark" /> {BRAND.address}</p>
        </CardBody>
      </Card>
    </div>
  )
}
