import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Phone, Plus, Target, UserPlus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useProjects } from '@/lib/queries'
import {
  LEAD_CLOSED, LEAD_LABELS, LEAD_SOURCES, LEAD_STATUSES, leadBuckets,
  useCreateLead, useLeadActivities, useLogLeadActivity, useMyLeads, useUpdateLead,
  type LeadDraft, type LeadRow, type LeadStatus,
} from '@/lib/sponsor-crm'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader,
  RecordCard, Responsive, Select, StatTile, Table, Td, Textarea, Th,
} from '@/components/ui'
import { Notice, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { date, money } from '@/lib/format'

/**
 * Lead follow-up — the member's own prospects, and the one thing the panel
 * can do that no report can: tell them who to ring today.
 *
 * Ownership is enforced by RLS, not by this screen. A converted or lost lead
 * cannot be edited (leads_update_owner excludes both statuses), so the form is
 * closed rather than letting the member submit an update the database refuses.
 */

const TONE_FOR: Record<LeadStatus, 'neutral' | 'blue' | 'amber' | 'green' | 'red'> = {
  new: 'blue',
  contacted: 'blue',
  visit_planned: 'amber',
  visited: 'amber',
  negotiation: 'amber',
  converted: 'green',
  lost: 'red',
}

function LeadBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={TONE_FOR[status]}>{LEAD_LABELS[status]}</Badge>
}

/** Today in the yyyy-mm-dd shape a date input expects. */
function todayInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const BLANK: LeadDraft = {
  name: '', mobile: '', email: '', source: 'referral', status: 'new',
  category: '', budget: null, next_follow_up: '', remark: '', project_id: null,
}

