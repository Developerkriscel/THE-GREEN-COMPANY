import { useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { addYears, format } from 'date-fns'
import {
  ArrowLeft, Camera, Copy, CreditCard, Download, ExternalLink, Eye, EyeOff, FileText, History, Laptop, LogOut, Mail, MessageCircle,
  Pencil, Phone, Plane, Printer, RefreshCw, UserRound,
} from 'lucide-react'
import {
  DOC_TYPES, REQUIRED_DOCS, STATUS_LABEL, STATUS_TONE, TYPE_LABEL, age, cardState, daysUntil, onProbation, tenure, useEmployee, useEmployeeDocs,
  useEmployees, useHrFileUrl, useReissueCard, useUploadEmployeePhoto, verifyUrl, type Employee,
} from '@/lib/employees'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Spinner, useToast } from '@/components/ui'
import { EmployeeCardFaces } from '@/components/EmployeeIdCard'
import { PRINT_CSS, printIdCards, saveIdCardPdf } from '@/components/idcard'
import { date, initials, money, num } from '@/lib/format'
import { AssetsTab, DocumentsTab, ExitTab, LeaveTab, TimelineTab } from './EmployeeTabs'

/**
 * One employee's file: who they are, their job and pay, papers, timeline,
 * what they were issued, leave, their ID card and, when it comes, the exit.
 */

const TABS = [
  ['overview', 'Overview', UserRound],
  ['card', 'ID card', CreditCard],
  ['documents', 'Documents', FileText],
  ['timeline', 'Timeline', History],
  ['assets', 'Assets', Laptop],
  ['leave', 'Leave', Plane],
  ['exit', 'Status & exit', LogOut],
] as const
type Tab = (typeof TABS)[number][0]

