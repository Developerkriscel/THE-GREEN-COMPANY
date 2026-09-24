import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMyDownline, useMyLedger, levelSummary, type DownlineRow } from '@/lib/sponsor'
import {
  Badge, Card, CardHeader, EmptyState, Input, PageHeader, Select, StatTile, Table, Td, Th,
} from '@/components/ui'
import { MemberStatusBadge, SkeletonRows } from '@/components/sponsor'
import { rankTone } from '@/lib/network'
import { date, money, num } from '@/lib/format'

/**
 * Module 5 — the downline level by level.
 *
 * A downline member's income, wallet, phone number and documents are not in the
 * data this screen receives, let alone on it. Identity and position only.
 */
export function SponsorTeam() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: downline = [], isLoading } = useMyDownline(me)
  const { data: ledger = [] } = useMyLedger(me)
  const [open, setOpen] = useState<number[]>([1])

  const levels = useMemo(() => levelSummary(downline, ledger), [downline, ledger])
  const directs = downline.filter((d) => d.level === 1)
  const activeAll = downline.filter((d) => d.status === 'active').length
  const activeDirect = directs.filter((d) => d.status === 'active').length
  const joined30 = downline.filter(
    (d) => new Date(d.joined).getTime() > Date.now() - 30 * 24 * 3600 * 1000,
  ).length

  const toggle = (level: number) =>
    setOpen((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]))

  return (
    <>
      <PageHeader
        title="My Team"
        description="Your downline, level by level — where your team is growing and which level is earning."
        action={
          <Link to="/sponsor/tree" className="text-sm font-medium text-brand-700 hover:underline">
            View as tree →
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total team" value={num(downline.length)} hint={`${num(activeAll)} active`} tone="violet" />
        <StatTile label="Direct members" value={num(directs.length)} hint={`${num(activeDirect)} active`} tone="blue" />
        <StatTile label="Joined (30 days)" value={num(joined30)} hint="New in your team" tone="green" />
        <StatTile
          label="Deepest level reached"
          value={num(levels.filter((l) => l.members > 0).length)}
          hint="Of 12 paying levels"
          tone="amber"
        />
      </div>

      {/* Top performers — deliberately scoped to this member's OWN team, and
          showing only position and rank. A company-wide leaderboard would put
          other members' standing in front of people who may not see it. */}
      {downline.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            title="Top performers in your team"
            subtitle="By team size, then directs — no earnings are shown"
          />
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {[...downline]
              .sort(
                (a, b) =>
                  b.team_count - a.team_count ||
                  b.direct_count - a.direct_count ||
                  (b.rank_seniority ?? 0) - (a.rank_seniority ?? 0),
              )
              .slice(0, 6)
              .map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 bg-white p-4">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{m.full_name}</p>
                    <p className="text-[11px] text-slate-500">
                      Level {m.level} · {num(m.direct_count)} direct · {num(m.team_count)} team
                    </p>
                  </div>
                  <Badge tone={rankTone(m.rank_name)}>{m.rank_name ?? '—'}</Badge>
                </div>
              ))}
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : downline.length === 0 ? (
        <Card>
          <EmptyState
            title="You haven’t added anyone to your team yet"
            description="Members you sponsor appear here, level by level, as soon as the office activates them."
            action={
              <Link to="/sponsor/refer" className="text-sm font-medium text-brand-700 hover:underline">
                Refer a member
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {levels.map((l) => (
            <LevelBlock
              key={l.level}
              level={l.level}
              members={downline.filter((d) => d.level === l.level)}
              income={l.income}
              activeCount={l.active}
              open={open.includes(l.level)}
              onToggle={() => toggle(l.level)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function LevelBlock({
  level,
  members,
  income,
  activeCount,
  open,
  onToggle,
}: {
  level: number
  members: DownlineRow[]
  income: number
  activeCount: number
  open: boolean
  onToggle: () => void
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const PER = 25

  const filtered = members.filter((m) => {
    if (status !== 'all' && m.status !== status) return false
    if (!search) return true
    const q = search.toLowerCase()
    return m.full_name.toLowerCase().includes(q) || (m.member_code ?? '').toLowerCase().includes(q)
  })
  const pages = Math.max(1, Math.ceil(filtered.length / PER))
  const slice = filtered.slice(page * PER, page * PER + PER)
  const empty = members.length === 0

  return (
    <Card className={empty ? 'opacity-60' : ''}>
      <button
        onClick={empty ? undefined : onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
        disabled={empty}
      >
        <div className="flex items-center gap-2">
          {!empty && (
            <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          )}
          {empty && <span className="inline-block w-4" />}
          <span className="text-sm font-semibold text-slate-900">
            Level {level}
            {level === 1 && <span className="ml-1 font-normal text-slate-500">(your direct members)</span>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span>
            <strong className="text-slate-900">{num(members.length)}</strong> member
            {members.length === 1 ? '' : 's'}
          </span>
          <span>
            <strong className="text-slate-900">{num(activeCount)}</strong> active
          </span>
          <span>
            Earned <strong className="text-slate-900">{money(income)}</strong>
          </span>
        </div>
      </button>

      {open && !empty && (
        <>
          <div className="grid gap-3 border-t border-slate-200 px-5 py-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search name or member ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(0)
                }}
              />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Inactive</option>
              <option value="suspended">On hold</option>
            </Select>
          </div>

          {slice.length === 0 ? (
            <EmptyState title="No members match that search" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Member ID</Th>
                  <Th>Name</Th>
                  <Th>Rank</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                  {level > 1 && <Th>Sponsor</Th>}
                </tr>
              </thead>
              <tbody>
                {slice.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs text-slate-600">{m.member_code}</Td>
                    <Td className="font-medium text-slate-800">{m.full_name}</Td>
                    <Td>
                      <Badge tone={rankTone(m.rank_name)}>{m.rank_name ?? '—'}</Badge>
                    </Td>
                    <Td>
                      <MemberStatusBadge status={m.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{date(m.joined)}</Td>
                    {level > 1 && (
                      <Td className="text-xs text-slate-600">
                        {m.sponsor_name ?? '—'}
                        {m.sponsor_code && (
                          <span className="ml-1 font-mono text-[11px] text-slate-400">{m.sponsor_code}</span>
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
              <span>
                Page {page + 1} of {pages} · {num(filtered.length)} members
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
