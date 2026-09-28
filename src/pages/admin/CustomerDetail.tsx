import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileUp, KeyRound, Link2, Plus, Save, Trash2, Upload } from 'lucide-react'
import {
  bookingMoney, DOC_LABEL, STAGE_LABEL, UPLOAD_DOC_TYPES,
  useBookingDocuments, useBookingEmis, useBookingPayments, useCreateCustomerBooking, useCustomer, useCustomerBookings,
  useCustomerReferralLeads, useDeleteCustomerDoc, useFeedback, useLinkBooking, useSaveCustomer, useSetCustomerPassword,
  useUnlinkedBookings, useUpdateBookingStages, useUploadCustomerDoc,
  type CustomerBooking, type CustomerDetails, type CustomerDocument, type CustomerProfile, type GuardianRelation, type StageStatus,
} from '@/lib/customers'
import { useAvailablePlots } from '@/lib/sponsor-crm'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Select, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { ProgressBar } from '@/components/sponsor'
import { date, money, num } from '@/lib/format'
import { openDocument } from '@/pages/customer/common'
import { useRmOptions } from './Customers'

/**
 * One customer, as the office runs them: their record and RM, the plots they
 * bought (linked from Plot Sales or booked here), the registry / mutation /
 * possession stages, the papers their panel shows, and what they sent back.
 */