export function AdminEmployeeDetail() {
  const { id } = useParams()
  const { data: e, isLoading } = useEmployee(id)
  const { data: docs = [] } = useEmployeeDocs(id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  if (isLoading) return <Spinner />
  if (!e) return <EmptyState title="Employee not found" description="They may have been deleted." action={<Link to="/admin/employees" className="text-sm font-semibold text-brand-700">Back to employees</Link>} />

  const complete = completeness(e, docs.map((d) => d.doc_type))

  return (
    <div className="space-y-5">
      <Header employee={e} complete={complete} onTab={setTab} />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        <div className="flex w-max gap-1 rounded-xl bg-white p-1 ring-1 ring-brand-gold/20 sm:w-auto sm:flex-wrap">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${tab === k ? 'bg-gold-metal text-brand-darker shadow-sm' : 'text-slate-600 hover:bg-brand-gold/10'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview employee={e} />}
      {tab === 'card' && <CardTab employee={e} />}
      {tab === 'documents' && <DocumentsTab employee={e} />}
      {tab === 'timeline' && <TimelineTab employee={e} />}
      {tab === 'assets' && <AssetsTab employee={e} />}
      {tab === 'leave' && <LeaveTab employee={e} />}
      {tab === 'exit' && <ExitTab employee={e} />}
    </div>
  )
}

/** How much of the record is filled: the fields that matter, a photo, and the joining papers. */
function completeness(e: Employee, docTypes: string[]) {
  const checks: [string, boolean][] = [
    ['Photo', !!e.photo_path],
    ['Mobile', !!e.phone],
    ['Date of birth', !!e.dob],
    ['Address', !!e.current_address],
    ['Designation', !!e.designation],
    ['Department', !!e.department],
    ['Salary', e.monthly_salary !== null],
    ['Bank account', !!e.bank_account || e.salary_mode !== 'bank'],
    ['PAN', !!e.pan],
    ['Emergency contact', !!e.emergency_phone],
    ['Blood group', !!e.blood_group],
    ...REQUIRED_DOCS.map((d) => [DOC_TYPES[d], docTypes.includes(d)] as [string, boolean]),
  ]
  const done = checks.filter(([, ok]) => ok).length
  return { pct: Math.round((done * 100) / checks.length), missing: checks.filter(([, ok]) => !ok).map(([k]) => k) }
}

function Header({ employee: e, complete, onTab }: { employee: Employee; complete: { pct: number; missing: string[] }; onTab: (t: Tab) => void }) {
  const { data: photo } = useHrFileUrl(e.photo_path)
  const upload = useUploadEmployeePhoto()
  const input = useRef<HTMLInputElement>(null)
  const { push } = useToast()
  const wa = e.phone?.replace(/\D/g, '').slice(-10)

  return (
    <div className="bg-leaf-deep rounded-3xl p-5 text-white shadow-luxe ring-1 ring-brand-gold/30 sm:p-6">
      <Link to="/admin/employees" className="mb-3 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Employees</Link>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <button type="button" onClick={() => input.current?.click()} disabled={upload.isPending}
          className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl ring-2 ring-brand-gold/60" title="Change photo">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center bg-white/10 text-2xl font-bold">{initials(e.full_name)}</span>}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
            <Camera className="h-5 w-5" />
          </span>
          {upload.isPending && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs">Uploading…</span>}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(ev) => {
            const file = ev.target.files?.[0]
            ev.target.value = ''
            if (file) upload.mutate({ employee: e, file }, { onSuccess: () => push('success', 'Photo updated.'), onError: (err) => push('error', (err as Error).message) })
          }} />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold leading-tight">{e.full_name}</h1>
          <p className="mt-1 text-sm text-white/75">
            <span className="font-mono font-semibold text-brand-gold-light">{e.employee_code}</span>
            {e.designation && <> · {e.designation}</>}{e.department && <> · {e.department}</>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
            <Badge tone="leaf">{TYPE_LABEL[e.employment_type]}</Badge>
            {onProbation(e) && <Badge tone="gold">Probation till {date(e.probation_end)}</Badge>}
            <span className="text-xs text-white/70">{tenure(e)} {e.status === 'exited' ? 'served' : 'with us'}</span>
          </div>
          <div className="mt-3 max-w-xs">
            <div className="flex justify-between text-[11px] text-white/70"><span>Record complete</span><span className="font-semibold text-white">{complete.pct}%</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gold-metal" style={{ width: `${complete.pct}%` }} /></div>
            {complete.missing.length > 0 && (
              <p className="mt-1 truncate text-[11px] text-white/60" title={complete.missing.join(', ')}>Missing: {complete.missing.join(', ')}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
          <Link to={`/admin/employees/${e.id}/edit`}><Button className="w-full"><Pencil className="h-4 w-4" /> Edit details</Button></Link>
          <Button variant="outline" className="!border-brand-gold/50 !bg-white/5 !text-white" onClick={() => onTab('card')}><CreditCard className="h-4 w-4" /> ID card</Button>
          <div className="flex gap-2">
            {e.phone && <a href={`tel:${e.phone}`} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" title="Call"><Phone className="h-4 w-4" /></a>}
            {wa && wa.length === 10 && <a href={`https://wa.me/91${wa}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/10 p-2 hover:bg-white/20" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
            {e.email && <a href={`mailto:${e.email}`} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" title="Email"><Mail className="h-4 w-4" /></a>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- overview */

function Overview({ employee: e }: { employee: Employee }) {
  const { data: all = [] } = useEmployees()
  const manager = all.find((x) => x.id === e.reporting_manager_id)
  const reports = all.filter((x) => x.reporting_manager_id === e.id && x.status !== 'exited')
  const a = age(e.dob)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoCard title="Personal" rows={[
        ['Date of birth', e.dob ? `${date(e.dob)}${a !== null ? ` (${a} yrs)` : ''}` : null],
        ['Gender', e.gender && e.gender[0].toUpperCase() + e.gender.slice(1)],
        ['Blood group', e.blood_group],
        ['Marital status', e.marital_status && e.marital_status[0].toUpperCase() + e.marital_status.slice(1)],
        ["Father's name", e.father_name],
        ["Spouse's name", e.spouse_name],
        ['Qualification', e.qualification],
        ['Experience before', e.experience_years !== null ? `${num(e.experience_years, 1)} yrs${e.previous_employer ? ` · ${e.previous_employer}` : ''}` : e.previous_employer],
      ]} />
      <InfoCard title="Contact" rows={[
        ['Mobile', e.phone && <a href={`tel:${e.phone}`} className="text-brand-700 hover:underline">{e.phone}</a>],
        ['Alternate', e.alt_phone],
        ['Official email', e.email && <a href={`mailto:${e.email}`} className="break-all text-brand-700 hover:underline">{e.email}</a>],
        ['Personal email', e.personal_email],
        ['Current address', e.current_address],
        ['Permanent address', e.permanent_address],
        ['City', [e.city, e.state, e.pincode].filter(Boolean).join(', ') || null],
      ]} />
      <InfoCard title="Job" rows={[
        ['Designation', e.designation],
        ['Department', e.department],
        ['Type', TYPE_LABEL[e.employment_type]],
        ['Location', e.work_location],
        ['Shift', e.shift],
        ['Joined', `${date(e.joining_date)} · ${tenure(e)}`],
        ['Probation', e.probation_end ? (e.confirmation_date ? `Confirmed ${date(e.confirmation_date)}` : `Till ${date(e.probation_end)}${(daysUntil(e.probation_end) ?? 1) < 0 ? ' — overdue for confirmation' : ''}`) : e.confirmation_date ? `Confirmed ${date(e.confirmation_date)}` : null],
        ['Contract ends', e.contract_end && date(e.contract_end)],
        ['Reports to', manager && <Link to={`/admin/employees/${manager.id}`} className="text-brand-700 hover:underline">{manager.full_name}</Link>],
        ['Team', reports.length ? (
          <span className="flex flex-wrap justify-end gap-1">
            {reports.map((r) => <Link key={r.id} to={`/admin/employees/${r.id}`} className="rounded-full bg-brand-gold/10 px-2 py-0.5 text-xs text-brand-darker hover:underline">{r.full_name}</Link>)}
          </span>
        ) : null],
      ]} />
      <InfoCard title="Salary & bank" rows={[
        ['Monthly salary', e.monthly_salary !== null ? <span className="font-semibold">{money(e.monthly_salary)}</span> : null],
        ['Yearly (CTC)', e.monthly_salary !== null ? money(e.monthly_salary * 12) : null],
        ['Paid by', { bank: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash' }[e.salary_mode]],
        ['Account holder', e.account_holder],
        ['Bank', e.bank_name],
        ['Account no.', e.bank_account && <Secret value={e.bank_account} />],
        ['IFSC', e.ifsc],
        ['UPI', e.upi_id],
      ]} />
      <InfoCard title="Statutory IDs" rows={[
        ['PAN', e.pan && <Secret value={e.pan} keep={4} />],
        ['Aadhaar', e.aadhaar_last4 && `XXXX XXXX ${e.aadhaar_last4}`],
        ['UAN (PF)', e.uan],
        ['ESIC', e.esic_no],
      ]} />
      <InfoCard title="Emergency contact" rows={[
        ['Name', e.emergency_name && `${e.emergency_name}${e.emergency_relation ? ` (${e.emergency_relation})` : ''}`],
        ['Phone', e.emergency_phone && <a href={`tel:${e.emergency_phone}`} className="text-brand-700 hover:underline">{e.emergency_phone}</a>],
      ]} />
      {e.notes && (
        <Card className="lg:col-span-2">
          <CardHeader title="Notes" />
          <CardBody><p className="whitespace-pre-line text-sm text-slate-700">{e.notes}</p></CardBody>
        </Card>
      )}
    </div>
  )
}

function InfoCard({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const filled = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <Card>
      <CardHeader title={title} />
      {filled.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-400">Nothing recorded yet.</p>
      ) : (
        <dl className="divide-y divide-slate-100">
          {filled.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-5 py-2.5 text-sm">
              <dt className="shrink-0 text-slate-500">{k}</dt>
              <dd className="min-w-0 text-right text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}

/** A sensitive number shown masked until asked for. */
function Secret({ value, keep = 4 }: { value: string; keep?: number }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      {shown ? value : `${'•'.repeat(Math.max(0, value.length - keep))}${value.slice(-keep)}`}
      <button type="button" onClick={() => setShown(!shown)} className="text-slate-400 hover:text-slate-700" title={shown ? 'Hide' : 'Show'}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}

/* ----------------------------------------------------------------- ID card */

function CardTab({ employee: e }: { employee: Employee }) {
  const { data: photo } = useHrFileUrl(e.photo_path)
  const facesRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const { push } = useToast()
  const state = cardState(e)
  const link = verifyUrl(e.card_token)

  async function downloadPdf() {
    const faces = facesRef.current?.querySelectorAll<HTMLElement>('.id-face')
    if (!faces?.length) return
    setSaving(true)
    try {
      await saveIdCardPdf([...faces], e.employee_code, 'Employee-ID-Card')
    } catch (err) {
      push('error', `Could not create the PDF: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const warnings = [
    state === 'void' && `${e.full_name} is ${e.status === 'exited' ? 'no longer with the company' : 'suspended'}: the card is stamped “Not valid” and its QR says so.`,
    state === 'expired' && 'This card has expired. Re-issue it with a new validity date.',
    state === 'expiring' && `This card expires on ${date(e.card_valid_till)}.`,
    !e.photo_path && 'No photo yet: upload one from the header above (click the initials).',
    !e.emergency_phone && 'No emergency contact: the back of the card leaves that box out.',
    !e.blood_group && 'No blood group recorded.',
  ].filter(Boolean) as string[]

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="grid gap-5 2xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Employee ID card" subtitle="CR80 size, front and back. Print on PVC card stock or download for a card printer."
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void downloadPdf()} loading={saving}><Download className="h-4 w-4" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={printIdCards}><Printer className="h-4 w-4" /> Print</Button>
              </div>
            } />
          <CardBody>
            <div ref={facesRef} className="id-print-area flex flex-wrap items-start justify-center gap-6">
              <EmployeeCardFaces employee={e} photoUrl={photo} />
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-1 2xl:content-start">
          <Card>
            <CardHeader title="Card details" />
            <dl className="divide-y divide-slate-100 text-sm">
              {([
                ['Status', <Badge key="s" tone={state === 'valid' ? 'green' : state === 'expiring' ? 'amber' : 'red'}>{state === 'void' ? 'Not valid' : state === 'expiring' ? 'Expiring soon' : state[0].toUpperCase() + state.slice(1)}</Badge>],
                ['Issue no.', e.card_issue_no],
                ['Issued on', date(e.card_issued_on)],
                ['Valid till', e.card_valid_till ? date(e.card_valid_till) : 'While employed'],
              ] as [string, ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex justify-between px-5 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>
              ))}
            </dl>
            <div className="space-y-2 border-t border-slate-100 p-4">
              <p className="text-xs text-slate-500">The QR on the back opens this public check page, which shows the photo, name, designation and whether the card is valid today:</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => void navigator.clipboard.writeText(link).then(() => push('success', 'Verification link copied.'))}>
                  <Copy className="h-4 w-4" /> Copy link
                </Button>
                <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full"><ExternalLink className="h-4 w-4" /> Open</Button>
                </a>
              </div>
              <Button size="sm" className="w-full" onClick={() => setReissuing(true)} disabled={e.status === 'exited'}>
                <RefreshCw className="h-4 w-4" /> Re-issue card
              </Button>
              <p className="text-[11px] text-slate-400">Lost, damaged or expired? A re-issued card gets a new QR; the old card stops verifying.</p>
            </div>
          </Card>
          {warnings.length > 0 && (
            <Card>
              <ul className="space-y-2 p-4 text-sm">
                {warnings.map((w) => <li key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">{w}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {reissuing && <ReissueModal employee={e} onClose={() => setReissuing(false)} />}
    </>
  )
}

function ReissueModal({ employee: e, onClose }: { employee: Employee; onClose: () => void }) {
  const reissue = useReissueCard()
  const { push } = useToast()
  const [validTill, setValidTill] = useState(format(addYears(new Date(), 1), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title="Re-issue ID card" size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={reissue.isPending}
            onClick={() => reissue.mutate({ id: e.id, validTill: validTill || null, reason }, {
              onSuccess: () => { push('success', `Card issue ${e.card_issue_no + 1} is ready to print.`); onClose() },
              onError: (err) => push('error', (err as Error).message),
            })}>
            <RefreshCw className="h-4 w-4" /> Re-issue
          </Button>
        </>
      }>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          The new card gets a new QR code. Card issue {e.card_issue_no} — the one {e.full_name} holds now — will show as
          <strong> not valid</strong> when scanned.
        </p>
        <Field label="Reason">
          <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Lost, damaged, designation changed, renewal" list="reissue-reasons" />
          <datalist id="reissue-reasons">{['Lost', 'Damaged', 'Renewal', 'Designation changed', 'New photo'].map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label="Valid till" hint="Blank = valid while employed">
          <Input type="date" value={validTill} min={format(new Date(), 'yyyy-MM-dd')} onChange={(ev) => setValidTill(ev.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
