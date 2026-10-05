import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { useAvailablePlots } from '@/lib/sponsor-crm'
import { previewSchedule, useCreatePlotSale, type Milestone } from '@/lib/plot-sale'
import { useCustomers } from '@/lib/customers'
import { useMembers, useProjects } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { useSponsorRates } from '@/lib/sponsor'
import { Badge, Button, Field, Input, Modal, Select, Table, Td, Textarea, Th, useToast } from '@/components/ui'
import { date, money, num } from '@/lib/format'

/**
 * "New plot sale" — booking amount, monthly EMIs and/or custom milestones;
 * the schedule is generated when the sale is saved and previewed here first.
 *
 * `office` adds what only the office may do: credit a member, attach a
 * customer account, confirm on the spot and mark the booking amount received.
 */

const today = () => new Date().toISOString().slice(0, 10)
const numOr = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/,/g, '')) || 0)
const clean = (s: string) => s.replace(/[^\d.]/g, '')

export function NewPlotSale({ office = false, onClose, onCreated }: {
  office?: boolean
  onClose: () => void
  onCreated?: (bookingId: string) => void
}) {
  const { data: plots = [], isLoading } = useAvailablePlots()
  const create = useCreatePlotSale()
  const { push } = useToast()

  const [f, setF] = useState({
    name: '', phone: '', email: '', address: '',
    projectId: '', plotId: '', area: '', rate: '', total: '',
    booking: '', emiCount: '', emiAmount: '', start: today(), firstEmi: '', notes: '',
  })
  const [totalTouched, setTotalTouched] = useState(false)
  const [milestones, setMilestones] = useState<{ label: string; due_date: string; amount: string }[]>([])
  const [agreed, setAgreed] = useState(office)
  // office-only
  const [repId, setRepId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [confirmNow, setConfirmNow] = useState(true)
  const [bookingPaid, setBookingPaid] = useState(false)

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const { profile } = useAuth()
  const { data: rates } = useSponsorRates()

  const { data: allProjects = [] } = useProjects({ publishedOnly: true })
  const projects = useMemo(() => [...new Map(plots.map((p) => [p.project_id, p.project_name])).entries()], [plots])
  // Lowest listed rate per sq yd in each project, for the picker.
  const fromRate = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of plots) {
      const size = Number(p.size ?? 0)
      if (!size || !p.price) continue
      const r = Number(p.price) / size
      m.set(p.project_id, Math.min(m.get(p.project_id) ?? Infinity, r))
    }
    return m
  }, [plots])
  const inProject = plots.filter((p) => p.project_id === f.projectId)
  const plot = plots.find((p) => p.id === f.plotId)

  // Picking a plot fills the area and the listed rate.
  useEffect(() => {
    if (!plot) return
    const size = Number(plot.size ?? 0)
    setF((x) => ({
      ...x,
      area: size ? String(size) : x.area,
      rate: size && plot.price ? String(Math.round((Number(plot.price) / size) * 100) / 100) : x.rate,
    }))
    setTotalTouched(false)
  }, [plot])

  const autoTotal = Math.round(numOr(f.area) * numOr(f.rate))
  const total = totalTouched ? numOr(f.total) : autoTotal
  // Direct income as distribute_sale_income() will credit it on verification:
  // the member's rank rate on the sale value, less TDS and admin charge.
  const rankRate = Number(profile?.rank?.own_sale_rate ?? 0)
  const expGross = Math.round((total * rankRate) / 100)
  const expNet = Math.round(expGross * (1 - ((rates?.tds_pct ?? 5) + (rates?.admin_pct ?? 3)) / 100))
  const ms: Milestone[] = milestones.map((m) => ({ label: m.label, due_date: m.due_date, amount: numOr(m.amount) }))
  const plan = previewSchedule({
    total, bookingAmount: numOr(f.booking), emiCount: numOr(f.emiCount), emiAmount: numOr(f.emiAmount) || null,
    start: f.start, firstEmi: f.firstEmi || null, milestones: ms,
  })

  const digits = f.phone.replace(/\D/g, '')
  const phoneOk = digits.length === 0 || digits.length >= 10
  const canSave = Boolean(f.plotId) && f.name.trim().length >= 2 && phoneOk && !plan.error && agreed && !create.isPending

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    create.mutate({
      plotId: f.plotId, customerName: f.name.trim(), customerPhone: f.phone.trim(), customerEmail: f.email.trim(),
      customerAddress: f.address.trim(), area: numOr(f.area) || null, rate: numOr(f.rate) || null, total,
      bookingAmount: numOr(f.booking), emiCount: numOr(f.emiCount), emiAmount: numOr(f.emiAmount) || null,
      start: f.start, firstEmi: f.firstEmi || null, notes: f.notes.trim(), milestones: ms,
      ...(office ? { repId: repId || null, customerId: customerId || null, confirm: confirmNow, bookingPaid } : {}),
    }, {
      onSuccess: (id) => {
        push('success', office
          ? (confirmNow ? 'Sale created and confirmed. The schedule is live.' : 'Sale created — it is waiting in Plot Sales for verification.')
          : 'Sale filed. The office will verify it; you can already upload receipts against the schedule.')
        onCreated?.(id)
        onClose()
      },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <Modal open onClose={onClose} size="lg" title="New plot sale"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-plot-sale" loading={create.isPending} disabled={!canSave}>Create sale</Button>
        </div>
      }>
      <form id="new-plot-sale" onSubmit={submit} className="space-y-5">
        <p className="-mt-1 text-sm text-slate-500">Booking + monthly EMIs and/or custom milestones. The schedule is generated automatically.</p>

        {office && <OfficeCustomer customerId={customerId} onPick={(c) => {
          setCustomerId(c?.id ?? '')
          if (c) setF((x) => ({ ...x, name: c.full_name, phone: c.phone ?? '', email: c.email?.endsWith('@customers.symocity.app') ? '' : (c.email ?? ''), address: [c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') }))
        }} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" required><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Buyer's full name" /></Field>
          <Field label="Phone" hint={f.phone && !phoneOk ? 'Needs at least 10 digits.' : undefined}><Input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Project" required>
            <Select value={f.projectId} onChange={(e) => setF((x) => ({ ...x, projectId: e.target.value, plotId: '' }))}>
              <option value="">{isLoading ? 'Loading…' : 'Select a project'}</option>
              {/* Every published project; one with no plot in the inventory yet cannot be sold until the office lists its plots. */}
              {allProjects.map((pr) => {
                const has = projects.some(([id]) => id === pr.id)
                return (
                  <option key={pr.id} value={pr.id} disabled={!has}>
                    {pr.name}{has ? (fromRate.get(pr.id) ? ` — from ${money(Math.round(fromRate.get(pr.id)!))}/sq yd` : '') : pr.sold_out ? ' — sold out' : ' — plots not listed yet'}
                  </option>
                )
              })}
            </Select>
          </Field>
          <Field label="Plot no." required hint={f.projectId ? `${inProject.length} available` : allProjects.some((pr) => !projects.some(([id]) => id === pr.id)) ? (office ? 'A project shows “plots not listed yet” until its plots are added in Plot inventory.' : 'A project shows “plots not listed yet” until the office adds its plots — ask the office.') : undefined}>
            <Select value={f.plotId} onChange={(e) => set('plotId', e.target.value)} disabled={!f.projectId}>
              <option value="">Select a plot</option>
              {inProject.map((p) => <option key={p.id} value={p.id}>{p.number}{p.size ? ` — ${num(p.size)} ${p.size_unit}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Area (sq. yd)"><Input inputMode="decimal" value={f.area} onChange={(e) => set('area', clean(e.target.value))} /></Field>
          <Field label="Rate / sq. yd (₹)"><Input inputMode="decimal" value={f.rate} onChange={(e) => set('rate', clean(e.target.value))} /></Field>
          <Field label={`Total amount${autoTotal ? ` (auto ${money(autoTotal)})` : ''}`} required>
            <Input inputMode="numeric" value={totalTouched ? f.total : (autoTotal ? String(autoTotal) : '')}
              onChange={(e) => { setTotalTouched(true); set('total', clean(e.target.value)) }} placeholder="Area × rate" />
          </Field>
          <Field label="Booking amount (₹)"><Input inputMode="numeric" value={f.booking} onChange={(e) => set('booking', clean(e.target.value))} placeholder="0" /></Field>
          {!office && (
            <Field label="Expected direct income" hint={rankRate ? `${rankRate}% of the total at your rank (${profile?.rank?.name ?? '—'}); credited when the office verifies the sale.` : 'Your rank has no direct-income rate yet.'}>
              <div className="flex h-[38px] items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm">
                <b className="text-emerald-700">{money(expGross)}</b>
                <span className="text-xs text-emerald-800">{money(expNet)} after TDS &amp; admin</span>
              </div>
            </Field>
          )}
          <Field label="Number of EMIs"><Input inputMode="numeric" value={f.emiCount} onChange={(e) => set('emiCount', e.target.value.replace(/\D/g, ''))} placeholder="0 = pay the balance at once" /></Field>
          <Field label="EMI amount (₹)" hint="Leave blank to split the balance evenly."><Input inputMode="numeric" value={f.emiAmount} onChange={(e) => set('emiAmount', clean(e.target.value))} /></Field>
          <Field label="Start / booking date"><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="First EMI date" hint="Default: a month after the booking date."><Input type="date" value={f.firstEmi} onChange={(e) => set('firstEmi', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
        </div>

        <div className="rounded-2xl border border-brand-gold/25 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-darker">Custom milestones</p>
              <p className="text-xs text-slate-500">Optional — e.g. "Registry", "Possession".</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setMilestones((m) => [...m, { label: '', due_date: '', amount: '' }])}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {milestones.map((m, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <Input aria-label="Label" placeholder="Label" value={m.label} onChange={(e) => setMilestones((x) => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} />
              <Input aria-label="Date" type="date" value={m.due_date} onChange={(e) => setMilestones((x) => x.map((y, j) => j === i ? { ...y, due_date: e.target.value } : y))} />
              <Input aria-label="Amount" inputMode="numeric" placeholder="Amount" value={m.amount} onChange={(e) => setMilestones((x) => x.map((y, j) => j === i ? { ...y, amount: clean(e.target.value) } : y))} />
              <button type="button" aria-label="Remove" className="rounded-lg px-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setMilestones((x) => x.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-darker"><CalendarClock className="h-4 w-4 text-brand-gold-dark" /> Payment schedule</p>
          {plan.error ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{plan.error}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
              <Table>
                <thead><tr><Th>Item</Th><Th>Due</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody>
                  {plan.items.map((it) => (
                    <tr key={`${it.kind}-${it.seq}`}>
                      <Td>{it.label} {it.kind === 'milestone' && <Badge tone="gold">Milestone</Badge>}</Td>
                      <Td>{date(it.due_date)}</Td>
                      <Td className="text-right font-medium">{money(it.amount)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-brand-gold/[0.06]"><Td className="font-semibold">Total</Td><Td /><Td className="text-right font-bold">{money(total)}</Td></tr>
                </tbody>
              </Table>
            </div>
          )}
        </div>

        {office ? <OfficeOptions repId={repId} setRepId={setRepId} confirmNow={confirmNow} setConfirmNow={setConfirmNow}
          bookingPaid={bookingPaid} setBookingPaid={setBookingPaid} hasBooking={numOr(f.booking) > 0} /> : (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>I confirm this sale is genuine, on a company project, and that every payment will be made against an official company receipt. The office verifies the sale and each receipt.</span>
          </label>
        )}
      </form>
    </Modal>
  )
}

function OfficeCustomer({ customerId, onPick }: {
  customerId: string
  onPick: (c: { id: string; full_name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null } | null) => void
}) {
  const { data: customers = [] } = useCustomers()
  return (
    <Field label="Customer account (optional)" hint="Pick one to fill the details and show the sale on their customer panel. Otherwise it is linked by mobile when confirmed.">
      <Select value={customerId} onChange={(e) => onPick(customers.find((c) => c.id === e.target.value) ?? null)}>
        <option value="">— new buyer / no account —</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name} · {c.user_code}{c.phone ? ` · ${c.phone}` : ''}</option>)}
      </Select>
    </Field>
  )
}

function OfficeOptions(p: {
  repId: string; setRepId: (v: string) => void
  confirmNow: boolean; setConfirmNow: (v: boolean) => void
  bookingPaid: boolean; setBookingPaid: (v: boolean) => void
  hasBooking: boolean
}) {
  const { data: members = [] } = useMembers()
  const reps = members.filter((m) => m.role === 'rep' && m.status === 'active').sort((a, z) => a.full_name.localeCompare(z.full_name))
  return (
    <div className="space-y-3 rounded-2xl bg-brand-gold/[0.06] p-4">
      <Field label="Credit the sale to a sponsor" hint="Their direct and level income is worked out when the sale is confirmed.">
        <Select value={p.repId} onChange={(e) => p.setRepId(e.target.value)}>
          <option value="">No sponsor — office sale</option>
          {reps.map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.member_code ? ` (${m.member_code})` : ''}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={p.confirmNow} onChange={(e) => p.setConfirmNow(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Confirm the sale now (otherwise it waits in Plot Sales for verification)
      </label>
      {p.hasBooking && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={p.bookingPaid} onChange={(e) => p.setBookingPaid(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          The booking amount has been received (records it as collected)
        </label>
      )}
    </div>
  )
}
