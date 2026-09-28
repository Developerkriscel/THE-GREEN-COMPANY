import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import clsx from 'clsx'
import { ChevronsDownUp, ChevronsUpDown, Minus, Plus, RotateCcw } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/ui'
import { rankTone } from '@/lib/network'
import { date, num } from '@/lib/format'

/**
 * A genealogy drawn as a tree: the member at the top, each sponsored member
 * beneath the one who brought them in, joined by gold lines — the shape a
 * network is usually explained with. Branches fold and unfold; the chart
 * zooms, and pans by drag (mouse) or swipe (touch), so a wide team still fits
 * a phone.
 */

export interface ChartNode {
  id: string
  name: string
  code: string | null
  rank?: string | null
  status?: string | null
  direct?: number
  team?: number
  joined?: string | null
  /** Shown only where the viewer may read it (the office); otherwise initials. */
  avatarPath?: string | null
  children: ChartNode[]
}

const ZOOMS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15]

export function GenealogyChart({
  root,
  rootLabel,
  onSelect,
  highlight,
  expandDepth = 2,
  selectLabel = 'Show this branch',
}: {
  root: ChartNode
  /** A tag on the top card, e.g. "You". */
  rootLabel?: string
  /** Called when a card is chosen: the page decides what that means (focus, re-root). */
  onSelect?: (node: ChartNode) => void
  highlight?: Set<string>
  /** Levels open on first view, below the top card. */
  expandDepth?: number
  selectLabel?: string
}) {
  const allIds = useMemo(() => {
    const ids: string[] = []
    const walk = (n: ChartNode) => { ids.push(n.id); n.children.forEach(walk) }
    walk(root)
    return ids
  }, [root])

  const initial = useMemo(() => {
    const open = new Set<string>()
    const walk = (n: ChartNode, d: number) => {
      if (d < expandDepth) open.add(n.id)
      n.children.forEach((c) => walk(c, d + 1))
    }
    walk(root, 0)
    return open
  }, [root, expandDepth])

  const [open, setOpen] = useState<Set<string>>(initial)
  useEffect(() => setOpen(initial), [initial])

  // A search opens the path down to every match.
  useEffect(() => {
    if (!highlight?.size) return
    const path = new Set<string>()
    const walk = (n: ChartNode, trail: string[]): boolean => {
      let hit = highlight.has(n.id)
      for (const c of n.children) if (walk(c, [...trail, n.id])) hit = true
      if (hit) trail.forEach((t) => path.add(t))
      return hit
    }
    walk(root, [])
    setOpen((prev) => new Set([...prev, ...path]))
  }, [highlight, root])

  const [zoom, setZoom] = useState(1)
  const scroller = useRef<HTMLDivElement>(null)

  // Phones start a little zoomed out, so a branch and its children fit.
  useLayoutEffect(() => {
    if ((scroller.current?.clientWidth ?? 1000) < 600) setZoom(0.7)
  }, [])

  // Start centred on the top card.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [root, zoom])

  // Drag to pan with a mouse; touch screens scroll natively.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('button')) return
    const el = scroller.current!
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const el = scroller.current!
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x)
    el.scrollTop = drag.current.top - (e.clientY - drag.current.y)
  }
  const endDrag = () => { drag.current = null }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const zi = ZOOMS.indexOf(zoom)
  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-gold/15 px-4 py-2.5">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-brand-darker">{num(allIds.length - 1)}</span> below ·
          drag or swipe to move · tap a card to {selectLabel.toLowerCase()}
        </p>
        <div className="flex items-center gap-1">
          <ToolBtn title="Unfold every branch" onClick={() => setOpen(new Set(allIds))}><ChevronsUpDown className="h-4 w-4" /></ToolBtn>
          <ToolBtn title="Fold to the first levels" onClick={() => setOpen(initial)}><ChevronsDownUp className="h-4 w-4" /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-brand-gold/25" />
          <ToolBtn title="Zoom out" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])}><Minus className="h-4 w-4" /></ToolBtn>
          <span className="w-10 text-center text-xs font-semibold tabular-nums text-brand-darker">{Math.round(zoom * 100)}%</span>
          <ToolBtn title="Zoom in" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])}><Plus className="h-4 w-4" /></ToolBtn>
          <ToolBtn title="Reset zoom" onClick={() => setZoom(1)}><RotateCcw className="h-3.5 w-3.5" /></ToolBtn>
        </div>
      </div>

      <div
        ref={scroller}
        className="gtree-scroller max-h-[72vh] min-h-[320px] cursor-grab overflow-auto active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div className="gtree mx-auto w-max px-6 py-8" style={{ zoom }}>
          <ul>
            <Branch node={root} depth={0} open={open} toggle={toggle} onSelect={onSelect} highlight={highlight} rootLabel={rootLabel} selectLabel={selectLabel} />
          </ul>
        </div>
      </div>
    </div>
  )
}

