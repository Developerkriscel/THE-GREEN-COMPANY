import { useEffect, useMemo, useState } from 'react'
import { Network, GitBranch, Search, ChevronDown } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@/components/ui'
import { useMembers } from '@/lib/queries'
import { buildForest, findNode, levelize, rankTone, statusTone, type TreeKind } from '@/lib/network'
import type { MemberNode } from '@/lib/types'

export function AdminGenealogy() {
  const { data: members = [], isLoading, error } = useMembers()
  const [kind, setKind] = useState<TreeKind>('sponsor')
  const [rootId, setRootId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const forest = useMemo(() => buildForest(members, kind), [members, kind])

  // Default the root to the first top-level member.
  useEffect(() => {
    if (!rootId && forest.length) setRootId(forest[0].id)
  }, [forest, rootId])

  const root = useMemo(() => (rootId ? findNode(forest, rootId) : null), [forest, rootId])
  const levels = useMemo(() => (root ? levelize(root) : []), [root])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return members
      .filter((m) => [m.member_code, m.full_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8)
  }, [members, search])

  return (
    <div>
      <PageHeader
        title="Genealogy"
        description="Visualise any member's downline by levels."
        action={
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              onClick={() => setKind('sponsor')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${kind === 'sponsor' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <Network className="h-4 w-4" /> Sponsor
            </button>
            <button
              onClick={() => setKind('placement')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${kind === 'placement' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <GitBranch className="h-4 w-4" /> Placement
            </button>
          </div>
        }
      />

      <Card className="mb-5 overflow-visible">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="text-sm text-slate-500">
            Root:{' '}
            {root ? (
              <span className="font-semibold text-slate-900">
                <span className="font-mono">{root.member_code}</span> · {root.full_name}
              </span>
            ) : '—'}
          </div>
          <div className="relative ml-auto min-w-[240px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Change root by ID or name…" className="pl-9" />
            {searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {searchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setRootId(m.id); setSearch('') }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="font-mono text-xs text-slate-400">{m.member_code}</span>
                    {m.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Loading genealogy…" />
      ) : error ? (
        <ErrorState error={error} />
      ) : !root ? (
        <EmptyState title="No members yet" description="Add members to explore the genealogy." />
      ) : (
        <div className="space-y-2">
          {/* root card */}
          <div className="flex justify-center">
            <RootCard node={root} />
          </div>

          {levels.length === 0 ? (
            <p className="pt-6 text-center text-sm text-slate-500">This member has no downline yet.</p>
          ) : (
            levels.map((level, i) => (
              <div key={i}>
                <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ChevronDown className="h-4 w-4" />
                  Level {i + 1} · {level.length} {level.length === 1 ? 'member' : 'members'}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {level.map((n) => <MemberCard key={n.id} node={n} onClick={() => setRootId(n.id)} />)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function RootCard({ node }: { node: MemberNode }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-4 text-white shadow-lg">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
          {node.full_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="text-base font-bold">{node.full_name}</p>
          <p className="font-mono text-xs text-white/70">{node.member_code}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {node.rank_name && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{node.rank_name}</span>
        )}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{node.direct_count} direct</span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{node.team_count} team</span>
      </div>
    </div>
  )
}

function MemberCard({ node, onClick }: { node: MemberNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Set as root"
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
        {node.full_name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{node.full_name}</p>
        <p className="font-mono text-xs text-slate-400">{node.member_code}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {node.rank_name && <Badge tone={rankTone(node.rank_name)}>{node.rank_name}</Badge>}
          <Badge tone={statusTone(node.status)}>{node.status}</Badge>
          {node.direct_count > 0 && <span className="text-xs text-slate-400">· {node.direct_count} direct</span>}
        </div>
      </div>
    </button>
  )
}
