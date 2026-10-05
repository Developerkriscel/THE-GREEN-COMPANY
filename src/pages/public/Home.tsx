import { Link } from 'react-router-dom'
import { Crown, Gift, Handshake, Ruler, TrendingUp, Users, Wallet } from 'lucide-react'
import { useProjects, useSiteSetting, useCmsContent, useBanners, useRanks } from '@/lib/queries'
import { BRAND } from '@/lib/brand'
import { planRows } from '@/lib/plan'
import { RANKS as PLAN_FALLBACK } from '@/lib/plan-data'
import { money, num } from '@/lib/format'
import { RewardArt } from '@/components/RewardArt'
import type { Rank } from '@/lib/types'
import { useWebsiteRewards } from '@/lib/website-rewards'
import { LeadersSection, PersonPhoto, type Leader } from '@/components/LeadersSection'

const HERO_DEFAULTS = {
  badge: '90 Days Training — Registrations Open',
  title_lead: 'Build Your',
  title_accent: 'Financial Future',
  title_tail: `with ${BRAND.short}`,
  subtitle: `India's trusted ${BRAND.short} network. Earn direct sponsor income, level commissions and lifetime rewards.`,
  primary_cta_label: 'Join as Sponsor',
  primary_cta_link: '/register',
  secondary_cta_label: 'Explore Projects',
  secondary_cta_link: '/projects',
}

/* ── Real image URLs scraped from royalgreencompany.com ── */
const HERO_IMG = 'https://royalgreencompany.com/assets/hero-Cw3CXUiu.jpg'

const SB = 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery'

/** Seed rows for the CMS "load defaults" button; the home page reads the Achievers CMS table. */
export const ACHIEVERS = [
  {
    name: 'NEETA SINGH',
    rank: 'CORE MANAGER',
    img: `${SB}/1783315463802-q2gk3s.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1NDYzODAyLXEyZ2szcy5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1NDY2LCJleHAiOjIwOTg2NzU0NjZ9.C0zdeG5tCcTxhVaBSbc9UN5a3RR6kHElVb2fX-ktWfI`,
  },
  {
    name: 'Dinesh Singh',
    rank: 'AGM / CORE MANAGER',
    img: `${SB}/1783315547058-27fity.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1NTQ3MDU4LTI3Zml0eS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1NTUwLCJleHAiOjIwOTg2NzU1NTB9.ZJe_xlV-t9UkuBdA338WWEQkeWPLvK9_5_OAbumihbs`,
  },
  {
    name: 'AMRENDER SINGH',
    rank: 'PLATINUM',
    img: `${SB}/1783315590913-3o9f6e.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1NTkwOTEzLTNvOWY2ZS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1NTkzLCJleHAiOjIwOTg2NzU1OTN9.D7RvYfSCzAi4JgxPQIKKjw4s_rll0PD05TtrCh1LdaE`,
  },
  {
    name: 'Mamata Rani',
    rank: 'GOLD LEADER',
    img: `${SB}/1783315691434-fh6gm8.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1NjkxNDM0LWZoNmdtOC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1NjkzLCJleHAiOjIwOTg2NzU2OTN9.dDDZzaiAwLQlXkg4e09fw85AqENBAzSlN9U8Epqyc0U`,
  },
  {
    name: 'NEETA SINGH',
    rank: 'CORE MANAGER',
    img: `${SB}/1783315720147-nwmjak.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1NzIwMTQ3LW53bWphay5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1NzIyLCJleHAiOjIwOTg2NzU3MjJ9.Dt1whOSUrHNbj9d4YOrWhZA-d4TT0XSZgUOia2MK60w`,
  },
  {
    name: 'ANAND SWROOP',
    rank: 'DIAMOND',
    img: `${SB}/1783315779976-zgwucj.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1Nzc5OTc2LXpnd3Vjai5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1NzgxLCJleHAiOjIwOTg2NzU3ODF9.xKHqvi9iaKsghPr-bWoQ61f4XtoF3SAy4stfbSVDJTk`,
  },
  {
    name: 'AMAN KUMAR JAISWAL',
    rank: 'CHANNEL PARTNER',
    img: `${SB}/1783315798290-c0sbf3.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1Nzk4MjkwLWMwc2JmMy5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1ODAwLCJleHAiOjIwOTg2NzU4MDB9.bQzKfUnmREsfG816KeWwp0EnxIg4_eTD67iZNMnWkac`,
  },
]