export function AdminCustomerDetail() {
  const { id } = useParams()
  const { data, isLoading } = useCustomer(id)
  const { data: bookings = [] } = useCustomerBookings(id)
  const ids = useMemo(() => bookings.map((b) => b.id), [bookings])
  const { data: emis = [] } = useBookingEmis(ids)
  const { data: payments = [] } = useBookingPayments(ids)
  const { data: docs = [] } = useBookingDocuments(ids)
  const [linking, setLinking] = useState(false)
  const [booking, setBooking] = useState(false)

  if (isLoading) return <Spinner />
  if (!data?.profile) return <EmptyState title="Customer not found" action={<Link to="/admin/customers" className="text-sm font-semibold text-brand-700">Back to customers</Link>} />
  const { profile: p, details } = data

  return (
    <div className="space-y-6">
      <div className="bg-leaf-deep flex flex-wrap items-end justify-between gap-4 rounded-3xl p-6 text-white shadow-luxe ring-1 ring-brand-gold/30">
        <div>
          <Link to="/admin/customers" className="mb-2 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Customers</Link>
          <h1 className="text-2xl font-extrabold">{p.full_name}</h1>
          <p className="mt-1 text-sm text-white/70">
            <span className="font-mono font-semibold text-brand-gold-light">{p.user_code}</span>
            {details?.guardian_name && <> · {details.guardian_relation ?? 'S/O'} {details.guardian_name}</>}
            {p.phone && <> · {p.phone}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="!border-brand-gold/50 !bg-white/5 !text-white" onClick={() => setLinking(true)}><Link2 className="h-4 w-4" /> Link a booking</Button>
          <Button onClick={() => setBooking(true)}><Plus className="h-4 w-4" /> Book a plot</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {bookings.length === 0 ? (
            <Card><EmptyState title="No plot linked yet"
              description="Link the booking made in Plot Sales, or book a plot for them here. Their panel shows the plot, instalments and papers once linked." /></Card>
          ) : bookings.map((b) => (
            <BookingCard key={b.id} customerId={p.id} booking={b} money={bookingMoney(b, emis, payments)} docs={docs.filter((d) => d.booking_id === b.id)} />
          ))}
          <ReferralsCard customerId={p.id} />
          <FeedbackCard customerId={p.id} />
        </div>
        <div className="space-y-6">
          <DetailsCard profile={p} details={details} />
          <PasswordCard customerId={p.id} />
        </div>
      </div>

      {linking && <LinkBookingModal customerId={p.id} name={p.full_name} phone={p.phone} onClose={() => setLinking(false)} />}
      {booking && <BookPlotModal customerId={p.id} rmId={details?.rm_id ?? null} onClose={() => setBooking(false)} />}
    </div>
  )
}

/* ---------------------------------------------------------------- booking */

function BookingCard({ customerId, booking: b, money: m, docs }: {
  customerId: string; booking: CustomerBooking; money: ReturnType<typeof bookingMoney>; docs: CustomerDocument[]
}) {
  const stages = useUpdateBookingStages(customerId)
  const del = useDeleteCustomerDoc()
  const { push } = useToast()
  const [uploading, setUploading] = useState(false)

  const setStage = (k: 'registry_status' | 'mutation_status' | 'possession_status', v: StageStatus) =>
    stages.mutate({ id: b.id, [k]: v }, { onSuccess: () => push('success', 'Updated — the customer sees it now.'), onError: (e) => push('error', (e as Error).message) })

  const paidEmis = m.emis.filter((e) => e.status === 'paid').length
  const awaiting = m.emis.filter((e) => e.status === 'awaiting_verification').length

  return (
    <Card>
      <CardHeader
        title={`${b.project?.name ?? 'Plot'} · Plot ${b.plot?.number ?? '—'}`}
        subtitle={`Booking ${b.reference} · ${b.plot?.size ? `${num(b.plot.size)} ${b.plot.size_unit ?? 'sq yd'} · ` : ''}${date(b.created_at)}${b.rep ? ` · sold by ${b.rep.full_name}` : ''}`}
        action={<Link to={`/admin/bookings/${b.id}`} className="text-sm font-medium text-brand-700 hover:underline">Open booking</Link>}
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[['Plot value', money(m.value)], ['Paid', money(m.paid)], ['Still to pay', money(m.outstanding)], ['Instalments', m.emis.length ? `${paidEmis}/${m.emis.length} paid` : 'None']].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-brand-gold/[0.07] px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p><p className="font-bold text-brand-darker">{v}</p></div>
          ))}
        </div>
        <ProgressBar percent={m.pct} />
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={b.status === 'confirmed' ? 'green' : 'amber'}>{b.status.replace(/_/g, ' ')}</Badge>
          {m.overdue.length > 0 && <Badge tone="red">{m.overdue.length} overdue</Badge>}
          {awaiting > 0 && <Link to="/admin/crm"><Badge tone="blue">{awaiting} slip{awaiting === 1 ? '' : 's'} to verify →</Badge></Link>}
          {m.next && <span className="text-slate-500">Next: {money(m.next.amount)} on {date(m.next.due_date)}</span>}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Stages the customer sees</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['registry_status', 'Registry'], ['mutation_status', 'Mutation'], ['possession_status', 'Possession']] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <Select value={b[k]} onChange={(e) => setStage(k, e.target.value as StageStatus)} disabled={stages.isPending}>
                  {(Object.keys(STAGE_LABEL) as StageStatus[]).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                </Select>
              </Field>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Papers on the customer's panel</p>
            <Button size="sm" onClick={() => setUploading(true)}><FileUp className="h-4 w-4" /> Upload</Button>
          </div>
          {docs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-brand-gold/30 py-5 text-center text-sm text-slate-500">No papers yet — upload the registry, mutation, plot photos, allotment letter…</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <Badge tone="gold">{DOC_LABEL[d.type] ?? d.type}</Badge>
                  <button className="min-w-0 flex-1 truncate text-left font-medium text-brand-darker hover:underline" onClick={() => void openDocument(d)}>{d.title}</button>
                  <span className="hidden text-xs text-slate-400 sm:inline">{date(d.created_at)}</span>
                  <button aria-label="Delete" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => { if (confirm(`Remove "${d.title}" from the customer's panel?`)) del.mutate(d, { onError: (e) => push('error', (e as Error).message) }) }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
      {uploading && <UploadDocModal customerId={customerId} bookingId={b.id} onClose={() => setUploading(false)} />}
    </Card>
  )
}

