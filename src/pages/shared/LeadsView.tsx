import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Download, Phone, Plus, Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLeads, useProjects, useSaveLead, useProfiles } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageHeader,
  Select, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { LeadBadge } from '@/components/status'
import { date, downloadCsv, money, num } from '@/lib/format'
import type { Lead, LeadStatus } from '@/lib/types'

const PIPELINE: LeadStatus[] = ['new', 'contacted', 'visit_scheduled', 'negotiation', 'converted', 'lost']

/**
 * One leads screen, three audiences.
 *  - 'own'  : a rep. RLS already limits rows to theirs; we do not send owner_id.
 *  - 'all'  : an admin.
 *  - 'team' : a manager. Read-only — no create, no edit. Mobile and remark are
 *             visible because the manager is explicitly allowed them by RLS,
 *             but peers of the owning rep can never reach this data.
 */
export function LeadsView({ scope, basePath }: { scope: 'own' | 'all' | 'team'; basePath: string }) {
  const { profile } = useAuth()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(false)

  const { data = [], isLoading, error } = useLeads({
    status: status || undefined,
    search: search || undefined,
  })
  const { data: projects = [] } = useProjects()
  const { data: reps = [] } = useProfiles(scope === 'all' ? { role: 'rep', status: 'active' } : {})
  const save = useSaveLead()
  const { push } = useToast()

  const readOnly = scope === 'team'

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save.mutate(
      {
        id: editing?.id,
        name: String(f.get('name')),
        mobile: String(f.get('mobile')),
        email: String(f.get('email') ?? '') || null,
        project_id: (f.get('project_id') as string) || null,
        category: String(f.get('category') ?? '') || null,
        budget: f.get('budget') ? Number(f.get('budget')) : null,
        visit_date: (f.get('visit_date') as string) || null,
        token_amount: f.get('token_amount') ? Number(f.get('token_amount')) : null,
        plot_number: String(f.get('plot_number') ?? '') || null,
        source: String(f.get('source') || 'direct'),
        remark: String(f.get('remark') ?? '') || null,
        status: String(f.get('status') || 'new') as LeadStatus,
        next_follow_up: (f.get('next_follow_up') as string) || null,
        // A rep may only ever own their own leads; an admin can assign.
        owner_id: scope === 'all' ? ((f.get('owner_id') as string) || null) : (editing?.owner_id ?? profile?.id ?? null),
      } as Partial<Lead>,
      {
        onSuccess: () => {
          push('success', 'Lead saved.')
          setEditing(null)
          setCreating(false)
        },
        onError: (err) => push('error', err instanceof Error ? err.message : 'Could not save the lead'),
      },
    )
  }

  const counts = PIPELINE.map((s) => ({ s, n: data.filter((l) => l.status === s).length }))

  return (
    <>
      <PageHeader
        title={scope === 'team' ? 'Team leads' : scope === 'all' ? 'All leads' : 'My leads'}
        description={
          scope === 'team'
            ? 'Read-only view of your reps’ pipeline, for coordination.'
            : 'A lead’s mobile number, budget and remark are visible only to its owner, that rep’s manager, and administrators.'
        }
        action={
          !readOnly && (
            <Button onClick={() => { setEditing(null); setCreating(true) }}>
              <Plus className="h-4 w-4" /> New lead
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {counts.map(({ s, n }) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? '' : s)}
            className={
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition ' +
              (status === s
                ? 'border-brand-600 bg-brand-50 text-brand-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
            }
          >
            {s.replace(/_/g, ' ')} · {n}
          </button>
        ))}
      </div>

      {error && <ErrorState error={error} />}

      <Card>
        <CardHeader
          title={`${num(data.length)} leads`}
          action={
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-8 w-48 pl-8 text-xs"
                  placeholder="Name or mobile"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    'leads',
                    data.map((l) => ({
                      name: l.name,
                      mobile: l.mobile,
                      email: l.email,
                      project: l.project?.name ?? '',
                      budget: l.budget,
                      visit_date: l.visit_date,
                      plot_number: l.plot_number,
                      status: l.status,
                      source: l.source,
                      owner: l.owner?.full_name ?? '',
                      created_at: l.created_at,
                    })),
                  )
                }
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState
            title="No leads yet"
            description={readOnly ? 'Your reps have not added any leads.' : 'Add your first lead to start working the pipeline.'}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Lead</Th>
                <Th>Project / plot</Th>
                <Th>Budget</Th>
                <Th>Visit</Th>
                <Th>Status</Th>
                {scope !== 'own' && <Th>Owner</Th>}
                <Th>Follow-up</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <Td>
                    <Link to={`${basePath}/${l.id}`} className="font-medium text-brand-700 hover:underline">
                      {l.name}
                    </Link>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" /> {l.mobile}
                    </p>
                  </Td>
                  <Td className="text-xs">
                    {l.project?.name ?? '—'}
                    {l.plot_number ? ` · ${l.plot_number}` : ''}
                  </Td>
                  <Td className="text-xs">{money(l.budget)}</Td>
                  <Td className="text-xs">{date(l.visit_date)}</Td>
                  <Td><LeadBadge status={l.status} /></Td>
                  {scope !== 'own' && <Td className="text-xs">{l.owner?.full_name ?? 'Unassigned'}</Td>}
                  <Td className="text-xs">{date(l.next_follow_up)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => { setEditing(null); setCreating(false) }}
        title={editing ? `Edit ${editing.name}` : 'New lead'}
        size="lg"
      >
        <form id="lead-form" onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input name="name" required defaultValue={editing?.name} />
            </Field>
            <Field label="Mobile number" required>
              <Input name="mobile" required defaultValue={editing?.mobile} inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={editing?.email ?? ''} />
            </Field>
            <Field label="Project / category">
              <Select name="project_id" defaultValue={editing?.project_id ?? ''}>
                <option value="">Not decided</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Budget (₹)">
              <Input name="budget" type="number" defaultValue={editing?.budget ?? ''} />
            </Field>
            <Field label="Visit date">
              <Input name="visit_date" type="date" defaultValue={editing?.visit_date ?? ''} />
            </Field>
            <Field label="Token amount (₹)">
              <Input name="token_amount" type="number" defaultValue={editing?.token_amount ?? ''} />
            </Field>
            <Field label="Plot number">
              <Input name="plot_number" defaultValue={editing?.plot_number ?? ''} />
            </Field>
            <Field label="Source">
              <Select name="source" defaultValue={editing?.source ?? 'direct'}>
                <option value="direct">Direct</option>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="walk_in">Walk-in</option>
                <option value="campaign">Campaign</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={editing?.status ?? 'new'}>
                {PIPELINE.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </Field>
            <Field label="Next follow-up">
              <Input name="next_follow_up" type="date" defaultValue={editing?.next_follow_up ?? ''} />
            </Field>
            {scope === 'all' && (
              <Field label="Assign to rep">
                <Select name="owner_id" defaultValue={editing?.owner_id ?? ''}>
                  <option value="">Unassigned</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>{r.full_name} ({r.user_code})</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Remark" hint="Private to you, your manager and administrators.">
            <Textarea name="remark" rows={3} defaultValue={editing?.remark ?? ''} />
          </Field>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button>
          <Button type="submit" form="lead-form" loading={save.isPending}>Save lead</Button>
        </div>
      </Modal>
    </>
  )
}
