import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Award, BadgeCheck, BookOpen, Check, CheckCircle2, Circle, CreditCard, Eye, FileUp, Flag, GraduationCap, IndianRupee, LogIn, LogOut,
  MoveRight, PackageCheck, Pencil, Plus, ShieldAlert, StickyNote, Trash2, TrendingUp, Undo2, UserCheck,
} from 'lucide-react'
import {
  ASSET_TYPES, DOC_TYPES, EVENT_LABEL, EXIT_LABEL, LEAVE_TYPES, MANUAL_EVENTS, QUOTA_TYPES, REQUIRED_DOCS, STATUS_LABEL,
  daysUntil, leaveUsed, openHrFile, spanDays, useAddEmployeeEvent, useArchiveEmployee, useDeleteAsset, useDeleteEmployeeDoc,
  useDeleteEmployeeEvent, useDeleteLeave, useEmployeeAssets, useEmployeeDocs, useEmployeeEvents, useEmployeeLeaves, useSaveAsset,
  useSaveEmployee, useSaveLeave, useUpdateEmployeeDoc, useUploadEmployeeDoc,
  type Employee, type EmployeeAsset, type EmployeeDocument, type EmployeeEvent, type EmployeeLeave, type EventKind, type ExitType,
} from '@/lib/employees'
import {
  Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, Modal, RecordCard, Responsive, Select, Table, Td,
  Textarea, Th, useToast,
} from '@/components/ui'
import { date, money, num } from '@/lib/format'

const todayYmd = () => format(new Date(), 'yyyy-MM-dd')
const fail = (push: ReturnType<typeof useToast>['push']) => (e: unknown) => push('error', (e as Error).message)

/* =============================================================== documents */

