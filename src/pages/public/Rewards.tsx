import { RewardArt } from '@/components/RewardArt'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useWebsiteRewards } from '@/lib/website-rewards'
import { licenseUrl, rewardPhotoCredit } from '@/lib/reward-photos'

const RGA = 'https://royalgreencompany.com/assets'

/** Seed rows for the CMS "load defaults" button. */
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
  // Website CMS -> Rewards (the rank plan's rewards only if that list is empty).
  const rewards = useWebsiteRewards()
  const credited = rewards.flatMap((r) => {
    const c = rewardPhotoCredit(r.img)
    return c ? [{ key: r.key, title: r.title, rank: r.rank, ...c }] : []
  })
  // "Photo credits" on the home page links here with #photo-credits.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash && rewards.length) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash, rewards.length])
  return (
    <>
      {/* Hero */}
      <section
        className="py-20 text-white text-center relative overflow-hidden"
        style={{ background: 'radial-gradient(circle at 85% 15%, rgb(var(--c-gold) / .2), transparent 45%), linear-gradient(135deg, rgb(var(--c-dark)) 0%, rgb(var(--c-darker)) 55%, rgb(var(--c-leaf-dark)) 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Trending Achievements</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Reward Income</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            Every milestone unlocks a reward. Hit the target — claim the prize.
          </p>
        </div>
      </section>

      {/* Rewards Grid — Business Settings → Rank plan */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          {rewards.length === 0 ? (
            <p className="py-10 text-center text-gray-500">The reward list is being updated. Please check back soon.</p>
          ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.map((r) => (
              <div key={r.key} className="group flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-elegant transition-all duration-300 overflow-hidden">
                <div className="relative aspect-[4/3] overflow-hidden bg-brand-dark">
                  {r.img ? (
                    <img src={r.img} alt={r.title} loading="lazy"
                      className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <RewardArt title={r.title} className="h-full" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3 text-center">
                    <p className="text-xl font-extrabold leading-tight text-white drop-shadow">{r.title}</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-brand-primary/10 p-3 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-1">Rank</p>
                      <p className="text-sm font-bold text-brand-darker">{r.rank ?? '—'}</p>
                    </div>
                    <div className="rounded-xl bg-brand-darker/5 p-3 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-brand-darker mb-1">Reward slab</p>
                      <p className="text-sm font-bold text-brand-darker">{r.slab ?? '—'}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-gold-metal/20 px-3 py-2 text-center ring-1 ring-brand-gold/30">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-gold-deep">Sales target</p>
                    <p className="text-sm font-bold text-brand-darker">{r.target ?? '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}

          {credited.length > 0 && (
            <details id="photo-credits" className="mt-8 scroll-mt-28 rounded-2xl border border-gray-100 bg-gray-50 p-5 text-sm text-gray-600" open={hash === '#photo-credits'}>
              <summary className="cursor-pointer font-semibold text-brand-darker">Photo credits</summary>
              <p className="mt-2 text-xs text-gray-500">Photos are illustrative of each reward and are from Wikimedia Commons, cropped to fit.</p>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {credited.map((c) => (
                  <li key={c.key}>
                    <span className="font-medium text-brand-darker">{c.title}{c.rank ? ` (${c.rank})` : ''}</span>
                    {' — '}<a href={c.source} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-primary">photo</a>
                    {' by '}{c.author}, <a href={licenseUrl(c.license)} target="_blank" rel="noopener noreferrer license" className="underline hover:text-brand-primary">{c.license}</a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Disclaimer */}
          <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ Rewards count after 50% payment is received on the plot sale. Reward count is 4 months wise. Effective date: 1st Sep 2026 to 31st Dec 2026.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-leaf-deep py-16">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-extrabold text-white">Start Unlocking Rewards Today</h2>
          <p className="mt-3 text-white/70">Every joining brings you closer to your next reward milestone.</p>
          <a href="/register" className="btn-gold mt-6 rounded-xl px-8 py-3.5 text-sm">
            Join Now — Free
          </a>
        </div>
      </section>
    </>
  )
}
