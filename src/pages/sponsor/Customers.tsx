import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, Bell, CalendarClock, CheckCircle2, ChevronDown, Clock, History, IndianRupee, MessageCircle, Phone, PhoneCall, Search, Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMySales, type SaleRow } from '@/lib/sponsor'
import { collectionsOf, dayStart, useMyEmis, useMyPayments, type CollectionRow, type EmiRow } from '@/lib/sponsor-crm'
import { itemLabel } from '@/lib/plot-sale'
import {
  CHANNEL_LABEL, KIND_LABEL, reminderMessage, useReminders, useSendReminder, whatsappLink, intlPhone,
  type ReminderChannel, type ReminderRow,
} from '@/lib/reminders'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatTile, Textarea, useToast } from '@/components/ui'
import { ProgressBar, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { ago, date, money, moneyShort } from '@/lib/format'

/**
 * My Customers — the buyers of the member's sales, one card each: what they
 * have paid, what is pending, what is late and by how many days, and when
 * they were last reminded. The member reminds them from here (WhatsApp, a
 * call, or a notification in the customer's own panel); the automatic
 * reminders (due in 3 days, due today, overdue) appear in the same history.
 */

const DAY = 86_400_000
/** Owing and not already with the office for verification. */
const chase = (e: EmiRow) => ['pending', 'overdue', 'rejected'].includes(e.status)

interface CustomerCard {
  key: string
  name: string
  phone: string | null
  rows: CollectionRow[]
  value: number
  collected: number
  outstanding: number
  overdue: { item: EmiRow; row: CollectionRow }[]
  overdueAmount: number
  daysLate: number
  next: { item: EmiRow; row: CollectionRow } | null
  dueWeek: number
  underReview: number
  last: ReminderRow | null
}

type Filter = 'all' | 'overdue' | 'week' | 'review' | 'paid'

/** For the dashboard alert: how many of the member's customers are late, and by how much. */
export function useMyCustomerDues(memberId: string | undefined) {
  const { data: sales = [] } = useMySales(memberId)
  const ids = useMemo(() => sales.filter((x) => !['cancelled', 'rejected', 'draft'].includes(x.status)).map((x) => x.id), [sales])
  const { data: emis = [] } = useMyEmis(ids)
  return useMemo(() => {
    const today = dayStart(new Date().toISOString())
    const late = emis.filter((e) => chase(e) && dayStart(e.due_date) < today)
    const people = new Set(late.map((e) => {
      const b = sales.find((x) => x.id === e.booking_id)
      return String(b?.customer_phone ?? '').replace(/\D/g, '').slice(-10) || b?.customer_name || e.booking_id
    }))
    return { lateCustomers: people.size, overdueAmount: late.reduce((t, e) => t + Number(e.amount), 0) }
  }, [sales, emis])
}

function plotName(r: CollectionRow) {
  return `${r.booking.project?.name ?? 'Plot'} · Plot ${r.booking.plot?.number ?? '—'}`
}

export function SponsorCustomers() {
  const { profile } = useAuth()
  const { data: sales = [], isLoading: sLoading } = useMySales(profile?.id)
  const live = useMemo(() => sales.filter((s) => !['cancelled', 'rejected', 'draft'].includes(s.status)), [sales])
  const ids = useMemo(() => live.map((s) => s.id), [live])
  const { data: emis = [], isLoading: eLoading } = useMyEmis(ids)
  const { data: payments = [], isLoading: pLoading } = useMyPayments(ids)
  const { data: reminders = [] } = useReminders(ids)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [logFor, setLogFor] = useState<CustomerCard | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)

  const cards = useMemo<CustomerCard[]>(() => {
    const today = dayStart(new Date().toISOString())
    const rows = collectionsOf(live, emis, payments)
    const groups = new Map<string, CollectionRow[]>()
    for (const r of rows) {
      const digits = String(r.booking.customer_phone ?? '').replace(/\D/g, '').slice(-10)
      const key = digits.length === 10 ? digits : (r.booking.customer_name ?? r.booking.id).trim().toLowerCase()
      groups.set(key, [...(groups.get(key) ?? []), r])
    }
    return [...groups.entries()].map(([key, rs]) => {
      const items = rs.flatMap((row) => row.emis.filter(chase).map((item) => ({ item, row })))
      const overdue = items.filter(({ item }) => dayStart(item.due_date) < today).sort((a, z) => dayStart(a.item.due_date) - dayStart(z.item.due_date))
      const upcoming = items.filter(({ item }) => dayStart(item.due_date) >= today).sort((a, z) => dayStart(a.item.due_date) - dayStart(z.item.due_date))
      const bookingIds = new Set(rs.map((r) => r.booking.id))
      const mine = reminders.filter((x) => bookingIds.has(x.booking_id))
      return {
        key,
        name: rs[0].booking.customer_name?.trim() || 'Customer',
        phone: rs.find((r) => r.booking.customer_phone)?.booking.customer_phone ?? null,
        rows: rs,
        value: rs.reduce((t, r) => t + Number(r.booking.sale_value ?? 0), 0),
        collected: rs.reduce((t, r) => t + r.collected, 0),
        outstanding: rs.reduce((t, r) => t + r.outstanding, 0),
        overdue,
        overdueAmount: overdue.reduce((t, o) => t + Number(o.item.amount), 0),
        daysLate: overdue[0] ? Math.round((today - dayStart(overdue[0].item.due_date)) / DAY) : 0,
        next: upcoming[0] ?? null,
        dueWeek: upcoming.filter(({ item }) => dayStart(item.due_date) - today <= 7 * DAY).reduce((t, o) => t + Number(o.item.amount), 0),
        underReview: rs.reduce((t, r) => t + r.emis.filter((e) => e.status === 'awaiting_verification').length, 0),
        last: mine[0] ?? null,
      }
    }).sort((a, z) => z.daysLate - a.daysLate || (a.next ? dayStart(a.next.item.due_date) : Infinity) - (z.next ? dayStart(z.next.item.due_date) : Infinity))
  }, [live, emis, payments, reminders])

  const shown = cards.filter((c) => {
    const q = search.trim().toLowerCase()
    if (q && !`${c.name} ${c.phone ?? ''} ${c.rows.map(plotName).join(' ')}`.toLowerCase().includes(q)) return false
    if (filter === 'overdue') return c.overdue.length > 0
    if (filter === 'week') return c.dueWeek > 0
    if (filter === 'review') return c.underReview > 0
    if (filter === 'paid') return c.outstanding <= 0
    return true
  })
  const loading = sLoading || (ids.length > 0 && (eLoading || pLoading))
  const totalOverdue = cards.reduce((t, c) => t + c.overdueAmount, 0)
  const lateCustomers = cards.filter((c) => c.overdue.length > 0).length

  return (
    <>
      <PageHeader title="My Customers" description="Every buyer of your sales: what they have paid, what is pending or late, and when they were last reminded. Remind them from here — the office also sends automatic reminders before and after each due date." />

      {loading ? <SkeletonTiles count={4} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="My customers" value={cards.length} hint={`${live.length} plot${live.length === 1 ? '' : 's'} sold`} icon={<Users className="h-4 w-4" />} />
          <StatTile label="Pending payment" value={moneyShort(cards.reduce((t, c) => t + c.outstanding, 0))} hint="Still to be collected" icon={<IndianRupee className="h-4 w-4" />} />
          <StatTile label="Overdue" value={moneyShort(totalOverdue)} hint={`${lateCustomers} customer${lateCustomers === 1 ? '' : 's'} late`} tone={totalOverdue > 0 ? 'red' : 'neutral'} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatTile label="Due in 7 days" value={moneyShort(cards.reduce((t, c) => t + c.dueWeek, 0))} hint="Remind them early" tone="amber" icon={<CalendarClock className="h-4 w-4" />} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {([['all', 'All'], ['overdue', `Overdue (${lateCustomers})`], ['week', 'Due this week'], ['review', 'Receipt under review'], ['paid', 'Fully paid']] as [Filter, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition', filter === k ? 'bg-brand-darker text-brand-gold-light ring-brand-darker' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-gold')}>
            {label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, mobile, plot" className="pl-9" />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? <Card><SkeletonRows rows={4} /></Card> : cards.length === 0 ? (
          <Card><EmptyState title="No customers yet" description="When you file a plot sale, its buyer appears here with their payment schedule." /></Card>
        ) : shown.length === 0 ? (
          <Card><EmptyState title="Nobody in this view" description="Try another filter." /></Card>
        ) : shown.map((c) => (
          <CustomerCardView key={c.key} c={c} me={profile?.full_name ?? null} reminders={reminders} historyOpen={historyFor === c.key}
            onHistory={() => setHistoryFor(historyFor === c.key ? null : c.key)} onLog={() => setLogFor(c)} />
        ))}
      </div>

      {logFor && <LogReminder c={logFor} onClose={() => setLogFor(null)} />}
    </>
  )
}

function StatusBadge({ c }: { c: CustomerCard }) {
  if (c.outstanding <= 0) return <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Fully paid</Badge>
  if (c.overdue.length) return <Badge tone="red"><AlertTriangle className="h-3 w-3" /> {c.daysLate} day{c.daysLate === 1 ? '' : 's'} overdue</Badge>
  if (c.next) {
    const d = Math.round((dayStart(c.next.item.due_date) - dayStart(new Date().toISOString())) / DAY)
    return <Badge tone={d <= 7 ? 'amber' : 'neutral'}><Clock className="h-3 w-3" /> {d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`}</Badge>
  }
  if (c.underReview) return <Badge tone="blue">Receipt under review</Badge>
  return <Badge tone="neutral">No instalment due</Badge>
}

/** The plot and amount a reminder is about: the oldest late item, else the next one. */
function focusOf(c: CustomerCard) {
  const f = c.overdue[0] ?? c.next
  if (!f) return null
  const sameBooking = c.overdue.filter((o) => o.row.booking.id === f.row.booking.id)
  const amount = c.overdue.length ? sameBooking.reduce((t, o) => t + Number(o.item.amount), 0) : Number(f.item.amount)
  const daysLate = Math.round((dayStart(new Date().toISOString()) - dayStart(f.item.due_date)) / DAY)
  return { booking: f.row.booking, amount, dueDate: date(f.item.due_date), daysLate, plot: plotName(f.row) }
}

function CustomerCardView({ c, me, reminders, historyOpen, onHistory, onLog }: {
  c: CustomerCard; me: string | null; reminders: ReminderRow[]; historyOpen: boolean; onHistory: () => void; onLog: () => void
}) {
  const send = useSendReminder()
  const { push } = useToast()
  const focus = focusOf(c)
  const tel = intlPhone(c.phone)
  const text = focus ? reminderMessage({ customer: c.name, plot: focus.plot, amount: focus.amount, dueDate: focus.dueDate, daysLate: focus.daysLate, from: me }) : ''
  const wa = focus ? whatsappLink(c.phone, text) : null
  const hasAccount = c.rows.some((r) => (r.booking as SaleRow).customer_id)
  const bookingIds = new Set(c.rows.map((r) => r.booking.id))
  const history = reminders.filter((x) => bookingIds.has(x.booking_id))

  function log(channel: ReminderChannel, note?: string) {
    if (!focus) return
    send.mutate({ bookingId: focus.booking.id, channel, note }, {
      onSuccess: () => push('success', channel === 'panel' ? 'Reminder sent to the customer\'s panel.' : 'Reminder logged.'),
      onError: (e) => push('error', (e as Error).message),
    })
  }

  return (
    <Card className={clsx(c.overdue.length > 0 && 'ring-1 ring-red-200')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-gold/15 px-5 py-4">
        <div>
          <p className="text-base font-bold text-brand-darker">{c.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            {c.phone ? <span className="font-mono">{c.phone}</span> : <span>No mobile on file</span>}
            <span>{c.rows.length} plot{c.rows.length === 1 ? '' : 's'}</span>
            {c.last && <span className="inline-flex items-center gap-1"><Bell className="h-3 w-3" /> Last reminded {ago(c.last.created_at)} · {c.last.kind === 'manual' ? CHANNEL_LABEL[c.last.channel] : 'automatic'}</span>}
          </p>
        </div>
        <StatusBadge c={c} />
      </div>

      <div className="space-y-3 px-5 py-4">
        {c.rows.map((r) => {
          const late = c.overdue.filter((o) => o.row.booking.id === r.booking.id)
          const next = r.emis.filter(chase).find((e) => !late.some((o) => o.item.id === e.id))
          return (
            <div key={r.booking.id} className="grid gap-2 rounded-xl bg-brand-gold/[0.05] p-3 sm:grid-cols-[1.3fr_1fr_1fr]">
              <div>
                <p className="text-sm font-semibold text-brand-darker">{plotName(r)}</p>
                <p className="text-xs text-slate-500">{r.booking.reference} · paid {money(r.collected)} of {money(r.booking.sale_value)}</p>
                <div className="mt-1.5"><ProgressBar percent={r.collectedPct} /></div>
              </div>
              <div className="text-sm">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Late</p>
                {late.length ? (
                  <p className="font-semibold text-red-700">{money(late.reduce((t, o) => t + Number(o.item.amount), 0))}
                    <span className="block text-xs font-normal">{late.map((o) => itemLabel(o.item)).join(', ')} · since {date(late[0].item.due_date)}</span></p>
                ) : <p className="text-slate-500">Nothing late</p>}
              </div>
              <div className="text-sm">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Next due</p>
                {next ? <p className="font-semibold text-brand-darker">{money(next.amount)}<span className="block text-xs font-normal text-slate-500">{itemLabel(next)} · {date(next.due_date)}</span></p>
                  : <p className="text-slate-500">{r.outstanding > 0 ? 'Receipts under review' : 'Fully paid'}</p>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-brand-gold/15 px-5 py-3">
        {focus && c.outstanding > 0 ? (
          <>
            <a href={wa ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!wa}
              onClick={(e) => { if (!wa) { e.preventDefault(); return } log('whatsapp', `WhatsApp reminder: ${money(focus.amount)} for ${focus.plot}`) }}
              className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white', wa ? 'bg-emerald-600 hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-300')}>
              <MessageCircle className="h-4 w-4" /> WhatsApp reminder
            </a>
            <a href={tel ? `tel:+${tel}` : undefined} onClick={(e) => { if (!tel) e.preventDefault() }}
              className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold', tel ? 'border-brand-gold/40 text-brand-darker hover:bg-brand-gold/10' : 'cursor-not-allowed border-slate-200 text-slate-400')}>
              <Phone className="h-4 w-4" /> Call
            </a>
            <Button size="sm" variant="outline" disabled={!hasAccount} loading={send.isPending && send.variables?.channel === 'panel'}
              onClick={() => log('panel')} title={hasAccount ? undefined : 'The customer has no panel account yet'}>
              <Bell className="h-4 w-4" /> Notify in their panel
            </Button>
            <Button size="sm" variant="ghost" onClick={onLog}><PhoneCall className="h-4 w-4" /> Log a follow-up</Button>
          </>
        ) : <span className="text-xs text-slate-500">Nothing to chase right now.</span>}
        <button onClick={onHistory} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-gold-dark hover:underline">
          <History className="h-3.5 w-3.5" /> Reminders ({history.length}) <ChevronDown className={clsx('h-3.5 w-3.5 transition', historyOpen && 'rotate-180')} />
        </button>
      </div>

      {historyOpen && (
        <div className="border-t border-brand-gold/15 px-5 py-3">
          {history.length === 0 ? <p className="text-xs text-slate-500">No reminders yet.</p> : (
            <ul className="space-y-1.5 text-xs">
              {history.slice(0, 20).map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-slate-700"><b className="text-brand-darker">{h.kind === 'manual' ? CHANNEL_LABEL[h.channel] : KIND_LABEL[h.kind]}</b>{h.note ? ` — ${h.note}` : ''}</span>
                  <span className="text-slate-400">{date(h.created_at)}{h.kind === 'manual' && h.sender?.full_name ? ` · ${h.sender.full_name}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/sponsor/crm" className="mt-2 inline-block text-xs font-semibold text-brand-gold-dark hover:underline">Open the full schedule in Payments CRM →</Link>
        </div>
      )}
    </Card>
  )
}

function LogReminder({ c, onClose }: { c: CustomerCard; onClose: () => void }) {
  const send = useSendReminder()
  const { push } = useToast()
  const [bookingId, setBookingId] = useState((c.overdue[0] ?? c.next)?.row.booking.id ?? c.rows[0].booking.id)
  const [channel, setChannel] = useState<ReminderChannel>('call')
  const [note, setNote] = useState('')
  return (
    <Modal open onClose={onClose} title={`Follow-up with ${c.name}`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={send.isPending} disabled={!note.trim()} onClick={() => send.mutate({ bookingId, channel, note: note.trim() }, {
          onSuccess: () => { push('success', 'Follow-up logged.'); onClose() },
          onError: (e) => push('error', (e as Error).message),
        })}>Save</Button></div>}>
      <div className="space-y-3">
        {c.rows.length > 1 && (
          <Field label="Plot">
            <Select value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
              {c.rows.map((r) => <option key={r.booking.id} value={r.booking.id}>{plotName(r)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="How">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel)}>
            {(['call', 'whatsapp', 'sms', 'visit', 'other'] as ReminderChannel[]).map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}
          </Select>
        </Field>
        <Field label="What they said" required><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will pay on the 15th after salary" /></Field>
      </div>
    </Modal>
  )
}
