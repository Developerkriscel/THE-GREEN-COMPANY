import clsx from 'clsx'
import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, type Tone } from '@/components/ui'
import { money, num } from '@/lib/format'
import type { LedgerRow, WithdrawalRow } from '@/lib/sponsor'

/* ---------------------------------------------------------------- statuses */

const WITHDRAWAL_TONE: Record<WithdrawalRow['status'], Tone> = {
  requested: 'amber',
  approved: 'blue',
  paid: 'green',
  rejected: 'red',
  cancelled: 'neutral',
}

export function WithdrawalBadge({ status }: { status: WithdrawalRow['status'] }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return <Badge tone={WITHDRAWAL_TONE[status] ?? 'neutral'}>{label}</Badge>
}

export function MemberStatusBadge({ status, frozen }: { status: string; frozen?: boolean }) {
  if (frozen) return <Badge tone="red">On hold</Badge>
  const tone: Tone = status === 'active' ? 'green' : status === 'suspended' ? 'red' : 'amber'
  const label = status === 'suspended' ? 'On hold' : status === 'pending' ? 'Inactive' : 'Active'
  return <Badge tone={tone}>{label}</Badge>
}

/* ------------------------------------------------------------------ money */

/**
 * The house rule from the business plan: a screen may never show a gross amount
 * on its own. Net leads; the deductions that produced it sit underneath.
 */
export function NetAmount({
  row,
  rates,
  align = 'right',
}: {
  row: Pick<LedgerRow, 'gross' | 'tds' | 'admin_charge' | 'net' | 'kind' | 'status'>
  rates?: { tds_pct: number; admin_pct: number }
  align?: 'left' | 'right'
}) {
  const debit = row.kind === 'debit'
  const reversed = row.status === 'reversed'
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p
        className={clsx(
          'font-semibold tabular-nums',
          reversed && 'text-slate-400 line-through',
          !reversed && (debit ? 'text-slate-500' : 'text-slate-900'),
        )}
      >
        {debit ? '−' : ''}
        {money(Math.abs(Number(row.net)))}
      </p>
      {Number(row.gross) > 0 && Number(row.gross) !== Number(row.net) && (
        <p className="text-[11px] text-slate-500">
          {money(row.gross)} gross · TDS {money(row.tds)}
          {rates ? ` (${rates.tds_pct}%)` : ''} · admin {money(row.admin_charge)}
          {rates ? ` (${rates.admin_pct}%)` : ''}
        </p>
      )}
    </div>
  )
}

/** Indian square-yard figure, unit always stated. */
export function Area({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <>—</>
  return <>{num(Number(value))} sq yd</>
}

/* --------------------------------------------------------------- progress */

export function ProgressBar({
  percent,
  tone = 'brand',
  className,
}: {
  percent: number
  tone?: 'brand' | 'green' | 'amber'
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, percent))
  const fill =
    tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand-600'
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={clsx('h-full rounded-full transition-all', fill)} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** A requirement line: the numbers first, the bar as support. */
export function RequirementRow({
  label,
  achieved,
  required,
  met,
}: {
  label: string
  achieved: number
  required: number
  met: boolean
}) {
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-700">{label}</span>
        <span className={clsx('text-sm font-semibold tabular-nums', met ? 'text-emerald-700' : 'text-slate-900')}>
          {num(achieved)} of {num(required)}
          {met ? ' ✓' : ''}
        </span>
      </div>
      <ProgressBar percent={required ? (achieved / required) * 100 : 0} tone={met ? 'green' : 'brand'} />
    </div>
  )
}

/* ----------------------------------------------------------------- notices */

/**
 * A blocked action always says why and what to do about it — never a silently
 * disabled button. `to` turns the notice into the fix.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  to,
  action,
}: {
  tone?: 'info' | 'warn' | 'error'
  title: string
  children?: ReactNode
  to?: string
  action?: string
}) {
  const skin =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-900'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-800'
  const Icon = tone === 'info' ? Info : AlertTriangle

  const body = (
    <div className={clsx('flex items-start justify-between gap-3 rounded-lg border px-4 py-3', skin)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">{title}</p>
          {children && <div className="mt-0.5 opacity-90">{children}</div>}
        </div>
      </div>
      {to && (
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium">
          {action ?? 'Open'} <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  )

  return to ? (
    <Link to={to} className="block transition hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Skeleton placeholders that match the layout they replace. */
export function SkeletonTiles({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      ))}
    </div>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  )
}

/** Only ever show the last four digits of a payout account. */
export function maskAccount(value: string | null | undefined) {
  if (!value) return '—'
  const clean = value.replace(/\s+/g, '')
  if (clean.length <= 4) return clean
  return `•••• ${clean.slice(-4)}`
}
