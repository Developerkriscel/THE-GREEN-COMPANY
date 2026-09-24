import { useAuth } from '@/context/AuthContext'
import { useRankHistory } from '@/lib/queries'
import {
  useMyDownline, useMySales, useRankLadder, useSponsorProfile,
  confirmedArea, legsOf, rankProgress,
} from '@/lib/sponsor'
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from '@/components/ui'
import { ProgressBar, RequirementRow, SkeletonRows } from '@/components/sponsor'
import { date, money, num, pct } from '@/lib/format'

/**
 * Module 7 — "what do I need for the next rank?", answered without a phone call.
 *
 * Every requirement shows achieved AND required as numbers; the bar is support,
 * not the message. Leg conditions are broken out per leg with the direct member
 * who heads each one, because the member has to know which branch to work on.
 */
export function SponsorRank() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: member, isLoading } = useSponsorProfile(me)
  const { data: downline = [] } = useMyDownline(me)
  const { data: ladder = [], isLoading: ladderLoading } = useRankLadder()
  const { data: sales = [] } = useMySales(me)
  const { data: history = [] } = useRankHistory(me)

  const progress = rankProgress(member, ladder, downline)
  const current = member?.rank
  const area = confirmedArea(sales)
  const legs = legsOf(downline)
  const needSen = progress.next?.req_rank_sen ?? 0
  const needLegs = progress.next?.req_legs ?? 0

  // Wait for the ladder too: with an empty ladder there is no "next rank", and
  // rendering that state early tells the member they are at the top when they
  // are not.
  if (isLoading || ladderLoading || ladder.length === 0) {
    return (
      <>
        <PageHeader title="Rank & Progress" description="Where you stand, and exactly what the next rank needs." />
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Rank & Progress" description="Where you stand, and exactly what the next rank needs." />

      {/* --- what the current rank buys ----------------------------------- */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current rank</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">{current?.name ?? '—'}</p>
            <p className="mt-1 text-xs text-slate-500">Member since {date(member?.created_at)}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <Unlock label="Direct commission" value={pct(current?.own_sale_rate ?? 0)} />
            <Unlock label="Level income" value="To level 12" />
            <Unlock
              label="Monthly salary"
              value={(current?.salary ?? 0) > 0 ? money(current?.salary ?? 0) : 'Not yet'}
            />
            <Unlock label="Reward tier" value={current?.reward_title ?? 'None yet'} />
          </div>
        </div>
      </Card>

      {/* --- next-rank checklist ------------------------------------------ */}
      {!progress.next ? (
        <Card className="mb-5">
          <div className="p-5">
            <Badge tone="gold">Highest rank achieved</Badge>
            <p className="mt-2 text-sm text-slate-700">
              You are at {current?.name}, the top of the ladder. There is nothing left to qualify for.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="mb-5">
          <CardHeader
            title={`What ${progress.next.name} needs`}
            subtitle={`You are ${progress.percent}% of the way there`}
            action={<Badge tone={progress.allMet ? 'green' : 'amber'}>{progress.allMet ? 'All met' : 'In progress'}</Badge>}
          />
          <div className="px-5 pt-4">
            <ProgressBar percent={progress.percent} tone={progress.allMet ? 'green' : 'brand'} />
          </div>
          <div className="divide-y divide-slate-100 px-5 pb-2">
            {progress.requirements.map((r) => (
              <RequirementRow key={r.label} {...r} />
            ))}
          </div>

          {/* Leg conditions, one row per leg — a combined number is useless here. */}
          {needLegs > 0 && legs.length > 0 && (
            <div className="border-t border-slate-200 px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your legs — {needLegs} must carry a qualified leader
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {legs.map(({ head, branch }, i) => {
                  const qualified =
                    (head.rank_seniority ?? 0) >= needSen ||
                    branch.some((m) => (m.rank_seniority ?? 0) >= needSen)
                  return (
                    <div
                      key={head.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                        qualified ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">Leg {i + 1}</span>
                        <span className="ml-1 text-slate-600">{head.full_name}</span>
                        <span className="ml-1 font-mono text-[11px] text-slate-400">{head.member_code}</span>
                      </span>
                      <span className={qualified ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                        {num(branch.length + 1)} deep {qualified ? '✓' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            {progress.allMet ? (
              <p className="text-sm font-medium text-emerald-800">
                All requirements met. Your rank will be updated in the next review.
              </p>
            ) : progress.biggestGap ? (
              <p className="text-sm text-slate-700">
                You’re closest on <strong>{progress.biggestGap.label}</strong>. You need{' '}
                <strong>{num(progress.biggestGap.required - progress.biggestGap.achieved)} more</strong> to
                qualify for {progress.next.name}.
              </p>
            ) : (
              <p className="text-sm text-slate-700">Start by adding your first direct member.</p>
            )}
          </div>
        </Card>
      )}

      {/* --- the whole journey -------------------------------------------- */}
      <Card>
        <CardHeader title="The rank ladder" subtitle="Every rank, what it requires and what it pays" />
        <Table>
          <thead>
            <tr>
              <Th>Rank</Th>
              <Th className="text-right">Direct rate</Th>
              <Th>Qualification</Th>
              <Th className="text-right">Salary</Th>
              <Th>Reward</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((r) => {
              const isCurrent = r.id === current?.id
              const passed = (current?.seniority ?? 0) > r.seniority
              return (
                <tr key={r.id} className={isCurrent ? 'bg-brand-50' : 'hover:bg-slate-50'}>
                  <Td className="font-medium text-slate-800">{r.name}</Td>
                  <Td className="text-right tabular-nums">{pct(r.own_sale_rate)}</Td>
                  <Td className="text-xs text-slate-600">
                    {(r.req_direct ?? 0) > 0
                      ? `${r.req_direct} direct · ${r.req_team} group${
                          (r.req_rank_count ?? 0) > 0
                            ? ` · ${r.req_rank_count} ${
                                ladder.find((x) => x.seniority === r.req_rank_sen)?.name ?? 'qualified'
                              }`
                            : ''
                        }${(r.req_legs ?? 0) > 0 ? ` · ${r.req_legs} legs` : ''}`
                      : 'Entry rank'}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {(r.salary ?? 0) > 0 ? money(r.salary ?? 0) : '—'}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {r.reward_title ? `${r.reward_title} · ${num(r.reward_sqyd ?? 0)} sq yd` : '—'}
                  </Td>
                  <Td>
                    {isCurrent ? (
                      <Badge tone="gold">Current</Badge>
                    ) : passed ? (
                      <Badge tone="green">Achieved</Badge>
                    ) : (
                      <Badge tone="neutral">Ahead</Badge>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>

      {/* Your record of every promotion — and the evidence if a rate is queried. */}
      <Card className="mt-6">
        <CardHeader title="Rank history" subtitle="Every rank you have reached, with the date" />
        {history.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">
            No rank changes recorded yet. Your first promotion will appear here.
          </div>
        ) : (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>From</Th><Th>To</Th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{date(h.created_at)}</Td>
                  <Td className="text-xs text-slate-500">{h.from_rank?.name ?? '—'}</Td>
                  <Td><Badge tone="gold">{h.to_rank?.name ?? '—'}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        These counts come from the same records as My Team and My Sales — {num(downline.length)} team
        members and {num(area)} sq yd of confirmed personal sales. Your rank is set by the company.
      </p>
    </>
  )
}

function Unlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value}</p>
    </div>
  )
}
