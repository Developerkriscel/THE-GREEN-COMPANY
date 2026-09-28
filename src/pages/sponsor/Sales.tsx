import { useMemo, useState } from 'react'
import { BadgeCheck, Clock, IndianRupee, Plus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  useMyLedger, useMySales, useSponsorProfile, isCounted,
} from '@/lib/sponsor'
import {
  salesSummary, saleStage,
  type SaleStage,
} from '@/lib/sponsor-crm'
import {
  Badge, Button, Card, CardHeader, EmptyState, PageHeader,
  RecordCard, Responsive, StatTile, Table, Td, Th,
} from '@/components/ui'
import { Area, Notice, SkeletonRows, SkeletonTiles } from '@/components/sponsor'
import { NewPlotSale } from '@/components/NewPlotSale'
import { date, money, moneyShort, num } from '@/lib/format'

/**
 * Plot Sales — the member files a sale they closed, and watches it through
 * verification.
 *
 * Nothing here credits money. The row sits as pending until the office
 * verifies it; the income is then distributed server-side by
 * trg_bookings_income_sync, which is why the Direct Income column can be
 * empty on a sale that is otherwise complete — it fills the moment the
 * office confirms.
 */

const STAGE_TONE: Record<SaleStage, 'green' | 'amber' | 'red' | 'neutral'> = {
  verified: 'green',
  pending: 'amber',
  rejected: 'red',
  cancelled: 'neutral',
}