export function SponsorLeads() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: leads = [], isLoading } = useMyLeads(me)
  const { data: projects = [] } = useProjects()
  const create = useCreateLead(me)
  const update = useUpdateLead(me)

  const [filter, setFilter] = useState<'all' | 'due' | LeadStatus>('all')
  const [editing, setEditing] = useState<LeadRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState<LeadRow | null>(null)

  const buckets = useMemo(() => leadBuckets(leads), [leads])
  const needsCall = buckets.overdue.length + buckets.dueSoon.length

  const shown = useMemo(() => {
    if (filter === 'all') return leads
    if (filter === 'due') {
      const ids = new Set([...buckets.overdue, ...buckets.dueSoon].map((l) => l.id))
      return leads.filter((l) => ids.has(l.id))
    }
    return leads.filter((l) => l.status === filter)
  }, [leads, filter, buckets])

  const isOverdue = (l: LeadRow) => buckets.overdue.some((x) => x.id === l.id)

  return (
    <>
      <PageHeader
        title="Lead follow-up"
        description="Your prospects, and who to call next. Only you and the office can see these."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        }
      />

      {buckets.overdue.length > 0 && (
        <div className="mb-5">
          <Notice tone="warn" title={`${buckets.overdue.length} follow-up${buckets.overdue.length === 1 ? '' : 's'} overdue.`}>
            The oldest is {buckets.overdue[0].name}, due {date(buckets.overdue[0].next_follow_up!)}.
          </Notice>
        </div>
      )}

      {isLoading ? (
        <SkeletonTiles count={4} />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Open leads" value={buckets.open} icon={<Target className="h-4 w-4" />} tone="blue"
            hint={`${buckets.total} in total`} />
          <StatTile label="Needs a call" value={needsCall} icon={<Phone className="h-4 w-4" />}
            tone={buckets.overdue.length ? 'amber' : 'neutral'}
            hint={buckets.overdue.length ? `${buckets.overdue.length} overdue` : 'Next 7 days'} />
          <StatTile label="Converted" value={buckets.converted} icon={<UserPlus className="h-4 w-4" />} tone="green"
            hint={`${buckets.lost} lost`} />
          <StatTile label="Conversion" value={`${buckets.conversionPct}%`} icon={<CalendarClock className="h-4 w-4" />}
            hint="Of leads you closed" />
        </div>
      )}

      {/* --- filter chips ------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([['all', `All (${buckets.total})`], ['due', `Needs a call (${needsCall})`]] as const).map(([key, label]) => (
          <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)}>{label}</FilterChip>
        ))}
        {buckets.byStatus.filter((s) => s.count > 0).map((s) => (
          <FilterChip key={s.status} active={filter === s.status} onClick={() => setFilter(s.status)}>
            {s.label} ({s.count})
          </FilterChip>
        ))}
      </div>

      <Card>
        <CardHeader title={filter === 'all' ? 'All leads' : 'Filtered leads'} subtitle={`${shown.length} shown`} />
        {isLoading ? (
          <SkeletonRows rows={5} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={leads.length === 0 ? 'No leads yet' : 'Nothing matches this filter'}
            description={
              leads.length === 0
                ? 'Add the people you are talking to, and this panel will remind you who to call.'
                : 'Try another filter.'
            }
            action={leads.length === 0 ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add lead</Button> : undefined}
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th><Th>Mobile</Th><Th>Interest</Th><Th>Budget</Th>
                    <Th>Follow-up</Th><Th>Status</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.id}>
                      <Td>
                        <button className="text-left font-medium text-slate-900 hover:underline" onClick={() => setDetail(l)}>
                          {l.name}
                        </button>
                        <p className="text-xs text-slate-400">{l.source.replace('_', ' ')}</p>
                      </Td>
                      <Td>{l.mobile}</Td>
                      <Td>{l.project?.name ?? l.category ?? '—'}</Td>
                      <Td>{l.budget ? money(l.budget) : '—'}</Td>
                      <Td>
                        {l.next_follow_up ? (
                          <span className={isOverdue(l) ? 'font-medium text-rose-600' : ''}>
                            {date(l.next_follow_up)}
                            {isOverdue(l) && <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />}
                          </span>
                        ) : '—'}
                      </Td>
                      <Td><LeadBadge status={l.status} /></Td>
                      <Td className="text-right">
                        {!LEAD_CLOSED.includes(l.status) && (
                          <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setEditing(l)}>
                            Update
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {shown.map((l) => (
                  <RecordCard
                    key={l.id}
                    title={<button className="text-left hover:underline" onClick={() => setDetail(l)}>{l.name}</button>}
                    subtitle={l.mobile}
                    badge={<LeadBadge status={l.status} />}
                    amount={l.budget ? <span className="text-sm font-semibold">{money(l.budget)}</span> : null}
                    rows={[
                      { label: 'Interest', value: l.project?.name ?? l.category ?? '—' },
                      {
                        label: 'Follow-up',
                        value: l.next_follow_up
                          ? <span className={isOverdue(l) ? 'font-medium text-rose-600' : ''}>{date(l.next_follow_up)}</span>
                          : '—',
                      },
                    ]}
                  />
                ))}
              </div>
            }
          />
        )}
      </Card>

      <LeadForm
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a lead"
        projects={projects}
        initial={{ ...BLANK, next_follow_up: todayInput() }}
        busy={create.isPending}
        error={create.error?.message}
        onSubmit={(draft) => create.mutate(draft, { onSuccess: () => setAdding(false) })}
      />

      <LeadForm
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Update ${editing?.name ?? 'lead'}`}
        projects={projects}
        initial={editing ?? BLANK}
        busy={update.isPending}
        error={update.error?.message}
        onSubmit={(draft) =>
          editing && update.mutate({ id: editing.id, ...draft }, { onSuccess: () => setEditing(null) })
        }
      />

      <LeadDetail lead={detail} onClose={() => setDetail(null)} />
    </>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white'
          : 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300'
      }
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ form */

function LeadForm({
  open, onClose, title, initial, projects, busy, error, onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  initial: LeadDraft
  projects: Array<{ id: string; name: string }>
  busy: boolean
  error?: string
  onSubmit: (draft: LeadDraft) => void
}) {
  // Keyed remount keeps the form in step with whichever lead is being edited
  // without an effect that fights the user's typing.
  return open ? (
    <LeadFormInner
      key={String(initial.name) + String(initial.mobile)}
      {...{ onClose, title, initial, projects, busy, error, onSubmit }}
    />
  ) : null
}

function LeadFormInner({
  onClose, title, initial, projects, busy, error, onSubmit,
}: {
  onClose: () => void
  title: string
  initial: LeadDraft
  projects: Array<{ id: string; name: string }>
  busy: boolean
  error?: string
  onSubmit: (draft: LeadDraft) => void
}) {
  const [f, setF] = useState<LeadDraft>(initial)
  const set = <K extends keyof LeadDraft>(k: K, v: LeadDraft[K]) => setF((p) => ({ ...p, [k]: v }))

  const nameOk = (f.name ?? '').trim().length >= 2
  // Indian mobile numbers are ten digits; anything shorter is a typo, and the
  // office cannot chase a lead it cannot ring.
  const digits = (f.mobile ?? '').replace(/\D/g, '')
  const mobileOk = digits.length >= 10
  const canSave = nameOk && mobileOk && !busy

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    onSubmit({
      ...f,
      name: (f.name ?? '').trim(),
      mobile: (f.mobile ?? '').trim(),
      email: (f.email ?? '').trim() || null,
      budget: f.budget ? Number(f.budget) : null,
      next_follow_up: f.next_follow_up || null,
      project_id: f.project_id || null,
      category: (f.category ?? '').trim() || null,
      remark: (f.remark ?? '').trim() || null,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lead-form" disabled={!canSave}>
            {busy ? 'Saving…' : 'Save lead'}
          </Button>
        </div>
      }
    >
      <form id="lead-form" onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error" title="Could not save.">{error}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required hint={f.name && !nameOk ? 'At least two characters.' : undefined}>
            <Input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Mobile" required hint={f.mobile && !mobileOk ? 'Needs at least 10 digits.' : undefined}>
            <Input value={f.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} placeholder="10-digit number" inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Source">
            <Select value={f.source ?? 'referral'} onChange={(e) => set('source', e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}</option>
              ))}
            </Select>
          </Field>
          <Field label="Project of interest">
            <Select value={f.project_id ?? ''} onChange={(e) => set('project_id', e.target.value || null)}>
              <option value="">Not decided</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Budget (₹)">
            <Input type="number" min={0} value={f.budget ?? ''} onChange={(e) => set('budget', e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Status">
            <Select value={f.status ?? 'new'} onChange={(e) => set('status', e.target.value as LeadStatus)}>
              {/* A member may mark a lead lost, but never converted — only a
                  confirmed booking does that, and the office owns it. */}
              {LEAD_STATUSES.filter((s) => s !== 'converted').map((s) => (
                <option key={s} value={s}>{LEAD_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up">
            <Input type="date" value={f.next_follow_up ?? ''} onChange={(e) => set('next_follow_up', e.target.value)} />
          </Field>
        </div>

        <Field label="Remark" hint="Private to you and the office.">
          <Textarea rows={3} value={f.remark ?? ''} onChange={(e) => set('remark', e.target.value)} placeholder="What did they say?" />
        </Field>
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- detail */

function LeadDetail({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: activities = [], isLoading } = useLeadActivities(lead?.id)
  const log = useLogLeadActivity(profile?.id)
  const [note, setNote] = useState('')

  if (!lead) return null

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const body = note.trim()
    if (!body) return
    log.mutate({ leadId: lead.id, body }, { onSuccess: () => setNote('') })
  }

  return (
    <Modal open onClose={onClose} title={lead.name} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {[
            ['Mobile', lead.mobile],
            ['Email', lead.email ?? '—'],
            ['Source', lead.source.replace('_', ' ')],
            ['Interest', lead.project?.name ?? lead.category ?? '—'],
            ['Budget', lead.budget ? money(lead.budget) : '—'],
            ['Follow-up', lead.next_follow_up ? date(lead.next_follow_up) : '—'],
            ['Added', date(lead.created_at)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-400">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-slate-400">Status</dt>
            <dd className="mt-0.5"><LeadBadge status={lead.status} /></dd>
          </div>
        </div>

        {lead.remark && (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Remark</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.remark}</p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Follow-up history</h3>
          <form onSubmit={add} className="mb-3 flex gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a call, a visit, a promise…" />
            <Button type="submit" disabled={!note.trim() || log.isPending}>
              {log.isPending ? 'Saving…' : 'Log'}
            </Button>
          </form>
          {log.error && <Notice tone="error" title="Could not save the note.">{log.error.message}</Notice>}

          {isLoading ? (
            <SkeletonRows rows={2} />
          ) : activities.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Nothing logged yet.</p>
          ) : (
            <ol className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <p className="text-sm text-slate-700">{a.body}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{date(a.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  )
}
