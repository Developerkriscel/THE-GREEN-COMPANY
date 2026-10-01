import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BadgeCheck, Cake, CalendarClock, CreditCard, Download, FileWarning, IdCard, PackageOpen, Plus, Search,
  UserCheck, UserMinus, Users, Wallet,
} from 'lucide-react'
import {
  REQUIRED_DOCS, STATUS_LABEL, STATUS_TONE, TYPE_LABEL, cardState, daysToNextAnniversary, daysUntil, employeeCsvRows, onProbation,
  today, useEmployeeAssets, useEmployeeDocs, useEmployeeLeaves, useEmployees, useHrFileUrl, yearsAtNext,
  type Employee, type EmployeeStatus,
} from '@/lib/employees'
import {
  Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Input, Modal, PageHeader, RecordCard, Responsive, Select, Spinner,
  StatTile, Table, Td, Th, useToast,
} from '@/components/ui'
import { EmployeeCardFaces } from '@/components/EmployeeIdCard'
import { saveIdCardPdf, saveIdCardSheetPdf } from '@/components/idcard'
import { date, downloadCsv, initials, money, num } from '@/lib/format'

/**
 * Employees — the company's own staff, as HR records the office keeps.
 * No login, no panel: Staff (/admin/staff) is who can sign in; this is who
 * works here. Lists, filters, what needs attention this week, CSV export
 * and ID cards for one or many at once.
 */

type StatusFilter = 'current' | EmployeeStatus | 'all'

