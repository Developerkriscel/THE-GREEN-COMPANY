import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Crown, Medal } from 'lucide-react'
import { assetUrl } from '@/lib/supabase'

export interface Leader {
  id: string
  name: string
  rank: string | null
  photo_url: string | null
  direct_team: string | null
  total_sales: string | null
  /** The spotlight paragraph (Website CMS → Achievers). */
  achievement: string | null
}

const initialsOf = (name: string) =>
  name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

/** A photo that falls back to initials when the file cannot be loaded. */
export function PersonPhoto({ src, name, className = '', initialsClass = 'text-5xl' }: { src: string | null; name: string; className?: string; initialsClass?: string }) {
  const [failed, setFailed] = useState(false)
  const url = src ? assetUrl(src) : null
  if (!url || failed) {
    return <div className={`flex items-center justify-center bg-gradient-to-br from-brand-dark to-brand-darker font-black text-white/30 ${initialsClass} ${className}`}>{initialsOf(name)}</div>
  }
  return <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} className={`object-cover object-top ${className}`} />
}

/* Twinkling stars, placed once (deterministic, so server and client agree). */
const STARS = [
  [8, 6, 22], [22, 34, 14], [30, 12, 18], [44, 72, 12], [48, 18, 10], [58, 64, 22], [63, 8, 14],
  [70, 88, 18], [76, 4, 20], [86, 12, 12], [92, 40, 16], [95, 80, 20], [18, 86, 14], [36, 92, 20], [3, 60, 12],
] as const

/**
 * "Real leaders. Real rewards." — a spotlight that turns through the five
 * leaders (Rank #N champion, their paragraph, direct team, total sales and
 * rank, their portrait in a gold ring), and the five cards below it. Tapping
 * a card puts that leader in the spotlight. Everything is edited in
 * Website CMS → Achievers.
 */
