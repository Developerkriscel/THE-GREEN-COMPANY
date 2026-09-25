import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, CheckCircle2, ChevronRight, Mail, Plus, RefreshCw, Trophy, Wallet, X,
} from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageHeader,
  Select, Spinner, StatTile, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import {
  useMemberByCode, useMembers, useCommissions, useSales, useBookings, useLeads, useMyKyc,
  useCmsContent, useSiteSetting, useMemberLedger, useMemberWithdrawals,
  useAddLedgerEntry, useAddWithdrawal, useUpdateWithdrawal, useSetMemberFrozen,
  useSaveWelcomeLetter, useRecalculateMember, useDistributeIncome, useReverseIncome,
  useMemberWallet, useRankReview, useRankHistory, useMemberAudit,
} from '@/lib/queries'
import { buildForest, findNode, rankTone, statusTone } from '@/lib/network'
import {
  useRankLadder, useSponsorRates, downlineFromMembers, isCounted, levelSummary,
  netOf, rankProgress, rewardTiers, walletFrom,
  type LedgerRow, type WithdrawalRow,
} from '@/lib/sponsor'
import { rewardReference, useAwardReward, useIssuedRewards, useMyRewardArea } from '@/lib/sponsor-crm'
import { RewardArt } from '@/components/RewardArt'
import { ProgressBar, RequirementRow, WithdrawalBadge } from '@/components/sponsor'
import { WELCOME_DEFAULTS } from '@/lib/welcome-letter'
import { date, money, num, pct } from '@/lib/format'
import type { MemberNode, Profile } from '@/lib/types'

const TABS = ['Overview', 'Income', 'Withdrawals', 'Credit / Debit', 'Reports', 'Rank', 'Rewards', 'Team', 'Tree View', 'Sales', 'Leads', 'KYC', 'History'] as const
type TabName = typeof TABS[number]