export function AdminEmployees() {
  const { data: list = [], isLoading, error } = useEmployees()
  const { data: docs = [] } = useEmployeeDocs()
  const { data: assets = [] } = useEmployeeAssets()
  const { data: leaves = [] } = useEmployeeLeaves()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [status, setStatus] = useState<StatusFilter>('current')
  const [type, setType] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cardsOpen, setCardsOpen] = useState(false)

  const current = useMemo(() => list.filter((e) => e.status !== 'exited'), [list])
  const names = useMemo(() => new Map(list.map((e) => [e.id, e.full_name])), [list])
  const departments = useMemo(() => {
    const m = new Map<string, number>()
    current.forEach((e) => m.set(e.department || 'No department', (m.get(e.department || 'No department') ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [current])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((e) => {
      if (status === 'current' ? e.status === 'exited' : status !== 'all' && e.status !== status) return false
      if (dept && (e.department || 'No department') !== dept) return false
      if (type && e.employment_type !== type) return false
      if (!s) return true
      return [e.full_name, e.employee_code, e.phone, e.email, e.designation, e.department, e.work_location]
        .some((v) => v?.toLowerCase().includes(s))
    })
  }, [list, q, dept, status, type])

  const t = today()
  const todayStr = new Date(t.getTime() - t.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  const joinedThisMonth = list.filter((e) => e.joining_date.startsWith(todayStr.slice(0, 7))).length
  const leftThisYear = list.filter((e) => e.status === 'exited' && e.exit_date?.startsWith(todayStr.slice(0, 4))).length
  const payroll = current.filter((e) => e.status !== 'suspended').reduce((s, e) => s + (e.monthly_salary ?? 0), 0)
  const onLeaveToday = new Set(leaves.filter((l) => l.status === 'approved' && l.from_date <= todayStr && l.to_date >= todayStr).map((l) => l.employee_id))

  const allChecked = filtered.length > 0 && filtered.every((e) => selected.has(e.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((e) => e.id)))
  const chosen = list.filter((e) => selected.has(e.id))

  if (isLoading) return <Spinner label="Loading employees…" />
  if (error) return <ErrorState error={error} />

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Every staff member's record, papers, assets, leave and ID card. Employees do not sign in — this is the office's file on them."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!filtered.length}
              onClick={() => downloadCsv(`employees-${todayStr}`, employeeCsvRows(filtered, names))}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCardsOpen(true)} disabled={!chosen.length}
              title={chosen.length ? undefined : 'Tick employees in the list first'}>
              <IdCard className="h-4 w-4" /> ID cards{chosen.length ? ` (${chosen.length})` : ''}
            </Button>
            <Link to="/admin/employees/new"><Button size="sm"><Plus className="h-4 w-4" /> Add employee</Button></Link>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Working now" value={num(current.length)} icon={<Users className="h-4 w-4" />}
          hint={`${num(current.filter((e) => e.status === 'on_notice').length)} on notice · ${num(onLeaveToday.size)} on leave today`} />
        <StatTile label="Joined this month" value={num(joinedThisMonth)} icon={<UserCheck className="h-4 w-4" />}
          hint={`${num(current.filter(onProbation).length)} on probation`} />
        <StatTile label="Left this year" value={num(leftThisYear)} icon={<UserMinus className="h-4 w-4" />}
          hint={current.length + leftThisYear ? `Attrition ${num((leftThisYear * 100) / (current.length + leftThisYear), 1)}%` : undefined} />
        <StatTile label="Monthly payroll" value={money(payroll)} icon={<Wallet className="h-4 w-4" />} hint="Salaries of working staff" />
      </div>

      <Attention list={list} docs={docs} assets={assets} />

      {departments.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {departments.map(([d, n]) => (
            <button key={d} onClick={() => setDept(dept === d ? '' : d)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${dept === d ? 'bg-gold-metal text-brand-darker ring-brand-gold/50' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-gold/40'}`}>
              {d} <span className="ml-0.5 font-bold">{n}</span>
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID, phone, designation…" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="!w-auto">
            <option value="current">Working (not exited)</option>
            {(Object.keys(STATUS_LABEL) as EmployeeStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            <option value="all">Everyone</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto">
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {dept && <Badge tone="gold">{dept} <button className="ml-1" onClick={() => setDept('')} aria-label="Clear department">×</button></Badge>}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={list.length ? 'No one matches these filters' : 'No employees yet'}
            description={list.length ? 'Clear the search or choose another status.' : 'Add your first employee: their details, papers and an ID card in one place.'}
            action={!list.length ? <Link to="/admin/employees/new"><Button size="sm"><Plus className="h-4 w-4" /> Add employee</Button></Link> : undefined}
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th className="w-10"><Checkbox label="" checked={allChecked} onChange={toggleAll} /></Th>
                    <Th>Employee</Th>
                    <Th>Designation</Th>
                    <Th>Phone</Th>
                    <Th>Joined</Th>
                    <Th>ID card</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="cursor-pointer hover:bg-brand-gold/[0.04]" onClick={() => navigate(`/admin/employees/${e.id}`)}>
                      <Td><span onClick={(ev) => ev.stopPropagation()}><Checkbox label="" checked={selected.has(e.id)} onChange={() => toggle(e.id)} /></span></Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar employee={e} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{e.full_name}</p>
                            <p className="font-mono text-[11px] text-slate-500">{e.employee_code}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <p className="text-slate-800">{e.designation || '—'}</p>
                        <p className="text-xs text-slate-500">{[e.department, TYPE_LABEL[e.employment_type]].filter(Boolean).join(' · ')}</p>
                      </Td>
                      <Td className="whitespace-nowrap">{e.phone || '—'}</Td>
                      <Td className="whitespace-nowrap">{date(e.joining_date)}</Td>
                      <Td className="whitespace-nowrap"><CardBadge e={e} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                          {onLeaveToday.has(e.id) && <Badge tone="blue">On leave</Badge>}
                          {onProbation(e) && <Badge tone="gold">Probation</Badge>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {filtered.map((e) => (
                  <RecordCard key={e.id} onClick={() => navigate(`/admin/employees/${e.id}`)}
                    title={<span className="flex items-center gap-2"><EmployeeAvatar employee={e} size="sm" /> {e.full_name}</span>}
                    subtitle={`${e.employee_code} · ${[e.designation, e.department].filter(Boolean).join(', ') || 'No designation'}`}
                    badge={<Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>}
                    rows={[
                      { label: 'Phone', value: e.phone || '—' },
                      { label: 'Joined', value: date(e.joining_date) },
                      { label: 'ID card', value: <CardBadge e={e} /> },
                      { label: 'Type', value: TYPE_LABEL[e.employment_type] },
                    ]}
                    actions={
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-brand-700" /> Select for ID cards
                      </label>
                    } />
                ))}
              </div>
            }
          />
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          {num(filtered.length)} of {num(list.length)} employees{chosen.length > 0 && <> · {chosen.length} selected · <button className="font-medium text-brand-700 hover:underline" onClick={() => setSelected(new Set())}>clear</button></>}
        </p>
      </Card>

      {cardsOpen && <BulkCardsModal employees={chosen} onClose={() => setCardsOpen(false)} />}
    </div>
  )
}

/* -------------------------------------------------------------- pieces */

export function EmployeeAvatar({ employee: e, size = 'md' }: { employee: Pick<Employee, 'full_name' | 'photo_path'>; size?: 'sm' | 'md' | 'lg' }) {
  const { data: url } = useHrFileUrl(e.photo_path)
  const cls = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-24 w-24 text-2xl' }[size]
  return url ? (
    <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover ring-2 ring-brand-gold/40`} />
  ) : (
    <span className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-gold-metal font-bold text-brand-darker`}>{initials(e.full_name)}</span>
  )
}

function CardBadge({ e }: { e: Employee }) {
  const s = cardState(e)
  if (s === 'void') return <Badge tone="neutral">Not valid</Badge>
  if (s === 'expired') return <Badge tone="red">Expired</Badge>
  if (s === 'expiring') return <Badge tone="amber">Expires {date(e.card_valid_till)}</Badge>
  return <Badge tone="green">{e.card_valid_till ? `Till ${date(e.card_valid_till)}` : 'Valid'}</Badge>
}

/** What needs the office this week, each line linking to the person. */
function Attention({ list, docs, assets }: {
  list: Employee[]
  docs: ReturnType<typeof useEmployeeDocs>['data'] & object
  assets: ReturnType<typeof useEmployeeAssets>['data'] & object
}) {
  const [all, setAll] = useState(false)
  const current = list.filter((e) => e.status !== 'exited')
  const byId = new Map(list.map((e) => [e.id, e]))
  type Item = { key: string; icon: ReactNode; tone: 'red' | 'amber' | 'blue' | 'gold'; who: Employee; text: string; sort: number }
  const items: Item[] = []

  for (const e of current) {
    const b = daysToNextAnniversary(e.dob)
    if (b !== null && b <= 7) items.push({ key: `b${e.id}`, icon: <Cake className="h-4 w-4" />, tone: 'gold', who: e, sort: b,
      text: b === 0 ? 'Birthday today 🎉' : `Birthday in ${b} day${b > 1 ? 's' : ''} (${date(e.dob).slice(0, 6)})` })
    const a = daysToNextAnniversary(e.joining_date)
    const yrs = yearsAtNext(e.joining_date)
    if (a !== null && a <= 7 && yrs >= 1) items.push({ key: `a${e.id}`, icon: <BadgeCheck className="h-4 w-4" />, tone: 'gold', who: e, sort: a,
      text: `${yrs} year${yrs > 1 ? 's' : ''} with us ${a === 0 ? 'today' : `in ${a} day${a > 1 ? 's' : ''}`}` })
    if (onProbation(e)) {
      const p = daysUntil(e.probation_end)!
      if (p <= 15) items.push({ key: `p${e.id}`, icon: <CalendarClock className="h-4 w-4" />, tone: p < 0 ? 'red' : 'amber', who: e, sort: p,
        text: p < 0 ? `Probation ended ${-p} day${p < -1 ? 's' : ''} ago — confirm or extend` : `Probation ends ${p === 0 ? 'today' : `in ${p} days`}` })
    }
    const c = daysUntil(e.contract_end)
    if (c !== null && c <= 30) items.push({ key: `c${e.id}`, icon: <CalendarClock className="h-4 w-4" />, tone: c < 0 ? 'red' : 'amber', who: e, sort: c,
      text: c < 0 ? 'Contract has ended' : `Contract ends in ${c} days` })
    const s = cardState(e)
    if (s === 'expired' || s === 'expiring') items.push({ key: `i${e.id}`, icon: <CreditCard className="h-4 w-4" />, tone: s === 'expired' ? 'red' : 'amber', who: e, sort: daysUntil(e.card_valid_till)!,
      text: s === 'expired' ? 'ID card expired — re-issue it' : `ID card expires ${date(e.card_valid_till)}` })
    const have = new Set(docs.filter((d) => d.employee_id === e.id).map((d) => d.doc_type))
    const missing = REQUIRED_DOCS.filter((d) => !have.has(d))
    if (missing.length) items.push({ key: `m${e.id}`, icon: <FileWarning className="h-4 w-4" />, tone: 'blue', who: e, sort: 100,
      text: `${missing.length} joining paper${missing.length > 1 ? 's' : ''} missing` })
  }
  for (const d of docs) {
    const who = byId.get(d.employee_id)
    const left = daysUntil(d.expiry_date)
    if (!who || who.status === 'exited' || left === null || left > 30) continue
    items.push({ key: `d${d.id}`, icon: <FileWarning className="h-4 w-4" />, tone: left < 0 ? 'red' : 'amber', who, sort: left,
      text: `${d.title} ${left < 0 ? 'expired' : `expires in ${left} days`}` })
  }
  for (const e of list.filter((x) => x.status === 'exited')) {
    const out = assets.filter((a) => a.employee_id === e.id && !a.returned_on)
    if (out.length) items.push({ key: `r${e.id}`, icon: <PackageOpen className="h-4 w-4" />, tone: 'red', who: e, sort: -50,
      text: `Left, but ${out.length} asset${out.length > 1 ? 's' : ''} not returned` })
    if (!e.fnf_settled) items.push({ key: `f${e.id}`, icon: <Wallet className="h-4 w-4" />, tone: 'amber', who: e, sort: 50,
      text: 'Full & final settlement pending' })
  }
  if (!items.length) return null
  items.sort((x, y) => x.sort - y.sort)
  const shown = all ? items : items.slice(0, 6)
  const tones = { red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-sky-50 text-sky-700', gold: 'bg-brand-gold/10 text-brand-gold-deep' }

  return (
    <Card className="mb-5">
      <CardHeader title={<><AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention</>}
        subtitle={`${items.length} item${items.length > 1 ? 's' : ''} — birthdays, probation, papers, cards, exits`} />
      <ul className="grid gap-px bg-slate-100 sm:grid-cols-2">
        {shown.map((i) => (
          <li key={i.key} className="bg-white">
            <Link to={`/admin/employees/${i.who.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-gold/[0.05]">
              <span className={`rounded-lg p-1.5 ${tones[i.tone]}`}>{i.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{i.who.full_name}</span>
                <span className="block truncate text-xs text-slate-500">{i.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button onClick={() => setAll(!all)} className="w-full border-t border-slate-100 py-2 text-xs font-medium text-brand-700 hover:bg-brand-gold/[0.05]">
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}

/** ID cards for several employees at once: a card-printer PDF or an A4 sheet to cut. */
function BulkCardsModal({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'' | 'cards' | 'sheet'>('')
  const { push } = useToast()
  const blocked = employees.filter((e) => cardState(e) === 'void')

  async function save(kind: 'cards' | 'sheet') {
    const faces = [...(ref.current?.querySelectorAll<HTMLElement>('.id-face') ?? [])]
    if (!faces.length) return
    setBusy(kind)
    try {
      if (kind === 'sheet') await saveIdCardSheetPdf(faces, `Employee-ID-Cards-${employees.length}`)
      else await saveIdCardPdf(faces, `${employees.length}-employees`, 'Employee-ID-Cards')
    } catch (e) {
      push('error', `Could not create the PDF: ${(e as Error).message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`ID cards for ${employees.length} employee${employees.length > 1 ? 's' : ''}`}
      footer={
        <>
          <Button variant="outline" onClick={() => void save('sheet')} loading={busy === 'sheet'} disabled={!!busy}>
            <Download className="h-4 w-4" /> A4 sheet (cut &amp; laminate)
          </Button>
          <Button onClick={() => void save('cards')} loading={busy === 'cards'} disabled={!!busy}>
            <Download className="h-4 w-4" /> Card-printer PDF
          </Button>
        </>
      }>
      {blocked.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {blocked.map((e) => e.full_name).join(', ')} {blocked.length > 1 ? 'are' : 'is'} not working now, so {blocked.length > 1 ? 'their cards are' : 'the card is'} stamped “Not valid”.
        </p>
      )}
      <p className="mb-3 text-xs text-slate-500">
        Card-printer PDF: one face per page at true size (54 × 85.6 mm), front then back. A4 sheet: nine faces a page,
        front and back side by side, to print on an office printer and cut out.
      </p>
      <div ref={ref} className="flex max-h-[55vh] flex-wrap justify-center gap-4 overflow-y-auto rounded-xl bg-slate-50 p-4">
        {employees.map((e) => <BulkCard key={e.id} employee={e} />)}
      </div>
    </Modal>
  )
}

function BulkCard({ employee }: { employee: Employee }) {
  const { data: photo } = useHrFileUrl(employee.photo_path)
  return <EmployeeCardFaces employee={employee} photoUrl={photo} />
}
