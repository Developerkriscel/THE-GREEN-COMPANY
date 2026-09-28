import { useState } from 'react'
import { useCmsContent, useRanks } from '@/lib/queries'
import { planRows } from '@/lib/plan'

export const RANKS = [
  // Fallback only, for when the ranks cannot be loaded. The live table is
  // built from the ranks the income engine pays on (planRows), which the
  // office edits in Admin → Business Settings → Rank plan.
  // `direct` is the SPONSOR slab (deck slide 6), `pct` the own-sale slab
  // (slide 5).
  { rank: 'Channel Partner',    joining: 'Free',      direct: '—',  pct: '5%',  features: '₹3,000 training fee · Induction', elite: false },
  { rank: 'Team Coordinator',   joining: '₹1,100',      direct: '2%', pct: '7%',  features: '₹3,000 training fee · Juicer at 100 sq yd', elite: false },
  { rank: 'Manager',            joining: '₹2,100',      direct: '2%', pct: '9%',  features: '₹3,000 training fee · Mixer grinder at 100 sq yd', elite: false },
  { rank: 'Deputy Manager',     joining: '₹3,100',      direct: '2%', pct: '11%', features: '₹3,000 training fee · Mobile phone at 100 sq yd', elite: false },
  { rank: 'AGM',                joining: '₹5,100',    direct: '2%', pct: '13%', features: 'Training free · ₹1,000 monthly salary · Mobile phone at 200 sq yd', elite: false },
  { rank: 'DGM',                joining: '₹11,000',   direct: '1%', pct: '14%', features: 'Training free · ₹2,000 monthly · 1 ticket · Mobile phone at 300 sq yd', elite: false },
  { rank: 'GM',                 joining: '₹21,000',   direct: '1%', pct: '15%', features: 'Training free · ₹5,000 monthly · 2 tickets · Mobile phone at 400 sq yd', elite: false },
  { rank: 'Vice President',     joining: '₹1,00,000', direct: '1%', pct: '16%', features: 'Training free · ₹9,000 monthly · 3 tickets · Laptop at 500 sq yd', elite: false },
  { rank: 'Core Manager',       joining: '₹2,00,000', direct: '1%', pct: '17%', features: '₹12,000 monthly · 5 tickets · Car (₹7 lakh) at 1,300 sq yd', elite: true },
  { rank: 'Sales Country Head', joining: '₹3,00,000', direct: '1%', pct: '18%', features: '₹15,000 monthly · 7 tickets · Car (₹7 lakh) at 1,300 sq yd', elite: true },
  { rank: 'Diamond',            joining: '₹4,00,000', direct: '1%', pct: '19%', features: '₹20,000 monthly · 11 tickets · Brezza at 1,800 sq yd', elite: true },
  { rank: 'Crown',              joining: '₹5,00,000', direct: '1%', pct: '20%', features: '₹1,00,000 monthly · 15 tickets · Ertiga at 2,500 sq yd', elite: true },
]

export const LEVELS = [
  { level: 1, rate: 300, tag: 'MOST REWARDING' },
  { level: 2, rate: 25, tag: '' },
  { level: 3, rate: 25, tag: '' },
  { level: 4, rate: 25, tag: '' },
  { level: 5, rate: 25, tag: '' },
  { level: 6, rate: 25, tag: '' },
  { level: 7, rate: 25, tag: '' },
  { level: 8, rate: 25, tag: '' },
  { level: 9, rate: 25, tag: '' },
  { level: 10, rate: 25, tag: '' },
  { level: 11, rate: 50, tag: '' },
  { level: 12, rate: 50, tag: '' },
  { level: 13, rate: 50, tag: '' },
  { level: 14, rate: 50, tag: '' },
  { level: 15, rate: 50, tag: '' },
  { level: 16, rate: 100, tag: '' },
  { level: 17, rate: 100, tag: '' },
]