const STATS = [
  { value: '12', label: 'RANK LEVELS' },
  { value: '250+', label: 'PARTNERS' },
  { value: '75+', label: 'ACTIVE PARTNERS' },
  { value: '5+', label: 'CITIES' },
  { value: '₹55+ Lac', label: 'PAYOUTS' },
]

/**
 * The six income streams. Where the rank plan carries the figure (direct
 * income, salary) it is read from it, so the office's edits in Business
 * Settings show here too.
 */
function incomeStreams(ranks: Rank[]) {
  const active = ranks.filter((r) => r.active).sort((a, b) => a.seniority - b.seniority)
  const rates = active.map((r) => Number(r.own_sale_rate)).filter((v) => v > 0)
  const salaried = active.filter((r) => Number(r.salary ?? 0) > 0)
  const firstSalary = salaried[0]
  const topSalary = salaried.length ? Math.max(...salaried.map((r) => Number(r.salary))) : 0
  return [
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: 'Direct Income',
      desc: rates.length
        ? `${num(Math.min(...rates))}% to ${num(Math.max(...rates))}% of every plot you sell, rising with your rank.`
        : 'A share of every plot you sell, rising with your rank.',
    },
    { icon: <Handshake className="h-6 w-6" />, title: 'Sponsor Income', desc: 'The difference between your slab and your team’s slab on every plot your team sells — 2% up to AGM, 1% from DGM.' },
    { icon: <Users className="h-6 w-6" />, title: 'Referral Income', desc: 'Earn when the customers and partners you refer book their plots.' },
    {
      icon: <Gift className="h-6 w-6" />,
      title: 'Reward Income',
      desc: 'Juicer, mixer, mobile phone, laptop and cars — Brezza, Ertiga — as your sales in sq yd grow.',
    },
    {
      icon: <Wallet className="h-6 w-6" />,
      title: 'Salary Income',
      desc: firstSalary
        ? `A fixed monthly salary from ${firstSalary.name} upward — ${money(Number(firstSalary.salary))} to ${money(topSalary)} a month.`
        : 'A fixed monthly salary at the senior ranks.',
    },
    { icon: <Crown className="h-6 w-6" />, title: 'Board of Member Income', desc: 'Diamond and Crown join the Board of Members: 1% of your own team’s turnover plus an iPhone as a gift.' },
  ]
}

/** The company's name, motto and logo, set large: a section heading on its own. */
function CompanyHeading({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const short = BRAND.short || BRAND.name
  const rest = BRAND.name.toUpperCase().startsWith(short.toUpperCase()) ? BRAND.name.slice(short.length).trim() : ''
  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
      <img src={BRAND.markSquare} alt="" className="h-20 w-20 shrink-0 object-contain drop-shadow-lg sm:h-24 sm:w-24" />
      <div className="leading-tight">
        <p className={`text-2xl font-extrabold uppercase tracking-wide sm:text-3xl lg:text-4xl ${tone === 'dark' ? 'text-gold-metal' : 'text-brand-darker'}`}>{short}</p>
        {rest && <p className={`mt-1 text-xs font-bold uppercase tracking-[0.3em] sm:text-sm ${tone === 'dark' ? 'text-white/60' : 'text-brand-gold-deep'}`}>{rest}</p>}
        {BRAND.tagline && <p className={`mt-1.5 text-base font-semibold italic sm:text-lg ${tone === 'dark' ? 'text-brand-gold-light' : 'text-brand-gold-deep'}`}>{BRAND.tagline}</p>}
      </div>
    </div>
  )
}

