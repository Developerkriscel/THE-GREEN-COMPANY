import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import {
  useCancelWithdrawal, useMyWallet, useMyWithdrawals, useRequestWithdrawal,
  useSponsorProfile, useSponsorRates,
} from '@/lib/sponsor'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader,
  Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { Notice, SkeletonRows, WithdrawalBadge, maskAccount } from '@/components/sponsor'
import { date, dateTime, money } from '@/lib/format'

/**
 * Module 4 — turn balance into money in the bank.
 *
 * The eligibility gate is checked in a fixed order and only the FIRST failure
 * is shown, each with its own message and its own fix. The same checks run
 * again inside request_withdrawal() on the server, so the form is a courtesy,
 * not the control.
 */

interface Gate {
  ok: boolean
  title: string
  detail?: string
  to?: string
  action?: string
}

export function SponsorWithdrawals() {
  const { profile } = useAuth()
  const me = profile?.id
  const toast = useToast()

  const { data: member } = useSponsorProfile(me)
  const { data: wallet } = useMyWallet(me)
  const { data: withdrawals = [], isLoading } = useMyWithdrawals(me)
  const { data: kyc } = useMyKyc(me)
  const { data: rates } = useSponsorRates()

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  // One key per attempt: a double tap or a retry after a timeout reuses it, so
  // the server returns the original request instead of creating a second one.
  const idemKey = useRef(crypto.randomUUID())

  const request = useRequestWithdrawal(me)
  const cancel = useCancelWithdrawal(me)

  const available = wallet?.available ?? 0
  const minimum = rates?.min_withdrawal ?? 500
  const open = withdrawals.find((w) => w.status === 'requested' || w.status === 'approved')
  const payoutAccount = member?.bank_account
    ? `${member.bank_name ?? 'Bank'} ${maskAccount(member.bank_account)}`
    : member?.upi_id ?? null

  const gate: Gate = useMemo(() => {
    if (member?.frozen || member?.status === 'suspended')
      return {
        ok: false,
        title: 'Your account is on hold.',
        detail: 'Please contact the office to make a withdrawal.',
      }
    if (!kyc)
      return { ok: false, title: 'Complete your KYC before withdrawing.', to: '/sponsor/kyc', action: 'Go to KYC' }
    if (kyc.status === 'pending')
      return { ok: false, title: 'Your KYC is under review.', detail: 'This usually takes 2–3 working days.' }
    if (kyc.status === 'rejected')
      return {
        ok: false,
        title: `Your KYC was rejected${kyc.reject_reason ? `: ${kyc.reject_reason}` : '.'}`,
        to: '/sponsor/kyc',
        action: 'Re-upload',
      }
    if (!payoutAccount)
      return {
        ok: false,
        title: 'Add your bank account or UPI to receive payouts.',
        to: '/sponsor/bank',
        action: 'Add details',
      }
    if (open)
      return {
        ok: false,
        title: `You already have a withdrawal of ${money(open.amount)} being processed.`,
        detail: 'You can make a new request once this one is settled.',
      }
    if (available < minimum)
      return {
        ok: false,
        title: `A minimum of ${money(minimum)} is needed to withdraw.`,
        detail: `Your available balance is ${money(available)}.`,
      }
    return { ok: true, title: '' }
  }, [member, kyc, payoutAccount, open, available, minimum])

  const value = Number(amount)
  const amountError =
    amount === ''
      ? null
      : !Number.isFinite(value) || value <= 0
        ? 'Enter a valid amount.'
        : value < minimum
          ? `The minimum withdrawal is ${money(minimum)}.`
          : value > available
            ? `That is more than your available balance of ${money(available)}.`
            : null

  const submit = () => {
    request.mutate(
      { amount: value, note: note || undefined, key: idemKey.current },
      {
        onSuccess: () => {
          toast.push('success', 'Withdrawal requested')
          setConfirming(false)
          setAmount('')
          setNote('')
          idemKey.current = crypto.randomUUID()
        },
        onError: (e) => {
          toast.push('error', (e as Error).message)
          setConfirming(false)
        },
      },
    )
  }

  return (
    <>
      <PageHeader
        title="Withdrawals"
        description="Request a payout and follow it all the way to your bank."
      />

      <Card className="mb-5">
        <div className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Available to withdraw</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{money(available)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Minimum {money(minimum)} per request
            {payoutAccount ? ` · paying to ${payoutAccount}` : ''}
          </p>
        </div>
      </Card>

      {/* --- the form, or the blocked reason in its place ------------------ */}
      {gate.ok ? (
        <Card className="mb-6">
          <CardHeader title="Request a withdrawal" subtitle="Reviewed by the office before payment" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Amount (₹)" required error={amountError ?? undefined}>
              <Input
                type="number"
                min={minimum}
                max={available}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(minimum)}
              />
            </Field>
            <Field label="Payout account" hint="Change this under My Profile & Bank Details">
              <Input value={payoutAccount ?? ''} readOnly className="bg-slate-50" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Note (optional)" hint="For your own reference, up to 200 characters">
                <Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button
                disabled={!amount || Boolean(amountError)}
                onClick={() => setConfirming(true)}
              >
                Review request
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="mb-6">
          <Notice
            tone={member?.frozen ? 'error' : 'warn'}
            title={gate.title}
            to={gate.to}
            action={gate.action}
          >
            {gate.detail}
            {!gate.to && !gate.detail && ' Please contact the office.'}
          </Notice>
        </div>
      )}

      {/* --- history ------------------------------------------------------- */}
      <Card>
        <CardHeader title="Request history" subtitle="Newest first" />
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : withdrawals.length === 0 ? (
          <EmptyState
            title="You haven’t made a withdrawal yet"
            description={`Your available balance is ${money(available)}.`}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Requested</Th>
                <Th className="text-right">Amount</Th>
                <Th>To</Th>
                <Th>Status</Th>
                <Th>Settled</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{dateTime(w.requested_at)}</Td>
                  <Td className="text-right font-semibold tabular-nums">{money(w.amount)}</Td>
                  <Td className="text-xs text-slate-600">{maskAccount(w.account)}</Td>
                  <Td>
                    <WithdrawalBadge status={w.status} />
                    {w.status === 'rejected' && w.reject_reason && (
                      <p className="mt-1 text-[11px] text-red-700">{w.reject_reason}</p>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {w.status === 'paid' ? (
                      <>
                        {date(w.paid_at ?? w.processed_at)}
                        {w.payout_reference && (
                          <span className="ml-1 font-mono text-[11px] text-slate-400">
                            {w.payout_reference}
                          </span>
                        )}
                      </>
                    ) : w.processed_at ? (
                      date(w.processed_at)
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {w.status === 'requested' && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={cancel.isPending}
                        onClick={() =>
                          cancel.mutate(w.id, {
                            onSuccess: () => toast.push('success', 'Request cancelled'),
                            onError: (e) => toast.push('error', (e as Error).message),
                          })
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        A request holds the money out of your available balance straight away, so the same amount
        cannot be requested twice. A rejected or cancelled request returns it.{' '}
        <Link to="/sponsor/wallet" className="font-medium text-brand-700 hover:underline">
          See your wallet
        </Link>
      </p>

      {/* --- confirmation restates what will actually be received ---------- */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirm your withdrawal"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button loading={request.isPending} onClick={submit}>
              Confirm request
            </Button>
          </>
        }
      >
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">Amount requested</dt>
            <dd className="font-semibold text-slate-900">{money(value)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">Paid to</dt>
            <dd className="text-slate-800">{payoutAccount}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">You will receive</dt>
            <dd className="text-lg font-bold text-emerald-700">{money(value)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">Balance afterwards</dt>
            <dd className="text-slate-800">{money(available - value)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          TDS and the admin charge were already applied when each income was credited, so nothing
          further is deducted from this payout. The office reviews every request before payment.
        </p>
        {open && <Badge tone="amber">A request is already open</Badge>}
      </Modal>
    </>
  )
}