export function PlansPage() {
  const [sqyds, setSqyds] = useState(100)
  const { data: rankData = [] } = useRanks()
  const { data: levelRows = [] } = useCmsContent<{ level: number; rate: number; tag: string }>('plan_levels', { activeOnly: true })
  const rankRows = planRows(rankData)
  const ranks = rankRows.length ? rankRows : RANKS
  const levels = levelRows.length ? levelRows : LEVELS

  return (
    <>
      {/* Hero */}
      <section
        className="py-20 text-white text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgb(var(--c-dark)) 0%, rgb(var(--c-darker)) 45%, rgb(var(--c-primary)) 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Direct Sponsor Plan</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Ranks · One Vision</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            From {ranks[0]?.rank} to {ranks[ranks.length - 1]?.rank}. The higher the rank, the higher your own sale percentage, your sponsor percentage and your monthly salary.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {['Direct Sponsor Income', '12-Level Team Payout', 'Elite Rank Rewards', 'Bi-Monthly Payout Cycle'].map(f => (
              <span key={f} className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">
                <svg className="h-3.5 w-3.5 text-brand-primary-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Rank Table */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Sponsor Plan</span>
            <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">Rank & Income Table</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-darker text-white">
                  <th className="py-4 pl-5 pr-3 text-left text-xs font-bold uppercase tracking-wider">#</th>
                  <th className="py-4 px-3 text-left text-xs font-bold uppercase tracking-wider">Rank</th>
                  <th className="py-4 px-3 text-right text-xs font-bold uppercase tracking-wider">Joining (₹)</th>
                  <th className="py-4 px-3 text-right text-xs font-bold uppercase tracking-wider">Sponsor %</th>
                  <th className="py-4 px-3 text-right text-xs font-bold uppercase tracking-wider">Own Sale %</th>
                  <th className="py-4 pl-3 pr-5 text-left text-xs font-bold uppercase tracking-wider hidden lg:table-cell">Features</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranks.map((r, i) => (
                  <tr key={r.rank} className={`transition-colors ${r.elite ? 'bg-brand-gold/5 hover:bg-brand-gold/10' : 'hover:bg-brand-primary/5'}`}>
                    <td className="py-3.5 pl-5 pr-3 text-gray-400 font-medium">{String(i + 1).padStart(2, '0')}</td>
                    <td className="py-3.5 px-3 font-bold text-brand-darker">
                      <span>{r.rank}</span>
                      {r.elite && <span className="ml-2 inline-flex rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-gold-dark">ELITE</span>}
                    </td>
                    <td className="py-3.5 px-3 text-right text-gray-600">{r.joining}</td>
                    <td className="py-3.5 px-3 text-right font-bold text-brand-primary-dark">{r.direct}</td>
                    <td className="py-3.5 px-3 text-right font-semibold text-brand-darker">{r.pct}</td>
                    <td className="py-3.5 pl-3 pr-5 text-xs text-gray-500 hidden lg:table-cell">{r.features}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Level Payout */}
      <section className="py-20 bg-brand-darker">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Level Payout</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white">Level-wise Payout (₹ / SQYDS)</h2>
            <p className="mt-3 text-white/50 max-w-xl mx-auto">
              Earn a fixed rate per SQYDS sold across every level of your team — up to 17 levels deep.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {levels.map(l => (
              <div key={l.level}
                className={`rounded-2xl border p-5 text-center transition-all hover:scale-105 ${l.level === 1 ? 'border-brand-primary-glow/50 bg-brand-primary-glow/10' : 'border-white/10 bg-white/5'}`}>
                {l.tag && <span className="inline-block mb-2 text-[10px] font-bold uppercase tracking-wider text-brand-primary-glow bg-brand-primary-glow/10 rounded-full px-2 py-0.5">{l.tag}</span>}
                <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${l.level === 1 ? 'text-brand-primary-glow' : 'text-white/40'}`}>Level {l.level}</p>
                <p className={`text-2xl font-extrabold ${l.level === 1 ? 'text-brand-primary-glow' : 'text-white'}`}>{l.rate}</p>
                <p className="text-xs text-white/40 mt-1">₹/SQYDS</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Income Estimator */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-10">
              <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Estimator</span>
              <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">Quick Income Estimator</h2>
              <p className="mt-3 text-gray-500">See how much you can earn at any level for a single sale.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 shadow-sm p-8 bg-gray-50">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">SQYDS Sold</label>
              <input
                type="range" min={10} max={500} step={10} value={sqyds}
                onChange={e => setSqyds(Number(e.target.value))}
                className="w-full accent-brand-primary"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1 mb-6">
                <span>10</span><span className="font-bold text-brand-primary-dark">{sqyds} SQYDS</span><span>500</span>
              </div>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                {levels.map(l => (
                  <div key={l.level} className={`flex items-center justify-between px-4 py-2.5 ${l.level === 1 ? 'bg-brand-primary/10' : 'bg-white'}`}>
                    <span className="text-sm font-medium text-gray-600">Level {l.level} — ₹{l.rate}/sqyd</span>
                    <span className={`text-sm font-bold ${l.level === 1 ? 'text-brand-primary-dark' : 'text-gray-800'}`}>
                      ₹{(l.rate * sqyds).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl p-4 text-center"
                style={{ background: 'linear-gradient(135deg, rgb(var(--c-primary-light)), rgb(var(--c-primary-dark)))' }}>
                <p className="text-xs font-bold uppercase tracking-wider text-white/70 mb-1">Level 1 Estimated Payout</p>
                <p className="text-3xl font-extrabold text-white">₹{(300 * sqyds).toLocaleString('en-IN')}</p>
                <p className="text-white/60 text-sm">₹300 × {sqyds} SQYDS</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Payment Cycle */}
      <section className="py-20 bg-gray-50">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Payment Cycle</span>
            <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">When You Get Paid</h2>
            <p className="mt-3 text-gray-500">Payouts run on two fixed dates each month based on the day you joined.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {[
              { label: 'IF YOU JOIN Day 1 – 15', payout: '30th of month', color: 'rgb(var(--c-primary))' },
              { label: 'IF YOU JOIN Day 16 – 30', payout: '15th of next month', color: 'rgb(var(--c-dark))' },
            ].map(p => (
              <div key={p.label} className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm hover:shadow-elegant transition-all">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">{p.label}</p>
                <p className="text-sm text-gray-500 mb-2">Your first payout date is</p>
                <p className="text-2xl font-extrabold" style={{ color: p.color }}>{p.payout}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16"
        style={{ background: 'linear-gradient(135deg, rgb(var(--c-primary)) 0%, rgb(var(--c-primary-dark)) 100%)' }}>
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-extrabold text-white">Ready to Start Earning?</h2>
          <p className="mt-3 text-white/70">
            Join as a {ranks[0]?.rank} — {ranks[0]?.joining === 'Free' ? 'free to join' : `joining ${ranks[0]?.joining}`} — and begin your journey today.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <a href="/register" className="rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-brand-primary-dark shadow-lg hover:-translate-y-0.5 transition-all">
              Register Now — Free
            </a>
            <a href="/sponsor-login" className="rounded-xl border border-white/40 px-8 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all">
              Sponsor Login
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
