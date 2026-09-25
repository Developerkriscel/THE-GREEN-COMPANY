import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck, Banknote, CalendarClock, Check, Copy, ExternalLink, Gift, Mail,
  Network, Printer, TrendingUp, Trophy, Users, Wallet, X
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMemberById, useMyKyc, useSiteSetting } from '@/lib/queries'
import {
  useMyDownline, useMyLedger, useMyWallet, useMyWithdrawals, useRankLadder,
  useSponsorProfile, useSponsorRates, INCOME_LABELS, inMonth, isCounted, netOf, rankProgress,
} from '@/lib/sponsor'
import { payoutCycle } from '@/lib/sponsor-crm'
import { resolveWelcomeLetter, WelcomeLetterView, type WelcomeLetter } from '@/lib/welcome-letter'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatTile, Table, Td, Th } from '@/components/ui'
import { KycBadge, RankBadge } from '@/components/status'
import { MemberStatusBadge, NetAmount, Notice, ProgressBar, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { date, money, moneyShort, num } from '@/lib/format'

/**
 * Module 1 — "Where do I stand today?" in five seconds, plus the one thing
 * that needs attention. Everything on this screen navigates; nothing writes.
 */
export function SponsorDashboard() {
  const { profile } = useAuth()
  const me = profile?.id

  const [showWelcomeLetter, setShowWelcomeLetter] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data: member } = useSponsorProfile(me)
  const { data: wallet, isLoading: walletLoading } = useMyWallet(me)
  const { data: ledger = [], isLoading: ledgerLoading } = useMyLedger(me)
  const { data: downline = [] } = useMyDownline(me)
  const { data: withdrawals = [] } = useMyWithdrawals(me)
  const { data: ladder = [], isLoading: ladderLoading } = useRankLadder()
  const { data: rates } = useSponsorRates()
  const { data: kyc, isLoading: kycLoading } = useMyKyc(me)
  const { data: defaultTpl } = useSiteSetting('welcome.letter')

  const person = member ?? profile
  // No placeholder name: a real account's name used here was shown to
  // every member while their own profile was still loading.
  const fullName = person?.full_name?.trim() ?? ''
  const onHold = Boolean(person?.frozen) || person?.status === 'suspended'

  const credits = ledger.filter((l) => isCounted(l) && l.kind === 'credit')
  const thisMonth = netOf(credits.filter((l) => inMonth(l.created_at)))
  const totalIncome = credits.reduce((acc, c) => acc + (c.net || c.amount || 0), 0)
  const recent = credits.slice(0, 5)

  const directs = downline.filter((d) => d.level === 1)
  const activeDirects = directs.filter((d) => d.status === 'active').length
  const activeTeam = downline.filter((d) => d.status === 'active').length

  const cycle = payoutCycle(person?.created_at)
  const plan = person?.plan_rank ?? null
  const progress = rankProgress(person, ladder, downline)
  const openWithdrawal = withdrawals.find((w) => w.status === 'requested' || w.status === 'approved')
  const hasBank = Boolean(person?.bank_account || person?.upi_id)

  const refCode = person?.member_code || person?.user_code || null
  const referralUrl = refCode ? `${window.location.origin}/join?ref=${refCode}` : null

  const copyReferral = async () => {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const stored = (person?.welcome_letter as Partial<WelcomeLetter> | null) ?? (defaultTpl as Partial<WelcomeLetter> | null)
  const letter = resolveWelcomeLetter(stored)

  const joinedRecently = downline.filter(
    (d) => new Date(d.joined).getTime() > Date.now() - 30 * 24 * 3600 * 1000,
  ).length
  const newest = [...downline]
    .sort((a, b) => (a.joined < b.joined ? 1 : -1))
    .slice(0, 5)

  return (
    <>
      {/* Top Hero Banner matching production */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Welcome{fullName ? `, ${fullName}` : ''}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-500">
            <span>Sponsor ID</span>
            <span className="font-semibold text-slate-800">· {person?.member_code || person?.user_code || '—'}</span>
            {person?.rank?.name && <RankBadge name={person.rank.name} />}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowWelcomeLetter(true)}
            className="flex items-center gap-2 border-slate-300 bg-white font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Mail className="h-4 w-4 text-[#ea580c]" /> Welcome Letter
          </Button>

          <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 shadow-sm">
            <span className="max-w-[200px] truncate text-xs text-slate-600 sm:max-w-[260px]">
              {referralUrl ?? 'Loading your referral link…'}
            </span>
            <button
              onClick={copyReferral}
              disabled={!referralUrl}
              className="ml-2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="Copy referral link"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

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

      {/* --- summary tiles matching production --- */}
      {walletLoading ? (
        <SkeletonTiles count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="Wallet balance"
            value={money(wallet?.available ?? 0)}
            hint={wallet?.pending ? `${money(wallet.pending)} pending` : 'Available now'}
            tone="green"
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatTile
            label="Current plan"
            value={plan?.name ?? 'Crown'}
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
            icon={<Trophy className="h-4 w-4" />}
          />
          <StatTile
            label="Direct team"
            value={num(directs.length)}
            hint={`${num(activeDirects)} active`}
            tone="violet"
            icon={<Users className="h-4 w-4" />}
          />
          <StatTile
            label="Total income"
            value={money(totalIncome)}
            hint={`${money(thisMonth)} this month`}
            tone="blue"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatTile
            label="Next payout"
            value={cycle ? date(cycle.next) : '—'}
            hint={
              cycle
                ? cycle.daysAway === 0
                  ? 'Due today'
                  : `In ${cycle.daysAway} day${cycle.daysAway === 1 ? '' : 's'}`
                : 'Join date unknown'
            }
            tone="blue"
            icon={<CalendarClock className="h-4 w-4" />}
          />
        </div>
      )}

      {/* --- payment cycle strip --- */}
      {cycle && (
        <Card className="mt-4 border-slate-200/80 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-[#ea580c]">
              <CalendarClock className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment cycle</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                You joined on day {cycle.joinDay} → {cycle.cycle} cycle
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Joiners between 1–15 get paid on the 15th of next month; joiners between 16–30 get paid on the 30th of next month.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Next payout</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{date(cycle.next)}</p>
              <p className="text-xs font-medium text-[#ea580c]">
                {cycle.daysAway === 0 ? 'Due now' : `In ${cycle.daysAway} day${cycle.daysAway === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* --- rank roadmap 2-column widget matching live production --- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 pb-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Trophy className="h-4 w-4 text-amber-500" /> Current Rank
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {person?.rank?.name ?? 'Unranked'}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <BadgeCheck className="h-4 w-4 text-[#ea580c]" /> Current Plan
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {plan?.name ?? 'Crown'}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 pt-4">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>{directs.length} directs</span>
              <span>Team size {downline.length}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#ea580c] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(8, (directs.length / 15) * 100))}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl bg-slate-50/90 p-3 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Wallet</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{money(wallet?.available ?? 0)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Income</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{money(totalIncome)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Direct Team</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{directs.length}</p>
            </div>
          </div>
        </div>

        {/* Rank Roadmap Promo card */}
        <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0b192c] to-[#152e4d] p-6 text-white shadow-md">
          <div>
            <div className="inline-flex rounded-xl bg-white/10 p-2.5 text-amber-400">
              <Trophy className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-white">Rank Roadmap</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Grow your direct team to unlock higher ranks, lucrative sponsor overrides, and exclusive company rewards.
            </p>
          </div>

          <div className="mt-6">
            <Link
              to="/sponsor/rank"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ea580c] px-4 py-2.5 text-sm font-bold text-white shadow transition-all hover:bg-[#d94e08]"
            >
              View Roadmap <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* --- recent team activity table matching production --- */}
      <Card className="mt-6 border-slate-200/80 shadow-sm">
        <CardHeader
          title="Recent Team Activity"
          subtitle="Downline team members and sponsor placements"
          action={
            <Link to="/sponsor/team" className="text-xs font-semibold text-[#ea580c] hover:underline">
              View all
            </Link>
          }
        />
        {newest.length === 0 ? (
          <EmptyState
            title="No team members yet"
            description="Share your referral link to start building your direct team."
            action={
              <Link to="/sponsor/refer" className="text-sm font-semibold text-[#ea580c] hover:underline">
                Refer a member
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Sponsor</Th>
                <Th>Rank</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {newest.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        {d.full_name ? d.full_name[0].toUpperCase() : 'M'}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{d.full_name}</p>
                        <p className="font-mono text-xs text-slate-400">{d.member_code}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-mono text-xs text-slate-600">
                    {d.sponsor_code ?? '—'}
                  </Td>
                  <Td>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {d.rank_name || 'Channel Partner'}
                    </span>
                  </Td>
                  <Td>
                    <MemberStatusBadge status={d.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* --- recent income --- */}
      <div className="mt-6">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader
            title="Recent income"
            subtitle="Newest first"
            action={
              <Link to="/sponsor/income" className="text-xs font-semibold text-[#ea580c] hover:underline">
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
      </div>

      {rates && (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
          Every income credit is shown as gross → deductions → net. TDS {rates.tds_pct}% and an admin
          charge of {rates.admin_pct}% are applied to each credit, as per company rules. Lifetime credited{' '}
          {moneyShort(wallet?.credited ?? 0)}.
        </p>
      )}

      {/* --- Welcome Letter Modal --- */}
      {showWelcomeLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Welcome Letter</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <button
                  onClick={() => setShowWelcomeLetter(false)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <WelcomeLetterView letter={letter} member={person} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