export function AdminMemberDetail() {
  const { code } = useParams<{ code: string }>()
  const { data: member, isLoading, error } = useMemberByCode(code)
  const [tab, setTab] = useState<TabName>('Overview')
  const [modal, setModal] = useState<null | 'credit' | 'withdrawal'>(null)
  const letterRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  const recalc = useRecalculateMember()
  const rankReview = useRankReview()
  const setFrozen = useSetMemberFrozen()

  const { data: members = [] } = useMembers()
  const { data: commissions = [] } = useCommissions({ repId: member?.id })
  const { data: ledger = [] } = useMemberLedger(member?.id)
  const { data: withdrawals = [] } = useMemberWithdrawals(member?.id)
  const { data: serverWallet } = useMemberWallet(member?.id)

  if (isLoading) return <Spinner label="Loading member…" />
  if (error) return <ErrorState error={error} />
  if (!member) return <EmptyState title="Member not found" description={`No member with code ${code}.`} action={<Link to="/admin/members" className="text-sm text-brand-700 hover:underline">Back to members</Link>} />

  // ---- financials -----------------------------------------------------------
  // Same formula as app.member_balance() in SQL and as the member's own wallet.
  const typedLedger = ledger as unknown as LedgerRow[]
  const typedWithdrawals = withdrawals as unknown as WithdrawalRow[]
  // One balance formula, server-side. walletFrom() is the fallback for the
  // first render only, so the tiles are never blank while the RPC is in flight.
  const wallet = serverWallet ?? walletFrom(typedLedger, typedWithdrawals)
  const bySource = (source: string) =>
    netOf(typedLedger.filter((l) => l.source === source))
  const directIncome = bySource('direct_income')
  const levelIncome = bySource('level_income')
  const salaryIncome = bySource('salary')
  const rewardIncome = bySource('reward')
  const pendingIncome = commissions
    .filter((c) => c.status === 'accrued' || c.status === 'approved')
    .reduce((s, c) => s + Number(c.net_amount), 0)

  const joinDay = new Date(member.created_at).getDate()
  const cycle = joinDay <= 15 ? '1–15' : '16–30'

  return (
    <div>
      <Link to="/admin/members" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Back to members
      </Link>

      <PageHeader
        title={member.full_name || '—'}
        description={`${member.member_code} · ${member.rank?.name ?? '—'} · joined ${date(member.created_at)} · next payout cycle ${cycle}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => letterRef.current?.scrollIntoView({ behavior: 'smooth' })}>
              <Mail className="h-4 w-4" /> Welcome Letter
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal('credit')}>
              <Plus className="h-4 w-4" /> Add Credit
            </Button>
            <Button size="sm" onClick={() => setModal('withdrawal')}>
              <Wallet className="h-4 w-4" /> Add Withdrawal
            </Button>
            <Button variant="outline" size="sm" loading={recalc.isPending}
              onClick={() => recalc.mutate(member.id, { onSuccess: () => toast.push('success', 'Recalculated'), onError: (e) => toast.push('error', (e as Error).message) })}>
              <RefreshCw className="h-4 w-4" /> Reset &amp; Recalculate
            </Button>
            <Button variant="outline" size="sm" loading={rankReview.isPending}
              onClick={() => rankReview.mutate(member.id, {
                onSuccess: (r) => toast.push(r ? 'success' : 'info', r ? `Promoted to ${r}` : 'No promotion — requirements not met yet'),
                onError: (e) => toast.push('error', (e as Error).message),
              })}>
              <Trophy className="h-4 w-4" /> Rank review
            </Button>
            <Button variant={member.frozen ? 'secondary' : 'danger'} size="sm"
              onClick={() => setFrozen.mutate({ id: member.id, frozen: !member.frozen, code },
                { onSuccess: () => toast.push('success', member.frozen ? 'Account unfrozen' : 'Account frozen'), onError: (e) => toast.push('error', (e as Error).message) })}>
              {member.frozen ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              {member.frozen ? 'Unfreeze' : 'Freeze'}
            </Button>
          </div>
        }
      />

      {/* stat tiles */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Available" value={money(wallet.available)} tone="green" />
        <StatTile
          label="Credited (net)"
          value={money(wallet.credited)}
          hint={`Direct ${money(directIncome)} · Level ${money(levelIncome)}`}
          tone="blue"
        />
        <StatTile label="Pending" value={money(pendingIncome)} tone="amber" />
        <StatTile
          label="Paid out"
          value={money(wallet.withdrawn)}
          hint={`Req. pending ${money(wallet.pending)}`}
        />
        <StatTile label="Team" value={num(member.team_count)} hint={`Direct ${member.direct_count}`} tone="violet" />
      </div>

      {/* tabs */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="mb-8">
        {tab === 'Overview' && <OverviewTab member={member} cycle={cycle} />}
        {tab === 'Income' && (
          <IncomeTab
            ledger={typedLedger}
            members={members}
            memberId={member.id}
            direct={directIncome}
            level={levelIncome}
            salary={salaryIncome}
            reward={rewardIncome}
            pendingIncome={pendingIncome}
            credited={wallet.credited}
            available={wallet.available}
          />
        )}
        {tab === 'Withdrawals' && (
          <WithdrawalsTab member={member} withdrawals={typedWithdrawals} onAdd={() => setModal('withdrawal')} />
        )}
        {tab === 'Credit / Debit' && <LedgerTab ledger={ledger} />}
        {tab === 'Reports' && <ReportsTab ledger={ledger} />}
        {tab === 'Rank' && <RankTab member={member} members={members} />}
        {tab === 'Rewards' && <RewardsTab member={member} />}
        {tab === 'Team' && <TeamTab member={member} members={members} />}
        {tab === 'Tree View' && <TreeTab member={member} members={members} />}
        {tab === 'Sales' && <SalesTab member={member} ledger={typedLedger} />}
        {tab === 'Leads' && <LeadsTab member={member} />}
        {tab === 'KYC' && <KycTab member={member} />}
        {tab === 'History' && <HistoryTab member={member} />}
      </div>

      <div ref={letterRef}>
        <WelcomeLetterEditor member={member} code={code} />
      </div>

      {modal === 'credit' && <CreditModal member={member} onClose={() => setModal(null)} />}
      {modal === 'withdrawal' && <WithdrawalModal member={member} available={wallet.available} onClose={() => setModal(null)} />}
    </div>
  )
}

/* --------------------------------------------------------------- Overview */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{children}</p>
    </div>
  )
}

function OverviewTab({ member, cycle }: { member: Profile; cycle: string }) {
  const { data: kyc } = useMyKyc(member.id)
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Profile" />
        <div className="grid sm:grid-cols-2">
          <Row label="Sponsor ID">{member.member_code}</Row>
          <Row label="Full name">{member.full_name || '—'}</Row>
          <Row label="Email">{member.email ?? '—'}</Row>
          <Row label="Phone">{member.phone ?? '—'}</Row>
          <Row label="Referrer Sponsor ID">{member.referrer?.member_code ?? '—'}</Row>
          <Row label="Placement ID">{member.placement_parent?.member_code ?? '—'}</Row>
          <Row label="Current rank / plan">{member.rank?.name ?? '—'}</Row>
          <Row label="Status"><Badge tone={statusTone(member.status)}>{member.status}</Badge></Row>
          <Row label="Joined">{date(member.created_at)}</Row>
          <Row label="KYC">
            {kyc
              ? <Badge tone={kyc.status === 'verified' ? 'green' : kyc.status === 'rejected' ? 'red' : 'amber'}>{kyc.status}</Badge>
              : 'Not submitted'}
          </Row>
          <Row label="Payout account">
            {member.bank_account
              ? `${member.bank_name ?? 'Bank'} •••• ${member.bank_account.slice(-4)}`
              : member.upi_id ?? 'Not added'}
          </Row>
          <Row label="Payout cycle">{cycle} (joined day {new Date(member.created_at).getDate()})</Row>
          <Row label="Next payout">{cycle === '1–15' ? '15th of next cycle' : '30th of next cycle'}</Row>
        </div>
      </Card>
      <Card>
        <CardHeader title="Freeze / Compliance" />
        <div className="p-5">
          {member.frozen
            ? <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><Ban className="h-4 w-4" /> This account is frozen. Withdrawals are blocked.</div>
            : <p className="text-sm text-slate-500">Account is in good standing. No active freeze.</p>}
        </div>
      </Card>
    </div>
  )
}

/* ----------------------------------------------------------------- Income */

function IncomeTab({
  ledger, members, memberId, direct, level, salary, reward, pendingIncome, credited, available,
}: {
  ledger: LedgerRow[]
  members: Profile[]
  memberId: string
  direct: number
  level: number
  salary: number
  reward: number
  pendingIncome: number
  credited: number
  available: number
}) {
  const { data: rates } = useSponsorRates()
  const downline = useMemo(() => downlineFromMembers(members, memberId), [members, memberId])
  const levels = useMemo(() => levelSummary(downline, ledger), [downline, ledger])
  const credits = ledger.filter((l) => l.kind === 'credit')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label="Direct income" value={money(direct)} hint="Own confirmed sales" tone="green" />
        <StatTile
          label="Level income"
          value={money(level)}
          hint={`${num(credits.filter((l) => l.source === 'level_income').length)} credits from the team`}
          tone="blue"
        />
        <StatTile label="Pending income" value={money(pendingIncome)} hint="Awaiting confirmation" tone="amber" />
        <StatTile label="Salary + rewards" value={money(salary + reward)} hint={`Salary ${money(salary)}`} tone="violet" />
        <StatTile label="Total credited (net)" value={money(credited)} hint="Lifetime, after deductions" />
        <StatTile label="Withdrawable" value={money(available)} tone="green" />
      </div>

      <Card>
        <CardHeader
          title="Level income split"
          subtitle={
            rates
              ? `Earned per level, net of TDS ${rates.tds_pct}% and admin ${rates.admin_pct}%`
              : 'Earned per level across the team'
          }
        />
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-6">
          {levels.map((l) => (
            <div key={l.level} className={`bg-white p-4 ${l.income > 0 ? '' : 'opacity-60'}`}>
              <p className="text-xs font-medium text-slate-400">Level {l.level}</p>
              <p className="text-sm font-bold text-slate-800">{money(l.income)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {num(l.members)} member{l.members === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Income entries" subtitle="Every credit, with its full breakdown" />
        {credits.length === 0 ? (
          <EmptyState title="No income yet" description="Income appears once a sale is confirmed and distributed." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th>Type</Th><Th>Reference</Th>
                <Th className="text-right">Gross</Th><Th className="text-right">TDS</Th>
                <Th className="text-right">Admin</Th><Th className="text-right">Net</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {credits.map((l) => (
                <tr key={l.id} className={`hover:bg-slate-50 ${l.status === 'reversed' ? 'opacity-60' : ''}`}>
                  <Td className="whitespace-nowrap text-xs">{date(l.created_at)}</Td>
                  <Td>
                    <Badge tone={l.source === 'direct_income' ? 'green' : 'blue'}>
                      {(l.source ?? '').replace(/_/g, ' ')}{l.level ? ` L${l.level}` : ''}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs text-slate-600">{l.reference ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{money(l.gross)}</Td>
                  <Td className="text-right tabular-nums text-slate-500">−{money(l.tds)}</Td>
                  <Td className="text-right tabular-nums text-slate-500">−{money(l.admin_charge)}</Td>
                  <Td className="text-right font-semibold tabular-nums">{money(l.net)}</Td>
                  <Td>
                    {l.status === 'reversed'
                      ? <Badge tone="red">Reversed</Badge>
                      : <Badge tone="green">Credited</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------ Withdrawals */

/**
 * The company side of the payout flow the member sees under Withdrawals.
 * Approving, paying and rejecting here is what moves their request forward — a
 * rejection cannot be saved without a reason, because the member is always told why.
 */
function WithdrawalsTab({
  member, withdrawals, onAdd,
}: {
  member: Profile
  withdrawals: WithdrawalRow[]
  onAdd: () => void
}) {
  const update = useUpdateWithdrawal()
  const toast = useToast()
  const [rejecting, setRejecting] = useState<WithdrawalRow | null>(null)
  const [paying, setPaying] = useState<WithdrawalRow | null>(null)
  const [reason, setReason] = useState('')
  const [utr, setUtr] = useState('')

  const act = (w: WithdrawalRow, status: 'approved' | 'paid', extra?: Record<string, string>) =>
    update.mutate(
      { id: w.id, member_id: member.id, status, ...extra },
      {
        onSuccess: () => toast.push('success', `Withdrawal ${status}`),
        onError: (e) => toast.push('error', (e as Error).message),
      },
    )

  return (
    <>
      <Card>
        <CardHeader
          title="Withdrawal requests"
          subtitle="Members request payouts from their own panel; decisions are made here"
          action={<Button size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add Withdrawal</Button>}
        />
        {withdrawals.length === 0 ? (
          <EmptyState title="No withdrawals yet" description="Requests the member makes will appear here for review." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ref</Th><Th>Requested</Th><Th>A/C</Th>
                <Th className="text-right">Amount</Th><Th>UTR</Th><Th>Status</Th><Th />
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{w.id.slice(0, 8)}</Td>
                  <Td className="whitespace-nowrap text-xs">{date(w.requested_at)}</Td>
                  <Td className="text-xs">{w.account ?? '—'}</Td>
                  <Td className="text-right font-medium">{money(w.amount)}</Td>
                  <Td className="text-xs">{w.utr ?? w.payout_reference ?? '—'}</Td>
                  <Td>
                    <WithdrawalBadge status={w.status} />
                    {w.reject_reason && <p className="mt-1 text-[11px] text-red-700">{w.reject_reason}</p>}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {w.status === 'requested' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => act(w, 'approved')}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={() => { setRejecting(w); setReason('') }}>Reject</Button>
                        </>
                      )}
                      {w.status === 'approved' && (
                        <>
                          <Button size="sm" onClick={() => { setPaying(w); setUtr('') }}>Mark paid</Button>
                          <Button size="sm" variant="danger" onClick={() => { setRejecting(w); setReason('') }}>Reject</Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Record this payment"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button
              loading={update.isPending}
              onClick={() => {
                if (!paying || !utr.trim()) return
                act(paying, 'paid', { payout_reference: utr.trim(), utr: utr.trim() })
                setPaying(null)
              }}
            >
              Mark as paid
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Paying <strong>{money(paying?.amount ?? 0)}</strong> to {paying?.account ?? '—'}. The member sees
          this reference against the payout, and the amount moves from “pending” to “withdrawn”.
        </p>
        <Field label="Payment reference (UTR)" required>
          <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR…" />
        </Field>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this withdrawal"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={() => {
                if (!rejecting) return
                update.mutate(
                  { id: rejecting.id, member_id: member.id, status: 'rejected', reject_reason: reason },
                  {
                    onSuccess: () => { toast.push('success', 'Withdrawal rejected'); setRejecting(null) },
                    onError: (e) => toast.push('error', (e as Error).message),
                  },
                )
              }}
            >
              Reject and notify
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          The member sees this reason on their Withdrawals screen, and the held amount returns to
          their available balance.
        </p>
        <Field label="Reason" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

/* ---------------------------------------------------------- Credit / Debit */

function LedgerTab({ ledger }: { ledger: import('@/lib/queries').LedgerEntry[] }) {
  return (
    <Card>
      <CardHeader title="Credit / Debit ledger" />
      {ledger.length === 0 ? (
        <EmptyState title="No transactions yet" />
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Type</Th><Th>Source</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <Td className="text-xs">{date(l.created_at)}</Td>
                <Td><Badge tone={l.kind === 'credit' ? 'green' : 'red'}>{l.kind}</Badge></Td>
                <Td>{l.source ?? '—'}</Td>
                <Td>{l.reference ?? '—'}</Td>
                <Td className={`text-right font-medium ${l.kind === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>{l.kind === 'credit' ? '+' : '−'}{money(l.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- Reports */

function ReportsTab({ ledger }: { ledger: import('@/lib/queries').LedgerEntry[] }) {
  const rows = ledger as unknown as LedgerRow[]

  // Group by ISO week and by calendar month. Previously this tab rendered
  // column headers above an empty body, which read as "no data" rather than
  // "never built".
  const bucket = (fmt: (d: Date) => string) => {
    const map = new Map<string, { key: string; credits: number; debits: number }>()
    for (const l of rows) {
      if (l.status !== 'credited') continue
      const key = fmt(new Date(l.created_at))
      const row = map.get(key) ?? { key, credits: 0, debits: 0 }
      if (l.kind === 'debit') row.debits += Number(l.net)
      else row.credits += Number(l.net)
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
  }

  const weekKey = (d: Date) => {
    const t = new Date(d)
    t.setHours(0, 0, 0, 0)
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7)) // Monday
    return t.toISOString().slice(0, 10)
  }
  const monthKey = (d: Date) => d.toISOString().slice(0, 7)

  const weekly = bucket(weekKey)
  const monthly = bucket(monthKey)

  const Report = ({ title, data, label }: {
    title: string
    data: { key: string; credits: number; debits: number }[]
    label: (k: string) => string
  }) => (
    <Card>
      <CardHeader title={title} subtitle={`${num(data.length)} period${data.length === 1 ? '' : 's'}`} />
      {data.length === 0 ? (
        <EmptyState title="Nothing to report yet" description="Income and adjustments appear here once they are credited." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Period</Th>
              <Th className="text-right">Credits</Th>
              <Th className="text-right">Debits</Th>
              <Th className="text-right">Net</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.key} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap text-xs">{label(r.key)}</Td>
                <Td className="text-right tabular-nums text-emerald-700">{money(r.credits)}</Td>
                <Td className="text-right tabular-nums text-slate-500">{r.debits ? `−${money(r.debits)}` : '—'}</Td>
                <Td className="text-right font-semibold tabular-nums">{money(r.credits - r.debits)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Report title="Weekly report" data={weekly} label={(k) => `Week of ${date(k)}`} />
      <Report
        title="Monthly report"
        data={monthly}
        label={(k) => new Date(`${k}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- Rank */

/** The same qualification maths the member sees on their Rank & Progress screen. */
function RankTab({ member, members }: { member: Profile; members: Profile[] }) {
  const { data: ladder = [] } = useRankLadder()
  const downline = useMemo(() => downlineFromMembers(members, member.id), [members, member.id])
  const progress = rankProgress(member, ladder, downline)

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current rank</p>
            <p className="text-xl font-bold text-brand-700">{member.rank?.name ?? '—'}</p>
            <p className="mt-1 text-xs text-slate-500">
              Direct rate {pct(member.rank?.own_sale_rate ?? 0)}
              {(member.rank?.salary ?? 0) > 0 ? ` · salary ${money(member.rank?.salary ?? 0)}` : ''}
            </p>
          </div>
          {progress.next && (
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next rank</p>
              <p className="text-lg font-bold text-slate-800">{progress.next.name}</p>
              <p className="mt-1 text-xs text-slate-500">{progress.percent}% qualified</p>
            </div>
          )}
        </div>
        <ProgressBar percent={progress.percent} tone={progress.allMet ? 'green' : 'brand'} className="rounded-none" />
      </Card>

      {progress.next && (
        <Card>
          <CardHeader
            title={`Qualification for ${progress.next.name}`}
            action={<Badge tone={progress.allMet ? 'green' : 'amber'}>{progress.allMet ? 'All met' : 'In progress'}</Badge>}
          />
          <div className="divide-y divide-slate-100 px-5 pb-3">
            {progress.requirements.length === 0
              ? <p className="py-4 text-sm text-slate-500">This rank has no qualification conditions set.</p>
              : progress.requirements.map((r) => <RequirementRow key={r.label} {...r} />)}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="All ranks" subtitle="The business plan as configured" />
        <Table>
          <thead>
            <tr>
              <Th>Rank</Th><Th className="text-right">Direct</Th><Th>Qualification</Th>
              <Th className="text-right">Salary</Th><Th className="text-right">Joining</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((r) => {
              const isCurrent = r.id === member.rank_id
              const passed = (member.rank?.seniority ?? 0) > r.seniority
              return (
                <tr key={r.id} className={isCurrent ? 'bg-brand-50' : 'hover:bg-slate-50'}>
                  <Td className="font-medium text-slate-800">{r.name}</Td>
                  <Td className="text-right tabular-nums">{pct(r.own_sale_rate)}</Td>
                  <Td className="text-xs text-slate-600">
                    {(r.req_direct ?? 0) > 0
                      ? `${r.req_direct} direct · ${r.req_team} group${(r.req_legs ?? 0) > 0 ? ` · ${r.req_legs} legs` : ''}`
                      : 'Entry rank'}
                  </Td>
                  <Td className="text-right tabular-nums">{(r.salary ?? 0) > 0 ? money(r.salary ?? 0) : '—'}</Td>
                  <Td className="text-right tabular-nums">{(r.joining_fee ?? 0) > 0 ? money(r.joining_fee ?? 0) : 'Free'}</Td>
                  <Td>
                    {isCurrent ? <Badge tone="amber">Current</Badge>
                      : passed ? <Badge tone="green">Achieved</Badge>
                        : <Badge tone="neutral">Locked</Badge>}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- Rewards */

/** Reward progress measured the same way the member's own Rewards screen does. */
function RewardsTab({ member }: { member: Profile }) {
  // Earned is the member's achievement; issued is whether the goods actually
  // went out. Only the second one answers "did we send this member their car?"
  const { data: issued = [] } = useIssuedRewards(member.id)
  const award = useAwardReward(member.id)
  const { push } = useToast()
  const issuedAt = new Map<string, string>(issued.map((r) => [r.reference, r.issued_at]))
  const { data: ladder = [] } = useRankLadder()
  const { data: sales = [] } = useSales({ repId: member.id })
  const { data: cms = [] } = useCmsContent<{ id: string; title: string; image_url: string }>('rewards', { activeOnly: true })

  // Reward area is NOT simply confirmed area: a sale only counts once at
  // least half its value has been received (plan deck slide 7). This used to
  // total every confirmed booking, so the office saw more tiers earned than
  // the member did -- exactly the argument this screen exists to settle.
  // my_reward_area() is the one definition, and admins may call it for anyone.
  const { data: area = 0 } = useMyRewardArea(member.id)
  const { data: bookings = [] } = useBookings({ repId: member.id })
  const confirmedOnly = bookings
    .filter((b) => b.status === 'confirmed')
    .reduce((t, b) => t + Number(b.plot?.size ?? 0), 0)
  void sales

  const tiers = rewardTiers(ladder, area)
  const earned = tiers.filter((t) => t.earned)
  const next = tiers.find((t) => !t.earned)
  const imageFor = (title: string) =>
    cms.find((c) => c.title?.toLowerCase().includes(title.toLowerCase().split(' ')[0]))?.image_url

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Reward progress"
          subtitle={
            `${num(area)} sq yd counting · ${earned.length} of ${tiers.length} tiers earned` +
            (confirmedOnly > area ? ` · ${num(confirmedOnly - area)} sq yd awaiting payment` : '')
          }
        />
        <div className="p-5">
          {next ? (
            <>
              <p className="text-sm text-slate-700">
                Next: <strong>{next.title}</strong> — {num(next.targetSqyd - area)} sq yd to go
              </p>
              <div className="mt-3"><ProgressBar percent={next.progress} /></div>
            </>
          ) : tiers.length ? (
            <p className="text-sm text-emerald-700">Every reward tier has been earned.</p>
          ) : (
            <p className="text-sm text-slate-500">No reward tiers configured.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t) => {
          const img = imageFor(t.title)
          return (
            <Card key={`${t.seniority}-${t.title}`} className={`overflow-hidden ${next?.seniority === t.seniority ? 'ring-2 ring-brand-500' : ''}`}>
              {img
                ? <img src={img} alt={t.title} className="h-24 w-full object-cover" loading="lazy" />
                : <RewardArt title={t.title} className="h-24" />}
              <div className="p-4">
                <p className="text-sm font-bold text-slate-800">{t.title}</p>
                <p className="mt-1 text-xs text-slate-500">{num(t.targetSqyd)} sq yd</p>
                <div className="mt-3"><ProgressBar percent={t.progress} tone={t.earned ? 'green' : 'brand'} /></div>
                {(() => {
                  const on = issuedAt.get(rewardReference(t.title, t.targetSqyd))
                  return (
                    <>
                      <Badge
                        tone={on ? 'green' : t.earned ? 'amber' : next?.seniority === t.seniority ? 'blue' : 'neutral'}
                        className="mt-2"
                      >
                        {on ? 'Issued' : t.earned ? 'Earned, not issued' : next?.seniority === t.seniority ? 'Next' : 'Locked'}
                      </Badge>
                      {on && <p className="mt-1 text-[11px] text-slate-500">Issued {date(on)}</p>}
                      {t.earned && !on && (
                        <Button
                          size="sm"
                          className="mt-2 w-full"
                          loading={award.isPending}
                          onClick={() => award.mutate(
                            { rankId: t.rankId },
                            {
                              onSuccess: () => push('success', `${t.title} marked as issued.`),
                              onError: (e: unknown) => push('error', (e as Error).message),
                            },
                          )}
                        >
                          Mark as issued
                        </Button>
                      )}
                    </>
                  )
                })()}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- Team */

function TeamTab({ member, members }: { member: Profile; members: Profile[] }) {
  const [view, setView] = useState<'direct' | 'group'>('direct')
  const forest = useMemo(() => buildForest(members, 'sponsor'), [members])
  const node = useMemo(() => findNode(forest, member.id), [forest, member.id])
  const direct = node?.children ?? []
  const group: MemberNode[] = []
  if (node) { const walk = (n: MemberNode) => { n.children.forEach((c) => { group.push(c); walk(c) }) }; walk(node) }
  const list = view === 'direct' ? direct : group

  return (
    <Card>
      <div className="flex gap-1 border-b border-slate-200 px-4 py-2">
        <button onClick={() => setView('direct')} className={`rounded px-3 py-1 text-sm font-medium ${view === 'direct' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Direct ({direct.length})</button>
        <button onClick={() => setView('group')} className={`rounded px-3 py-1 text-sm font-medium ${view === 'group' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Group ({group.length})</button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No team members" />
      ) : (
        <Table>
          <thead><tr><Th>ID</Th><Th>Name</Th><Th>Rank</Th><Th className="text-right">Direct</Th><Th className="text-right">Team</Th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td><Link to={`/admin/members/${m.member_code}`} className="font-mono text-xs text-brand-700 hover:underline">{m.member_code}</Link></Td>
                <Td className="font-medium text-slate-800">{m.full_name}</Td>
                <Td><Badge tone={rankTone(m.rank_name)}>{m.rank_name ?? '—'}</Badge></Td>
                <Td className="text-right">{m.direct_count}</Td>
                <Td className="text-right">{m.team_count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- Tree View */

function TreeNode({ node, depth }: { node: MemberNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 }}>
        {node.children.length > 0
          ? <button onClick={() => setOpen(!open)} className="text-slate-400 hover:text-slate-700"><ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} /></button>
          : <span className="inline-block w-4" />}
        <Link to={`/admin/members/${node.member_code}`} className="text-sm font-medium text-slate-800 hover:text-brand-700">{node.full_name}</Link>
        <span className="font-mono text-xs text-slate-400">{node.member_code}</span>
        <Badge tone={rankTone(node.rank_name)}>{node.rank_name ?? '—'}</Badge>
      </div>
      {open && node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  )
}

function TreeTab({ member, members }: { member: Profile; members: Profile[] }) {
  const forest = useMemo(() => buildForest(members, 'sponsor'), [members])
  const node = useMemo(() => findNode(forest, member.id), [forest, member.id])
  return (
    <Card>
      <CardHeader title="Genealogy tree" />
      <div className="p-5">
        {node ? (
          node.children.length ? <TreeNode node={node} depth={0} /> : (
            <div>
              <TreeNode node={node} depth={0} />
              <p className="mt-2 pl-6 text-sm text-slate-400">No downline members yet.</p>
            </div>
          )
        ) : <EmptyState title="Not in the tree" />}
      </div>
    </Card>
  )
}


/* ------------------------------------------------------------------ Sales */

/**
 * The member's plot sales, and the control that turns a confirmed sale into
 * income. Running a distribution credits the seller and their whole upline and
 * is immediately visible in every affected member's own Sponsor Panel.
 */
function SalesTab({ member, ledger }: { member: Profile; ledger: LedgerRow[] }) {
  const { data: bookings = [] } = useBookings({ repId: member.id })
  const distribute = useDistributeIncome()
  const reverse = useReverseIncome()
  const toast = useToast()

  const distributed = new Set(ledger.map((l) => l.booking_id).filter(Boolean) as string[])
  const confirmed = bookings.filter((b) => b.status === 'confirmed')
  const undistributed = confirmed.filter((b) => !distributed.has(b.id))

  return (
    <Card>
      <CardHeader
        title="Plot sales"
        subtitle={`${num(confirmed.length)} confirmed · ${num(undistributed.length)} awaiting income distribution`}
        action={
          undistributed.length > 0 ? (
            <Button
              size="sm"
              loading={distribute.isPending}
              onClick={async () => {
                let credits = 0
                for (const b of undistributed) {
                  try {
                    credits += await distribute.mutateAsync(b.id)
                  } catch (e) {
                    toast.push('error', (e as Error).message)
                    return
                  }
                }
                toast.push('success', `${credits} income credit${credits === 1 ? '' : 's'} created`)
              }}
            >
              <Wallet className="h-4 w-4" /> Run income for {undistributed.length}
            </Button>
          ) : null
        }
      />
      {bookings.length === 0 ? (
        <EmptyState title="No sales recorded." description="Confirmed bookings for this member appear here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th><Th>Booking</Th><Th>Plot</Th><Th className="text-right">Area</Th>
              <Th className="text-right">Sale value</Th><Th>Status</Th><Th>Income</Th><Th />
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const done = distributed.has(b.id)
              return (
                <tr key={b.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{date(b.created_at)}</Td>
                  <Td className="font-mono text-xs">{b.reference}</Td>
                  <Td className="text-xs">{b.plot?.number ?? '—'}</Td>
                  <Td className="text-right text-xs">{b.plot?.size ? `${num(b.plot.size)} sq yd` : '—'}</Td>
                  <Td className="text-right font-medium">{money(b.sale_value)}</Td>
                  <Td><Badge tone={b.status === 'confirmed' ? 'green' : 'amber'}>{b.status.replace(/_/g, ' ')}</Badge></Td>
                  <Td>{done ? <Badge tone="green">Distributed</Badge> : <Badge tone="neutral">Not run</Badge>}</Td>
                  <Td>
                    {b.status === 'confirmed' && !done && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          distribute.mutate(b.id, {
                            onSuccess: (n) => toast.push('success', `${n} credit${n === 1 ? '' : 's'} created`),
                            onError: (e) => toast.push('error', (e as Error).message),
                          })
                        }
                      >
                        Run income
                      </Button>
                    )}
                    {done && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          reverse.mutate(b.id, {
                            onSuccess: (n) => toast.push('success', `${n} row${n === 1 ? '' : 's'} reversed`),
                            onError: (e) => toast.push('error', (e as Error).message),
                          })
                        }
                      >
                        Reverse
                      </Button>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ Leads */

function LeadsTab({ member }: { member: Profile }) {
  const { data: leads = [] } = useLeads({ ownerId: member.id })
  return (
    <Card>
      <CardHeader title="Leads" />
      {leads.length === 0 ? <EmptyState title="No leads." /> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Name</Th><Th>Phone</Th><Th>Project</Th><Th>Status</Th></tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <Td className="text-xs">{date(l.created_at)}</Td>
                <Td className="font-medium text-slate-800">{l.name}</Td>
                <Td>{l.mobile}</Td>
                <Td>{l.project?.name ?? '—'}</Td>
                <Td><Badge tone="blue">{l.status.replace(/_/g, ' ')}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------- KYC */

function KycTab({ member }: { member: Profile }) {
  const { data: kyc } = useMyKyc(member.id)
  return (
    <Card>
      <CardHeader title="KYC details" action={kyc ? <Badge tone={kyc.status === 'verified' ? 'green' : kyc.status === 'rejected' ? 'red' : 'amber'}>{kyc.status}</Badge> : <Badge tone="neutral">Not submitted</Badge>} />
      <div className="grid sm:grid-cols-2">
        <Row label="Full name">{member.full_name || '—'}</Row>
        <Row label="ID type">{kyc?.id_type ?? '—'}</Row>
        <Row label="ID (last 4)">{kyc?.id_last4 ? `•••• ${kyc.id_last4}` : '—'}</Row>
        <Row label="Status">{kyc?.status ?? 'Not submitted'}</Row>
        <Row label="Submitted">{kyc ? date(kyc.created_at) : '—'}</Row>
        <Row label="Reviewed">{kyc?.reviewed_at ? date(kyc.reviewed_at) : '—'}</Row>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- History */

function HistoryTab({ member }: { member: Profile }) {
  const { data: audit = [] } = useMemberAudit(member.id)
  const { data: ranks = [] } = useRankHistory(member.id)

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Activity trail" subtitle="Everything this member did that changed data" />
        {audit.length === 0 ? (
          <EmptyState title="No recorded activity" description="Bank changes, withdrawals and referrals are recorded here." />
        ) : (
          <Table>
            <thead><tr><Th>When</Th><Th>Action</Th><Th>Detail</Th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{date(a.at)}</Td>
                  <Td><Badge tone="blue">{a.entity.replace(/_/g, ' ')}</Badge></Td>
                  <Td className="text-xs text-slate-600">{a.summary ?? a.action}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Rank history" subtitle="Every promotion, with the date it was earned" />
        {ranks.length === 0 ? (
          <EmptyState title="No rank changes yet" description="Promotions from a rank review appear here." />
        ) : (
          <Table>
            <thead><tr><Th>When</Th><Th>From</Th><Th>To</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {ranks.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{date(r.created_at)}</Td>
                  <Td className="text-xs text-slate-500">{r.from_rank?.name ?? '—'}</Td>
                  <Td><Badge tone="gold">{r.to_rank?.name ?? '—'}</Badge></Td>
                  <Td className="text-xs text-slate-600">{r.reason ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

/* --------------------------------------------------- Add credit / withdrawal */

function CreditModal({ member, onClose }: { member: Profile; onClose: () => void }) {
  const add = useAddLedgerEntry()
  const toast = useToast()
  const ref = useRef<HTMLFormElement>(null)
  return (
    <Modal open onClose={onClose} title={`Add credit / debit — ${member.full_name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={add.isPending} onClick={() => ref.current?.requestSubmit()}>Save</Button></>}>
      <form ref={ref} className="space-y-3" onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        add.mutate({ member_id: member.id, kind: String(f.get('kind')), source: String(f.get('source') ?? ''), reference: String(f.get('reference') ?? ''), amount: Number(f.get('amount') ?? 0), note: String(f.get('note') ?? '') },
          { onSuccess: () => { toast.push('success', 'Entry added'); onClose() }, onError: (e2) => toast.push('error', (e2 as Error).message) })
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type"><Select name="kind" defaultValue="credit"><option value="credit">Credit</option><option value="debit">Debit</option></Select></Field>
          <Field label="Amount (₹)" required><Input name="amount" type="number" min={0} step={1} required /></Field>
          <Field label="Source"><Input name="source" placeholder="adjustment / direct_income / reward" /></Field>
          <Field label="Reference"><Input name="reference" /></Field>
        </div>
        <Field label="Note"><Textarea name="note" rows={2} /></Field>
      </form>
    </Modal>
  )
}

function WithdrawalModal({ member, available, onClose }: { member: Profile; available: number; onClose: () => void }) {
  const add = useAddWithdrawal()
  const toast = useToast()
  const ref = useRef<HTMLFormElement>(null)
  return (
    <Modal open onClose={onClose} title={`Add withdrawal — ${member.full_name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={add.isPending} onClick={() => ref.current?.requestSubmit()}>Request withdrawal</Button></>}>
      <form ref={ref} className="space-y-3" onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        add.mutate({ member_id: member.id, amount: Number(f.get('amount') ?? 0), account: String(f.get('account') ?? ''), status: String(f.get('status') ?? 'requested'), note: String(f.get('note') ?? '') },
          { onSuccess: () => { toast.push('success', 'Withdrawal recorded'); onClose() }, onError: (e2) => toast.push('error', (e2 as Error).message) })
      }}>
        <p className="text-xs text-slate-500">Available balance: <strong>{money(available)}</strong></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)" required><Input name="amount" type="number" min={0} step={1} required /></Field>
          <Field label="Status"><Select name="status" defaultValue="requested"><option value="requested">Requested</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></Select></Field>
        </div>
        <Field label="Bank account"><Input name="account" placeholder="A/C number" /></Field>
        <Field label="Note"><Textarea name="note" rows={2} /></Field>
      </form>
    </Modal>
  )
}

/* -------------------------------------------------- Welcome letter override */

function WelcomeLetterEditor({ member, code }: { member: Profile; code: string | undefined }) {
  const save = useSaveWelcomeLetter()
  const { data: siteDefault } = useSiteSetting('welcome.letter')
  const toast = useToast()
  const base = (member.welcome_letter as typeof WELCOME_DEFAULTS | null) ?? { ...WELCOME_DEFAULTS, ...(siteDefault ?? {}) }
  const [letter, setLetter] = useState<typeof WELCOME_DEFAULTS>({ ...WELCOME_DEFAULTS, ...base, paragraphs: base.paragraphs ?? WELCOME_DEFAULTS.paragraphs })
  const isOverride = Boolean(member.welcome_letter)

  const set = (k: keyof typeof WELCOME_DEFAULTS, v: unknown) => setLetter((p) => ({ ...p, [k]: v }))
  const setPara = (i: number, v: string) => setLetter((p) => ({ ...p, paragraphs: p.paragraphs.map((x, j) => (j === i ? v : x)) }))

  return (
    <Card>
      <CardHeader
        title="Welcome Letter (Member Override)"
        subtitle={`Customize the welcome letter for ${member.full_name}. If no override is saved, the default template is used.`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => save.mutate({ id: member.id, letter: null, code }, { onSuccess: () => { setLetter({ ...WELCOME_DEFAULTS, ...(siteDefault ?? {}) } as typeof WELCOME_DEFAULTS); toast.push('success', 'Reset to default') } })}>
              Reset defaults
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ id: member.id, letter: letter as unknown as Record<string, unknown>, code }, { onSuccess: () => toast.push('success', 'Welcome letter saved'), onError: (e) => toast.push('error', (e as Error).message) })}>
              Save
            </Button>
          </div>
        }
      />
      <div className="p-5">
        <Badge tone={isOverride ? 'blue' : 'neutral'}>{isOverride ? 'Custom override active' : 'Using default template'}</Badge>
        <p className="mt-3 text-xs text-slate-400">Placeholders: {'{{name}} {{id}} {{rank}} {{joined}} {{email}} {{phone}} {{sponsorName}} {{sponsorId}} {{date}}'}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Brand title"><Input value={letter.brand_title} onChange={(e) => set('brand_title', e.target.value)} /></Field>
          <Field label="Subtitle"><Input value={letter.subtitle} onChange={(e) => set('subtitle', e.target.value)} /></Field>
          <Field label="Reference prefix"><Input value={letter.ref_prefix} onChange={(e) => set('ref_prefix', e.target.value)} /></Field>
          <Field label="Heading"><Input value={letter.heading} onChange={(e) => set('heading', e.target.value)} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Salutation"><Input value={letter.salutation} onChange={(e) => set('salutation', e.target.value)} /></Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Body paragraphs</p>
            <Button size="sm" variant="outline" onClick={() => setLetter((p) => ({ ...p, paragraphs: [...p.paragraphs, ''] }))}><Plus className="h-4 w-4" /> Add paragraph</Button>
          </div>
          <div className="space-y-2">
            {letter.paragraphs.map((para, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2 w-5 text-right text-xs text-slate-400">{i + 1}</span>
                <Textarea value={para} rows={2} onChange={(e) => setPara(i, e.target.value)} className="flex-1" />
                <button onClick={() => setLetter((p) => ({ ...p, paragraphs: p.paragraphs.filter((_, j) => j !== i) }))} className="mt-2 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Closing"><Input value={letter.closing} onChange={(e) => set('closing', e.target.value)} /></Field>
          <Field label="Signatory"><Input value={letter.signatory} onChange={(e) => set('signatory', e.target.value)} /></Field>
          <Field label="Company line"><Input value={letter.company_line} onChange={(e) => set('company_line', e.target.value)} /></Field>
          <Field label="Footer slogan"><Input value={letter.footer_slogan} onChange={(e) => set('footer_slogan', e.target.value)} /></Field>
        </div>
      </div>
    </Card>
  )
}
