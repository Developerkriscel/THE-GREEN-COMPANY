import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  useMyDownline, useMyLedger, useRankLadder, useSponsorProfile, useSponsorRates,
  inFinancialYear, inMonth, isCounted, levelSummary, netOf, type LedgerRow,
} from '@/lib/sponsor'
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui'
import { Area, NetAmount, SkeletonRows } from '@/components/sponsor'
import { date, money, num, pct } from '@/lib/format'

/**
 * Module 3 — why the member was paid. The Wallet shows money moving; this
 * shows the reason behind every rupee.
 *
 * A downline member's own earnings are never shown here. What a member sees is
 * their OWN income that arose from a downline sale — the seller's name and the
 * sale reference, never the seller's money.
 */

// 'Sponsor' is deliberately absent: the rank override is not paid alongside
// level income (it would pay the upline twice on one sale), so a Sponsor tab
// could only ever be empty. Re-add it if the override is implemented as a
// rank differential.
const TABS = ['Direct', 'Level', 'Salary', 'Rewards'] as const
type TabName = (typeof TABS)[number]

const SOURCE_FOR: Record<TabName, string> = {
  Direct: 'direct_income',
  Level: 'level_income',
  Salary: 'salary',
  Rewards: 'reward',
}

/**
 * `initialTab` lets the nav point straight at one income type. Direct and
 * Level get their own entries because that is how a member thinks about them
 * -- "what did I earn on my own sale" is a different question from "what did
 * my team earn me" -- while the tabs keep both reachable from either screen.
 */
