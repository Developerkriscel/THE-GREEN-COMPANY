import { useMemo, useState, type FormEvent } from 'react'
import { ImageUpload } from '@/components/MediaUpload'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Gift, KeyRound, MessageSquareHeart, Pencil, Plus, Search, Trash2, UserRound, Users } from 'lucide-react'
import { useMembers } from '@/lib/queries'
import {
  useCreateCustomer, useCustomerOffers, useCustomers, useDeleteOffer, useFeedback, useReplyFeedback, useSaveOffer,
  type CustomerOffer, type GuardianRelation, type NewCustomer,
} from '@/lib/customers'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, StatTile, Table, Td, Textarea, Th, useToast, RecordCard, Responsive,
} from '@/components/ui'
import { date, money, num } from '@/lib/format'

/**
 * Customers — plot buyers and their panel. The office opens a customer's
 * account here, links or creates their booking, uploads their registry and
 * mutation papers, publishes offers and answers feedback.
 */

type Tab = 'customers' | 'offers' | 'feedback'

export function AdminCustomers() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'customers'
  const setTab = (t: Tab) => setParams(t === 'customers' ? {} : { tab: t })
  const { data: feedback = [] } = useFeedback()
  const unread = feedback.filter((f) => f.status === 'new').length

  return (
    <div>
      <PageHeader title="Customers" description="Plot buyers, their customer panel, offers and feedback." />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-brand-gold/20">
        {([['customers', 'Customers', Users], ['offers', 'Offers', Gift], ['feedback', 'Feedback', MessageSquareHeart]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === k ? 'bg-gold-metal text-brand-darker shadow-sm' : 'text-slate-600 hover:bg-brand-gold/10'}`}>
            <Icon className="h-4 w-4" /> {label}
            {k === 'feedback' && unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
          </button>
        ))}
      </div>
      {tab === 'customers' && <CustomerList />}
      {tab === 'offers' && <OffersTab />}
      {tab === 'feedback' && <FeedbackTab />}
    </div>
  )
}

/* ------------------------------------------------------------------- list */

function CustomerList() {
  const { data: customers = [], isLoading } = useCustomers()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const rms = useRmOptions()
  const rmName = (id: string | null | undefined) => rms.find((r) => r.id === id)?.label

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return customers
    return customers.filter((c) => [c.full_name, c.user_code, c.phone, c.email, c.details?.guardian_name]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(s)))
  }, [customers, q])

  const withPlot = customers.filter((c) => c.bookings.length > 0).length
  const value = customers.reduce((t, c) => t + c.bookings.reduce((u, b) => u + Number(b.sale_value ?? 0), 0), 0)

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Customers" value={num(customers.length)} icon={<Users className="h-4 w-4" />} />
        <StatTile label="With a plot" value={num(withPlot)} icon={<UserRound className="h-4 w-4" />} />
        <StatTile label="Plot value" value={money(value)} />
        <StatTile label="Without a plot yet" value={num(customers.length - withPlot)} tone={customers.length - withPlot ? 'amber' : 'neutral'} />
      </div>
      <Card>
        <CardHeader
          title="All customers" subtitle={`${num(shown.length)} shown`}
          action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add customer</Button>}
        />
        <div className="border-b border-brand-gold/15 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, customer ID, mobile, e-mail or father's name" />
          </div>
        </div>
        {isLoading ? <Spinner /> : shown.length === 0 ? (
          <EmptyState title={customers.length ? 'No customer matches' : 'No customers yet'}
            description={customers.length ? undefined : 'Add a plot buyer to give them their customer panel.'}
            action={!customers.length ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add customer</Button> : undefined} />
        ) : (
          <Responsive table={<Table>
            <thead><tr><Th>Customer</Th><Th>Mobile</Th><Th>Relationship manager</Th><Th className="text-right">Plots</Th><Th className="text-right">Value</Th><Th>Since</Th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-brand-gold/[0.05]" onClick={() => navigate(`/admin/customers/${c.id}`)}>
                  <Td>
                    <Link to={`/admin/customers/${c.id}`} className="font-semibold text-brand-darker hover:underline" onClick={(e) => e.stopPropagation()}>{c.full_name}</Link>
                    <p className="font-mono text-xs text-slate-400">{c.user_code}{c.details?.guardian_name ? ` · ${c.details.guardian_relation ?? 'S/O'} ${c.details.guardian_name}` : ''}</p>
                  </Td>
                  <Td>{c.phone ?? '—'}</Td>
                  <Td className="text-slate-600">{c.details?.rm_name ?? rmName(c.details?.rm_id) ?? <span className="text-amber-700">Not assigned</span>}</Td>
                  <Td className="text-right">{c.bookings.length || <Badge tone="amber">None</Badge>}</Td>
                  <Td className="text-right">{money(c.bookings.reduce((t, b) => t + Number(b.sale_value ?? 0), 0))}</Td>
                  <Td className="text-xs text-slate-500">{date(c.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>} cards={
            <div>
              {shown.map((c) => (
                <RecordCard key={c.id} onClick={() => navigate(`/admin/customers/${c.id}`)}
                  title={c.full_name}
                  subtitle={`${c.user_code ?? ''}${c.details?.guardian_name ? ` · ${c.details.guardian_relation ?? 'S/O'} ${c.details.guardian_name}` : ''}`}
                  amount={<span className="text-sm font-semibold">{money(c.bookings.reduce((t, b) => t + Number(b.sale_value ?? 0), 0))}</span>}
                  badge={c.bookings.length ? <Badge tone="green">{c.bookings.length} plot{c.bookings.length === 1 ? '' : 's'}</Badge> : <Badge tone="amber">No plot</Badge>}
                  rows={[
                    { label: 'Mobile', value: c.phone ?? '—' },
                    { label: 'RM', value: c.details?.rm_name ?? rmName(c.details?.rm_id) ?? 'Not assigned' },
                    { label: 'Since', value: date(c.created_at) },
                  ]} />
              ))}
            </div>
          } />
        )}
      </Card>
      {adding && <AddCustomer onClose={() => setAdding(false)} onCreated={(id) => navigate(`/admin/customers/${id}`)} />}
    </>
  )
}

/* ------------------------------------------------------------ add customer */

export function useRmOptions() {
  const { data: members = [] } = useMembers()
  return useMemo(() => members
    .filter((m) => m.role === 'rep' && m.status === 'active')
    .map((m) => ({ id: m.id, label: `${m.full_name}${m.member_code ? ` (${m.member_code})` : ''}`, phone: m.phone ?? '', name: m.full_name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [members])
}

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '@' + (10 + Math.floor(Math.random() * 89))
}

function AddCustomer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateCustomer()
  const rms = useRmOptions()
  const { push } = useToast()
  const [f, setF] = useState<NewCustomer>({ full_name: '', phone: '', password: genPassword(), guardian_relation: 'S/O' })
  const [rmMode, setRmMode] = useState<'member' | 'other'>('member')
  const [done, setDone] = useState<{ id: string; user_code: string } | null>(null)
  const set = <K extends keyof NewCustomer>(k: K, v: NewCustomer[K]) => setF((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const body: NewCustomer = { ...f }
    if (rmMode === 'member') { delete body.rm_name; delete body.rm_phone } else { delete body.rm_id }
    create.mutate(body, {
      onSuccess: (r) => setDone(r),
      onError: (err) => push('error', (err as Error).message),
    })
  }

  if (done) {
    return (
      <Modal open onClose={() => onCreated(done.id)} title="Customer account created"
        footer={<Button onClick={() => onCreated(done.id)}>Open customer — link their plot</Button>}>
        <div className="space-y-3 text-sm">
          <p>Share these sign-in details with <b>{f.full_name}</b>:</p>
          <div className="rounded-2xl bg-leaf-deep p-4 text-white">
            <p className="text-xs uppercase tracking-wider text-brand-gold-light/80">Customer portal</p>
            <p className="mt-1">{window.location.origin}/customer-login</p>
            <p className="mt-2">Customer ID: <b className="font-mono text-brand-gold-light">{done.user_code}</b> (or mobile {f.phone})</p>
            <p>Password: <b className="font-mono text-brand-gold-light">{f.password}</b></p>
          </div>
          <p className="text-xs text-slate-500">The password is shown only now. It can be reset later from the customer's page.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Add customer" size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="add-customer" loading={create.isPending}>Create customer</Button></div>}>
      <form id="add-customer" onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Customer details</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required><Input required value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <Field label="Relation">
                <Select value={f.guardian_relation ?? 'S/O'} onChange={(e) => set('guardian_relation', e.target.value as GuardianRelation)}>
                  {['S/O', 'D/O', 'W/O', 'C/O'].map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Father / husband name"><Input value={f.guardian_name ?? ''} onChange={(e) => set('guardian_name', e.target.value)} /></Field>
            </div>
            <Field label="Mobile number" required><Input required inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit" /></Field>
            <Field label="Alternate mobile"><Input inputMode="tel" value={f.alt_phone ?? ''} onChange={(e) => set('alt_phone', e.target.value)} /></Field>
            <Field label="E-mail (optional)"><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="City"><Input value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><Textarea rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field></div>
            <Field label="State"><Input value={f.state ?? ''} onChange={(e) => set('state', e.target.value)} /></Field>
            <Field label="Pincode"><Input value={f.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Relationship manager (RM)</legend>
          <div className="mb-2 flex gap-2 text-sm">
            {(['member', 'other'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setRmMode(m)}
                className={`rounded-lg px-3 py-1.5 ${rmMode === m ? 'bg-gold-metal font-semibold text-brand-darker' : 'border border-slate-200 text-slate-600'}`}>
                {m === 'member' ? 'A sponsor' : 'Office staff / other'}
              </button>
            ))}
          </div>
          {rmMode === 'member' ? (
            <Field label="Sponsor" hint="Their name and number are shown to the customer; referrals from the customer go to them.">
              <Select value={f.rm_id ?? ''} onChange={(e) => set('rm_id', e.target.value)}>
                <option value="">Not assigned yet</option>
                {rms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="RM name"><Input value={f.rm_name ?? ''} onChange={(e) => set('rm_name', e.target.value)} /></Field>
              <Field label="RM contact number"><Input inputMode="tel" value={f.rm_phone ?? ''} onChange={(e) => set('rm_phone', e.target.value)} /></Field>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Referred by (if any)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={f.referred_by_name ?? ''} onChange={(e) => set('referred_by_name', e.target.value)} /></Field>
            <Field label="Number"><Input inputMode="tel" value={f.referred_by_phone ?? ''} onChange={(e) => set('referred_by_phone', e.target.value)} /></Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Customer panel sign-in</legend>
          <Field label="Password" hint="Shown once after creating; share it with the customer. They sign in with their customer ID or mobile.">
            <div className="flex gap-2">
              <Input value={f.password} onChange={(e) => set('password', e.target.value)} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => set('password', genPassword())}><KeyRound className="h-4 w-4" /> New</Button>
            </div>
          </Field>
          <div className="mt-3"><Field label="Notes (office only)"><Textarea rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field></div>
        </fieldset>
      </form>
    </Modal>
  )
}

/* ----------------------------------------------------------------- offers */

function OffersTab() {
  const { data: offers = [], isLoading } = useCustomerOffers({ all: true })
  const save = useSaveOffer()
  const del = useDeleteOffer()
  const { push } = useToast()
  const [editing, setEditing] = useState<Partial<CustomerOffer> | null>(null)

  return (
    <Card>
      <CardHeader title="Offers for customers" subtitle="Shown on every customer's dashboard and Offers page while active and in date."
        action={<Button onClick={() => setEditing({ active: true })}><Plus className="h-4 w-4" /> New offer</Button>} />
      {isLoading ? <Spinner /> : offers.length === 0 ? <EmptyState title="No offers yet" /> : (
        <Responsive table={<Table>
          <thead><tr><Th>Offer</Th><Th>For</Th><Th>Valid till</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <Td><p className="font-semibold text-brand-darker">{o.title}</p>{o.body && <p className="line-clamp-1 text-xs text-slate-500">{o.body}</p>}</Td>
                <Td className="text-sm">{o.customer_id ? 'One customer' : 'All customers'}</Td>
                <Td className="text-sm">{o.valid_until ? date(o.valid_until) : 'No end date'}</Td>
                <Td>{o.active ? <Badge tone="green">Live</Badge> : <Badge tone="neutral">Off</Badge>}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(o)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${o.title}"?`)) del.mutate(o.id) }}><Trash2 className="h-4 w-4" /></Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>} cards={
          <div>
            {offers.map((o) => (
              <RecordCard key={o.id} onClick={() => setEditing(o)}
                title={o.title} subtitle={o.body ?? undefined}
                badge={o.active ? <Badge tone="green">Live</Badge> : <Badge tone="neutral">Off</Badge>}
                rows={[
                  { label: 'For', value: o.customer_id ? 'One customer' : 'All customers' },
                  { label: 'Valid till', value: o.valid_until ? date(o.valid_until) : 'No end date' },
                ]}
                actions={<Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${o.title}"?`)) del.mutate(o.id) }}><Trash2 className="h-4 w-4" /></Button>} />
            ))}
          </div>
        } />
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'Edit offer' : 'New offer'}
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} disabled={!editing.title?.trim()} onClick={() => save.mutate({ ...editing, title: editing.title!.trim() } as CustomerOffer, {
              onSuccess: () => { push('success', 'Offer saved.'); setEditing(null) }, onError: (e) => push('error', (e as Error).message),
            })}>Save offer</Button></div>}>
          <div className="space-y-3">
            <Field label="Title" required><Input value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Festive offer: 5% off on a second plot" /></Field>
            <Field label="Details"><Textarea rows={4} value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
            <Field label="Image (optional)"><ImageUpload folder="offers" value={editing.image_url ?? null} onChange={(p) => setEditing({ ...editing, image_url: p })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Button text"><Input value={editing.cta_label ?? ''} onChange={(e) => setEditing({ ...editing, cta_label: e.target.value || null })} placeholder="Know more" /></Field>
              <Field label="Button link"><Input value={editing.cta_link ?? ''} onChange={(e) => setEditing({ ...editing, cta_link: e.target.value || null })} placeholder="https://… or a WhatsApp link" /></Field>
              <Field label="Valid till"><Input type="date" value={editing.valid_until ?? ''} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value || null })} /></Field>
              <Field label="Status">
                <Select value={editing.active === false ? 'off' : 'on'} onChange={(e) => setEditing({ ...editing, active: e.target.value === 'on' })}>
                  <option value="on">Live</option><option value="off">Off</option>
                </Select>
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- feedback */