function initialsOf(name: string) {
  return name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/** A rate per sq yd, e.g. ₹14,500. */
const rate = (v: unknown) => `₹${Number(v).toLocaleString('en-IN')}`

/**
 * A project's rate: pre-launch and launch side by side when both are set
 * (Admin → Projects), otherwise the one rate.
 */
export function ProjectRates({ project }: { project: Record<string, any> }) {
  if (!project.price_from) return <span className="text-sm font-bold text-brand-primary-dark">Contact for price</span>
  const launch = project.price_to && Number(project.price_to) !== Number(project.price_from) ? project.price_to : null
  if (!launch) return <span className="text-sm font-bold text-brand-primary-dark">{rate(project.price_from)} / sq yd</span>
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-brand-gold/10 px-2.5 py-1.5 ring-1 ring-brand-gold/30">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gold-deep">Pre-launch</p>
        <p className="text-sm font-extrabold text-brand-darker">{rate(project.price_from)}<span className="text-[10px] font-semibold text-gray-500"> /sq yd</span></p>
      </div>
      <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 ring-1 ring-gray-200">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Launch</p>
        <p className="text-sm font-extrabold text-brand-darker">{rate(launch)}<span className="text-[10px] font-semibold text-gray-500"> /sq yd</span></p>
      </div>
    </div>
  )
}

