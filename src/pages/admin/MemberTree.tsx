import { useMemo, useState } from 'react'
import { ChevronRight, Users, Network, GitBranch, Search } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Spinner, StatTile } from '@/components/ui'
import { useMembers } from '@/lib/queries'
import { buildForest, rankTone, statusTone, type TreeKind } from '@/lib/network'
import type { MemberNode } from '@/lib/types'

export function AdminMemberTree() {
  const { data: members = [], isLoading, error } = useMembers()
  const [kind, setKind] = useState<TreeKind>('sponsor')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  const forest = useMemo(() => buildForest(members, kind), [members, kind])

  const allIds = useMemo(() => {
    const ids: string[] = []
    const walk = (n: MemberNode) => { ids.push(n.id); n.children.forEach(walk) }
    forest.forEach(walk)
    return ids
  }, [forest])

  const stats = useMemo(() => ({
    total: members.length,
    active: members.filter((m) => m.status === 'active').length,
    roots: forest.length,
  }), [members, forest])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    const set = new Set<string>()
    const walk = (n: MemberNode, ancestors: string[]) => {
      const hit = [n.member_code, n.full_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      if (hit) { set.add(n.id); ancestors.forEach((a) => set.add(a)) }
      n.children.forEach((c) => walk(c, [...ancestors, n.id]))
    }
    forest.forEach((r) => walk(r, []))
    return set
  }, [search, forest])

  const isOpen = (id: string) => {
    if (matches) return matches.has(id)
    return allExpanded || expanded.has(id)
  }
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div>
      <PageHeader
        title="Member Tree"
        description="Full network view across all members."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              <button
                onClick={() => setKind('sponsor')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${kind === 'sponsor' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <Network className="h-4 w-4" /> Sponsor Tree
              </button>
              <button
                onClick={() => setKind('placement')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${kind === 'placement' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <GitBranch className="h-4 w-4" /> Placement Tree
              </button>
            </div>
            <button
              onClick={() => { setAllExpanded(true); setExpanded(new Set(allIds)) }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Expand all
            </button>
            <button
              onClick={() => { setAllExpanded(false); setExpanded(new Set()) }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Collapse all
            </button>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total members" value={stats.total} icon={<Users className="h-4 w-4" />} tone="blue" />
        <StatTile label="Active" value={stats.active} tone="green" />
        <StatTile label="Roots" value={stats.roots} tone="amber" />
      </div>

      <Card>
        <div className="border-b border-slate-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or name…" className="pl-9" />
          </div>
        </div>

        {isLoading ? (
          <Spinner label="Building the tree…" />
        ) : error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : forest.length === 0 ? (
          <EmptyState title="No members yet" description="Add members to see the network tree." />
        ) : (
          <div className="p-2 sm:p-4">
            {forest.map((root) => (
              <TreeRow key={root.id} node={root} depth={0} isOpen={isOpen} toggle={toggle} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function TreeRow({
  node, depth, isOpen, toggle,
}: {
  node: MemberNode
  depth: number
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  const open = isOpen(node.id)
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
        style={{ paddingLeft: depth * 22 + 8 }}
      >
        {hasChildren ? (
          <button
            onClick={() => toggle(node.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          </span>
        )}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
          {node.full_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-slate-800">{node.full_name}</span>
        <span className="shrink-0 font-mono text-xs text-slate-400">{node.member_code}</span>
        {node.rank_name && <Badge tone={rankTone(node.rank_name)}>{node.rank_name}</Badge>}
        <Badge tone={statusTone(node.status)}>{node.status}</Badge>
        {hasChildren && (
          <span className="shrink-0 text-xs text-slate-400">· {node.children.length} direct</span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((c) => (
            <TreeRow key={c.id} node={c} depth={depth + 1} isOpen={isOpen} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  )
}
