import { useEffect, useMemo, useState } from 'react'
import { Network, GitBranch, Search, CornerLeftUp } from 'lucide-react'
import { Card, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@/components/ui'
import { useMembers } from '@/lib/queries'
import { buildForest, findNode, type TreeKind } from '@/lib/network'
import { GenealogyChart, type ChartNode } from '@/components/GenealogyChart'
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
  const chartRoot = useMemo(() => (root ? toChart(root) : null), [root])
  const topId = forest[0]?.id

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
        description="Any member's downline as a tree. Tap a member to see the network from them."
        action={
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              onClick={() => setKind('sponsor')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${kind === 'sponsor' ? 'bg-gold-metal text-brand-darker shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <Network className="h-4 w-4" /> Sponsor
            </button>
            <button
              onClick={() => setKind('placement')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${kind === 'placement' ? 'bg-gold-metal text-brand-darker shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <GitBranch className="h-4 w-4" /> Placement
            </button>
          </div>
        }
      />

      <Card className="mb-5 overflow-visible">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="text-sm text-slate-500">
            Showing from:{' '}
            {root ? (
              <span className="font-semibold text-brand-darker">
                <span className="font-mono">{root.member_code}</span> · {root.full_name}
              </span>
            ) : '—'}
          </div>
          {root && topId && root.id !== topId && (
            <button
              onClick={() => setRootId(topId)}
              className="inline-flex items-center gap-1 rounded-full border border-brand-gold/40 px-3 py-1 text-xs font-semibold text-brand-darker hover:bg-brand-gold/10"
            >
              <CornerLeftUp className="h-3.5 w-3.5" /> Top of the network
            </button>
          )}
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
        <Card>
          {root.children.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">This member has no downline yet.</p>
          ) : (
            <GenealogyChart
              root={chartRoot!}
              onSelect={(n) => setRootId(n.id)}
              selectLabel="Show the network from this member"
            />
          )}
        </Card>
      )}
    </div>
  )
}

function toChart(n: MemberNode): ChartNode {
  return {
    id: n.id,
    name: n.full_name,
    code: n.member_code,
    rank: n.rank_name,
    status: n.status,
    direct: n.direct_count,
    team: n.team_count,
    avatarPath: n.avatar_path ?? null,
    children: n.children.map(toChart),
  }
}