/** Exported so ProjectsPage can reuse it. */
export function ProjectCard({ project }: { project: Record<string, any> }) {
  return (
    <Link
      to={`/projects/${project.slug}`}
      className="card-luxe group flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
    >
      {project.hero_image ? (
        <div className="h-40 overflow-hidden">
          <img
            src={project.hero_image}
            alt={project.name}
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-brand-dark to-brand-primary flex items-center justify-center">
          <span className="text-4xl font-black text-white/30">{project.name?.[0]}</span>
        </div>
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">{project.city ?? 'India'}</p>
          {project.sold_out && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">Sold out</span>}
        </div>
        <h3 className="text-base font-bold text-brand-darker group-hover:text-brand-primary-dark transition-colors">{project.name}</h3>
        <p className="mt-1 text-sm text-gray-500 flex-1 line-clamp-2">{project.location}</p>
        <div className="mt-4 space-y-3">
          <ProjectRates project={project} />
          <p className="text-right text-xs text-brand-primary font-semibold">View →</p>
        </div>
      </div>
    </Link>
  )
}

function FeaturedProjects() {
  const { data = [], isLoading } = useProjects({ publishedOnly: true })
  // In the office's order (Admin → Projects → sort order): Symo City, Manglam City, Anjani Kunj.
  const featured = data.filter((p) => p.featured).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).slice(0, 3)
  if (isLoading || featured.length === 0) return null
  return (
    <section className="py-20 bg-gray-50">
      <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Our Developments</span>
          <h2 className="mt-3 text-3xl font-extrabold text-brand-darker sm:text-4xl">
            Built on Trust. Designed for Growth.
          </h2>
          <div className="gold-rule" aria-hidden><i /></div>
          <p className="mt-3 mx-auto max-w-xl text-base text-gray-500">
            From premium plots to integrated townships, every {BRAND.short} project is engineered for long-term value.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/projects"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary-dark hover:text-brand-primary transition-colors">
            View all projects
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ── Main landing page ── */
/** Promotional banners managed from the admin CMS "Banners" tab. Hidden when none are active. */
function PromoBanners() {
  const { data: banners = [] } = useBanners()
  if (banners.length === 0) return null
  return (
    <section className="bg-white py-14">
      <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          {banners.map((b) => (
            <div
              key={b.id}
              className="relative overflow-hidden rounded-2xl p-8 text-white shadow-elegant min-h-[180px] flex flex-col justify-center"
              style={{
                background: b.image_url
                  ? `linear-gradient(120deg, rgb(var(--c-dark) / .82), rgb(var(--c-dark) / .45)), url(${b.image_url}) center/cover`
                  : 'radial-gradient(circle at 85% 15%, rgb(var(--c-gold) / .18), transparent 45%), linear-gradient(135deg, rgb(var(--c-dark)), rgb(var(--c-darker)) 55%, rgb(var(--c-leaf-dark)))',
              }}
            >
              <h3 className="text-2xl font-extrabold">{b.title}</h3>
              {b.subtitle && <p className="mt-2 max-w-md text-white/80">{b.subtitle}</p>}
              {b.cta_label && b.cta_link && (
                <Link
                  to={b.cta_link}
                  className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-primary-dark shadow hover:-translate-y-0.5 transition-all"
                >
                  {b.cta_label}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Home() {
  const { data: rankData = [] } = useRanks()
  // The built-in plan stands in while the ranks load or if they cannot.
  const liveRanks = planRows(rankData)
  const ranks = liveRanks.length ? liveRanks : PLAN_FALLBACK
  const freeCount = ranks.filter((r) => r.joining === 'Free').length
  const streams = incomeStreams(rankData)
  const rewards = useWebsiteRewards()
  const { data: heroCfg } = useSiteSetting('home.hero')
  const hero = { ...HERO_DEFAULTS, ...(heroCfg ?? {}) }
  // A saved button still pointing at the retired Plans page goes to Projects.
  if (/^\/plans/.test(hero.secondary_cta_link ?? '')) {
    hero.secondary_cta_link = HERO_DEFAULTS.secondary_cta_link
    hero.secondary_cta_label = HERO_DEFAULTS.secondary_cta_label
  }
  const { data: leaders = [] } = useCmsContent<Leader>('achievers', { activeOnly: true })
  const { data: team = [] } = useCmsContent<{ id: string; name: string; designation: string; category: string; photo_url: string }>('team_members', { activeOnly: true })
  // Every member on the Team page: directors and managing directors first, then the rest.
  const catOrder: Record<string, number> = { director: 0, managing_director: 1, branch_manager: 2, rank_achiever: 3 }
  const board = [...team].sort((a, b) => (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9))
  // Enough cards to fill a wide screen; the strip is then doubled for a seamless loop.
  const boardLoop = board.length ? Array.from({ length: Math.ceil(8 / board.length) }, () => board).flat() : []
  return (
    <>
      {/* ══════════════════════ HERO ══════════════════════ */}
      <section className="relative flex min-h-[90vh] items-center overflow-hidden">
        {/* Real hero background */}
        <img
          src={HERO_IMG}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="eager"
        />
        {/* Overlay gradient */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgb(var(--c-dark) / .95) 0%, rgb(var(--c-dark) / .7) 50%, rgba(0,0,0,0) 100%)' }}
        />

        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8 py-28 w-full">
          <div className="max-w-2xl">
            {/* Mission badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-darker/40 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary-glow opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-primary" />
              </span>
              <span className="text-xs font-bold uppercase tracking-[.15em] text-brand-primary-glow">
                {hero.badge}
              </span>
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl animate-fade-up">
              {hero.title_lead}{' '}
              <span
                className="text-gold-metal"
              >
                {hero.title_accent}
              </span>{' '}
              {hero.title_tail}
            </h1>
            <p className="mt-5 text-lg text-white/65 leading-relaxed animate-fade-up" style={{ animationDelay: '.1s' }}>
              {hero.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: '.2s' }}>
              <Link
                to={hero.primary_cta_link}
                className="btn-gold rounded-xl px-8 py-3.5 text-sm"
              >
                {hero.primary_cta_label}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                to={hero.secondary_cta_link}
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 backdrop-blur px-8 py-3.5 text-sm font-bold text-white hover:bg-white/20 transition-all"
              >
                {hero.secondary_cta_label}
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-5 animate-fade-up" style={{ animationDelay: '.3s' }}>
              {['Verified Plan', `${ranks.length} Rank Levels`, '250+ Partners'].map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm font-medium text-white/80">
                  <span className="h-2 w-2 rotate-45 bg-brand-gold" aria-hidden />{t}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The coin, floating, on wide screens */}
        <div className="pointer-events-none absolute right-[5%] top-1/2 hidden -translate-y-1/2 lg:block" aria-hidden>
          <div className="relative">
            <div className="absolute inset-6 rounded-full bg-brand-gold/30 blur-3xl" />
            <img src={BRAND.markSquare} alt="" className="coin-float relative w-[300px] xl:w-[360px] drop-shadow-2xl" />
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute inset-x-0 bottom-0">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full">
            <path d="M0 60H1440V20C1200 0 900 40 720 30C540 20 240 0 0 20V60Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ══════════════════════ STATS BAR ══════════════════════ */}
      <section className="bg-brand-darker -mt-1 py-12">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl lg:text-4xl font-extrabold text-gold-metal">{s.value}</p>
                <p className="mt-1 text-xs font-bold tracking-widest uppercase text-white/40">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ PROMO BANNERS ══════════════════════ */}
      <PromoBanners />

      {/* ══════════════════════ INCOME STREAMS ══════════════════════ */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">90 Days Training</span>
            <h2 className="mt-3 text-3xl font-extrabold text-brand-darker sm:text-4xl">
              A plan built for serious earners
            </h2>
            <div className="gold-rule" aria-hidden><i /></div>
            <p className="mt-3 mx-auto max-w-xl text-base text-gray-500">
              Six ways to earn with {BRAND.short} — each one explained in your 90 Days Training.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {streams.map((item, i) => (
              <div
                key={item.title}
                className="card-luxe group relative rounded-2xl border border-gray-100 p-6"
                style={{ background: 'linear-gradient(oklch(1 0 0) 0%, oklch(0.985 0.02 60) 100%)' }}
              >
                <span className="absolute right-5 top-4 text-3xl font-black text-brand-gold/25" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-brand-darker transition-all bg-gold-metal shadow-elegant">
                  {item.icon}
                </div>
                <h3 className="text-base font-bold text-brand-darker mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ TOP ACHIEVER SPOTLIGHT + REAL LEADERS (Website CMS → Achievers) ══════════════════════ */}
      <LeadersSection leaders={leaders} />

      {/* ══════════════════════ BOARD OF MEMBERS (Website CMS → Team: directors) ══════════════════════ */}
      {board.length > 0 && (
        <section className="py-16 bg-gray-50 overflow-hidden">
          <div className="mx-auto max-w-screen-xl px-6 lg:px-8 mb-10 text-center">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Award Achievers Gallery</span>
            <h2 className="mt-2 text-3xl font-extrabold text-brand-darker sm:text-4xl">Board of Members</h2>
            <div className="gold-rule" aria-hidden><i /></div>
            <div className="mt-6 flex justify-center"><CompanyHeading tone="light" /></div>
          </div>

          <div className="relative flex overflow-hidden">
            <div className="flex min-w-max gap-5 animate-marquee hover:[animation-play-state:paused]">
              {[...boardLoop, ...boardLoop].map((m, i) => (
                <div key={i} className="group relative h-[320px] w-[240px] flex-shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-brand-gold/30">
                  <PersonPhoto src={m.photo_url} name={m.name} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105" initialsClass="text-6xl" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-brand-primary-glow">{m.designation}</p>
                    <p className="text-base font-bold text-white">{m.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════ RANKS TABLE ══════════════════════ */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Income Structure</span>
            <h2 className="mt-3 text-3xl font-extrabold text-brand-darker sm:text-4xl">
              Ranks & Sponsor Income
            </h2>
            <div className="gold-rule" aria-hidden><i /></div>
            <p className="mt-3 mx-auto max-w-xl text-base text-gray-500">
              {ranks.length} career milestones.{' '}
              {freeCount > 0 && `${freeCount === 1 ? `${ranks[0]?.rank} joins` : `The first ${freeCount} ranks join`} free; `}
              {ranks.length > 1 && `your direct income rises from ${ranks[0]?.pct} to ${ranks[ranks.length - 1]?.pct}.`}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-darker text-brand-gold-light">
                  <th className="py-4 pl-6 pr-4 text-left text-xs font-bold uppercase tracking-wider">#</th>
                  <th className="py-4 px-4 text-left text-xs font-bold uppercase tracking-wider">Rank</th>
                  <th className="py-4 px-4 text-right text-xs font-bold uppercase tracking-wider">Joining</th>
                  <th className="py-4 pl-4 pr-6 text-right text-xs font-bold uppercase tracking-wider">Direct Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranks.map((r, i) => (
                  <tr key={r.rank} className={`transition-colors hover:bg-brand-primary/5 ${r.elite ? 'bg-brand-gold/[0.06]' : ''}`}>
                    <td className="py-3.5 pl-6 pr-4 text-gray-400 font-medium">{String(i + 1).padStart(2, '0')}</td>
                    <td className="py-3.5 px-4 font-semibold text-brand-darker">
                      {r.rank}
                      {r.joining === 'Free' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary-dark">
                          Entry
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-600">{r.joining}</td>
                    <td className="py-3.5 pl-4 pr-6 text-right font-bold text-brand-primary-dark">{r.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════════════ REWARDS (Business Settings → Rank plan) ══════════════════════ */}
      <section className="py-20 bg-brand-darker">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Rewards</span>
            <div className="mt-5 flex justify-center"><CompanyHeading /></div>
            <div className="gold-rule" aria-hidden><i /></div>
            <p className="mt-3 mx-auto max-w-xl text-base text-white/50">
              Every rank brings a reward once your direct and group sales reach its target. Rewards count after 50% payment, every 4 months — 1 Sep 2026 to 31 Dec 2026.
            </p>
          </div>

          {rewards.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {rewards.map((r) => (
                <div key={r.key} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all duration-300 hover:border-brand-primary-glow/40">
                  <div className="relative">
                    {r.img
                      ? <img src={r.img} alt={r.title} loading="lazy" className="h-28 w-full object-cover" />
                      : <RewardArt title={r.title} className="h-28" />}
                    {r.rank && (
                      <span className="absolute left-2 top-2 rounded-full bg-gold-metal px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-darker shadow">
                        {r.rank}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-white sm:text-base">
                      {r.title}
                      {r.slab && <span className="ml-1.5 rounded bg-brand-primary-glow/15 px-1.5 py-0.5 align-middle text-[10px] font-bold text-brand-primary-glow">{r.slab}</span>}
                    </h3>
                    {r.target && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-white/60">
                        <Ruler className="mt-0.5 h-3 w-3 shrink-0 text-brand-primary-glow" /> {r.target}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              to="/rewards"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary-glow hover:text-white transition-colors"
            >
              All rewards
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════ FEATURED PROJECTS ══════════════════════ */}
      <FeaturedProjects />

      {/* ══════════════════════ CTA ══════════════════════ */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div
            className="bg-leaf-deep rounded-3xl px-8 py-14 text-center shadow-elegant ring-1 ring-brand-gold/30"
          >
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Start your 90 Days Training</h2>
            <p className="mt-4 mx-auto max-w-lg text-lg text-white/70">
              Get your sponsor ID in minutes and unlock direct income, level commissions, and lifetime rewards.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="btn-gold rounded-xl px-8 py-3.5 text-sm"
              >
                Join Now
              </Link>
              <Link
                to="/contact"
                className="rounded-xl border border-white/40 px-8 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all"
              >
                Talk to a Mentor
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
