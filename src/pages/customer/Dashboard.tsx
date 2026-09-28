import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Gift, IndianRupee, LandPlot, MessageSquareHeart, UserPlus, Wallet } from 'lucide-react'
import { useCustomerOffers } from '@/lib/customers'
import { Card, CardHeader, EmptyState, StatTile } from '@/components/ui'
import { ProgressBar, SkeletonTiles } from '@/components/sponsor'
import { date, money, moneyShort, num } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { ContactCards, StageTimeline, useMyPortfolio } from './common'

export function CustomerDashboard() {
  const { profile, money: rows, totals, loading } = useMyPortfolio()
  const { data: offers = [] } = useCustomerOffers()
  const first = profile?.full_name?.split(' ')[0] ?? ''
  const pct = totals.value > 0 ? Math.round((totals.paid / totals.value) * 100) : 0

  return (
    <>
      {/* Welcome */}
      <div className="bg-leaf-deep relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-luxe ring-1 ring-brand-gold/30 sm:p-8">
        <img src={BRAND.markSquare} alt="" className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-20" aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-gold-light/80">Customer Portal</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Welcome{first ? `, ${first}` : ''}</h1>
        <p className="mt-1 text-sm text-white/70">
          Customer ID <span className="font-mono font-semibold text-brand-gold-light">{profile?.user_code ?? '—'}</span>
        </p>
        {rows.length > 0 && (
          <div className="mt-5 max-w-md">
            <div className="mb-1.5 flex justify-between text-xs text-white/70"><span>Paid so far</span><span>{pct}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gold-metal" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {totals.overdue.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {num(totals.overdue.length)} instalment{totals.overdue.length === 1 ? ' is' : 's are'} past the due date.{' '}
            <Link to="/customer/payments" className="font-semibold underline">Pay or upload the slip</Link>
          </p>
        </div>
      )}

      {loading ? <SkeletonTiles count={4} /> : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="My plots" value={num(rows.length)} icon={<LandPlot className="h-4 w-4" />} />
          <StatTile label="Total value" value={moneyShort(totals.value)} icon={<IndianRupee className="h-4 w-4" />} />
          <StatTile label="Paid" value={moneyShort(totals.paid)} icon={<Wallet className="h-4 w-4" />} hint={`${pct}% of the total`} />
          <StatTile label="Still to pay" value={moneyShort(totals.outstanding)} tone={totals.overdue.length ? 'red' : 'neutral'}
            icon={<CalendarClock className="h-4 w-4" />}
            hint={totals.next ? `Next ${money(totals.next.amount)} on ${date(totals.next.due_date)}` : 'Nothing due'} />
        </div>
      )}

      {/* My plots */}
      <Card className="mb-6">
        <CardHeader title="My plots" subtitle="Where each purchase has got to" action={<Link to="/customer/plots" className="text-sm font-medium text-brand-700 hover:underline">Details</Link>} />
        {!loading && rows.length === 0 ? (
          <EmptyState title="No plot linked yet" description="Once the office links your booking, your plot, payments and papers appear here." />
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(({ booking: b, pct: p, outstanding }) => (
              <div key={b.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.2fr_1fr]">
                <div>
                  <p className="text-base font-bold text-brand-darker">{b.project?.name ?? 'Plot'} · Plot {b.plot?.number ?? '—'}</p>
                  <p className="text-xs text-slate-500">
                    {b.plot?.size ? `${num(b.plot.size)} ${b.plot.size_unit ?? 'sq yd'} · ` : ''}Booking {b.reference} · {money(b.sale_value)}
                  </p>
                  <div className="mt-3 max-w-sm"><ProgressBar percent={p} /></div>
                  <p className="mt-1 text-xs text-slate-500">{p}% paid · {money(outstanding)} to go</p>
                </div>
                <StageTimeline booking={b} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Offers */}
      {offers.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-brand-darker"><Gift className="h-4 w-4 text-brand-gold-dark" /> New offers for you</h2>
            <Link to="/customer/offers" className="text-sm font-medium text-brand-700 hover:underline">All offers</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {offers.slice(0, 3).map((o) => (
              <div key={o.id} className="card-luxe overflow-hidden rounded-2xl border border-brand-gold/20 bg-white shadow-luxe">
                {o.image_url && <img src={o.image_url} alt="" className="h-32 w-full object-cover" />}
                <div className="p-4">
                  <p className="font-bold text-brand-darker">{o.title}</p>
                  {o.body && <p className="mt-1 line-clamp-3 text-sm text-slate-600">{o.body}</p>}
                  {o.valid_until && <p className="mt-2 text-xs font-semibold text-brand-gold-deep">Valid till {date(o.valid_until)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Link to="/customer/refer" className="card-luxe flex items-center gap-4 rounded-2xl border border-brand-gold/20 bg-white p-5 shadow-luxe">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-metal text-brand-darker shadow"><UserPlus className="h-5 w-5" /></span>
          <div><p className="font-bold text-brand-darker">Refer a friend</p><p className="text-sm text-slate-500">Know someone looking for a plot? Send us their name and number.</p></div>
        </Link>
        <Link to="/customer/feedback" className="card-luxe flex items-center gap-4 rounded-2xl border border-brand-gold/20 bg-white p-5 shadow-luxe">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-metal text-brand-darker shadow"><MessageSquareHeart className="h-5 w-5" /></span>
          <div><p className="font-bold text-brand-darker">Share feedback</p><p className="text-sm text-slate-500">Tell us how we are doing — the office reads every message.</p></div>
        </Link>
      </div>

      <ContactCards />
    </>
  )
}