function Branch({
  node, depth, open, toggle, onSelect, highlight, rootLabel, selectLabel,
}: {
  node: ChartNode
  depth: number
  open: Set<string>
  toggle: (id: string) => void
  onSelect?: (n: ChartNode) => void
  highlight?: Set<string>
  rootLabel?: string
  selectLabel: string
}) {
  const kids = node.children
  const isOpen = open.has(node.id)
  return (
    <li>
      <NodeCard
        node={node}
        isRoot={depth === 0}
        rootLabel={rootLabel}
        highlighted={Boolean(highlight?.has(node.id))}
        onSelect={depth === 0 ? undefined : onSelect}
        selectLabel={selectLabel}
      />
      {kids.length > 0 && (
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className="gtree-toggle"
          aria-expanded={isOpen}
          title={isOpen ? 'Fold this branch' : `Show ${kids.length} below`}
        >
          {isOpen ? <Minus className="h-3 w-3" /> : <span>+{num(countBelow(node))}</span>}
        </button>
      )}
      {kids.length > 0 && isOpen && (
        <ul>
          {kids.map((c) => (
            <Branch key={c.id} node={c} depth={depth + 1} open={open} toggle={toggle} onSelect={onSelect} highlight={highlight} selectLabel={selectLabel} />
          ))}
        </ul>
      )}
    </li>
  )
}

function countBelow(n: ChartNode): number {
  return n.children.reduce((t, c) => t + 1 + countBelow(c), 0)
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  pending: 'bg-amber-400',
  suspended: 'bg-red-500',
}

function NodeCard({
  node, isRoot, rootLabel, highlighted, onSelect, selectLabel,
}: {
  node: ChartNode
  isRoot: boolean
  rootLabel?: string
  highlighted: boolean
  onSelect?: (n: ChartNode) => void
  selectLabel: string
}) {
  const Tag = onSelect ? 'button' : 'div'
  return (
    <Tag
      type={onSelect ? 'button' : undefined}
      onClick={onSelect ? () => onSelect(node) : undefined}
      title={onSelect ? selectLabel : undefined}
      className={clsx(
        'gtree-card relative flex w-[172px] flex-col items-center rounded-2xl px-3 pb-4 pt-3 text-center transition',
        isRoot
          ? 'bg-leaf-deep text-white shadow-luxe ring-2 ring-brand-gold/70'
          : 'border border-brand-gold/25 bg-white shadow-luxe hover:-translate-y-0.5 hover:border-brand-gold-dark/60',
        highlighted && 'ring-2 ring-brand-orange ring-offset-2 ring-offset-[#faf7f0]',
      )}
    >
      {node.status && (
        <span
          className={clsx('absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ring-2', STATUS_DOT[node.status] ?? 'bg-slate-300', isRoot ? 'ring-brand-darker' : 'ring-white')}
          title={node.status}
        />
      )}
      {isRoot && rootLabel && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold-metal px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-darker shadow">
          {rootLabel}
        </span>
      )}
      <span className="rounded-full bg-gold-metal p-[2px] shadow">
        <Avatar path={node.avatarPath} name={node.name} size={isRoot ? 52 : 44} tone={isRoot ? 'brand' : 'neutral'} />
      </span>
      <p className={clsx('mt-2 line-clamp-2 text-[13px] font-bold leading-tight', isRoot ? 'text-white' : 'text-brand-darker')}>{node.name}</p>
      {node.code && <p className={clsx('mt-0.5 font-mono text-[10.5px]', isRoot ? 'text-brand-gold-light/80' : 'text-slate-400')}>{node.code}</p>}
      {node.rank && (
        <Badge tone={rankTone(node.rank)} className="mt-1.5 !text-[10.5px]">{node.rank}</Badge>
      )}
      <p className={clsx('mt-1.5 text-[10.5px]', isRoot ? 'text-white/70' : 'text-slate-500')}>
        {num(node.direct ?? node.children.length)} direct · {num(node.team ?? countBelow(node))} team
      </p>
      {node.joined && !isRoot && <p className="text-[10px] text-slate-400">joined {date(node.joined)}</p>}
    </Tag>
  )
}

function ToolBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-gold/30 bg-white text-brand-darker transition hover:bg-brand-gold/10 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
