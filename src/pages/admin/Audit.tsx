import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { useAuditLog } from '@/lib/queries'
import {
  Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Spinner,
  Table, Td, Th, type Tone,
} from '@/components/ui'
import { dateTime, downloadCsv, num, titleCase } from '@/lib/format'

const ACTION_TONE: Record<string, Tone> = {
  insert: 'green',
  update: 'blue',
  delete: 'red',
  access: 'violet',
  login: 'neutral',
  approve: 'green',
  reject: 'red',
}

const ENTITIES = [
  'profiles', 'projects', 'plots', 'leads', 'bookings', 'sale_confirmations',
  'commissions', 'emis', 'payments', 'documents', 'kyc', 'ranks', 'cms_pages',
]

/**
 * Append-only log. There is no UPDATE or DELETE policy on audit_log for any
 * role, including admin — this screen can only read.
 */
export function AdminAudit() {
  const [entity, setEntity] = useState('')
  const [search, setSearch] = useState('')
  const { data = [], isLoading } = useAuditLog({ entity: entity || undefined, limit: 500 })
  const [expanded, setExpanded] = useState<number | null>(null)

  const filtered = data.filter(
    (e) =>
      !search ||
      `${e.entity} ${e.summary ?? ''} ${e.entity_id ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every create, edit, delete and sensitive read across the platform. Immutable — nobody can alter or remove an entry."
      />

      <Card>
        <CardHeader
          title={`${num(filtered.length)} entries`}
          subtitle="Most recent first"
          action={
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-8 w-48 text-xs"
                placeholder="Search summary or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select className="h-8 w-40 text-xs" value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">All entities</option>
                {ENTITIES.map((t) => (
                  <option key={t} value={t}>{titleCase(t)}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    'audit-log',
                    filtered.map((e) => ({
                      at: e.at,
                      actor_role: e.actor_role,
                      actor_id: e.actor_id,
                      action: e.action,
                      entity: e.entity,
                      entity_id: e.entity_id,
                      summary: e.summary,
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
        ) : filtered.length === 0 ? (
          <EmptyState title="No entries" description="Nothing matches this filter." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8" />
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <Fragment key={e.id}>
                  <tr
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <Td>
                      {expanded === e.id ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{dateTime(e.at)}</Td>
                    <Td className="text-xs">
                      {e.actor_role ? <Badge tone="blue">{e.actor_role}</Badge> : <span className="text-slate-400">system / public</span>}
                    </Td>
                    <Td><Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{e.action}</Badge></Td>
                    <Td className="text-xs font-medium text-slate-800">{e.entity}</Td>
                    <Td className="max-w-md truncate text-xs">{e.summary ?? '—'}</Td>
                  </tr>
                  {expanded === e.id && (
                    <tr>
                      <Td />
                      <Td className="p-0" />
                      <td colSpan={4} className="border-b border-slate-100 px-4 pb-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <JsonBlock label="Before" value={e.before} />
                          <JsonBlock label="After" value={e.after} />
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400">
                          Entity ID: {e.entity_id ?? '—'} · Actor ID: {e.actor_id ?? '—'}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
  )
}
