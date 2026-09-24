import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import { useMySponsor, useMyWithdrawals, useSaveBankDetails, useSponsorProfile } from '@/lib/sponsor'
import {
  Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, useToast,
} from '@/components/ui'
import { KycBadge, RankBadge } from '@/components/status'
import { MemberStatusBadge, Notice, maskAccount } from '@/components/sponsor'
import { date } from '@/lib/format'

/**
 * Module 13 — contact details and the payout destination.
 *
 * Treated as a security area rather than a settings page: a wrong bank detail
 * means a failed payout, and changing it is exactly what an attacker with a
 * stolen password would do. The account number is entered twice, validated
 * server-side, and only ever read back masked.
 */
export function SponsorBankDetails() {
  const { profile, refreshProfile } = useAuth()
  const me = profile?.id
  const toast = useToast()

  const { data: member } = useSponsorProfile(me)
  const { data: kyc } = useMyKyc(me)
  const { data: sponsor } = useMySponsor(me)
  const { data: withdrawals = [] } = useMyWithdrawals(me)
  const save = useSaveBankDetails()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    holder: '', bank: '', account: '', confirm: '', ifsc: '', type: 'savings', upi: '', pan: '',
  })

  useEffect(() => {
    if (!member) return
    setForm((f) => ({
      ...f,
      holder: member.bank_holder ?? member.full_name ?? '',
      bank: member.bank_name ?? '',
      ifsc: member.bank_ifsc ?? '',
      type: member.bank_type ?? 'savings',
      upi: member.upi_id ?? '',
      pan: member.pan_number ?? '',
    }))
  }, [member])

  const onHold = Boolean(member?.frozen) || member?.status === 'suspended'
  const hasDetails = Boolean(member?.bank_account || member?.upi_id)
  const openRequest = withdrawals.find((w) => w.status === 'requested' || w.status === 'approved')

  const accountMismatch =
    form.account.length > 0 && form.confirm.length > 0 && form.account !== form.confirm

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (accountMismatch) {
      toast.push('error', 'The two account numbers do not match.')
      return
    }
    save.mutate(
      {
        holder: form.holder, bank: form.bank,
        // An untouched account field keeps whatever is already saved.
        account: form.account || member?.bank_account || '',
        ifsc: form.ifsc, type: form.type, upi: form.upi, pan: form.pan,
      },
      {
        onSuccess: async () => {
          toast.push('success', 'Payout details saved')
          setForm((f) => ({ ...f, account: '', confirm: '' }))
          setEditing(false)
          await refreshProfile()
        },
        onError: (err) => toast.push('error', (err as Error).message),
      },
    )
  }

  return (
    <>
      <PageHeader title="My Profile & Bank Details" description="Keep your contact details current and your payout destination correct." />

      {/* --- company-controlled, display only ------------------------------ */}
      <Card className="mb-6">
        <CardHeader title="Your membership" subtitle="Set by the company — contact the office to change any of these" />
        <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
          <Locked label="Member ID" value={member?.member_code ?? '—'} />
          <Locked label="Rank" value={<RankBadge name={member?.rank?.name} />} />
          <Locked
            label="Sponsor"
            value={sponsor?.full_name ? `${sponsor.full_name} (${sponsor.member_code ?? '—'})` : 'You are the network root'}
          />
          <Locked label="Joined" value={date(member?.created_at)} />
          <Locked label="Account status" value={<MemberStatusBadge status={member?.status ?? 'active'} frozen={member?.frozen} />} />
          <Locked label="KYC" value={kyc ? <KycBadge status={kyc.status} /> : <Badge tone="amber">Not submitted</Badge>} />
        </div>
      </Card>

      {/* --- payout destination -------------------------------------------- */}
      <Card>
        <CardHeader
          title="Bank & payout details"
          subtitle="Where your withdrawals are paid"
          action={
            hasDetails && !editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={onHold}>
                Edit
              </Button>
            ) : null
          }
        />

        {onHold && (
          <div className="p-5 pb-0">
            <Notice tone="error" title="Your account is on hold.">
              Payout details cannot be changed right now. Please contact the office.
            </Notice>
          </div>
        )}

        {openRequest && (
          <div className="p-5 pb-0">
            <Notice tone="info" title="You have a withdrawal in progress.">
              Changing these details will not change where that payout goes.
            </Notice>
          </div>
        )}

        {hasDetails && !editing ? (
          <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
            <Locked label="Account holder" value={member?.bank_holder ?? '—'} />
            <Locked label="Bank" value={member?.bank_name ?? '—'} />
            <Locked label="Account number" value={maskAccount(member?.bank_account)} />
            <Locked label="IFSC" value={member?.bank_ifsc ?? '—'} />
            <Locked label="Account type" value={member?.bank_type ?? '—'} />
            <Locked label="UPI ID" value={member?.upi_id ?? '—'} />
            <Locked label="PAN" value={member?.pan_number ? `••••• ${member.pan_number.slice(-4)}` : '—'} />
            <Locked label="Last changed" value={member?.bank_updated_at ? date(member.bank_updated_at) : '—'} />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            {!hasDetails && (
              <Notice tone="warn" title="Payouts need a destination.">
                Add a bank account or UPI ID before you request a withdrawal.
              </Notice>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account holder name" required hint="Must match your KYC name">
                <Input required value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} />
              </Field>
              <Field label="Bank name" required>
                <Input required value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
              </Field>
              <Field
                label={hasDetails ? 'New account number' : 'Account number'}
                hint="9 to 18 digits"
                required={!hasDetails}
              >
                <Input
                  required={!hasDetails}
                  inputMode="numeric"
                  value={form.account}
                  onChange={(e) => setForm({ ...form, account: e.target.value.replace(/\D/g, '').slice(0, 18) })}
                  placeholder={hasDetails ? maskAccount(member?.bank_account) : ''}
                />
              </Field>
              <Field
                label="Re-enter account number"
                required={!hasDetails || form.account.length > 0}
                error={accountMismatch ? 'The two account numbers do not match.' : undefined}
              >
                <Input
                  required={!hasDetails || form.account.length > 0}
                  inputMode="numeric"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value.replace(/\D/g, '').slice(0, 18) })}
                />
              </Field>
              <Field label="IFSC code" required hint="e.g. HDFC0001234">
                <Input
                  required
                  value={form.ifsc}
                  onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase().slice(0, 11) })}
                />
              </Field>
              <Field label="Account type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                </Select>
              </Field>
              <Field label="UPI ID (optional)">
                <Input value={form.upi} onChange={(e) => setForm({ ...form, upi: e.target.value })} placeholder="name@bank" />
              </Field>
              <Field label="PAN" hint="Used for TDS on your income">
                <Input
                  value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase().slice(0, 10) })}
                  placeholder="ABCDE1234F"
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button type="submit" loading={save.isPending} disabled={onHold || accountMismatch}>
                <ShieldCheck className="h-4 w-4" /> Save payout details
              </Button>
              {hasDetails && (
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Your account number is stored securely and only ever shown to you as the last four digits.
              Every change is recorded.
            </p>
          </form>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Name, phone and address are edited under{' '}
        <Link to="/sponsor/profile" className="font-medium text-brand-700 hover:underline">
          My Profile
        </Link>
        . Your password is changed under{' '}
        <Link to="/sponsor/password" className="font-medium text-brand-700 hover:underline">
          Change Password
        </Link>
        .
      </p>
    </>
  )
}

function Locked({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm text-slate-800">{value}</div>
    </div>
  )
}
