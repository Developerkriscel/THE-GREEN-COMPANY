import { useCmsContent } from '@/lib/queries'

const RGA = 'https://royalgreencompany.com/assets'

export const REWARDS = [
  { level: 1, title: 'Darjeeling / GOA', img: `${RGA}/reward-darjeeling-goa-DqX05LnR.jpg`, joining: '3 Fresh Joining', sales: '5 Sales', trending: true },
  { level: 2, title: 'Thailand / iPhone', img: `${RGA}/reward-thailand-iphone-CNLheiAV.jpg`, joining: '6 Fresh Joining', sales: '10 Sales', trending: true },
  { level: 3, title: 'Bullet / Laptop', img: `${RGA}/reward-bullet-laptop-BKH-6qrv.jpg`, joining: '9 Fresh Joining', sales: '15 Sales', trending: true },
  { level: 4, title: 'Car Down Payment', img: `${RGA}/reward-car-down-payment-BOm0GFjW.jpg`, joining: '12 Fresh Joining', sales: '25 Sales', trending: false },
  { level: 5, title: 'Bike + iPhone', img: `${RGA}/reward-bike-iphone-BySU8sap.jpg`, joining: '15 Fresh Joining', sales: '30 Sales', trending: false },
  { level: 6, title: 'Car Full Paid', img: `${RGA}/reward-car-full-paid-0aiysmLt.jpg`, joining: '50 Fresh Joining (Team)', sales: '50 Sales', trending: false },
  { level: 7, title: 'Car Full Paid', img: `${RGA}/reward-car-full-paid-0aiysmLt.jpg`, joining: '100 Fresh Joining (Team)', sales: '75 Sales', trending: false },
  { level: 8, title: 'Car Full Paid', img: `${RGA}/reward-car-full-paid-0aiysmLt.jpg`, joining: '100 Fresh Joining (Team)', sales: '105 Sales', trending: false },
  { level: 9, title: 'Car Full Paid', img: `${RGA}/reward-car-full-paid-0aiysmLt.jpg`, joining: '500 Fresh Joining (Team)', sales: '205 Sales', trending: false },
]

export function RewardsPage() {
  const { data: rows = [] } = useCmsContent<{ level: number; title: string; joining: string; sales: string; image_url: string; trending: boolean }>('rewards', { activeOnly: true })
  const rewards = rows.length
    ? rows.map((r) => ({ level: r.level, title: r.title, img: r.image_url, joining: r.joining, sales: r.sales, trending: r.trending }))
    : REWARDS
  return (
    <>
      {/* Hero */}
      <section
        className="py-20 text-white text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 45%, oklch(62% .19 43) 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Trending Achievements</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Reward Income</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            Every milestone unlocks a reward. Hit the target — claim the prize.
          </p>
        </div>
      </section>

      {/* Rewards Grid */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rewards.map(r => (
              <div key={r.level} className="group rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-elegant transition-all duration-300 overflow-hidden">
                <div className="relative h-52 overflow-hidden">
                  <img src={r.img} alt={r.title}
                    className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="rounded-full bg-[oklch(14%_.05_260)]/80 px-3 py-1 text-xs font-bold text-white uppercase tracking-wider backdrop-blur">
                      Level {r.level}
                    </span>
                    {r.trending && (
                      <span className="rounded-full bg-[oklch(62%_.19_43)] px-3 py-1 text-xs font-bold text-white">
                        🔥 Trending
                      </span>
                    )}
                  </div>
                  <p className="absolute bottom-3 left-3 text-lg font-extrabold text-white">{r.title}</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[oklch(62%_.19_43)]/10 p-3 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-[oklch(62%_.19_43)] mb-1">Joining</p>
                      <p className="text-sm font-bold text-[oklch(14%_.05_260)]">{r.joining}</p>
                    </div>
                    <div className="rounded-xl bg-[oklch(14%_.05_260)]/5 p-3 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-[oklch(14%_.05_260)] mb-1">Sales</p>
                      <p className="text-sm font-bold text-[oklch(14%_.05_260)]">{r.sales}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ Reward will be calculated after 70% received payment on behalf of plot sale. Reward will be announced in 90 days.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16"
        style={{ background: 'linear-gradient(135deg, oklch(62% .19 43) 0%, oklch(54% .19 40) 100%)' }}>
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-extrabold text-white">Start Unlocking Rewards Today</h2>
          <p className="mt-3 text-white/70">Every joining brings you closer to your next reward milestone.</p>
          <a href="/register" className="mt-6 inline-block rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-[oklch(54%_.19_40)] shadow-lg hover:-translate-y-0.5 transition-all">
            Join Now — Free
          </a>
        </div>
      </section>
    </>
  )
}