export function LeadersSection({ leaders }: { leaders: Leader[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = leaders.length

  useEffect(() => {
    if (paused || n < 2) return
    const t = window.setInterval(() => setActive((i) => (i + 1) % n), 7000)
    return () => window.clearInterval(t)
  }, [paused, n])

  if (!n) return null
  const l = leaders[Math.min(active, n - 1)]
  const go = (d: number) => setActive((i) => (i + d + n) % n)

  return (
    <section
      id="leaders-top"
      className="relative overflow-hidden py-20"
      style={{ background: 'radial-gradient(circle at 80% 45%, rgb(var(--c-orange) / .42), transparent 46%), radial-gradient(circle at 20% 15%, rgb(var(--c-gold) / .12), transparent 40%), linear-gradient(135deg, rgb(var(--c-darker)) 0%, rgb(var(--c-dark)) 55%, rgb(var(--c-leaf-dark)) 100%)' }}
    >
      <style>{`
        @keyframes rsgc-twinkle { 0%, 100% { opacity: .35; transform: scale(.85) rotate(0deg) } 50% { opacity: 1; transform: scale(1.15) rotate(18deg) } }
        @keyframes rsgc-glow { 0%, 100% { box-shadow: 0 0 40px 6px rgb(var(--c-gold) / .35) } 50% { box-shadow: 0 0 70px 14px rgb(var(--c-gold) / .55) } }
        @keyframes rsgc-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
      `}</style>
      {STARS.map(([x, y, s], i) => (
        <span key={i} aria-hidden className="pointer-events-none absolute text-brand-gold"
          style={{ left: `${x}%`, top: `${y}%`, fontSize: s, animation: `rsgc-twinkle ${2.4 + (i % 5) * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>★</span>
      ))}

      <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
        {/* ---------------------------------------------------- spotlight */}
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div key={`text-${l.id}`} style={{ animation: 'rsgc-rise .6s ease-out both' }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/50 bg-black/20 px-4 py-1.5 text-xs font-bold uppercase tracking-[.25em] text-brand-gold-light">
              <Crown className="h-4 w-4" /> Rank #{active + 1} Champion
            </span>
            <h2 className="mt-5 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Meet Our <span className="bg-gradient-to-r from-brand-gold-light via-brand-gold to-brand-orange bg-clip-text text-transparent">Top Achiever</span>
            </h2>
            {l.achievement && <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">{l.achievement}</p>}

            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {[
                [l.direct_team || '—', 'Direct team'],
                [l.total_sales || '—', 'Total sales'],
                [l.rank || '—', 'Rank'],
              ].map(([v, k]) => (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-4 text-center backdrop-blur">
                  <p className="text-xl font-extrabold text-brand-gold-light sm:text-2xl">{v}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/55 sm:text-xs">{k}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/register" className="btn-gold rounded-xl px-7 py-3 text-sm">
                Chase the Crown
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
              {n > 1 && (
                <div className="flex items-center gap-2">
                  <button aria-label="Previous leader" onClick={() => go(-1)} className="rounded-full border border-white/20 p-2 text-white/80 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
                  {leaders.map((x, i) => (
                    <button key={x.id} aria-label={x.name} onClick={() => setActive(i)}
                      className={`h-2 rounded-full transition-all ${i === active ? 'w-6 bg-brand-gold' : 'w-2 bg-white/30 hover:bg-white/60'}`} />
                  ))}
                  <button aria-label="Next leader" onClick={() => go(1)} className="rounded-full border border-white/20 p-2 text-white/80 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>

          <div key={`photo-${l.id}`} className="flex flex-col items-center" style={{ animation: 'rsgc-rise .6s ease-out both' }}>
            <div className="relative">
              <div className="rounded-full bg-gradient-to-br from-brand-gold-light via-brand-gold to-brand-orange p-2.5" style={{ animation: 'rsgc-glow 3.5s ease-in-out infinite' }}>
                <div className="h-64 w-64 overflow-hidden rounded-full border-4 border-brand-darker sm:h-80 sm:w-80">
                  <PersonPhoto src={l.photo_url} name={l.name} className="h-full w-full" initialsClass="text-7xl" />
                </div>
              </div>
              <span aria-hidden className="absolute -left-4 top-6 text-3xl text-brand-gold" style={{ animation: 'rsgc-twinkle 2.6s ease-in-out infinite' }}>✦</span>
              <span aria-hidden className="absolute -right-3 bottom-10 text-2xl text-brand-gold-light" style={{ animation: 'rsgc-twinkle 3.1s ease-in-out .5s infinite' }}>✦</span>
            </div>
            <div className="-mt-6 relative rounded-2xl border border-brand-gold/40 bg-brand-darker/90 px-8 py-4 text-center shadow-elegant backdrop-blur">
              <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[.25em] text-brand-gold-light">
                <Medal className="h-4 w-4" /> Champion of the season
              </p>
              <p className="mt-1 text-2xl font-extrabold uppercase tracking-wide text-white">{l.name}</p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- all leaders */}
        <div className="mt-20 text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Meet Our Top Achievers</span>
          <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl leading-tight">
            Real leaders. <span className="text-brand-primary-glow">Real rewards.</span>
          </h2>
          <div className="gold-rule" aria-hidden><i /></div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {leaders.map((x, i) => (
            <button key={x.id} type="button" onClick={() => { setActive(i); setPaused(true); window.scrollTo({ top: (document.getElementById('leaders-top')?.getBoundingClientRect().top ?? 0) + window.scrollY - 120, behavior: 'smooth' }) }}
              className={`group relative overflow-hidden rounded-2xl border bg-white/[0.06] text-left backdrop-blur transition hover:-translate-y-1 ${i === active ? 'border-brand-gold ring-2 ring-brand-gold/60' : 'border-brand-gold/25 hover:border-brand-gold/60'}`}>
              <div className="relative h-72 overflow-hidden bg-brand-dark sm:h-64 lg:h-56">
                <PersonPhoto src={x.photo_url} name={x.name} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gold-metal text-sm font-black text-brand-darker shadow">{i + 1}</span>
                <div className="absolute inset-x-3 bottom-3">
                  <p className="text-lg font-extrabold leading-tight text-white">{x.name}</p>
                  {x.rank && <span className="mt-1 inline-block rounded-full bg-gold-metal px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-darker">{x.rank}</span>}
                </div>
              </div>
              <dl className="grid grid-cols-2 divide-x divide-white/10 text-center">
                <div className="px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Direct team</dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-brand-primary-glow">{x.direct_team || '—'}</dd>
                </div>
                <div className="px-2 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total sales</dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-brand-primary-glow">{x.total_sales || '—'}</dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
