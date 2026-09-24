import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Wallet as WalletIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  useMyStatement, useMyWallet, useMyWithdrawals, useSponsorProfile, useSponsorRates,
  INCOME_LABELS, type StatementRow,
} from '@/lib/sponsor'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, RecordCard, Responsive,
  Select, Table, Td, Th,
} from '@/components/ui'
import { NetAmount, Notice, SkeletonRows, WithdrawalBadge, maskAccount } from '@/components/sponsor'
import { date, dateTime, downloadCsv, money, num } from '@/lib/format'

const PER_PAGE = 25

/**
 * Module 2 — the single source of truth for the member's money.
 *
 * The statement comes from my_ledger_page(): income credits and paid
 * withdrawals in one ordered stream, with "balance after" computed server-side
 * with a window function. That is what makes paging safe — page 2 shows the
 * same balance it would on one long page — and it keeps a 10,000-row ledger
 * out of the browser entirely.
 *
 * The header is always lifetime and never reacts to the filter; the filtered
 * count sits above the table instead. Confusing the two is the classic way a
 * member reads a filtered sum as their balance.
 */
export function SponsorWallet() {
  const { profile } = useAuth()
  const me = profile?.id

  const [source, setSource] = useState<string>('')
  const [page, setPage] = useState(0)

  const { data: member } = useSponsorProfile(me)
  const { data: wallet, isLoading } = useMyWallet(me)
  const { data: rows = [], isLoading: rowsLoading, isFetching } = useMyStatement(me, {
    limit: PER_PAGE,
    offset: page * PER_PAGE,
    source: source || null,
  })
  const { data: withdrawals = [] } = useMyWithdrawals(me)
  const { data: rates } = useSponsorRates()

  const onHold = Boolean(member?.frozen) || member?.status === 'suspended'
  const total = rows[0]?.total_count ?? 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  // Requests that have not been paid yet are not money movements, so they are
  // not in the statement — they are surfaced separately so nothing looks lost.
  const inFlight = withdrawals.filter((w) => w.status === 'requested' || w.status === 'approved')

  const label = (r: StatementRow) =>
    r.source === 'withdrawal'
      ? 'Withdrawal'
      : `${INCOME_LABELS[r.source] ?? 'Adjustment'}${r.level ? ` ${r.level}` : ''}`

  const particulars = (r: StatementRow) =>
    r.note || `${label(r)}${r.reference ? ` · ${r.reference}` : ''}`

  return (
    <>
      <PageHeader
        title="My Wallet"
        description="Everything that came in, everything that went out, and what is available now."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(`wallet-${member?.member_code ?? 'statement'}`, rows.map((r) => ({
                  Date: dateTime(r.created_at),
                  Reference: r.reference ?? '',
                  Type: label(r),
                  Particulars: particulars(r),
                  Gross: r.gross || '',
                  TDS: r.tds || '',
                  'Admin charge': r.admin_charge || '',
                  Net: r.kind === 'debit' ? -r.net : r.net,
                  'Balance after': r.balance_after,
                })))
              }
            >
              <Download className="h-4 w-4" /> Statement
            </Button>
            <Link to="/sponsor/withdrawals">
              <Button size="sm">
                <WalletIcon className="h-4 w-4" /> Withdraw
              </Button>
            </Link>
          </div>
        }
      />

      {/* --- balance header: the four figures always visibly add up -------- */}
      <Card className="mb-5">
        <div className="grid gap-px bg-slate-100 sm:grid-cols-4">
          <div className="bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Available balance</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">
              {isLoading ? '—' : money(wallet?.available ?? 0)}
            </p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total credited</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{money(wallet?.credited ?? 0)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Lifetime, after deductions</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total withdrawn</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{money(wallet?.withdrawn ?? 0)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Paid to your account</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending withdrawal</p>
            <p className="mt-1 text-lg font-semibold text-amber-700">{money(wallet?.pending ?? 0)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Held while your request is processed</p>
          </div>
        </div>
      </Card>

      {onHold && (
        <div className="mb-5">
          <Notice tone="error" title="Your account is on hold.">
            You can see your full history, but withdrawals are paused. Please contact the office.
          </Notice>
        </div>
      )}

      {inFlight.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="In progress" subtitle="Requested, not yet paid — held out of your available balance" />
          <div className="divide-y divide-slate-100">
            {inFlight.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">{money(w.amount)}</span>
                  <span className="ml-2 text-xs text-slate-500">to {maskAccount(w.account)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{date(w.requested_at)}</span>
                  <WithdrawalBadge status={w.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Statement"
          subtitle={`${num(total)} transaction${total === 1 ? '' : 's'}${source ? ' in this filter' : ''}`}
          action={
            <div className="w-48">
              <Select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value)
                  setPage(0)
                }}
              >
                <option value="">All types</option>
                <option value="direct_income">Direct income</option>
                <option value="level_income">Level income</option>
                <option value="salary">Salary</option>
                <option value="reward">Reward</option>
                <option value="adjustment">Adjustment</option>
                <option value="withdrawal">Withdrawal</option>
              </Select>
            </div>
          }
        />

        {rowsLoading ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={source ? 'Nothing of that type yet' : 'Your wallet is empty'}
            description={
              source
                ? 'Try a different type.'
                : 'Income appears here as your sales and your team’s sales are confirmed.'
            }
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Particulars</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Balance after</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs">{date(r.created_at)}</Td>
                      <Td>
                        <Badge tone={r.kind === 'debit' ? 'neutral' : r.source === 'direct_income' ? 'green' : 'blue'}>
                          {label(r)}
                        </Badge>
                      </Td>
                      <Td className="max-w-sm text-xs text-slate-600">{particulars(r)}</Td>
                      <Td><NetAmount row={r} rates={rates} /></Td>
                      <Td className="text-right text-xs tabular-nums text-slate-500">
                        {money(r.balance_after)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {rows.map((r) => (
                  <RecordCard
                    key={`m-${r.id}`}
                    title={particulars(r)}
                    subtitle={date(r.created_at)}
                    // On a phone the figure stays compact and the deductions
                    // move into the detail rows — the breakdown beside the
                    // title squeezed both into ellipses.
                    amount={
                      <span
                        className={
                          'text-base font-semibold tabular-nums ' +
                          (r.kind === 'debit' ? 'text-slate-500' : 'text-slate-900')
                        }
                      >
                        {r.kind === 'debit' ? '−' : ''}
                        {money(Math.abs(r.net))}
                      </span>
                    }
                    badge={
                      <Badge tone={r.kind === 'debit' ? 'neutral' : r.source === 'direct_income' ? 'green' : 'blue'}>
                        {label(r)}
                      </Badge>
                    }
                    rows={[
                      ...(r.gross > 0 && r.gross !== r.net
                        ? [
                            { label: 'Gross', value: money(r.gross) },
                            { label: `TDS ${rates ? `${rates.tds_pct}%` : ''}`, value: `−${money(r.tds)}` },
                            { label: `Admin ${rates ? `${rates.admin_pct}%` : ''}`, value: `−${money(r.admin_charge)}` },
                          ]
                        : []),
                      { label: 'Balance after', value: money(r.balance_after) },
                    ]}
                  />
                ))}
              </div>
            }
          />
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
            <span>
              Page {page + 1} of {pages}
              {isFetching && <span className="ml-2 text-slate-400">updating…</span>}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        “Balance after” is calculated over your whole statement, so it stays correct on every page.
        Requested and approved withdrawals are held out of your available balance and appear above
        until they are paid.
      </p>
    </>
  )
}