function FeedbackTab() {
  const { data: items = [], isLoading } = useFeedback()
  const reply = useReplyFeedback()
  const { push } = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const avg = items.filter((f) => f.rating).reduce((t, f, _, a) => t + (f.rating ?? 0) / a.length, 0)

  return (
    <Card>
      <CardHeader title="Customer feedback" subtitle={items.length ? `${items.length} message${items.length === 1 ? '' : 's'}${avg ? ` · average ${avg.toFixed(1)}★` : ''}` : undefined} />
      {isLoading ? <Spinner /> : items.length === 0 ? <EmptyState title="No feedback yet" /> : (
        <ul className="divide-y divide-slate-100">
          {items.map((f) => (
            <li key={f.id} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link to={`/admin/customers/${f.customer_id}`} className="font-semibold text-brand-darker hover:underline">{f.customer?.full_name ?? 'Customer'}</Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{f.customer?.user_code}</span>
                  {f.rating && <span className="ml-2 text-sm text-brand-gold-dark">{'★'.repeat(f.rating)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={f.status === 'new' ? 'red' : f.status === 'replied' ? 'green' : 'neutral'}>{f.status}</Badge>
                  <span className="text-xs text-slate-400">{date(f.created_at)}</span>
                </div>
              </div>
              <p className="whitespace-pre-line text-sm text-slate-700">{f.message}</p>
              {f.admin_reply ? (
                <p className="rounded-xl bg-brand-gold/[0.08] px-3 py-2 text-sm text-brand-darker"><b className="text-brand-gold-deep">Reply:</b> {f.admin_reply}</p>
              ) : open === f.id ? (
                <div className="space-y-2">
                  <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your reply — the customer sees it in their panel and is notified." />
                  <div className="flex gap-2">
                    <Button size="sm" loading={reply.isPending} disabled={text.trim().length < 2} onClick={() => reply.mutate({ id: f.id, reply: text }, {
                      onSuccess: () => { push('success', 'Reply sent.'); setOpen(null); setText('') }, onError: (e) => push('error', (e as Error).message),
                    })}>Send reply</Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setOpen(f.id); setText('') }}>Reply</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
