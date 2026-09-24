import { useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select,
  Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { useCreateMember, useDecideReferral, useRanks, useReferralQueue, type ReferralRequest } from '@/lib/queries'
import { date } from '@/lib/format'

/**
 * The company side of the members' "Refer a Member" screen.
 *
 * A member's submission creates a REQUEST, never a member — this is where the
 * office turns one into an account or declines it. Both outcomes are visible
 * back in that member's own panel, and a rejection always carries its reason.
 */
export function ReferralQueue() {
  const [status, setStatus] = useState('invited')
  const { data: referrals = [], isLoading } = useReferralQueue(status || undefined)
  const [approving, setApproving] = useState<ReferralRequest | null>(null)
  const [rejecting, setRejecting] = useState<ReferralRequest | null>(null)

  const pending = referrals.filter((r) => r.status === 'invited').length

  return (
    <>
      <Card className="mb-6">
        <CardHeader
          title="Referral requests"
          subtitle="Submitted by members from their own panel — approve to create the account, or decline with a reason"
          action={
            <div className="flex items-center gap-2">
              {pending > 0 && <Badge tone="amber">{pending} waiting</Badge>}
              <div className="w-40">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="invited">Waiting</option>
                  <option value="active">Approved</option>
                  <option value="rejected">Declined</option>
                  <option value="">All</option>
                </Select>
              </div>
            </div>
          }
        />

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description="Referrals members submit from the Sponsor Panel appear here for review."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Submitted</Th>
                <Th>Name</Th>
                <Th>Mobile</Th>
                <Th>City</Th>
                <Th>Sponsored by</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{date(r.created_at)}</Td>
                  <Td className="font-medium text-slate-800">{r.full_name}</Td>
                  <Td className="font-mono text-xs">{r.mobile}</Td>
                  <Td className="text-xs text-slate-600">{r.city ?? '—'}</Td>
                  <Td className="text-xs">
                    {r.sponsor?.full_name ?? '—'}
                    {r.sponsor?.member_code && (
                      <span className="ml-1 font-mono text-[11px] text-slate-400">{r.sponsor.member_code}</span>
                    )}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        r.status === 'active' ? 'green'
                          : r.status === 'rejected' ? 'red'
                            : r.status === 'registered' ? 'blue' : 'amber'
                      }
                    >
                      {r.status === 'invited' ? 'Waiting' : r.status}
                    </Badge>
                    {r.reject_reason && <p className="mt-1 text-[11px] text-red-700">{r.reject_reason}</p>}
                  </Td>
                  <Td>
                    {r.status === 'invited' && (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => setApproving(r)}>
                          <UserPlus className="h-4 w-4" /> Create member
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejecting(r)}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {approving && <ApproveModal referral={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectModal referral={rejecting} onClose={() => setRejecting(null)} />}
    </>
  )
}

/** Creates the login under the referring member, then closes the request. */
function ApproveModal({ referral, onClose }: { referral: ReferralRequest; onClose: () => void }) {
  const create = useCreateMember()
  const decide = useDecideReferral()
  const { data: ranks = [] } = useRanks()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const entryRank = [...ranks].sort((a, b) => a.seniority - b.seniority)[0]

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const created = await create.mutateAsync({
        full_name: referral.full_name,
        email: String(f.get('email') ?? '').trim(),
        password: String(f.get('password') ?? ''),
        phone: referral.mobile,
        referrer_id: referral.sponsor_id,
        placement_parent_id: referral.sponsor_id,
        rank_id: String(f.get('rank_id') ?? '') || entryRank?.id || null,
        city: referral.city ?? undefined,
        state: referral.state ?? undefined,
      })
      await decide.mutateAsync({ id: referral.id, status: 'active' })
      toast.push('success', `Member created${created?.member_code ? ` — ${created.member_code}` : ''}`)
      onClose()
    } catch (err) {
      toast.push('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Create member — ${referral.full_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button form="approve-referral" type="submit" loading={busy}>Create and approve</Button>
        </>
      }
    >
      <form id="approve-referral" onSubmit={onSubmit} className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Placed under <strong>{referral.sponsor?.full_name}</strong>{' '}
          <span className="font-mono">{referral.sponsor?.member_code}</span> as a direct member. They will see
          this person in their team as soon as the account is active.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={referral.full_name} readOnly className="bg-slate-50" />
          </Field>
          <Field label="Mobile">
            <Input value={referral.mobile} readOnly className="bg-slate-50" />
          </Field>
          <Field label="Login email" required hint="Used to sign in">
            <Input
              name="email"
              type="email"
              required
              defaultValue={referral.email ?? `${referral.mobile}@members.rgc.local`}
            />
          </Field>
          <Field label="Temporary password" required hint="Share it with the member">
            <Input name="password" required minLength={8} defaultValue="Member@123" />
          </Field>
          <Field label="Starting rank">
            <Select name="rank_id" defaultValue={entryRank?.id ?? ''}>
              {ranks.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}

function RejectModal({ referral, onClose }: { referral: ReferralRequest; onClose: () => void }) {
  const decide = useDecideReferral()
  const toast = useToast()
  const [reason, setReason] = useState('')

  return (
    <Modal
      open
      onClose={onClose}
      title={`Decline referral — ${referral.full_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={decide.isPending}
            onClick={() =>
              decide.mutate(
                { id: referral.id, status: 'rejected', reject_reason: reason },
                {
                  onSuccess: () => { toast.push('success', 'Referral declined'); onClose() },
                  onError: (e) => toast.push('error', (e as Error).message),
                },
              )
            }
          >
            Decline referral
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        {referral.sponsor?.full_name} sees this reason on their Refer a Member screen.
      </p>
      <Field label="Reason" required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}