export function DocumentsTab({ employee: e }: { employee: Employee }) {
  const { data: docs = [] } = useEmployeeDocs(e.id)
  const update = useUpdateEmployeeDoc()
  const del = useDeleteEmployeeDoc()
  const { push } = useToast()
  const [uploading, setUploading] = useState<string | null>(null)
  const have = new Set(docs.map((d) => d.doc_type))

  const open = (d: EmployeeDocument) => void openHrFile(d.storage_path).catch(fail(push))
  const remove = (d: EmployeeDocument) => {
    if (!confirm(`Delete “${d.title}”? The file is removed for good.`)) return
    del.mutate(d, { onSuccess: () => push('success', 'Document deleted.'), onError: fail(push) })
  }
  const expiry = (d: EmployeeDocument) => {
    const left = daysUntil(d.expiry_date)
    if (left === null) return null
    if (left < 0) return <Badge tone="red">Expired {date(d.expiry_date)}</Badge>
    if (left <= 30) return <Badge tone="amber">Expires {date(d.expiry_date)}</Badge>
    return <span className="text-xs text-slate-500">Valid till {date(d.expiry_date)}</span>
  }
  const actions = (d: EmployeeDocument) => (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => open(d)} title="View"><Eye className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" title={d.verified ? 'Mark as not checked' : 'Mark as checked against the original'}
        onClick={() => update.mutate({ id: d.id, verified: !d.verified }, { onError: fail(push) })}>
        <BadgeCheck className={`h-4 w-4 ${d.verified ? 'text-emerald-600' : 'text-slate-400'}`} />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => remove(d)} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
    </div>
  )

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader title="Documents" subtitle="Private: only the office can open them, through links that expire in minutes."
          action={<Button size="sm" onClick={() => setUploading('')}><FileUp className="h-4 w-4" /> Upload</Button>} />
        {docs.length === 0 ? (
          <EmptyState title="No documents yet" description="Upload ID proofs, the appointment letter, certificates… PDF or photo, up to 10 MB." />
        ) : (
          <Responsive
            table={
              <Table>
                <thead><tr><Th>Document</Th><Th>Number</Th><Th>Expiry</Th><Th>Uploaded</Th><Th className="text-right">Actions</Th></tr></thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <Td>
                        <button onClick={() => open(d)} className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline">{d.title}</button>
                        <p className="text-xs text-slate-500">{DOC_TYPES[d.doc_type] ?? d.doc_type}{d.verified && <span className="ml-1 text-emerald-600">· checked</span>}</p>
                      </Td>
                      <Td className="font-mono text-xs">{d.doc_number || '—'}</Td>
                      <Td>{expiry(d) ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-xs">{date(d.created_at)}{d.size_bytes ? ` · ${num(d.size_bytes / 1024)} KB` : ''}</Td>
                      <Td>{actions(d)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {docs.map((d) => (
                  <RecordCard key={d.id} onClick={() => open(d)} title={d.title}
                    subtitle={`${DOC_TYPES[d.doc_type] ?? d.doc_type}${d.doc_number ? ` · ${d.doc_number}` : ''}`}
                    badge={d.verified ? <Badge tone="green">Checked</Badge> : undefined}
                    rows={[{ label: 'Uploaded', value: date(d.created_at) }, { label: 'Expiry', value: expiry(d) ?? '—' }]}
                    actions={actions(d)} />
                ))}
              </div>
            }
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Joining papers" subtitle="The set every employee should have on file" />
        <ul className="divide-y divide-slate-100">
          {REQUIRED_DOCS.map((t) => (
            <li key={t} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              {have.has(t) ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
              <span className={`flex-1 ${have.has(t) ? 'text-slate-700' : 'text-slate-500'}`}>{DOC_TYPES[t]}</span>
              {!have.has(t) && <button onClick={() => setUploading(t)} className="text-xs font-medium text-brand-700 hover:underline">Upload</button>}
            </li>
          ))}
        </ul>
      </Card>

      {uploading !== null && <UploadDocModal employee={e} initialType={uploading} onClose={() => setUploading(null)} />}
    </div>
  )
}

function UploadDocModal({ employee: e, initialType, onClose }: { employee: Employee; initialType: string; onClose: () => void }) {
  const upload = useUploadEmployeeDoc()
  const { push } = useToast()
  const [type, setType] = useState(initialType || 'aadhaar')
  const [file, setFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!file) { push('error', 'Choose the file to upload.'); return }
    const f = new FormData(ev.currentTarget)
    upload.mutate({
      employeeId: e.id, docType: type, file,
      title: String(f.get('title') ?? ''), docNumber: String(f.get('doc_number') ?? ''), expiry: String(f.get('expiry') ?? ''),
    }, { onSuccess: () => { push('success', 'Document uploaded.'); onClose() }, onError: fail(push) })
  }

  return (
    <Modal open onClose={onClose} title={`Upload a document for ${e.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" required>
            <Select value={type} onChange={(ev) => setType(ev.target.value)}>
              {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Title" hint={`Blank = “${DOC_TYPES[type]}”`}><Input name="title" placeholder={DOC_TYPES[type]} /></Field>
          <Field label="Document number"><Input name="doc_number" placeholder="e.g. licence no." /></Field>
          <Field label="Expires on" hint="For licences, contracts, police verification"><Input type="date" name="expiry" /></Field>
        </div>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
          onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-brand-gold/40 px-4 py-6 text-center hover:bg-brand-gold/[0.05]">
          <FileUp className="h-6 w-6 text-brand-gold-dark" />
          <span className="text-sm font-medium text-brand-darker">{file ? file.name : 'Choose a file'}</span>
          <span className="text-xs text-slate-500">{file ? `${num(file.size / 1024)} KB · click to change` : 'PDF, JPG, PNG or WebP, up to 10 MB'}</span>
        </button>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={upload.isPending}><FileUp className="h-4 w-4" /> Upload</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ================================================================ timeline */

const EVENT_ICON: Record<EventKind, [ReactNode, string]> = {
  joined: [<LogIn key="i" className="h-3.5 w-3.5" />, 'bg-emerald-600'],
  confirmed: [<UserCheck key="i" className="h-3.5 w-3.5" />, 'bg-emerald-600'],
  promotion: [<TrendingUp key="i" className="h-3.5 w-3.5" />, 'bg-brand-700'],
  transfer: [<MoveRight key="i" className="h-3.5 w-3.5" />, 'bg-sky-600'],
  salary: [<IndianRupee key="i" className="h-3.5 w-3.5" />, 'bg-brand-gold-dark'],
  status: [<Flag key="i" className="h-3.5 w-3.5" />, 'bg-amber-500'],
  exit: [<LogOut key="i" className="h-3.5 w-3.5" />, 'bg-slate-600'],
  card: [<CreditCard key="i" className="h-3.5 w-3.5" />, 'bg-violet-600'],
  note: [<StickyNote key="i" className="h-3.5 w-3.5" />, 'bg-slate-500'],
  appreciation: [<Award key="i" className="h-3.5 w-3.5" />, 'bg-emerald-500'],
  warning: [<ShieldAlert key="i" className="h-3.5 w-3.5" />, 'bg-red-600'],
  training: [<GraduationCap key="i" className="h-3.5 w-3.5" />, 'bg-sky-500'],
  incident: [<BookOpen key="i" className="h-3.5 w-3.5" />, 'bg-orange-500'],
}

export function TimelineTab({ employee: e }: { employee: Employee }) {
  const { data: events = [] } = useEmployeeEvents(e.id)
  const add = useAddEmployeeEvent()
  const del = useDeleteEmployeeEvent()
  const { push } = useToast()
  const [kind, setKind] = useState<EventKind>('note')
  const [filter, setFilter] = useState<'' | EventKind>('')
  const formRef = useRef<HTMLFormElement>(null)
  const shown = filter ? events.filter((x) => x.kind === filter) : events
  const counts = useMemo(() => ({
    appreciation: events.filter((x) => x.kind === 'appreciation').length,
    warning: events.filter((x) => x.kind === 'warning').length,
  }), [events])

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    add.mutate({ employeeId: e.id, kind, title: String(f.get('title')), detail: String(f.get('detail') ?? ''), date: String(f.get('date')) }, {
      onSuccess: () => { push('success', 'Added to the timeline.'); formRef.current?.reset() },
      onError: fail(push),
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader title="Timeline" subtitle={`Joins, promotions, transfers, salary revisions and status changes are recorded by themselves. ${counts.appreciation} appreciation${counts.appreciation === 1 ? '' : 's'} · ${counts.warning} warning${counts.warning === 1 ? '' : 's'}.`}
          action={
            <Select value={filter} onChange={(ev) => setFilter(ev.target.value as EventKind | '')} className="!w-auto">
              <option value="">Everything</option>
              {(Object.keys(EVENT_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{EVENT_LABEL[k]}</option>)}
            </Select>
          } />
        {shown.length === 0 ? <EmptyState title="Nothing here yet" /> : (
          <ol className="relative px-5 py-4">
            <span className="absolute bottom-6 left-[31px] top-6 w-px bg-slate-200" aria-hidden />
            {shown.map((ev) => <TimelineItem key={ev.id} ev={ev} onDelete={() => {
              if (confirm('Remove this entry from the timeline?')) del.mutate(ev, { onError: fail(push) })
            }} />)}
          </ol>
        )}
      </Card>

      <Card className="self-start">
        <CardHeader title="Add an entry" subtitle="A note, appreciation, warning, training or incident" />
        <CardBody>
          <form ref={formRef} onSubmit={submit} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {MANUAL_EVENTS.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${kind === k ? 'bg-gold-metal text-brand-darker ring-brand-gold/50' : 'bg-white text-slate-600 ring-slate-200'}`}>
                  {EVENT_ICON[k][0]} {EVENT_LABEL[k]}
                </button>
              ))}
            </div>
            <Field label="Title" required><Input name="title" required maxLength={160}
              placeholder={{ note: 'e.g. Discussed targets for Q3', appreciation: 'e.g. Top seller of the month', warning: 'e.g. Late arrival — third time', training: 'e.g. Completed site-visit training', incident: 'e.g. Customer complaint at site' }[kind as 'note']} /></Field>
            <Field label="Details"><Textarea name="detail" rows={3} /></Field>
            <Field label="Date" required><Input type="date" name="date" required defaultValue={todayYmd()} max={todayYmd()} /></Field>
            <Button type="submit" loading={add.isPending} className="w-full"><Plus className="h-4 w-4" /> Add</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

function TimelineItem({ ev, onDelete }: { ev: EmployeeEvent; onDelete: () => void }) {
  const [icon, bg] = EVENT_ICON[ev.kind]
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-white ${bg}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">{ev.title}</p>
          {!ev.auto && <button onClick={onDelete} className="shrink-0 text-slate-300 hover:text-red-500" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
        {ev.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{ev.detail}</p>}
        <p className="mt-0.5 text-xs text-slate-400">
          {date(ev.event_date)} · {EVENT_LABEL[ev.kind]}{ev.author?.full_name ? ` · by ${ev.author.full_name}` : ''}{ev.auto ? ' · automatic' : ''}
        </p>
      </div>
    </li>
  )
}

/* ================================================================== assets */

export function AssetsTab({ employee: e }: { employee: Employee }) {
  const { data: assets = [] } = useEmployeeAssets(e.id)
  const del = useDeleteAsset()
  const { push } = useToast()
  const [editing, setEditing] = useState<EmployeeAsset | 'new' | null>(null)
  const [returning, setReturning] = useState<EmployeeAsset | null>(null)
  const out = assets.filter((a) => !a.returned_on)
  const value = out.reduce((s, a) => s + (a.value ?? 0), 0)

  const actions = (a: EmployeeAsset) => (
    <div className="flex justify-end gap-1">
      {!a.returned_on && <Button size="sm" variant="outline" onClick={() => setReturning(a)}><Undo2 className="h-4 w-4" /> Returned</Button>}
      <Button size="sm" variant="ghost" onClick={() => setEditing(a)} title="Edit"><Pencil className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" title="Delete" onClick={() => { if (confirm(`Delete ${a.name}?`)) del.mutate(a.id, { onError: fail(push) }) }}>
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </div>
  )

  return (
    <Card>
      <CardHeader title="Assets issued"
        subtitle={out.length ? `${out.length} with ${e.full_name.split(' ')[0]} now${value ? `, worth ${money(value)}` : ''}` : 'Nothing held at the moment'}
        action={<Button size="sm" onClick={() => setEditing('new')} disabled={e.status === 'exited'}><Plus className="h-4 w-4" /> Issue asset</Button>} />
      {assets.length === 0 ? (
        <EmptyState title="No assets issued" description="Record laptops, phones, SIMs, keys, vehicles… so nothing is forgotten when they leave." />
      ) : (
        <Responsive
          table={
            <Table>
              <thead><tr><Th>Asset</Th><Th>Serial / ID</Th><Th>Issued</Th><Th>Returned</Th><Th className="text-right">Value</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <Td><p className="font-medium text-slate-900">{a.name}</p><p className="text-xs text-slate-500">{ASSET_TYPES[a.asset_type]}{a.condition_out ? ` · ${a.condition_out}` : ''}</p></Td>
                    <Td className="font-mono text-xs">{a.serial_no || '—'}</Td>
                    <Td className="whitespace-nowrap">{date(a.issued_on)}</Td>
                    <Td>{a.returned_on ? <span className="text-emerald-700">{date(a.returned_on)}{a.condition_in ? ` · ${a.condition_in}` : ''}</span> : <Badge tone="amber">With employee</Badge>}</Td>
                    <Td className="text-right">{a.value !== null ? money(a.value) : '—'}</Td>
                    <Td>{actions(a)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          }
          cards={
            <div>
              {assets.map((a) => (
                <RecordCard key={a.id} title={a.name} subtitle={`${ASSET_TYPES[a.asset_type]}${a.serial_no ? ` · ${a.serial_no}` : ''}`}
                  badge={a.returned_on ? <Badge tone="green">Returned</Badge> : <Badge tone="amber">With employee</Badge>}
                  rows={[{ label: 'Issued', value: date(a.issued_on) }, { label: 'Returned', value: date(a.returned_on) }, { label: 'Value', value: a.value !== null ? money(a.value) : '—' }]}
                  actions={actions(a)} />
              ))}
            </div>
          }
        />
      )}
      {editing && <AssetModal employee={e} asset={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {returning && <ReturnModal asset={returning} onClose={() => setReturning(null)} />}
    </Card>
  )
}

function AssetModal({ employee: e, asset: a, onClose }: { employee: Employee; asset: EmployeeAsset | null; onClose: () => void }) {
  const save = useSaveAsset()
  const { push } = useToast()
  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const t = (k: string) => String(f.get(k) ?? '').trim() || null
    save.mutate({
      id: a?.id, employee_id: e.id, asset_type: t('asset_type')!, name: t('name')!, serial_no: t('serial_no'),
      value: t('value') === null ? null : Number(t('value')), issued_on: t('issued_on')!, condition_out: t('condition_out'), notes: t('notes'),
    }, { onSuccess: () => { push('success', a ? 'Asset updated.' : 'Asset issued.'); onClose() }, onError: fail(push) })
  }
  return (
    <Modal open onClose={onClose} title={a ? `Edit ${a.name}` : `Issue an asset to ${e.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" required>
            <Select name="asset_type" defaultValue={a?.asset_type ?? 'laptop'}>
              {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Name / model" required><Input name="name" required defaultValue={a?.name ?? ''} placeholder="e.g. Dell Latitude 3440" /></Field>
          <Field label="Serial no. / number"><Input name="serial_no" defaultValue={a?.serial_no ?? ''} placeholder="Serial, IMEI, SIM no., vehicle no." /></Field>
          <Field label="Value (₹)"><Input type="number" name="value" min={0} defaultValue={a?.value ?? ''} /></Field>
          <Field label="Issued on" required><Input type="date" name="issued_on" required defaultValue={a?.issued_on ?? todayYmd()} /></Field>
          <Field label="Condition when issued"><Input name="condition_out" defaultValue={a?.condition_out ?? ''} placeholder="e.g. New, Good" /></Field>
        </div>
        <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={a?.notes ?? ''} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}><PackageCheck className="h-4 w-4" /> {a ? 'Save' : 'Issue'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function ReturnModal({ asset: a, onClose }: { asset: EmployeeAsset; onClose: () => void }) {
  const save = useSaveAsset()
  const { push } = useToast()
  const [on, setOn] = useState(todayYmd())
  const [cond, setCond] = useState('Good')
  return (
    <Modal open onClose={onClose} title={`${a.name} returned`} size="sm"
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} onClick={() => save.mutate({ id: a.id, employee_id: a.employee_id, returned_on: on, condition_in: cond || null },
          { onSuccess: () => { push('success', 'Marked as returned.'); onClose() }, onError: fail(push) })}><Check className="h-4 w-4" /> Save</Button>
      </>}>
      <div className="space-y-4">
        <Field label="Returned on"><Input type="date" value={on} min={a.issued_on} max={todayYmd()} onChange={(ev) => setOn(ev.target.value)} /></Field>
        <Field label="Condition"><Input value={cond} onChange={(ev) => setCond(ev.target.value)} list="asset-conditions" />
          <datalist id="asset-conditions">{['Good', 'Minor wear', 'Damaged', 'Not working', 'Lost'].map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
    </Modal>
  )
}

/* =================================================================== leave */

export function LeaveTab({ employee: e }: { employee: Employee }) {
  const { data: leaves = [] } = useEmployeeLeaves(e.id)
  const del = useDeleteLeave()
  const saveLeave = useSaveLeave()
  const saveEmp = useSaveEmployee()
  const { push } = useToast()
  const [year, setYear] = useState(new Date().getFullYear())
  const [adding, setAdding] = useState(false)
  const [quotaEdit, setQuotaEdit] = useState(false)
  const used = leaveUsed(leaves, year)
  const inYear = leaves.filter((l) => l.from_date.startsWith(String(year)))
  const years = [...new Set([new Date().getFullYear(), ...leaves.map((l) => Number(l.from_date.slice(0, 4)))])].sort((a, b) => b - a)
  const tone = { approved: 'green', pending: 'amber', rejected: 'red', cancelled: 'neutral' } as const

  const actions = (l: EmployeeLeave) => (
    <div className="flex justify-end gap-1">
      {l.status === 'pending' && <>
        <Button size="sm" variant="outline" onClick={() => saveLeave.mutate({ id: l.id, employee_id: e.id, status: 'approved' }, { onError: fail(push) })}>Approve</Button>
        <Button size="sm" variant="ghost" onClick={() => saveLeave.mutate({ id: l.id, employee_id: e.id, status: 'rejected' }, { onError: fail(push) })}>Reject</Button>
      </>}
      <Button size="sm" variant="ghost" title="Delete" onClick={() => { if (confirm('Delete this leave record?')) del.mutate(l.id, { onError: fail(push) }) }}>
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUOTA_TYPES.map((t) => {
          const quota = Number(e.leave_quota?.[t] ?? 0)
          const u = used[t] ?? 0
          return (
            <div key={t} className="rounded-2xl bg-white p-4 shadow-luxe ring-1 ring-brand-gold/15">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{LEAVE_TYPES[t]}</p>
              <p className="mt-1 text-2xl font-bold text-brand-darker">{num(Math.max(0, quota - u), 1)}<span className="text-sm font-medium text-slate-400"> / {num(quota)} left</span></p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${u > quota ? 'bg-red-500' : 'bg-gold-metal'}`} style={{ width: `${quota ? Math.min(100, (u * 100) / quota) : 0}%` }} />
              </div>
              {u > quota && <p className="mt-1 text-[11px] text-red-600">{num(u - quota, 1)} over quota</p>}
            </div>
          )
        })}
        <div className="rounded-2xl bg-white p-4 shadow-luxe ring-1 ring-brand-gold/15">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unpaid & other</p>
          <p className="mt-1 text-2xl font-bold text-brand-darker">{num(Object.entries(used).filter(([k]) => !(QUOTA_TYPES as readonly string[]).includes(k)).reduce((s, [, v]) => s + v, 0), 1)}<span className="text-sm font-medium text-slate-400"> days</span></p>
          <button onClick={() => setQuotaEdit(true)} className="mt-2 text-xs font-medium text-brand-700 hover:underline">Change yearly quota</button>
        </div>
      </div>

      <Card>
        <CardHeader title={`Leave in ${year}`} subtitle={`${num(inYear.filter((l) => l.status === 'approved').reduce((s, l) => s + l.days, 0), 1)} days approved`}
          action={
            <div className="flex gap-2">
              <Select value={year} onChange={(ev) => setYear(Number(ev.target.value))} className="!w-auto">{years.map((y) => <option key={y}>{y}</option>)}</Select>
              <Button size="sm" onClick={() => setAdding(true)} disabled={e.status === 'exited'}><Plus className="h-4 w-4" /> Record leave</Button>
            </div>
          } />
        {inYear.length === 0 ? <EmptyState title="No leave recorded this year" /> : (
          <Responsive
            table={
              <Table>
                <thead><tr><Th>Type</Th><Th>From</Th><Th>To</Th><Th className="text-right">Days</Th><Th>Reason</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
                <tbody>
                  {inYear.map((l) => (
                    <tr key={l.id}>
                      <Td className="font-medium">{LEAVE_TYPES[l.leave_type]}</Td>
                      <Td className="whitespace-nowrap">{date(l.from_date)}</Td>
                      <Td className="whitespace-nowrap">{date(l.to_date)}</Td>
                      <Td className="text-right">{num(l.days, 1)}</Td>
                      <Td className="max-w-[220px] truncate text-slate-600">{l.reason || '—'}</Td>
                      <Td><Badge tone={tone[l.status]}>{l.status}</Badge></Td>
                      <Td>{actions(l)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {inYear.map((l) => (
                  <RecordCard key={l.id} title={`${LEAVE_TYPES[l.leave_type]} · ${num(l.days, 1)} day${l.days === 1 ? '' : 's'}`}
                    subtitle={`${date(l.from_date)} → ${date(l.to_date)}${l.reason ? ` · ${l.reason}` : ''}`}
                    badge={<Badge tone={tone[l.status]}>{l.status}</Badge>} actions={actions(l)} />
                ))}
              </div>
            }
          />
        )}
      </Card>

      {adding && <LeaveModal employee={e} onClose={() => setAdding(false)} />}
      {quotaEdit && (
        <Modal open onClose={() => setQuotaEdit(false)} title="Yearly leave quota" size="sm">
          <form className="space-y-4" onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const leave_quota = Object.fromEntries(QUOTA_TYPES.map((t) => [t, Number(f.get(t) ?? 0)]))
            saveEmp.mutate({ id: e.id, values: { leave_quota } }, { onSuccess: () => { push('success', 'Quota saved.'); setQuotaEdit(false) }, onError: fail(push) })
          }}>
            {QUOTA_TYPES.map((t) => (
              <Field key={t} label={`${LEAVE_TYPES[t]} (days a year)`}><Input type="number" name={t} min={0} max={365} step={0.5} defaultValue={e.leave_quota?.[t] ?? 0} /></Field>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setQuotaEdit(false)}>Cancel</Button>
              <Button type="submit" loading={saveEmp.isPending}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function LeaveModal({ employee: e, onClose }: { employee: Employee; onClose: () => void }) {
  const save = useSaveLeave()
  const { push } = useToast()
  const [from, setFrom] = useState(todayYmd())
  const [to, setTo] = useState(todayYmd())
  const [half, setHalf] = useState(false)
  const span = spanDays(from, to)
  const [days, setDays] = useState<string>('')
  const effective = days !== '' ? Number(days) : half ? 0.5 : span

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    if (to < from) { push('error', 'The end date is before the start date.'); return }
    save.mutate({
      employee_id: e.id, leave_type: String(f.get('leave_type')), from_date: from, to_date: to, days: effective,
      status: String(f.get('status')) as EmployeeLeave['status'], reason: String(f.get('reason') ?? '').trim() || null,
    }, { onSuccess: () => { push('success', 'Leave recorded.'); onClose() }, onError: fail(push) })
  }

  return (
    <Modal open onClose={onClose} title={`Record leave for ${e.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><Select name="leave_type" defaultValue="casual">{Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Status"><Select name="status" defaultValue="approved"><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></Select></Field>
          <Field label="From" required><Input type="date" required value={from} onChange={(ev) => { setFrom(ev.target.value); if (ev.target.value > to) setTo(ev.target.value) }} /></Field>
          <Field label="To" required><Input type="date" required value={to} min={from} onChange={(ev) => setTo(ev.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {span === 1 && <Checkbox label="Half day" checked={half} onChange={(ev) => setHalf(ev.target.checked)} />}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Days
            <Input type="number" min={0.5} step={0.5} className="w-24" value={days === '' ? effective : days} onChange={(ev) => setDays(ev.target.value)} />
          </label>
          <span className="text-xs text-slate-500">{span} calendar day{span === 1 ? '' : 's'} — lower it for Sundays and holidays</span>
        </div>
        <Field label="Reason"><Textarea name="reason" rows={2} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}

/* ==================================================================== exit */

export function ExitTab({ employee: e }: { employee: Employee }) {
  const save = useSaveEmployee()
  const archive = useArchiveEmployee()
  const { data: assets = [] } = useEmployeeAssets(e.id)
  const { data: docs = [] } = useEmployeeDocs(e.id)
  const { push } = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'' | 'notice' | 'exit' | 'suspend'>('')
  const out = assets.filter((a) => !a.returned_on)

  const setStatus = (status: Employee['status'], msg: string) =>
    save.mutate({ id: e.id, values: { status } }, { onSuccess: () => push('success', msg), onError: fail(push) })

  const checklist: [string, boolean, string?][] = [
    ['All assets returned', out.length === 0, out.length ? `${out.map((a) => a.name).join(', ')} still out` : undefined],
    ['ID card returned', !assets.some((a) => a.asset_type === 'id_card' && !a.returned_on), 'Record the card as an asset to track it'],
    ['Relieving letter on file', docs.some((d) => d.doc_type === 'relieving_letter')],
    ['Full & final settled', e.fnf_settled, e.fnf_amount !== null ? money(e.fnf_amount) : undefined],
  ]

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Status" subtitle={`Now: ${STATUS_LABEL[e.status]}${e.notice_date && e.status === 'on_notice' ? ` since ${date(e.notice_date)}` : ''}`} />
        <CardBody className="space-y-3">
          {e.status === 'exited' ? (
            <>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">Left on {date(e.exit_date)}{e.exit_type && ` · ${EXIT_LABEL[e.exit_type]}`}</p>
                {e.exit_reason && <p className="mt-1 text-slate-600">{e.exit_reason}</p>}
                {e.rehire_eligible !== null && <p className="mt-2"><Badge tone={e.rehire_eligible ? 'green' : 'red'}>{e.rehire_eligible ? 'Eligible for rehire' : 'Not eligible for rehire'}</Badge></p>}
              </div>
              <Button variant="outline" onClick={() => { if (confirm(`Bring ${e.full_name} back as active? The exit stays in the timeline.`)) setStatus('active', 'Rejoined — status is active.') }}>
                <Undo2 className="h-4 w-4" /> Rejoin
              </Button>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {e.status !== 'on_notice' && <Button variant="outline" onClick={() => setMode('notice')}><Flag className="h-4 w-4" /> Put on notice</Button>}
              {e.status !== 'active' && <Button variant="outline" onClick={() => setStatus('active', 'Back to active.')}><UserCheck className="h-4 w-4" /> Mark active</Button>}
              {e.status !== 'suspended' && <Button variant="outline" onClick={() => setMode('suspend')}><ShieldAlert className="h-4 w-4" /> Suspend</Button>}
              <Button onClick={() => setMode('exit')}><LogOut className="h-4 w-4" /> Record exit</Button>
            </div>
          )}
          <p className="text-xs text-slate-500">A suspended or exited employee's ID card stops verifying at once.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Exit clearance" subtitle={e.status === 'exited' || e.status === 'on_notice' ? 'Before the full & final' : 'Shown here when they resign or leave'} />
        <ul className="divide-y divide-slate-100">
          {checklist.map(([k, ok, hint]) => (
            <li key={k} className="flex items-start gap-3 px-5 py-2.5 text-sm">
              {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 text-slate-300" />}
              <span className="flex-1"><span className={ok ? 'text-slate-700' : 'text-slate-900'}>{k}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
            </li>
          ))}
        </ul>
        {(e.status === 'exited' || e.status === 'on_notice') && (
          <form className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-4" onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const amt = String(f.get('fnf_amount') ?? '').trim()
            save.mutate({ id: e.id, values: { fnf_amount: amt === '' ? null : Number(amt), fnf_settled: f.get('fnf_settled') === 'on' } },
              { onSuccess: () => push('success', 'Full & final saved.'), onError: fail(push) })
          }}>
            <Field label="F&F amount (₹)"><Input type="number" name="fnf_amount" step={1} defaultValue={e.fnf_amount ?? ''} className="w-36" /></Field>
            <Checkbox name="fnf_settled" label="Paid & settled" defaultChecked={e.fnf_settled} className="mb-2" />
            <Button type="submit" size="sm" loading={save.isPending} className="mb-1">Save</Button>
          </form>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Delete this record</p>
            <p className="text-xs text-slate-500">For a record added by mistake. Someone who left should be marked as exited instead, so their history stays.</p>
          </div>
          <Button variant="outline" className="!border-red-200 !text-red-600 hover:!bg-red-50" loading={archive.isPending}
            onClick={() => {
              if (!confirm(`Delete ${e.full_name}'s record? It disappears from every list and the ID card stops verifying.`)) return
              archive.mutate(e.id, { onSuccess: () => { push('success', 'Record deleted.'); navigate('/admin/employees') }, onError: fail(push) })
            }}>
            <Trash2 className="h-4 w-4" /> Delete record
          </Button>
        </CardBody>
      </Card>

      {mode && <StatusModal employee={e} mode={mode} onClose={() => setMode('')} />}
    </div>
  )
}

function StatusModal({ employee: e, mode, onClose }: { employee: Employee; mode: 'notice' | 'exit' | 'suspend'; onClose: () => void }) {
  const save = useSaveEmployee()
  const { push } = useToast()
  const title = { notice: 'Put on notice', exit: 'Record exit', suspend: 'Suspend' }[mode]

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const t = (k: string) => String(f.get(k) ?? '').trim() || null
    const values =
      mode === 'notice' ? { status: 'on_notice' as const, notice_date: t('notice_date'), exit_date: t('exit_date'), exit_type: t('exit_type') as ExitType | null, exit_reason: t('exit_reason') }
      : mode === 'exit' ? { status: 'exited' as const, exit_date: t('exit_date'), exit_type: t('exit_type') as ExitType | null, exit_reason: t('exit_reason'), rehire_eligible: f.get('rehire') === 'yes' ? true : f.get('rehire') === 'no' ? false : null }
      : { status: 'suspended' as const }
    save.mutate({ id: e.id, values }, {
      onSuccess: () => {
        push('success', { notice: 'On notice.', exit: 'Exit recorded. Their ID card no longer verifies.', suspend: 'Suspended.' }[mode])
        onClose()
      },
      onError: fail(push),
    })
  }

  return (
    <Modal open onClose={onClose} title={`${title}: ${e.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'suspend' ? (
          <p className="text-sm text-slate-600">Their ID card stops verifying until you mark them active again. Add the reason to the timeline as a warning or incident.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'notice' && <Field label="Notice given on" required><Input type="date" name="notice_date" required defaultValue={todayYmd()} /></Field>}
            <Field label={mode === 'notice' ? 'Expected last day' : 'Last working day'} required={mode === 'exit'}>
              <Input type="date" name="exit_date" required={mode === 'exit'} defaultValue={mode === 'exit' ? e.exit_date ?? todayYmd() : ''} min={e.joining_date} />
            </Field>
            <Field label="Reason for leaving">
              <Select name="exit_type" defaultValue={e.exit_type ?? 'resigned'}>
                {Object.entries(EXIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            {mode === 'exit' && (
              <Field label="Eligible for rehire?">
                <Select name="rehire" defaultValue=""><option value="">Not decided</option><option value="yes">Yes</option><option value="no">No</option></Select>
              </Field>
            )}
          </div>
        )}
        {mode !== 'suspend' && <Field label="Details"><Textarea name="exit_reason" rows={2} defaultValue={e.exit_reason ?? ''} placeholder="e.g. Moving to another city" /></Field>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{title}</Button>
        </div>
      </form>
    </Modal>
  )
}
