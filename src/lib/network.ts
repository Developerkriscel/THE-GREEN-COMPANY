import type { MemberNode, Profile } from '@/lib/types'
import type { Tone } from '@/components/ui'

export type TreeKind = 'sponsor' | 'placement'

/** Turn a flat member list into a forest, linked by the chosen relationship. */
export function buildForest(members: Profile[], kind: TreeKind): MemberNode[] {
  const parentKey = kind === 'sponsor' ? 'referrer_id' : 'placement_parent_id'
  const byId = new Map<string, MemberNode>()

  for (const m of members) {
    byId.set(m.id, {
      id: m.id,
      member_code: m.member_code,
      full_name: m.full_name || '—',
      rank_name: m.rank?.name ?? null,
      status: m.status,
      role: m.role,
      direct_count: m.direct_count ?? 0,
      team_count: m.team_count ?? 0,
      children: [],
    })
  }

  const roots: MemberNode[] = []
  for (const m of members) {
    const node = byId.get(m.id)!
    const parentId = m[parentKey] as string | null
    const parent = parentId ? byId.get(parentId) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (n: MemberNode) => {
    n.children.sort((a, b) => (a.member_code ?? '').localeCompare(b.member_code ?? ''))
    n.children.forEach(sortRec)
  }
  roots.sort((a, b) => (a.member_code ?? '').localeCompare(b.member_code ?? ''))
  roots.forEach(sortRec)
  return roots
}

/** Find a node by id anywhere in a forest. */
export function findNode(forest: MemberNode[], id: string): MemberNode | null {
  for (const n of forest) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

/** Flatten a node's downline into level buckets (level 1 = direct children). */
export function levelize(node: MemberNode): MemberNode[][] {
  const levels: MemberNode[][] = []
  let frontier = node.children
  while (frontier.length) {
    levels.push(frontier)
    frontier = frontier.flatMap((c) => c.children)
  }
  return levels
}

/** Colour a rank badge — elite ranks glow gold, mid-ranks blue, entry neutral. */
export function rankTone(rank: string | null | undefined): Tone {
  if (!rank) return 'neutral'
  // Names follow the Symo plan deck (slides 5-10); see migration
  // 20260201001200_symo_plan_alignment.sql.
  const elite = ['Crown', 'Diamond', 'Sales Country Head', 'Core Manager']
  const senior = ['Vice President', 'GM', 'DGM', 'AGM']
  if (elite.includes(rank)) return 'gold'
  if (senior.includes(rank)) return 'blue'
  return 'neutral'
}

export function statusTone(status: string): Tone {
  return status === 'active' ? 'green' : status === 'suspended' ? 'red' : 'amber'
}
