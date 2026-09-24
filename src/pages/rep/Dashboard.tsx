import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, ClipboardCheck, ListChecks, ShieldCheck, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBookings, useCommissions, useLeads, useMyKyc } from '@/lib/queries'
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, Spinner, StatTile, Table, Td, Th,
} from '@/components/ui'
import { ApprovalBadge, KycBadge, LeadBadge, RankBadge } from '@/components/status'
import { date, money, moneyShort, num, pct } from '@/lib/format'

/**
 * The sales partner's own panel. Every widget is scoped to this rep's own data —
 * there is no team tree, no wallet fed by other people's sales, and no
 * sponsor/level income anywhere, by design.
 */
export function RepDashboard() {
  const { profile } = useAuth()
  const { data: leads = [], isLoading } = useLeads({})
  const { data: bookings = [] } = useBookings({})
  const { data: commissions = [] } = useCommissions({})
  const { data: kyc } = useMyKyc(profile?.id)

  if (isLoading) return <Spinner />

  const openLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status))
  const followUps = leads
    .filter((l) => l.next_follow_up && !['converted', 'lost'].includes(l.status))
    .sort((a, b) => (a.next_follow_up! < b.next_follow_up! ? -1 : 1))
    .slice(0, 6)

  const pending = bookings.filter((b) => ['step1_done', 'step2_approved'].includes(b.status))
  const confirmed = bookings.filter((b) => b.status === 'confirmed')

  const accrued = commissions.filter((c) => c.status === 'accrued').reduce((t, c) => t + Number(c.net_amount), 0)
  const approved = commissions.filter((c) => c.status === 'approved').reduce((t, c) => t + Number(c.net_amount), 0)
  const paid = commissions.filter((c) => c.status === 'paid').reduce((t, c) => t + Number(c.net_amount), 0)

  const rate = profile?.commission_rate ?? profile?.rank?.own_sale_rate ?? 0

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? 'partner'}`}
        description="Your leads, your bookings and your commission — everything here is yours alone."
        action={
          <div className="flex items-center gap-2">
            {profile?.rank?.name && <RankBadge name={profile.rank.name} />}
            <Badge tone="neutral">{profile?.user_code}</Badge>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open leads" value={num(openLeads.length)} hint={`${num(leads.length)} total`} tone="violet" icon={<ListChecks className="h-4 w-4" />} />
        <StatTile label="Bookings in approval" value={num(pending.length)} hint={`${num(confirmed.length)} confirmed`} tone="amber" icon={<ClipboardCheck className="h-4 w-4" />} />
        <StatTile label="Commission earned" value={moneyShort(paid)} hint={`${moneyShort(accrued + approved)} pending payout`} tone="green" icon={<Banknote className="h-4 w-4" />} />
        <StatTile label="My own-sale rate" value={pct(rate)} hint={profile?.rank?.name ?? 'No rank assigned'} tone="gold" icon={<Wallet className="h-4 w-4" />} />
      </div>

      {kyc?.status !== 'verified' && (
        <Link to="/app/kyc" className="mt-4 block">
          <Card className="border-amber-200 bg-amber-50 transition hover:shadow">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">
                    {kyc ? 'Your KYC is not verified yet' : 'Complete your KYC'}
                  </p>
                  <p className="text-amber-800">Commission can only be paid out once your KYC is verified.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {kyc && <KycBadge status={kyc.status} />}
                <ArrowRight className="h-4 w-4 text-amber-700" />
              </div>
            </div>
          </Card>
        </Link>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Follow-ups due"
            subtitle="Your next conversations"
            action={<Link to="/app/leads" className="text-xs font-medium text-brand-700 hover:underline">All leads</Link>}
          />
          {followUps.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Set a follow-up date on a lead to see it here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Project</Th>
                  <Th>Status</Th>
                  <Th>Follow-up</Th>
                </tr>
              </thead>
              <tbody>
                {followUps.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/app/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                        {l.name}
                      </Link>
                    </Td>
                    <Td className="text-xs">{l.project?.name ?? '—'}</Td>
                    <Td><LeadBadge status={l.status} /></Td>
                    <Td className="text-xs">{date(l.next_follow_up)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="My bookings"
            subtitle="Latest first"
            action={<Link to="/app/bookings" className="text-xs font-medium text-brand-700 hover:underline">All bookings</Link>}
          />
          {bookings.length === 0 ? (
            <EmptyState title="No bookings yet" description="Convert a lead to raise your first booking." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Plot</Th>
                  <Th>Value</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {bookings.slice(0, 6).map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/app/bookings/${b.id}`} className="font-medium text-brand-700 hover:underline">
                        {b.reference}
                      </Link>
                    </Td>
                    <Td className="text-xs">{b.plot?.number ?? '—'}</Td>
                    <Td>{money(b.sale_value)}</Td>
                    <Td><ApprovalBadge status={b.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        You earn commission only on plots you personally sell. There is no income from introducing other
        partners and no share of anyone else's sale — your rank changes your own rate, nothing more.
      </p>
    </>
  )
}
