import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Phone, Search, Upload, Users, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Spinner, Table, Td, Th, type Tone } from '@/components/ui'
import { useLeads, useMembers, useProjects } from '@/lib/queries'
import { LeadImport } from '@/components/LeadImport'
import { AssignLeads } from '@/components/AssignLeads'
import { date, downloadCsv, money } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'

// Funnel stages shown across the top, mapped to the app's lead statuses.
const STAGES: { key: string; label: string; statuses: LeadStatus[]; tone: Tone }[] = [
  { key: 'new', label: 'New', statuses: ['new'], tone: 'blue' },
  { key: 'contacted', label: 'Contacted', statuses: ['contacted'], tone: 'violet' },
  { key: 'visit', label: 'Site Visit', statuses: ['visit_scheduled'], tone: 'amber' },
  { key: 'booked', label: 'Booked', statuses: ['negotiation'], tone: 'amber' },
  { key: 'converted', label: 'Converted', statuses: ['converted'], tone: 'green' },
  { key: 'lost', label: 'Lost', statuses: ['lost'], tone: 'red' },
]

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: 'blue', contacted: 'violet', visit_scheduled: 'amber',
  negotiation: 'amber', converted: 'green', lost: 'red',
}

export function AdminLeadConversion() {
  const { data: leads = [], isLoading, error } = useLeads({})
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState('')
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const qc = useQueryClient()
  const { data: members = [] } = useMembers()
  const { data: projects = [] } = useProjects()
  const assignable = useMemo(
    () => members
      .filter((m) => m.role === 'rep' && m.status === 'active')
      .map((m) => ({ id: m.id, label: `${m.full_name}${m.member_code ? ` (${m.member_code})` : ''}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [members],
  )

  const owners = useMemo(() => {
    const m = new Map<string, string>()
    leads.forEach((l) => { if (l.owner) m.set(l.owner.id, l.owner.full_name) })
    return [...m.entries()]
  }, [leads])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of STAGES) c[s.key] = leads.filter((l) => s.statuses.includes(l.status)).length
    return c
  }, [leads])

  const converted = leads.filter((l) => l.status === 'converted').length
  const conversion = leads.length ? Math.round((converted / leads.length) * 100) : 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (status && l.status !== status) return false
      if (owner === 'pool' ? l.owner : owner && l.owner?.id !== owner) return false
      if (q && ![l.name, l.mobile, l.project?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))) return false
      return true
    })
  }, [leads, search, status, owner])

  // Converted leads belong to a sale and are not reassigned.
  const selectable = filtered.filter((l) => l.status !== 'converted')
  const allChosen = selectable.length > 0 && selectable.every((l) => selected.has(l.id))
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(selectable.map((l) => l.id)))

  return (
    <div>
      <PageHeader
        title="Lead Conversion Tracker"
        description="Track follow-up progress and conversion rates across all sponsors."
        action={
          <div className="flex flex-wrap gap-2">
          <Button onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" /> Import leads
          </Button>
          <button
            onClick={() =>
              downloadCsv('leads', filtered.map((l) => ({
                lead: l.name, mobile: l.mobile, sponsor: l.owner?.full_name ?? 'Office pool',
                project: l.project?.name ?? '', budget: l.budget ?? '', status: l.status,
                updated: l.created_at,
              })))
            }
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((s) => (
          <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{counts[s.key]}</p>
          </div>
        ))}
      </div>

      <div
        className="bg-leaf-deep mb-5 rounded-2xl px-6 py-5 text-white shadow-sm"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">Overall Conversion</p>
        <p className="mt-1 text-4xl font-extrabold">{conversion}%</p>
        <p className="text-sm text-white/70">{converted} converted / {leads.length} leads</p>
      </div>

      <Card className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lead, phone, project…" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(['new', 'contacted', 'visit_scheduled', 'negotiation', 'converted', 'lost'] as LeadStatus[]).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </Select>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All sponsors</option>
            <option value="pool">Office pool (unassigned)</option>
            {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Phone className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900">Lead pipeline</h3>
        </div>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No leads match the filter." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all leads shown"
                    checked={allChosen}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 text-brand-gold-dark focus:ring-brand-gold"
                  />
                </Th>
                <Th>Lead</Th><Th>Sponsor</Th><Th>Project</Th><Th>Budget</Th><Th>Status</Th><Th>Last Update</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className={selected.has(l.id) ? 'bg-brand-gold/[0.07]' : 'hover:bg-slate-50'}>
                  <Td className="w-10">
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.name}`}
                      checked={selected.has(l.id)}
                      disabled={l.status === 'converted'}
                      title={l.status === 'converted' ? 'Converted leads stay with their sponsor' : undefined}
                      onChange={() => toggleOne(l.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-gold-dark focus:ring-brand-gold disabled:opacity-30"
                    />
                  </Td>
                  <Td>
                    <Link to={`/admin/leads/${l.id}`} className="font-medium text-slate-900 hover:text-brand-700">{l.name}</Link>
                    <p className="text-xs text-slate-400">{l.mobile}</p>
                  </Td>
                  <Td className="text-slate-600">{l.owner?.full_name ?? <span className="text-brand-gold-deep">Office pool</span>}</Td>
                  <Td className="text-slate-600">{l.project?.name ?? '—'}</Td>
                  <Td className="text-slate-600">{money(l.budget)}</Td>
                  <Td><Badge tone={STATUS_TONE[l.status]}>{l.status.replace(/_/g, ' ')}</Badge></Td>
                  <Td className="text-xs text-slate-500">{date(l.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {/* The action bar for the selected leads */}
      {selected.size > 0 && (
        <div className="sticky bottom-20 z-30 mt-4 lg:bottom-4">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-darker px-4 py-3 text-white shadow-2xl ring-1 ring-brand-gold/40">
            <p className="text-sm">
              <span className="font-bold text-brand-gold-light">{selected.size}</span> lead{selected.size === 1 ? '' : 's'} selected
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" /> Clear
              </button>
              <Button onClick={() => setAssigning(true)}>
                <Users className="h-4 w-4" /> Assign to members
              </Button>
            </div>
          </div>
        </div>
      )}

      {assigning && (
        <AssignLeads
          leadIds={[...selected]}
          members={assignable}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false)
            setSelected(new Set())
            void qc.invalidateQueries({ queryKey: ['leads'] })
          }}
        />
      )}

      {importing && (
        <LeadImport
          ownerId={null}
          owners={assignable}
          existingMobiles={leads.map((l) => l.mobile)}
          existingLabel="Already a lead"
          projects={projects}
          onClose={() => setImporting(false)}
          onImported={() => void qc.invalidateQueries({ queryKey: ['leads'] })}
        />
      )}
    </div>
  )
}
