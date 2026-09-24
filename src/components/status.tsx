import { Check, Circle, X } from 'lucide-react'
import { Badge, type Tone } from '@/components/ui'
import { dateTime, titleCase } from '@/lib/format'
import type {
  ApprovalStatus,
  CommissionStatus,
  EmiStatus,
  KycStatus,
  LeadStatus,
  PlotStatus,
} from '@/lib/types'

const APPROVAL: Record<ApprovalStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  step1_done: { tone: 'blue', label: 'Awaiting review' },
  step2_approved: { tone: 'violet', label: 'Awaiting admin' },
  confirmed: { tone: 'green', label: 'Confirmed' },
  rejected: { tone: 'red', label: 'Rejected' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
}

const PLOT: Record<PlotStatus, Tone> = {
  available: 'green',
  token: 'amber',
  booked: 'blue',
  registered: 'violet',
  sold: 'neutral',
  blocked: 'red',
}

const LEAD: Record<LeadStatus, Tone> = {
  new: 'blue',
  contacted: 'violet',
  visit_scheduled: 'amber',
  negotiation: 'gold',
  converted: 'green',
  lost: 'red',
}

const EMI: Record<EmiStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'neutral', label: 'Pending' },
  awaiting_verification: { tone: 'amber', label: 'Awaiting verification' },
  paid: { tone: 'green', label: 'Paid' },
  overdue: { tone: 'red', label: 'Overdue' },
  rejected: { tone: 'red', label: 'Slip rejected' },
}

const COMMISSION: Record<CommissionStatus, Tone> = {
  accrued: 'amber',
  approved: 'blue',
  paid: 'green',
  cancelled: 'neutral',
}

const KYC: Record<KycStatus, Tone> = {
  pending: 'amber',
  verified: 'green',
  rejected: 'red',
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const s = APPROVAL[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function PlotBadge({ status }: { status: PlotStatus }) {
  return <Badge tone={PLOT[status]}>{titleCase(status)}</Badge>
}

export function LeadBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD[status]}>{titleCase(status)}</Badge>
}

export function EmiBadge({ status }: { status: EmiStatus }) {
  const s = EMI[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function CommissionBadge({ status }: { status: CommissionStatus }) {
  return <Badge tone={COMMISSION[status]}>{titleCase(status)}</Badge>
}

export function KycBadge({ status }: { status: KycStatus }) {
  return <Badge tone={KYC[status]}>{titleCase(status)}</Badge>
}

export function RankBadge({ name }: { name?: string | null }) {
  if (!name) return null
  return <Badge tone="gold">{name}</Badge>
}

/**
 * The 3-step approval chain, rendered identically for bookings and sales.
 * Steps are staff/admin review gates — they are not an earnings chain.
 */
export function ApprovalTimeline({
  status,
  step1At,
  step2At,
  step3At,
  rejectStep,
  rejectRemark,
}: {
  status: ApprovalStatus
  step1At: string | null
  step2At: string | null
  step3At: string | null
  rejectStep?: number | null
  rejectRemark?: string | null
}) {
  const steps = [
    { n: 1, label: 'Submitted by rep', at: step1At, done: Boolean(step1At) },
    {
      n: 2,
      label: 'Reviewed (manager / admin)',
      at: step2At,
      done: ['step2_approved', 'confirmed'].includes(status),
    },
    { n: 3, label: 'Final approval (admin)', at: step3At, done: status === 'confirmed' },
  ]

  return (
    <div>
      <ol className="space-y-3">
        {steps.map((s) => {
          const failed = status === 'rejected' && rejectStep === s.n
          return (
            <li key={s.n} className="flex items-start gap-3">
              <span
                className={
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                  (failed
                    ? 'bg-red-100 text-red-700'
                    : s.done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400')
                }
              >
                {failed ? <X className="h-3.5 w-3.5" /> : s.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
              </span>
              <div className="min-w-0">
                <p className={'text-sm font-medium ' + (s.done ? 'text-slate-900' : 'text-slate-500')}>
                  Step {s.n} — {s.label}
                </p>
                <p className="text-xs text-slate-500">{s.at ? dateTime(s.at) : 'Pending'}</p>
              </div>
            </li>
          )
        })}
      </ol>
      {status === 'rejected' && rejectRemark && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <span className="font-semibold">Rejection remark:</span> {rejectRemark}
        </p>
      )}
    </div>
  )
}
