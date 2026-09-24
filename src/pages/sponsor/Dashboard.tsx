import { Link } from 'react-router-dom'
import { BadgeCheck, Banknote, CalendarClock, Network, TrendingUp, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import {
  useMyDownline, useMyLedger, useMyWallet, useMyWithdrawals, useRankLadder,
  useSponsorProfile, useSponsorRates, INCOME_LABELS, inMonth, isCounted, netOf, rankProgress,
} from '@/lib/sponsor'
import { payoutCycle } from '@/lib/sponsor-crm'
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatTile, Table, Td, Th } from '@/components/ui'
import { KycBadge, RankBadge } from '@/components/status'
import { NetAmount, Notice, ProgressBar, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { date, money, moneyShort, num } from '@/lib/format'

/**
 * Module 1 — "Where do I stand today?" in five seconds, plus the one thing
 * that needs attention. Everything on this screen navigates; nothing writes.
 */
export function SponsorDashboard() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: member } = useSponsorProfile(me)
  const { data: wallet, isLoading: walletLoading } = useMyWallet(me)
  const { data: ledger = [], isLoading: ledgerLoading } = useMyLedger(me)
  const { data: downline = [] } = useMyDownline(me)
  const { data: withdrawals = [] } = useMyWithdrawals(me)
  const { data: ladder = [], isLoading: ladderLoading } = useRankLadder()
  const { data: rates } = useSponsorRates()
  const { data: kyc, isLoading: kycLoading } = useMyKyc(me)

  const person = member ?? profile
  const firstName = person?.full_name?.split(' ')[0] ?? 'there'
  const onHold = Boolean(person?.frozen) || person?.status === 'suspended'

  const credits = ledger.filter((l) => isCounted(l) && l.kind === 'credit')
  const thisMonth = netOf(credits.filter((l) => inMonth(l.created_at)))
  const recent = credits.slice(0, 5)

  const directs = downline.filter((d) => d.level === 1)
  const activeDirects = directs.filter((d) => d.status === 'active').length
  const activeTeam = downline.filter((d) => d.status === 'active').length

  // The office pays on a fortnight keyed to the day the member joined, so the
  // date they should be watching for is personal to them.
  const cycle = payoutCycle(person?.created_at)

  // The plan is the rank slab bought at joining (plan deck slide 5, "Rank
  // select choice only one time"), which is not the same thing as the rank
  // since qualified for -- a member can buy Crown and still be unranked.
  const plan = person?.plan_rank ?? null

  const progress = rankProgress(person, ladder, downline)
  const openWithdrawal = withdrawals.find((w) => w.status === 'requested' || w.status === 'approved')
  const hasBank = Boolean(person?.bank_account || person?.upi_id)

  const joinedRecently = downline.filter(
    (d) => new Date(d.joined).getTime() > Date.now() - 30 * 24 * 3600 * 1000,
  ).length
  const newest = [...downline]
    .sort((a, b) => (a.joined < b.joined ? 1 : -1))
    .slice(0, 5)

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your earnings, your team and what to do next."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {person?.rank?.name && <RankBadge name={person.rank.name} />}
            <Badge tone="neutral">{person?.member_code ?? '—'}</Badge>
            {/* Don't accuse a verified member of not having submitted KYC while
                the query is still in flight. */}
            {kycLoading ? null : kyc ? <KycBadge status={kyc.status} /> : <Badge tone="amber">KYC not submitted</Badge>}
          </div>
        }
      />

      {/* --- action alerts, highest priority first, at most three ---------- */}
      <div className="mb-5 space-y-2">
        {[
          onHold && (
            <Notice key="hold" tone="error" title="Your account is on hold.">
              Please contact the office. You can still view everything here.
            </Notice>
          ),
          !kycLoading && (!kyc || kyc.status === 'rejected') ? (
            <Notice key="kyc" tone="warn" title="Complete your KYC to unlock withdrawals." to="/sponsor/kyc" action="Go to KYC">
              {kyc?.status === 'rejected' && kyc.reject_reason
                ? `Your documents were not accepted: ${kyc.reject_reason}`
                : 'Payouts are released once the company verifies your identity.'}
            </Notice>
          ) : null,
          !member ? null : !hasBank ? (
            <Notice key="bank" tone="warn" title="Add your bank details to receive payouts." to="/sponsor/bank" action="Add details" />
          ) : null,
          openWithdrawal && (
            <Notice
              key="wd"
              tone="info"
              title={`Your withdrawal of ${money(openWithdrawal.amount)} is being processed.`}
              to="/sponsor/withdrawals"
              action="View"
            />
          ),
          kyc?.status === 'pending' && (
            <Notice key="kycp" tone="info" title="Your KYC is under review." >
              This usually takes 2–3 working days.
            </Notice>
          ),
          progress.next && progress.biggestGap && (
            <Notice
              key="rank"
              tone="info"
              title={`You need ${num(progress.biggestGap.required - progress.biggestGap.achieved)} more — ${progress.biggestGap.label} — to reach ${progress.next.name}.`}
              to="/sponsor/rank"
              action="See progress"
            />
          ),
        ]
          .filter(Boolean)
          .slice(0, 3)}
      </div>

      {/* --- summary tiles ------------------------------------------------- */}
      {walletLoading ? (
        <SkeletonTiles count={7} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
          <StatTile
            label="Wallet balance"
            value={money(wallet?.available ?? 0)}
            hint={wallet?.pending ? `${money(wallet.pending)} pending withdrawal` : 'Available now'}
            tone="green"
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatTile
            label="Income this month"
            value={money(thisMonth)}
            hint={`${money(wallet?.credited ?? 0)} lifetime`}
            tone="blue"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatTile
            label="Direct members"
            value={num(directs.length)}
            hint={`${num(activeDirects)} active`}
            tone="violet"
            icon={<Users className="h-4 w-4" />}
          />
          <StatTile
            label="Total team"
            value={num(downline.length)}
            hint={`${num(activeTeam)} active`}
            tone="amber"
            icon={<Network className="h-4 w-4" />}
          />
          <StatTile
            label="Current rank"
            value={person?.rank?.name ?? 'Unranked'}
            hint={
              ladderLoading || ladder.length === 0
                ? '—'
                : progress.next
                  ? `Next: ${progress.next.name}`
                  : 'Highest rank achieved'
            }
            tone="gold"
            icon={<Banknote className="h-4 w-4" />}
          />
          <StatTile
            label="Current plan"
            value={plan?.name ?? '—'}
            hint={
              plan
                ? plan.seniority === person?.rank?.seniority
                  ? 'Qualified at your plan'
                  : `Earning at ${person?.rank?.name ?? 'Unranked'}`
                : 'No plan on record'
            }
            tone="violet"
            icon={<BadgeCheck className="h-4 w-4" />}
          />
          <StatTile
            label="Next payout"
            value={cycle ? date(cycle.next) : '—'}
            hint={
              cycle
                ? cycle.daysAway === 0
                  ? 'Today'
                  : `In ${cycle.daysAway} day${cycle.daysAway === 1 ? '' : 's'}`
                : 'Join date unknown'
            }
            tone="blue"
            icon={<CalendarClock className="h-4 w-4" />}
          />
        </div>
      )}

      {/* --- payment cycle -------------------------------------------------
          Members ask "when do I get paid" more than anything else, so the rule
          is spelled out rather than left to the payout date alone. */}
      {cycle && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-start gap-4 px-5 py-4">
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment cycle</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                You joined on day {cycle.joinDay} — you are on the {cycle.cycle} cycle
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Members who join between the 1st and 15th are paid on the 15th of the following
                month; members who join between the 16th and the month end are paid on the 30th.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next payout</p>
              <p className="mt-1 text-lg font-semibold text-brand-700">{date(cycle.next)}</p>
              <p className="text-xs text-slate-500">
                {cycle.daysAway === 0 ? 'Due today' : `In ${cycle.daysAway} day${cycle.daysAway === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* --- rank progress strip ------------------------------------------- */}
      {progress.next && (
        <Link to="/sponsor/rank" className="mt-4 block">
          <Card className="transition hover:shadow">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm text-slate-700">
                Progress to <span className="font-semibold text-slate-900">{progress.next.name}</span>
              </p>
              <p className="text-sm font-semibold text-brand-700">{progress.percent}%</p>
            </div>
            <div className="px-5 pb-4">
              <ProgressBar percent={progress.percent} tone={progress.allMet ? 'green' : 'brand'} />
            </div>
          </Card>
        </Link>
      )}

      {/* --- recent income + team snapshot --------------------------------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent income"
            subtitle="Newest first"
            action={
              <Link to="/sponsor/income" className="text-xs font-medium text-brand-700 hover:underline">
                View all income
              </Link>
            }
          />
          {ledgerLoading ? (
            <SkeletonRows />
          ) : recent.length === 0 ? (
            <EmptyState
              title="No income yet"
              description="Your income will appear here once your first sale is confirmed."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-xs">{date(l.created_at)}</Td>
                    <Td>
                      <Badge tone={l.source === 'direct_income' ? 'green' : 'blue'}>
                        {INCOME_LABELS[l.source ?? ''] ?? l.source}
                        {l.level ? ` ${l.level}` : ''}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">{l.reference ?? '—'}</Td>
                    <Td className="text-right font-semibold tabular-nums">{money(l.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Team snapshot"
            subtitle={`${num(joinedRecently)} joined in the last 30 days`}
            action={
              <Link to="/sponsor/team" className="text-xs font-medium text-brand-700 hover:underline">
                View my team
              </Link>
            }
          />
          {newest.length === 0 ? (
            <EmptyState
              title="No team members yet"
              description="Share your referral link to start building your team."
              action={
                <Link to="/sponsor/refer" className="text-sm font-medium text-brand-700 hover:underline">
                  Refer a member
                </Link>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>ID</Th>
                  <Th className="text-right">Level</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {newest.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-800">{d.full_name}</Td>
                    <Td className="font-mono text-xs text-slate-500">{d.member_code}</Td>
                    <Td className="text-right">{d.level}</Td>
                    <Td className="whitespace-nowrap text-xs">{date(d.joined)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {rates && (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          Every income credit is shown as gross → deductions → net. TDS {rates.tds_pct}% and an admin
          charge of {rates.admin_pct}% are applied to each credit, as per company rules. Lifetime credited{' '}
          {moneyShort(wallet?.credited ?? 0)}.
        </p>
      )}
    </>
  )
}