const STAGE_LABEL: Record<SaleStage, string> = {
  verified: 'Verified',
  pending: 'Pending verification',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function SponsorSales() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: member } = useSponsorProfile(me)
  const { data: sales = [], isLoading } = useMySales(me)
  const { data: ledger = [] } = useMyLedger(me)
  const [adding, setAdding] = useState(false)

  const summary = useMemo(() => salesSummary(sales), [sales])

  // Direct income is credited per booking, so it can be read straight off the
  // ledger rather than recomputed from the rank percentage — a rate change
  // must never rewrite what a member was actually paid.
  const directFor = useMemo(() => {
    const byBooking = new Map<string, number>()
    for (const l of ledger) {
      if (!l.booking_id || l.source !== 'direct_income' || !isCounted(l)) continue
      byBooking.set(l.booking_id, (byBooking.get(l.booking_id) ?? 0) + Number(l.net ?? 0))
    }
    return byBooking
  }, [ledger])

  const onHold = Boolean(member?.frozen) || member?.status === 'suspended'

  return (
    <>
      <PageHeader
        title="Plot Sales"
        description="Add a sale you closed. It appears in your verified list and direct income only after the office verifies it."
        action={
          <Button onClick={() => setAdding(true)} disabled={onHold}>
            <Plus className="h-4 w-4" /> Add sale
          </Button>
        }
      />

      {onHold && (
        <div className="mb-5">
          <Notice tone="error" title="Your account is on hold.">
            You can see everything here, but new sales cannot be filed until the office lifts the hold.
          </Notice>
        </div>
      )}

      {isLoading ? (
        <SkeletonTiles count={4} />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Verified sales" value={num(summary.verified)}
            hint={moneyShort(summary.verifiedValue)} tone="green"
            icon={<BadgeCheck className="h-4 w-4" />}
          />
          <StatTile
            label="Pending verification" value={num(summary.pending)}
            hint={summary.pending ? moneyShort(summary.pendingValue) : 'Nothing waiting'}
            tone={summary.pending ? 'amber' : 'neutral'}
            icon={<Clock className="h-4 w-4" />}
          />
          <StatTile
            label="Total submitted" value={num(summary.submitted)}
            hint="Excluding cancelled" tone="blue"
            icon={<IndianRupee className="h-4 w-4" />}
          />
          <StatTile
            label="Verified area" value={`${num(summary.verifiedArea)} sq yd`}
            hint="Counts toward rewards once half paid" tone="violet"
            icon={<BadgeCheck className="h-4 w-4" />}
          />
        </div>
      )}

      <Card>
        <CardHeader title="My sales" subtitle={`${sales.length} record${sales.length === 1 ? '' : 's'}`} />
        {isLoading ? (
          <SkeletonRows rows={5} />
        ) : sales.length === 0 ? (
          <EmptyState
            title="No sales yet"
            description='Click "Add sale" to file the first plot sale you closed.'
            action={<Button onClick={() => setAdding(true)} disabled={onHold}><Plus className="h-4 w-4" /> Add sale</Button>}
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th>Ref</Th><Th>Project / Plot</Th><Th>Customer</Th><Th>Referrer sponsor</Th>
                    <Th>Area</Th><Th>Amount</Th><Th>Direct income</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const stage = saleStage(s.status)
                    const direct = directFor.get(s.id)
                    return (
                      <tr key={s.id}>
                        <Td>
                          <span className="font-medium text-slate-900">{s.reference}</span>
                          <p className="text-xs text-slate-400">{date(s.created_at)}</p>
                        </Td>
                        <Td>
                          {s.project?.name ?? '—'}
                          <p className="text-xs text-slate-400">Plot {s.plot?.number ?? '—'}</p>
                        </Td>
                        <Td>
                          {s.customer_name ?? '—'}
                          {s.customer_phone && <p className="text-xs text-slate-400">{s.customer_phone}</p>}
                        </Td>
                        <Td>
                          {member?.full_name ?? '—'}
                          <p className="text-xs text-slate-400">{member?.member_code ?? ''}</p>
                        </Td>
                        <Td><Area value={s.plot?.size ?? 0} /></Td>
                        <Td>{money(s.sale_value)}</Td>
                        <Td>
                          {direct ? (
                            <span className="font-medium text-emerald-700">{money(direct)}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                          {stage === 'rejected' && s.reject_remark && (
                            <p className="mt-0.5 max-w-[16rem] text-xs text-rose-600">{s.reject_remark}</p>
                          )}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {sales.map((s) => {
                  const stage = saleStage(s.status)
                  const direct = directFor.get(s.id)
                  return (
                    <RecordCard
                      key={s.id}
                      title={s.reference}
                      subtitle={`${s.project?.name ?? '—'} · Plot ${s.plot?.number ?? '—'}`}
                      badge={<Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>}
                      amount={<span className="text-sm font-semibold">{money(s.sale_value)}</span>}
                      rows={[
                        { label: 'Customer', value: s.customer_name ?? '—' },
                        { label: 'Area', value: <Area value={s.plot?.size ?? 0} /> },
                        { label: 'Direct income', value: direct ? money(direct) : '—' },
                        { label: 'Filed', value: date(s.created_at) },
                      ]}
                    />
                  )
                })}
              </div>
            }
          />
        )}
      </Card>

      {adding && <NewPlotSale onClose={() => setAdding(false)} />}
    </>
  )
}

/* -------------------------------------------------------- verified only */

/**
 * Verified Sales — the same records, narrowed to the ones the office has
 * confirmed and money has been paid on.
 *
 * It exists as its own screen because the two answer different questions:
 * Plot Sales is "what have I filed and where has it got to", Verified Sales
 * is "what have I actually been paid for". Mixing them means a member
 * counting income from a sale nobody has checked yet.
 */
export function SponsorVerifiedSales() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: sales = [], isLoading } = useMySales(me)
  const { data: ledger = [] } = useMyLedger(me)

  const verified = useMemo(
    () => sales.filter((s) => saleStage(s.status) === 'verified'),
    [sales],
  )

  const directFor = useMemo(() => {
    const byBooking = new Map<string, number>()
    for (const l of ledger) {
      if (!l.booking_id || l.source !== 'direct_income' || !isCounted(l)) continue
      byBooking.set(l.booking_id, (byBooking.get(l.booking_id) ?? 0) + Number(l.net ?? 0))
    }
    return byBooking
  }, [ledger])

  const value = verified.reduce((n, s) => n + Number(s.sale_value ?? 0), 0)
  const area = verified.reduce((n, s) => n + Number(s.plot?.size ?? 0), 0)
  const earned = verified.reduce((n, s) => n + (directFor.get(s.id) ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Verified Sales"
        description="Sales the office has confirmed. These are the ones your income and rewards are built on."
      />

      {isLoading ? (
        <SkeletonTiles count={4} />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Verified sales" value={num(verified.length)} tone="green"
            hint="Confirmed by the office" icon={<BadgeCheck className="h-4 w-4" />} />
          <StatTile label="Sale value" value={moneyShort(value)} tone="gold"
            hint="Lifetime" icon={<IndianRupee className="h-4 w-4" />} />
          <StatTile label="Area sold" value={`${num(area)} sq yd`} tone="violet"
            hint="Counts toward rewards once half paid" icon={<BadgeCheck className="h-4 w-4" />} />
          <StatTile label="Direct income" value={moneyShort(earned)} tone="blue"
            hint="Net of TDS and admin charge" icon={<IndianRupee className="h-4 w-4" />} />
        </div>
      )}

      <Card>
        <CardHeader title="Confirmed sales" subtitle={`${verified.length} record${verified.length === 1 ? '' : 's'}`} />
        {isLoading ? (
          <SkeletonRows rows={5} />
        ) : verified.length === 0 ? (
          <EmptyState
            title="Nothing verified yet"
            description="Sales you file appear here once the office has confirmed them."
          />
        ) : (
          <Responsive
            table={
              <Table>
                <thead>
                  <tr>
                    <Th>Ref</Th><Th>Project / Plot</Th><Th>Customer</Th>
                    <Th>Area</Th><Th>Amount</Th><Th>Direct income</Th><Th>Verified</Th>
                  </tr>
                </thead>
                <tbody>
                  {verified.map((s) => (
                    <tr key={s.id}>
                      <Td><span className="font-medium text-slate-900">{s.reference}</span></Td>
                      <Td>
                        {s.project?.name ?? '—'}
                        <p className="text-xs text-slate-400">Plot {s.plot?.number ?? '—'}</p>
                      </Td>
                      <Td>{s.customer_name ?? '—'}</Td>
                      <Td><Area value={s.plot?.size ?? 0} /></Td>
                      <Td>{money(s.sale_value)}</Td>
                      <Td className="font-medium text-emerald-700">
                        {directFor.get(s.id) ? money(directFor.get(s.id)!) : '—'}
                      </Td>
                      <Td>{s.step3_at ? date(s.step3_at) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            }
            cards={
              <div>
                {verified.map((s) => (
                  <RecordCard
                    key={s.id}
                    title={s.reference}
                    subtitle={`${s.project?.name ?? '—'} · Plot ${s.plot?.number ?? '—'}`}
                    amount={<span className="text-sm font-semibold">{money(s.sale_value)}</span>}
                    badge={<Badge tone="green">Verified</Badge>}
                    rows={[
                      { label: 'Customer', value: s.customer_name ?? '—' },
                      { label: 'Area', value: <Area value={s.plot?.size ?? 0} /> },
                      { label: 'Direct income', value: directFor.get(s.id) ? money(directFor.get(s.id)!) : '—' },
                      { label: 'Verified', value: s.step3_at ? date(s.step3_at) : '—' },
                    ]}
                  />
                ))}
              </div>
            }
          />
        )}
      </Card>
    </>
  )
}
