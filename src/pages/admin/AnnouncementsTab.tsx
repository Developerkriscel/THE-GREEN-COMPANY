import { useMemo, useState, type FormEvent } from 'react'
import { Copy, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  announcementIsLive, THEMES, useAllAnnouncements, useDeleteAnnouncement, useSaveAnnouncement,
  type Announcement,
} from '@/lib/announcements'
import { ThemeSwatch, TickerView } from '@/components/AnnouncementTicker'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Spinner, useToast,
} from '@/components/ui'
import { dateTime } from '@/lib/format'

/**
 * Website CMS → Announcement bar. The office writes the sale / offer lines
 * that run across the top of the website and the panels, sees them exactly as
 * visitors will, and switches them on and off.
 */

type Draft = Omit<Announcement, 'id'> & { id?: string }

const BLANK: Draft = {
  message: '', badge: '', emoji: '🔥', coupon_code: '', cta_label: 'Book now', cta_link: '/projects',
  theme: 'sale', show_countdown: true, show_website: true, show_sponsor: true, show_customer: false,
  starts_at: null, ends_at: null, active: true, sort_order: 0,
}

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString()

const TEMPLATES: { label: string; draft: Partial<Draft> }[] = [
  { label: 'Flash sale', draft: { emoji: '⚡', badge: 'FLASH SALE', message: 'Extra discount on plots booked in the next 48 hours!', theme: 'sale', cta_label: 'Grab the offer', cta_link: '/projects', show_countdown: true, ends_at: inDays(2) } },
  { label: 'Festive offer', draft: { emoji: '🎉', badge: 'FESTIVE OFFER', message: 'Celebrate with a plot of your own — festive prices for a limited time.', theme: 'festive', cta_label: 'View plots', cta_link: '/projects', show_countdown: true, ends_at: inDays(7) } },
  { label: 'Discount coupon', draft: { emoji: '🎁', badge: 'FLAT 5% OFF', message: 'Use the code on your booking form.', coupon_code: 'SYMO5', theme: 'gold', cta_label: 'Book now', cta_link: '/projects', show_countdown: true, ends_at: inDays(10) } },
  { label: 'New launch', draft: { emoji: '🚀', badge: 'NEW LAUNCH', message: 'A new project is now open for booking — early buyers get the best plots.', theme: 'leaf', cta_label: 'Explore', cta_link: '/projects', show_countdown: false, ends_at: null } },
  { label: 'Few plots left', draft: { emoji: '⏳', badge: 'ONLY FEW LEFT', message: 'Last few plots remaining at the launch price.', theme: 'midnight', cta_label: 'Reserve yours', cta_link: '/projects', show_countdown: false, ends_at: null } },
  { label: 'Partner drive', draft: { emoji: '🤝', badge: 'JOIN TODAY', message: 'Become a channel partner and earn direct and level income.', theme: 'royal', cta_label: 'Join now', cta_link: '/join', show_countdown: false, ends_at: null } },
]

const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

function where(a: Announcement) {
  return [a.show_website && 'Website', a.show_sponsor && 'Sponsor panel', a.show_customer && 'Customer panel'].filter(Boolean).join(' · ') || 'Nowhere'
}