export function SponsorIncome({ initialTab = 'Direct' }: { initialTab?: TabName } = {}) {
  const { profile } = useAuth()
  const me = profile?.id
  const [tab, setTab] = useState<TabName>(initialTab)

  const { data: member } = useSponsorProfile(me)
  const { data: ledger = [], isLoading } = useMyLedger(me)
  const { data: downline = [] } = useMyDownline(me)
  const { data: ladder = [] } = useRankLadder()
  const { data: rates } = useSponsorRates()

  const credits = useMemo(() => ledger.filter((l) => l.kind === 'credit'), [ledger])
  const counted = credits.filter(isCounted)

  const lifetime = netOf(counted)
  const month = netOf(counted.filter((l) => inMonth(l.created_at)))
  const year = netOf(counted.filter((l) => inFinancialYear(l.created_at)))

  const rows = credits.filter((l) => l.source === SOURCE_FOR[tab])
  const tabTotal = netOf(rows.filter(isCounted))

  const nameOf = (id: string | null) =>
    downline.find((d) => d.id === id)?.full_name ?? '—'
  const codeOf = (id: string | null) =>
    downline.find((d) => d.id === id)?.member_code ?? ''

  const salaryRank = ladder.find((r) => (r.salary ?? 0) > 0)
  const mySalary = member?.rank?.salary ?? 0

  return (
    <>
      <PageHeader
        title="Income"
        description="Every rupee you earned, grouped by what produced it."
      />

      {/* --- always net, never gross ------------------------------------- */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lifetime earned (net)</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{money(lifetime)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This month (net)</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{money(month)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This financial year (net)</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{money(year)}</p>
          </div>
        </Card>
      </div>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const n = credits.filter((l) => l.source === SOURCE_FOR[t]).length
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
              {n > 0 && <span className="ml-1.5 text-xs text-slate-400">{n}</span>}
            </button>
          )
        })}
      </div>

      {/* --- level summary sits above the level list ---------------------- */}
      {tab === 'Level' && (
        <Card className="mb-5">
          <CardHeader
            title="Income by level"
            subtitle="All twelve levels, so you can see how deep your income currently reaches"
          />
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 lg:grid-cols-6">
            {levelSummary(downline, ledger).map((l) => (
              <div key={l.level} className={`bg-white p-4 ${l.income > 0 ? '' : 'opacity-60'}`}>
                <p className="text-xs font-medium text-slate-400">Level {l.level}</p>
                <p className="text-sm font-bold text-slate-800">{money(l.income)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {num(l.members)} member{l.members === 1 ? '' : 's'} · {num(l.active)} active
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`${tab} income`}
          subtitle={`${num(rows.length)} entr${rows.length === 1 ? 'y' : 'ies'} · ${money(tabTotal)} net`}
        />

        {isLoading ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyTab tab={tab} salaryRankName={salaryRank?.name} qualifies={mySalary > 0} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                {tab === 'Level' && <Th>Level</Th>}
                {tab === 'Level' && <Th>From member</Th>}
                {(tab === 'Direct' || tab === 'Level') && <Th>Sale</Th>}
                {(tab === 'Direct' || tab === 'Level') && <Th className="text-right">Area</Th>}
                {(tab === 'Direct' || tab === 'Level') && <Th className="text-right">Rate</Th>}
                {tab === 'Salary' && <Th>Month</Th>}
                {tab === 'Rewards' && <Th>Reward</Th>}
                <Th className="text-right">Gross → net</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <IncomeRow
                  key={l.id}
                  row={l}
                  tab={tab}
                  rates={rates}
                  fromName={nameOf(l.from_member_id)}
                  fromCode={codeOf(l.from_member_id)}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Every entry here matches exactly one wallet transaction. Reversed entries stay visible, struck
        through, and are excluded from every total.{' '}
        <Link to="/sponsor/wallet" className="font-medium text-brand-700 hover:underline">
          Open My Wallet
        </Link>
      </p>
    </>
  )
}

function IncomeRow({
  row,
  tab,
  rates,
  fromName,
  fromCode,
}: {
  row: LedgerRow
  tab: TabName
  rates?: { tds_pct: number; admin_pct: number }
  fromName: string
  fromCode: string
}) {
  const reversed = row.status === 'reversed'
  return (
    <tr className={`hover:bg-slate-50 ${reversed ? 'opacity-60' : ''}`}>
      <Td className="whitespace-nowrap text-xs">{date(row.created_at)}</Td>

      {tab === 'Level' && (
        <Td>
          <Badge tone="blue">Level {row.level}</Badge>
        </Td>
      )}
      {tab === 'Level' && (
        <Td className="text-xs">
          <span className="font-medium text-slate-800">{fromName}</span>
          {fromCode && <span className="ml-1 font-mono text-slate-400">{fromCode}</span>}
        </Td>
      )}

      {(tab === 'Direct' || tab === 'Level') && (
        <Td className="font-mono text-xs text-slate-600">{row.reference ?? '—'}</Td>
      )}
      {(tab === 'Direct' || tab === 'Level') && (
        <Td className="text-right text-xs">
          <Area value={row.area_sqyd} />
        </Td>
      )}
      {(tab === 'Direct' || tab === 'Level') && (
        <Td className="text-right text-xs text-slate-600">
          {row.rate_applied === null
            ? '—'
            : tab === 'Direct'
              ? pct(row.rate_applied)
              : `${money(row.rate_applied)}/100 sq yd`}
        </Td>
      )}

      {tab === 'Salary' && <Td className="text-xs">{row.reference?.replace('SALARY-', '') ?? '—'}</Td>}
      {tab === 'Rewards' && <Td className="text-xs">{row.note ?? row.reference ?? '—'}</Td>}

      <Td>
        <NetAmount row={row} rates={rates} />
      </Td>
      <Td>
        {reversed ? (
          <Badge tone="red">Reversed</Badge>
        ) : row.in_kind ? (
          <Badge tone="amber">Awarded in kind</Badge>
        ) : (
          <Badge tone="green">Credited</Badge>
        )}
      </Td>
    </tr>
  )
}

/** An empty tab explains what would fill it, rather than showing nothing. */
function EmptyTab({
  tab,
  salaryRankName,
  qualifies,
}: {
  tab: TabName
  salaryRankName?: string
  qualifies: boolean
}) {
  if (tab === 'Salary' && !qualifies) {
    return (
      <EmptyState
        title="Your rank does not include a salary yet"
        description={`A fixed monthly salary starts at ${salaryRankName ?? 'the senior ranks'}. Keep building your team to qualify.`}
        action={
          <Link to="/sponsor/rank" className="text-sm font-medium text-brand-700 hover:underline">
            See what the next rank needs
          </Link>
        }
      />
    )
  }
  const copy: Record<TabName, string> = {
    Direct: 'Direct income appears here when a plot you sold personally is confirmed.',
    Level: 'Level income appears here when a member in your team makes a sale.',
    Salary: 'Your monthly salary will appear here each month you qualify.',
    Rewards: 'Reward income appears here when you unlock a reward tier.',
  }
  return <EmptyState title={`No ${tab.toLowerCase()} income yet`} description={copy[tab]} />
}