function UploadDocModal({ customerId, bookingId, onClose }: { customerId: string; bookingId: string; onClose: () => void }) {
  const upload = useUploadCustomerDoc(customerId)
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [type, setType] = useState('registry')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<File[]>([])

  async function submit() {
    try {
      for (const [i, file] of files.entries()) {
        const t = title.trim() ? (files.length > 1 ? `${title.trim()} ${i + 1}` : title.trim()) : `${DOC_LABEL[type]}${files.length > 1 ? ` ${i + 1}` : ''}`
        await upload.mutateAsync({ bookingId, type, title: t, file })
      }
      push('success', `${files.length} file${files.length === 1 ? '' : 's'} uploaded — visible on the customer's panel.`)
      onClose()
    } catch (e) { push('error', (e as Error).message) }
  }

  return (
    <Modal open onClose={onClose} title="Upload papers for the customer"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={upload.isPending} disabled={!files.length} onClick={() => void submit()}><Upload className="h-4 w-4" /> Upload</Button></div>}>
      <div className="space-y-4">
        <Field label="What is it?">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {UPLOAD_DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="Title (optional)" hint="Defaults to the type, e.g. “Registry”."><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <input ref={fileRef} type="file" multiple={type === 'plot_photo'} accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-brand-gold/40 px-4 py-6 text-sm text-slate-600 hover:bg-brand-gold/5">
          <Upload className="mb-2 h-5 w-5 text-brand-gold-dark" />
          {files.length ? <span className="font-semibold text-brand-darker">{files.map((f) => f.name).join(', ')}</span>
            : `Choose ${type === 'plot_photo' ? 'photos' : 'the file'} (PDF, JPG, PNG or WebP, up to 20 MB)`}
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------ link / book a plot */

function LinkBookingModal({ customerId, name, phone, onClose }: { customerId: string; name: string; phone: string | null; onClose: () => void }) {
  const { data: rows = [], isLoading } = useUnlinkedBookings(true)
  const link = useLinkBooking(customerId)
  const { push } = useToast()
  const [q, setQ] = useState('')
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = rows.map((b) => ({
      b, match: (digits && (b.customer_phone ?? '').replace(/\D/g, '').endsWith(digits)) || (b.customer_name ?? '').toLowerCase() === name.toLowerCase(),
    }))
    return list
      .filter(({ b }) => !s || [b.reference, b.customer_name, b.customer_phone, b.plot?.number, b.project?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)))
      .sort((a, z) => Number(z.match) - Number(a.match))
  }, [rows, q, digits, name])

  return (
    <Modal open onClose={onClose} title="Link an existing booking" size="lg">
      <p className="mb-3 text-sm text-slate-600">Bookings not yet tied to a customer account. Matches on {name}'s name or mobile are listed first.</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by booking no., buyer name, mobile, plot or project" className="mb-3" />
      {isLoading ? <Spinner /> : shown.length === 0 ? <EmptyState title="No unlinked bookings" /> : (
        <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
          {shown.map(({ b, match }) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div>
                <p className="font-semibold text-brand-darker">{b.project?.name} · Plot {b.plot?.number} {match && <Badge tone="green">Likely match</Badge>}</p>
                <p className="text-xs text-slate-500">{b.reference} · {b.customer_name ?? '—'} {b.customer_phone ? `· ${b.customer_phone}` : ''} · {money(b.sale_value)} · {b.status.replace(/_/g, ' ')}</p>
              </div>
              <Button size="sm" loading={link.isPending && link.variables === b.id}
                onClick={() => link.mutate(b.id, { onSuccess: () => { push('success', 'Booking linked — it now shows on the customer panel.'); onClose() }, onError: (e) => push('error', (e as Error).message) })}>
                Link
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function BookPlotModal({ customerId, rmId, onClose }: { customerId: string; rmId: string | null; onClose: () => void }) {
  const { data: plots = [], isLoading } = useAvailablePlots()
  const rms = useRmOptions()
  const create = useCreateCustomerBooking(customerId)
  const { push } = useToast()
  const [projectId, setProjectId] = useState('')
  const [plotId, setPlotId] = useState('')
  const [sale, setSale] = useState('')
  const [token, setToken] = useState('')
  const [emiCount, setEmiCount] = useState('0')
  const [emiStart, setEmiStart] = useState('')
  const [repId, setRepId] = useState(rmId ?? '')

  const projects = useMemo(() => [...new Map(plots.map((p) => [p.project_id, p.project_name])).entries()], [plots])
  const inProject = plots.filter((p) => p.project_id === projectId)
  const plot = plots.find((p) => p.id === plotId)
  useEffect(() => { if (plot?.price) setSale(String(plot.price)) }, [plot])

  const saleN = Number(sale) || 0
  const tokenN = Number(token) || 0
  const n = Math.max(0, Math.floor(Number(emiCount) || 0))
  const perEmi = n > 0 ? Math.round((saleN - tokenN) / n) : 0

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate({ plotId, saleValue: saleN, tokenAmount: tokenN, emiCount: n, emiStart: n > 0 ? emiStart || null : null, repId: repId || null }, {
      onSuccess: () => { push('success', 'Plot booked and confirmed — the schedule is on the customer panel.'); onClose() },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <Modal open onClose={onClose} title="Book a plot for this customer" size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="book-plot" loading={create.isPending} disabled={!plotId || saleN <= 0 || tokenN > saleN || (n > 0 && !emiStart)}>Book &amp; confirm</Button></div>}>
      {isLoading ? <Spinner /> : (
        <form id="book-plot" onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project" required>
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPlotId('') }}>
                <option value="">Choose…</option>
                {projects.map(([pid, pname]) => <option key={pid} value={pid}>{pname}</option>)}
              </Select>
            </Field>
            <Field label="Plot" required hint={projectId ? `${inProject.length} available` : undefined}>
              <Select value={plotId} onChange={(e) => setPlotId(e.target.value)} disabled={!projectId}>
                <option value="">Choose…</option>
                {inProject.map((p) => <option key={p.id} value={p.id}>Plot {p.number}{p.size ? ` · ${num(p.size)} ${p.size_unit}` : ''}{p.price ? ` · ${money(p.price)}` : ''}</option>)}
              </Select>
            </Field>
            <Field label="Plot value (₹)" required><Input inputMode="numeric" value={sale} onChange={(e) => setSale(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
            <Field label="Booking amount paid (₹)" hint="Counted as paid on the customer panel."><Input inputMode="numeric" value={token} onChange={(e) => setToken(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
            <Field label="Number of EMIs" hint="0 for full payment."><Input inputMode="numeric" value={emiCount} onChange={(e) => setEmiCount(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="First EMI date" required={n > 0}><Input type="date" value={emiStart} onChange={(e) => setEmiStart(e.target.value)} disabled={n === 0} /></Field>
            <div className="sm:col-span-2">
              <Field label="Credit the sale to a sponsor (optional)" hint="Their direct and level income is worked out as for any confirmed sale.">
                <Select value={repId} onChange={(e) => setRepId(e.target.value)}>
                  <option value="">No sponsor — office sale</option>
                  {rms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </Field>
            </div>
          </div>
          {saleN > 0 && (
            <div className="rounded-xl bg-brand-gold/[0.08] px-4 py-3 text-sm text-brand-darker">
              {tokenN > saleN ? <span className="text-red-700">The booking amount is more than the plot value.</span>
                : n > 0 ? <>Balance {money(saleN - tokenN)} in <b>{n}</b> monthly EMIs of about <b>{money(perEmi)}</b>{emiStart ? ` from ${date(emiStart)}` : ''}.</>
                : <>Balance {money(saleN - tokenN)} as a single payment.</>}
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- details */

function DetailsCard({ profile: p, details: d }: { profile: CustomerProfile; details: CustomerDetails | null }) {
  const save = useSaveCustomer(p.id)
  const rms = useRmOptions()
  const { push } = useToast()
  const init = () => ({
    full_name: p.full_name, phone: p.phone ?? '', address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', pincode: p.pincode ?? '', notes: p.notes ?? '',
    guardian_relation: (d?.guardian_relation ?? 'S/O') as GuardianRelation, guardian_name: d?.guardian_name ?? '', alt_phone: d?.alt_phone ?? '',
    rm_id: d?.rm_id ?? '', rm_name: d?.rm_name ?? '', rm_phone: d?.rm_phone ?? '', referred_by_name: d?.referred_by_name ?? '', referred_by_phone: d?.referred_by_phone ?? '',
  })
  const [f, setF] = useState(init)
  useEffect(() => { setF(init()) }, [p, d]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof ReturnType<typeof init>, v: string) => setF((x) => ({ ...x, [k]: v }))
  const nul = (s: string) => s.trim() || null

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate({
      profile: { full_name: f.full_name.trim(), phone: nul(f.phone), address: nul(f.address), city: nul(f.city), state: nul(f.state), pincode: nul(f.pincode), notes: nul(f.notes) },
      details: {
        guardian_relation: f.guardian_relation, guardian_name: nul(f.guardian_name), alt_phone: nul(f.alt_phone), rm_id: f.rm_id || null,
        rm_name: nul(f.rm_name), rm_phone: nul(f.rm_phone), referred_by_name: nul(f.referred_by_name), referred_by_phone: nul(f.referred_by_phone),
      },
    }, { onSuccess: () => push('success', 'Customer saved.'), onError: (err) => push('error', (err as Error).message) })
  }

  return (
    <Card>
      <CardHeader title="Customer details" subtitle={`Customer since ${date(p.created_at)}`} />
      <CardBody>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name"><Input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <Field label="Relation">
              <Select value={f.guardian_relation} onChange={(e) => set('guardian_relation', e.target.value)}>
                {['S/O', 'D/O', 'W/O', 'C/O'].map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Father / husband"><Input value={f.guardian_name} onChange={(e) => set('guardian_name', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mobile"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Alternate mobile"><Input value={f.alt_phone} onChange={(e) => set('alt_phone', e.target.value)} /></Field>
          </div>
          <Field label="Address"><Textarea rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="City"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="State"><Input value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
            <Field label="Pincode"><Input value={f.pincode} onChange={(e) => set('pincode', e.target.value)} /></Field>
          </div>
          <Field label="Relationship manager (sponsor)">
            <Select value={f.rm_id} onChange={(e) => set('rm_id', e.target.value)}>
              <option value="">— none / office staff below —</option>
              {rms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="RM name (override)"><Input value={f.rm_name} onChange={(e) => set('rm_name', e.target.value)} placeholder={f.rm_id ? 'From the sponsor' : ''} /></Field>
            <Field label="RM contact no."><Input value={f.rm_phone} onChange={(e) => set('rm_phone', e.target.value)} placeholder={f.rm_id ? 'From the sponsor' : ''} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Referred by"><Input value={f.referred_by_name} onChange={(e) => set('referred_by_name', e.target.value)} /></Field>
            <Field label="Referrer's no."><Input value={f.referred_by_phone} onChange={(e) => set('referred_by_phone', e.target.value)} /></Field>
          </div>
          <Field label="Office notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <Button type="submit" loading={save.isPending} className="w-full"><Save className="h-4 w-4" /> Save details</Button>
        </form>
      </CardBody>
    </Card>
  )
}

function PasswordCard({ customerId }: { customerId: string }) {
  const setPw = useSetCustomerPassword()
  const { push } = useToast()
  const [pw, setPwText] = useState('')
  return (
    <Card>
      <CardHeader title="Customer panel sign-in" subtitle="Set a new password if the customer has forgotten theirs." />
      <CardBody className="space-y-3">
        <Input value={pw} onChange={(e) => setPwText(e.target.value)} placeholder="New password (6+ characters)" className="font-mono" />
        <Button variant="outline" className="w-full" loading={setPw.isPending} disabled={pw.length < 6}
          onClick={() => setPw.mutate({ member_id: customerId, password: pw }, {
            onSuccess: () => { push('success', 'Password changed. Share it with the customer.'); setPwText('') },
            onError: (e) => push('error', (e as Error).message),
          })}>
          <KeyRound className="h-4 w-4" /> Set password
        </Button>
        <p className="text-xs text-slate-500">Sign-in page: <span className="font-mono">{window.location.origin}/customer-login</span></p>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------- referrals and feedback */

function ReferralsCard({ customerId }: { customerId: string }) {
  const { data: leads = [] } = useCustomerReferralLeads(customerId)
  if (!leads.length) return null
  return (
    <Card>
      <CardHeader title="People this customer referred" subtitle={`${leads.length} lead${leads.length === 1 ? '' : 's'}`} />
      <Table>
        <thead><tr><Th>Name</Th><Th>Mobile</Th><Th>With</Th><Th>Status</Th><Th>On</Th></tr></thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <Td><Link to={`/admin/leads/${l.id}`} className="font-semibold text-brand-darker hover:underline">{l.name}</Link></Td>
              <Td>{l.mobile}</Td>
              <Td className="text-slate-600">{l.owner?.full_name ?? 'Office pool'}</Td>
              <Td><Badge tone="gold">{l.status.replace(/_/g, ' ')}</Badge></Td>
              <Td className="text-xs text-slate-500">{date(l.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}

function FeedbackCard({ customerId }: { customerId: string }) {
  const { data: items = [] } = useFeedback(customerId)
  if (!items.length) return null
  return (
    <Card>
      <CardHeader title="Feedback" action={<Link to="/admin/customers?tab=feedback" className="text-sm font-medium text-brand-700 hover:underline">Reply in the inbox</Link>} />
      <ul className="divide-y divide-slate-100">
        {items.map((f) => (
          <li key={f.id} className="space-y-1 px-5 py-3 text-sm">
            <div className="flex justify-between"><span className="text-brand-gold-dark">{f.rating ? '★'.repeat(f.rating) : ''}</span><span className="text-xs text-slate-400">{date(f.created_at)}</span></div>
            <p className="text-slate-700">{f.message}</p>
            {f.admin_reply && <p className="text-xs text-slate-500"><b>Reply:</b> {f.admin_reply}</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
