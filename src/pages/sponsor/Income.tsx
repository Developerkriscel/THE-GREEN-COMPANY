import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  useMyDownline, useMyLedger, useRankLadder, useSponsorProfile, useSponsorRates,
  inFinancialYear, inMonth, isCounted, levelSummary, netOf, type LedgerRow,
} from '@/lib/sponsor'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui'
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
        <LevelBreakdown
          summary={levelSummary(downline, ledger)}
          ledger={counted.filter((l) => l.source === 'level_income')}
          nameOf={nameOf}
          codeOf={codeOf}
          memberCode={member?.member_code ?? profile?.user_code ?? 'member'}
        />
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
              : // Before 29 Sep 2026 level income was paid per 100 sq yd; the
                // stored gross says which basis a row was paid on.
                Math.abs(Number(row.gross) - (Number(row.rate_applied) * Number(row.area_sqyd ?? 0)) / 100) < 0.01 && Number(row.area_sqyd ?? 0) > 0
                  ? `${money(row.rate_applied)}/100 sq yd`
                  : `${money(row.rate_applied)}/sq yd`}
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

/* ------------------------------------------------ level-wise breakdown */

/** The plan's level rates, as the income engine reads them (active rows only). */
function usePlanLevelRates() {
  return useQuery({
    queryKey: ['plan-level-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_levels').select('level, rate, sort_order').eq('is_active', true).order('sort_order')
      if (error) throw new Error(error.message)
      const m = new Map<number, number>()
      for (const r of (data ?? []) as { level: number; rate: number }[]) if (!m.has(Number(r.level))) m.set(Number(r.level), Number(r.rate))
      return m
    },
  })
}

function LevelBreakdown({ summary, ledger, nameOf, codeOf, memberCode }: {
  summary: { level: number; members: number; active: number; income: number }[]
  ledger: LedgerRow[]
  nameOf: (id: string | null) => string
  codeOf: (id: string | null) => string
  memberCode: string
}) {
  const { data: rates } = usePlanLevelRates()
  const [busy, setBusy] = useState(false)
  const areaBy = new Map<number, number>()
  for (const l of ledger) if (l.level) areaBy.set(l.level, (areaBy.get(l.level) ?? 0) + Number(l.area_sqyd ?? 0))
  const rows = summary.map((s) => ({ ...s, rate: rates?.get(s.level) ?? 0, area: areaBy.get(s.level) ?? 0 }))
  const totals = rows.reduce((t, r) => ({ area: t.area + r.area, income: t.income + r.income, members: t.members + r.members }), { area: 0, income: 0, members: 0 })

  async function exportExcel() {
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const sheet1 = XLSX.utils.json_to_sheet(rows.map((r) => ({
        Level: r.level, 'Rate (₹ per sq yd)': r.rate, Members: r.members, Active: r.active,
        'Downline sq yd': r.area, 'Level income (net ₹)': Math.round(r.income * 100) / 100,
      })))
      XLSX.utils.book_append_sheet(wb, sheet1, 'Level-wise')
      const sheet2 = XLSX.utils.json_to_sheet(ledger.map((l) => ({
        Date: l.created_at.slice(0, 10), Level: l.level, 'From member': nameOf(l.from_member_id), 'Member ID': codeOf(l.from_member_id),
        Sale: l.reference, 'Area sq yd': Number(l.area_sqyd ?? 0), Rate: Number(l.rate_applied ?? 0),
        Gross: Number(l.gross), TDS: Number(l.tds), 'Admin charge': Number(l.admin_charge), Net: Number(l.net),
      })))
      XLSX.utils.book_append_sheet(wb, sheet2, 'Entries')
      XLSX.writeFile(wb, `level-income-${memberCode}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Level-wise breakdown"
        subtitle="Every level of your team: the plan rate, the area sold there and what it earned you"
        action={<Button size="sm" variant="outline" loading={busy} onClick={() => void exportExcel()}><Download className="h-4 w-4" /> Export Excel</Button>}
      />
      <Table>
        <thead>
          <tr><Th>Level</Th><Th className="text-right">Rate (₹ / sq yd)</Th><Th className="text-right">Members</Th><Th className="text-right">Downline sq yd</Th><Th className="text-right">Level income (net)</Th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level} className={r.income > 0 ? '' : 'text-slate-400'}>
              <Td className="font-medium">Level {r.level}</Td>
              <Td className="text-right">{r.rate ? num(r.rate) : '—'}</Td>
              <Td className="text-right">{num(r.members)} <span className="text-xs text-slate-400">({num(r.active)} active)</span></Td>
              <Td className="text-right">{num(r.area)}</Td>
              <Td className="text-right font-semibold">{money(r.income)}</Td>
            </tr>
          ))}
          <tr className="bg-brand-gold/[0.06] font-semibold">
            <Td>Total</Td><Td /><Td className="text-right">{num(totals.members)}</Td><Td className="text-right">{num(totals.area)}</Td><Td className="text-right">{money(totals.income)}</Td>
          </tr>
        </tbody>
      </Table>
    </Card>
  )
}