export function AnnouncementsTab() {
  const { data = [], isLoading } = useAllAnnouncements()
  const save = useSaveAnnouncement()
  const del = useDeleteAnnouncement()
  const { push } = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const live = useMemo(() => data.filter((a) => announcementIsLive(a)), [data])

  const toggle = (a: Announcement) => save.mutate({ id: a.id, message: a.message, active: !a.active }, {
    onSuccess: () => push('success', a.active ? 'Switched off.' : 'Switched on — it is live now.'),
    onError: (e) => push('error', (e as Error).message),
  })

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Live right now" subtitle="Exactly what visitors see. Several items rotate every few seconds." />
        <div className="p-4">
          {live.length ? <div className="overflow-hidden rounded-xl ring-1 ring-slate-200"><TickerView items={live} preview /></div>
            : <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Nothing is live — switch an item on below or add a new one.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Announcement bar"
          subtitle="Sale and offer lines across the top of the website, the sponsor panel and the customer panel."
          action={<Button size="sm" onClick={() => setDraft({ ...BLANK, sort_order: data.length })}><Plus className="h-4 w-4" /> New announcement</Button>}
        />
        {isLoading ? <Spinner /> : data.length === 0 ? (
          <EmptyState title="No announcements yet" description="Start from a template: flash sale, festive offer, coupon, new launch…" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((a) => {
              const isLive = announcementIsLive(a)
              const scheduled = a.active && !isLive && a.starts_at && Date.parse(a.starts_at) > Date.now()
              return (
                <li key={a.id} className="space-y-2 px-5 py-4">
                  <div className="overflow-hidden rounded-lg ring-1 ring-slate-200"><TickerView items={[a]} preview /></div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge tone={isLive ? 'green' : scheduled ? 'blue' : a.active ? 'amber' : 'neutral'}>
                      {isLive ? 'Live' : scheduled ? `Starts ${dateTime(a.starts_at)}` : a.active ? 'Ended' : 'Off'}
                    </Badge>
                    <span>{where(a)}</span>
                    {a.ends_at && <span>· ends {dateTime(a.ends_at)}</span>}
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant={a.active ? 'outline' : 'primary'} onClick={() => toggle(a)}>{a.active ? 'Switch off' : 'Switch on'}</Button>
                      <Button size="sm" variant="ghost" aria-label="Duplicate" onClick={() => setDraft({ ...a, id: undefined, message: a.message, active: false, sort_order: data.length })}><Copy className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setDraft({ ...a })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => { if (confirm('Delete this announcement?')) del.mutate(a.id, { onError: (e) => push('error', (e as Error).message) }) }}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {draft && <Editor draft={draft} setDraft={setDraft} saving={save.isPending} onSave={(d) => save.mutate({
        ...d,
        message: d.message.trim(),
        badge: d.badge?.trim() || null, emoji: d.emoji?.trim() || null, coupon_code: d.coupon_code?.trim().toUpperCase() || null,
        cta_label: d.cta_label?.trim() || null, cta_link: d.cta_link?.trim() || null,
      }, {
        onSuccess: () => { push('success', d.active ? 'Saved — it is on the bar now.' : 'Saved (switched off).'); setDraft(null) },
        onError: (e) => push('error', (e as Error).message),
      })} />}
    </div>
  )
}

function Editor({ draft: d, setDraft, saving, onSave }: {
  draft: Draft; setDraft: (d: Draft | null) => void; saving: boolean; onSave: (d: Draft) => void
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...d, [k]: v })
  const preview: Announcement = { ...d, id: d.id ?? 'preview', message: d.message || 'Your offer message appears here' }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!d.message.trim()) return
    if (!d.show_website && !d.show_sponsor && !d.show_customer) return alert('Choose at least one place to show it.')
    onSave(d)
  }

  return (
    <Modal open onClose={() => setDraft(null)} size="lg" title={d.id ? 'Edit announcement' : 'New announcement'}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
        <Button type="submit" form="ann-form" loading={saving} disabled={!d.message.trim()}>{d.id ? 'Save' : 'Publish'}</Button></div>}>
      <form id="ann-form" onSubmit={submit} className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Live preview</p>
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200"><TickerView items={[preview]} preview /></div>
        </div>

        {!d.id && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Start from a template</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button key={t.label} type="button" onClick={() => setDraft({ ...d, ...t.draft })}
                  className="rounded-full border border-brand-gold/40 px-3 py-1 text-xs font-semibold text-brand-darker hover:bg-brand-gold/10">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
          <Field label="Emoji"><Input value={d.emoji ?? ''} onChange={(e) => set('emoji', e.target.value)} maxLength={4} /></Field>
          <Field label="Badge" hint="Short and loud: FLAT 10% OFF, NEW LAUNCH, LAST 5 PLOTS."><Input value={d.badge ?? ''} onChange={(e) => set('badge', e.target.value.toUpperCase())} maxLength={24} /></Field>
        </div>
        <Field label="Message" required><Input value={d.message} onChange={(e) => set('message', e.target.value)} maxLength={140} placeholder="Festive prices on plots at Manglam City — this week only!" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Coupon code (optional)"><Input value={d.coupon_code ?? ''} onChange={(e) => set('coupon_code', e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={20} placeholder="DIWALI10" /></Field>
          <Field label="Button text"><Input value={d.cta_label ?? ''} onChange={(e) => set('cta_label', e.target.value)} maxLength={24} /></Field>
          <Field label="Button goes to" hint="A page (/projects) or a full web address."><Input value={d.cta_link ?? ''} onChange={(e) => set('cta_link', e.target.value)} /></Field>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-700">Colour theme</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.map((t) => (
              <button key={t.value} type="button" onClick={() => set('theme', t.value)}
                className={`rounded-lg p-0.5 ring-2 transition ${d.theme === t.value ? 'ring-brand-gold' : 'ring-transparent hover:ring-slate-200'}`}>
                <ThemeSwatch theme={t.value} label={t.label} />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" hint="Blank = now."><Input type="datetime-local" value={toLocal(d.starts_at)} onChange={(e) => set('starts_at', fromLocal(e.target.value))} /></Field>
          <Field label="Ends" hint="Blank = until switched off. Shows a live countdown."><Input type="datetime-local" value={toLocal(d.ends_at)} onChange={(e) => set('ends_at', fromLocal(e.target.value))} /></Field>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-brand-gold/[0.06] px-4 py-3 text-sm text-slate-700">
          <span className="flex items-center gap-1.5 font-medium"><Megaphone className="h-4 w-4 text-brand-gold-dark" /> Show on:</span>
          {([['show_website', 'Website'], ['show_sponsor', 'Sponsor panel'], ['show_customer', 'Customer panel']] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input type="checkbox" checked={d[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> {label}
            </label>
          ))}
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={d.show_countdown} onChange={(e) => set('show_countdown', e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Countdown to end
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Order" hint="Lower shows first."><Input type="number" value={d.sort_order} onChange={(e) => set('sort_order', Number(e.target.value) || 0)} /></Field>
          <Field label="Status">
            <Select value={d.active ? 'on' : 'off'} onChange={(e) => set('active', e.target.value === 'on')}>
              <option value="on">On — publish now (or at the start time)</option>
              <option value="off">Off — keep as a draft</option>
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}
