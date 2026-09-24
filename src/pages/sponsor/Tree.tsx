import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { legsOf, useMyDownline, useSponsorProfile, type DownlineRow } from '@/lib/sponsor'
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader } from '@/components/ui'
import { MemberStatusBadge, SkeletonRows } from '@/components/sponsor'
import { rankTone } from '@/lib/network'
import { date, num } from '@/lib/format'

/**
 * Module 6 — the same downline as My Team, seen as a shape.
 *
 * The root is always the signed-in member and cannot be changed to an ancestor:
 * my_downline() simply does not return anyone above them, so there is nothing
 * to navigate to. A search that misses says "not in your team" whether the
 * member does not exist or belongs to someone else's branch — the tree cannot
 * be used to probe for other members.
 */

interface TreeNodeData extends DownlineRow {
  children: TreeNodeData[]
}

export function SponsorTree() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: member } = useSponsorProfile(me)
  const { data: downline = [], isLoading } = useMyDownline(me)
  const [search, setSearch] = useState('')
  const [focus, setFocus] = useState<DownlineRow | null>(null)

  // One leg per direct member, with everyone beneath them. The page promises
  // to show which leg is growing, and the top ranks are gated on leg COUNT
  // (2, 5, 7 and 10 for Core Manager upward), so a member needs to see their
  // legs side by side rather than infer them from an indented list.
  const legs = useMemo(() => {
    return legsOf(downline)
      .map((l) => ({
        head: l.head,
        size: l.branch.length + 1,
        active: [l.head, ...l.branch].filter((m) => m.status === 'active').length,
        depth: Math.max(l.head.level, ...l.branch.map((m) => m.level)) - l.head.level + 1,
      }))
      .sort((a, b) => b.size - a.size)
  }, [downline])

  const roots = useMemo(() => {
    const byId = new Map<string, TreeNodeData>()
    downline.forEach((d) => byId.set(d.id, { ...d, children: [] }))
    const top: TreeNodeData[] = []
    downline.forEach((d) => {
      const node = byId.get(d.id)!
      const parent = d.sponsor_id ? byId.get(d.sponsor_id) : undefined
      if (parent) parent.children.push(node)
      else top.push(node)
    })
    return top
  }, [downline])

  const query = search.trim().toLowerCase()
  const matches = query
    ? downline.filter(
        (d) => d.full_name.toLowerCase().includes(query) || (d.member_code ?? '').toLowerCase().includes(query),
      )
    : []

  const focusRoots = focus
    ? [findIn(roots, focus.id)].filter(Boolean as unknown as (v: TreeNodeData | null) => v is TreeNodeData)
    : roots

  return (
    <>
      <PageHeader
        title="Genealogy Tree"
        description="Your team as a shape — which leg is growing, and where a branch has stalled."
        action={
          <Link to="/sponsor/team" className="text-sm font-medium text-brand-700 hover:underline">
            ← Back to level view
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="relative p-4">
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search your team by name or member ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {query && (
            <p className="mt-2 text-xs text-slate-600">
              {matches.length === 0
                ? 'No member found in your team.'
                : `${num(matches.length)} match${matches.length === 1 ? '' : 'es'} — highlighted below.`}
            </p>
          )}
        </div>
      </Card>

      {focus && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <button
            onClick={() => setFocus(null)}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            <X className="h-3 w-3" /> Focused on {focus.full_name} — back to my position
          </button>
        </div>
      )}

      {legs.length > 0 && !focus && (
        <Card className="mb-5">
          <CardHeader
            title={`${num(legs.length)} leg${legs.length === 1 ? '' : 's'}`}
            subtitle="One leg per direct member. Rank qualification counts legs, not just team size."
          />
          <div className="grid gap-3 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-3">
            {legs.map((l) => (
              <button
                key={l.head.id}
                onClick={() => setFocus(l.head)}
                className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">{l.head.full_name}</span>
                  <Badge tone={rankTone(l.head.rank_name)}>{l.head.rank_name ?? '—'}</Badge>
                </div>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{l.head.member_code}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    ['In leg', num(l.size)],
                    ['Active', num(l.active)],
                    ['Depth', num(l.depth)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{k}</dt>
                      <dd className="text-sm font-semibold text-slate-800">{v}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your position and everyone below it"
          subtitle={`${num(downline.length)} member${downline.length === 1 ? '' : 's'} in your team`}
        />
        {isLoading ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="overflow-x-auto p-5">
            {/* The member is always the root and is never one of the fetched rows. */}
            {!focus && (
              <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
                <span className="text-sm font-semibold text-brand-900">You</span>
                <span className="font-mono text-xs text-brand-700">{member?.member_code}</span>
                {member?.rank?.name && <Badge tone="gold">{member.rank.name}</Badge>}
                <span className="text-xs text-brand-700">
                  {num(downline.filter((d) => d.level === 1).length)} direct · {num(downline.length)} team
                </span>
              </div>
            )}

            {downline.length === 0 ? (
              <EmptyState
                title="Your team will grow here"
                description="Everyone you sponsor appears below you, branch by branch."
                action={
                  <Link to="/sponsor/refer" className="text-sm font-medium text-brand-700 hover:underline">
                    Refer a member
                  </Link>
                }
              />
            ) : (
              focusRoots.map((n) => (
                <TreeNode
                  key={n.id}
                  node={n}
                  depth={focus ? 0 : 1}
                  query={query}
                  matchIds={matches.map((m) => m.id)}
                  onFocus={setFocus}
                />
              ))
            )}
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        You can see everyone below you. Your own sponsor, their other branches and anyone outside your
        team are not part of this view — and are not sent to your browser at all.
      </p>
    </>
  )
}

function findIn(nodes: TreeNodeData[], id: string): TreeNodeData | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findIn(n.children, id)
    if (hit) return hit
  }
  return null
}

function containsMatch(node: TreeNodeData, ids: string[]): boolean {
  if (ids.includes(node.id)) return true
  return node.children.some((c) => containsMatch(c, ids))
}

function TreeNode({
  node,
  depth,
  query,
  matchIds,
  onFocus,
}: {
  node: TreeNodeData
  depth: number
  query: string
  matchIds: string[]
  onFocus: (d: DownlineRow) => void
}) {
  // Default depth on load is the root plus two levels; a search opens the path
  // to whatever it found.
  const auto = depth < 3 || (query.length > 0 && containsMatch(node, matchIds))
  const [open, setOpen] = useState(auto)
  const isMatch = matchIds.includes(node.id)
  const hasKids = node.children.length > 0

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg py-1.5 pr-2 ${
          isMatch ? 'bg-amber-50 ring-1 ring-amber-200' : ''
        }`}
        style={{ paddingLeft: depth * 18 + 4 }}
      >
        {hasKids ? (
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-700"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}

        <button
          onClick={() => onFocus(node)}
          className="text-sm font-medium text-slate-800 hover:text-brand-700"
          title="Focus on this branch"
        >
          {node.full_name}
        </button>
        <span className="font-mono text-xs text-slate-400">{node.member_code}</span>
        <Badge tone={rankTone(node.rank_name)}>{node.rank_name ?? '—'}</Badge>
        <MemberStatusBadge status={node.status} />
        <span className="text-[11px] text-slate-500">
          {num(node.direct_count)} direct · {num(node.team_count)} team · joined {date(node.joined)}
        </span>
        {hasKids && !open && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {num(node.children.length)} below
          </span>
        )}
      </div>

      {open && node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} query={query} matchIds={matchIds} onFocus={onFocus} />
      ))}
    </div>
  )
}
