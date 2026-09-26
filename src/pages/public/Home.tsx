import { Link } from 'react-router-dom'
import { useProjects, useSiteSetting, useCmsContent, useBanners, useRanks } from '@/lib/queries'
import { BRAND } from '@/lib/brand'
import { planRows } from '@/lib/plan'

const HERO_DEFAULTS = {
  badge: 'Mission 90 Days — Registrations Open',
  title_lead: 'Build Your',
  title_accent: 'Financial Future',
  title_tail: `with ${BRAND.name}`,
  subtitle: `India's trusted ${BRAND.name} network. Earn direct sponsor income, level commissions and lifetime rewards.`,
  primary_cta_label: 'Join as Sponsor',
  primary_cta_link: '/register',
  secondary_cta_label: 'View Plans',
  secondary_cta_link: '/plans',
}

/* ── Real image URLs scraped from royalgreencompany.com ── */
const HERO_IMG = 'https://royalgreencompany.com/assets/hero-Cw3CXUiu.jpg'

const SB = 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery'

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

const REWARDS = [
  {
    img: 'https://royalgreencompany.com/assets/reward-darjeeling-goa-DqX05LnR.jpg',
    alt: 'Darjeeling / GOA',
    title: 'Darjeeling / GOA Trip',
    joining: 3,
    sales: 5,
    tag: 'Channel Partner+',
  },
  {
    img: 'https://royalgreencompany.com/assets/reward-thailand-iphone-CNLheiAV.jpg',
    alt: 'Thailand / iPhone',
    title: 'Thailand Trip + iPhone',
    joining: 6,
    sales: 10,
    tag: 'Manager+',
  },
  {
    img: 'https://royalgreencompany.com/assets/reward-bullet-laptop-BKH-6qrv.jpg',
    alt: 'Bullet / Laptop',
    title: 'Royal Enfield + Laptop',
    joining: 9,
    sales: 15,
    tag: 'Vice President+',
  },
  {
    img: 'https://royalgreencompany.com/assets/reward-car-down-payment-BOm0GFjW.jpg',
    alt: 'Car Down Payment',
    title: 'Car Down Payment',
    joining: 12,
    sales: 25,
    tag: 'Core Manager+',
  },
]

const STATS = [
  { value: '12', label: 'RANK LEVELS' },
  { value: '25,000+', label: 'PARTNERS' },
  { value: '2,500+', label: 'ACTIVE PARTNERS' },
  { value: '120+', label: 'CITIES REACHED' },
  { value: '₹50+', label: 'PAYOUTS (₹ CR)' },
]

const WHY_ITEMS = [
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Direct Sponsor Income',
    desc: 'Earn up to ₹15,00,000 per direct sponsorship at top ranks.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Level Income',
    desc: 'Deep level commissions across 12 levels, paid weekly.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    title: 'Rewards',
    desc: 'Smartphone, bike, car, international trips and house fund.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Transparent Plan',
    desc: 'Verified payouts, live dashboard, instant withdrawal requests.',
  },
]


/** Exported so ProjectsPage can reuse it. */
export function ProjectCard({ project }: { project: Record<string, any> }) {
  return (
    <Link
      to={`/projects/${project.slug}`}
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-elegant hover:border-[oklch(62%_.19_43)]/30 transition-all duration-300 overflow-hidden"
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
        <div className="h-40 bg-gradient-to-br from-[oklch(20%_.06_260)] to-[oklch(62%_.19_43)] flex items-center justify-center">
          <span className="text-4xl font-black text-white/30">{project.name?.[0]}</span>
        </div>
      )}
      <div className="p-5 flex flex-col flex-1">
        <p className="text-xs font-bold uppercase tracking-widest text-[oklch(62%_.19_43)] mb-1">{project.city ?? 'India'}</p>
        <h3 className="text-base font-bold text-[oklch(14%_.05_260)] group-hover:text-[oklch(54%_.19_40)] transition-colors">{project.name}</h3>
        <p className="mt-1 text-sm text-gray-500 flex-1 line-clamp-2">{project.location}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold text-[oklch(54%_.19_40)]">
            {project.price_from ? `₹${Number(project.price_from).toLocaleString('en-IN')} / sq yd` : 'Contact for price'}
          </span>
          <span className="text-xs text-[oklch(62%_.19_43)] font-semibold">View →</span>
        </div>
      </div>
    </Link>
  )
}

function FeaturedProjects() {
  const { data = [], isLoading } = useProjects({ publishedOnly: true })
  const featured = data.filter((p) => p.featured).slice(0, 3)
  if (isLoading || featured.length === 0) return null
  return (
    <section className="py-20 bg-gray-50">
      <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)]">Our Developments</span>
          <h2 className="mt-3 text-3xl font-extrabold text-[oklch(14%_.05_260)] sm:text-4xl">
            Built on Trust. Designed for Growth.
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-base text-gray-500">
            From premium plots to integrated townships, every Symocity project is engineered for long-term value.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/projects"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[oklch(54%_.19_40)] hover:text-[oklch(62%_.19_43)] transition-colors">
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
                  ? `linear-gradient(120deg, oklch(20% .06 260 / .82), oklch(20% .06 260 / .45)), url(${b.image_url}) center/cover`
                  : 'linear-gradient(135deg, oklch(62% .19 43), oklch(54% .19 40))',
              }}
            >
              <h3 className="text-2xl font-extrabold">{b.title}</h3>
              {b.subtitle && <p className="mt-2 max-w-md text-white/80">{b.subtitle}</p>}
              {b.cta_label && b.cta_link && (
                <Link
                  to={b.cta_link}
                  className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[oklch(54%_.19_40)] shadow hover:-translate-y-0.5 transition-all"
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
  const ranks = planRows(rankData)
  const freeCount = ranks.filter((r) => r.joining === 'Free').length
  const { data: heroCfg } = useSiteSetting('home.hero')
  const hero = { ...HERO_DEFAULTS, ...(heroCfg ?? {}) }
  const { data: achieverRows = [] } = useCmsContent<{ name: string; rank: string; photo_url: string }>('achievers', { activeOnly: true })
  const topAchiever = achieverRows[0]
    ? { name: achieverRows[0].name, rank: achieverRows[0].rank, img: achieverRows[0].photo_url }
    : ACHIEVERS[0]
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
          style={{ background: 'linear-gradient(to right, oklch(20% .06 260 / .95) 0%, oklch(20% .06 260 / .7) 50%, rgba(0,0,0,0) 100%)' }}
        />

        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8 py-28 w-full">
          <div className="max-w-2xl">
            {/* Mission badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[oklch(72%_.18_48)]/40 bg-[oklch(62%_.19_43)]/15 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(72%_.18_48)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[oklch(62%_.19_43)]" />
              </span>
              <span className="text-xs font-bold uppercase tracking-[.15em] text-[oklch(72%_.18_48)]">
                {hero.badge}
              </span>
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl animate-fade-up">
              {hero.title_lead}{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(to right, oklch(80% .16 85), oklch(72% .18 48))' }}
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
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow-elegant hover:opacity-90 transition-all"
                style={{ background: 'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)' }}
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
              {[{ icon: '✅', text: 'Verified Plan' }, { icon: '🏆', text: '12 Rank Levels' }, { icon: '👥', text: '25,000+ Partners' }].map((b) => (
                <div key={b.text} className="flex items-center gap-2 text-sm text-white/70">
                  <span>{b.icon}</span>{b.text}
                </div>
              ))}
            </div>
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
      <section className="bg-[oklch(14%_.05_260)] -mt-1 py-12">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl lg:text-4xl font-extrabold text-[oklch(72%_.18_48)]">{s.value}</p>
                <p className="mt-1 text-xs font-bold tracking-widest uppercase text-white/40">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ PROMO BANNERS ══════════════════════ */}
      <PromoBanners />

      {/* ══════════════════════ WHY US ══════════════════════ */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)]">Why {BRAND.name}</span>
            <h2 className="mt-3 text-3xl font-extrabold text-[oklch(14%_.05_260)] sm:text-4xl">
              A plan built for serious earners
            </h2>
            <p className="mt-3 mx-auto max-w-xl text-base text-gray-500">
              Six income streams, transparent ranks and rewards that match real effort.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_ITEMS.map((item) => (
              <div
                key={item.title}
                className="group rounded-2xl border border-gray-100 p-6 hover:border-[oklch(62%_.19_43)]/30 hover:shadow-elegant transition-all duration-300"
                style={{ background: 'linear-gradient(oklch(1 0 0) 0%, oklch(0.985 0.02 60) 100%)' }}
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)' }}>
                  {item.icon}
                </div>
                <h3 className="text-base font-bold text-[oklch(14%_.05_260)] mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ TOP ACHIEVER ══════════════════════ */}
      <section
        className="py-24 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 45%, oklch(62% .19 43) 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            {/* Text */}
            <div className="lg:w-1/2 text-center lg:text-left">
              <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Meet Our Top Achiever</span>
              <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl leading-tight">
                Real leaders.<br />
                <span className="text-[oklch(72%_.18_48)]">Real rewards.</span>
              </h2>
              <p className="mt-4 text-white/60 leading-relaxed max-w-md">
                Celebrating the champions who turned Mission 90 Days into a lifetime achievement.
              </p>

              {/* Achiever stats */}
              <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm">
                <div className="text-center lg:text-left">
                  <p className="text-2xl font-extrabold text-[oklch(72%_.18_48)]">1,240+</p>
                  <p className="mt-1 text-xs text-white/50 uppercase tracking-wider">Direct Team</p>
                </div>
                <div className="text-center lg:text-left">
                  <p className="text-2xl font-extrabold text-[oklch(72%_.18_48)]">₹42 Cr</p>
                  <p className="mt-1 text-xs text-white/50 uppercase tracking-wider">Total Sales</p>
                </div>
                <div className="text-center lg:text-left">
                  <p className="text-2xl font-extrabold text-[oklch(72%_.18_48)]">Crown</p>
                  <p className="mt-1 text-xs text-white/50 uppercase tracking-wider">Rank</p>
                </div>
              </div>

              {/* Achiever badge */}
              <div className="mt-8 inline-flex items-center gap-4 rounded-2xl border border-[oklch(72%_.18_48)]/20 bg-white/5 backdrop-blur px-6 py-4">
                <img
                  src={topAchiever.img}
                  alt={topAchiever.name}
                  className="h-14 w-14 rounded-full object-cover border-2 border-[oklch(72%_.18_48)]/50"
                />
                <div className="text-left">
                  <p className="text-xs font-bold uppercase tracking-widest text-[oklch(72%_.18_48)]">🏆 Champion of the Season</p>
                  <p className="text-white font-bold text-lg">{topAchiever.name}</p>
                  <p className="text-white/50 text-sm">{topAchiever.rank}</p>
                </div>
              </div>

              {/* Chase the Crown CTA */}
              <div className="mt-6">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-bold text-white shadow-elegant hover:opacity-90 transition-all"
                  style={{ background: 'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)' }}
                >
                  Chase the Crown
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Champion portrait circle */}
            <div className="lg:w-1/2 flex justify-center">
              <div className="relative">
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-full blur-2xl"
                  style={{ background: 'oklch(72% .18 48 / .25)', transform: 'scale(1.15)' }} />
                {/* Photo circle */}
                <div className="relative h-56 w-56 sm:h-72 sm:w-72 rounded-full border-4 border-[oklch(72%_.18_48)]/40 overflow-hidden shadow-glow">
                  <img
                    src={topAchiever.img}
                    alt={topAchiever.name}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                {/* Name badge */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-6 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-elegant"
                  style={{ background: 'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)' }}>
                  {topAchiever.rank}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ HALL OF FAME MARQUEE ══════════════════════ */}
      <section className="py-16 bg-gray-50 overflow-hidden">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 mb-10 text-center">
          <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)]">Award Achievers Gallery</span>
          <h2 className="mt-2 text-2xl font-extrabold text-[oklch(14%_.05_260)]">HALL OF FAME</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-lg mx-auto">
            Real leaders. Real rewards. Celebrating the champions who turned Mission 90 Days into a lifetime achievement.
          </p>
        </div>

        {/* Marquee of portrait cards */}
        <div className="relative flex gap-5 overflow-hidden">
          <div className="flex min-w-max gap-5 animate-marquee">
            {[...ACHIEVERS, ...ACHIEVERS].map((a, i) => (
              <div
                key={i}
                className="relative w-[220px] h-[300px] flex-shrink-0 rounded-2xl overflow-hidden shadow-md group"
              >
                <img
                  src={a.img}
                  alt={a.name}
                  className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
                {/* Bottom overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-[oklch(72%_.18_48)]">{a.rank}</p>
                  <p className="text-sm font-bold text-white">{a.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ RANKS TABLE ══════════════════════ */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)]">Income Structure</span>
            <h2 className="mt-3 text-3xl font-extrabold text-[oklch(14%_.05_260)] sm:text-4xl">
              Ranks & Sponsor Income
            </h2>
            <p className="mt-3 mx-auto max-w-xl text-base text-gray-500">
              {ranks.length} career milestones.{' '}
              {freeCount > 0 && `${freeCount === 1 ? `${ranks[0]?.rank} joins` : `The first ${freeCount} ranks join`} free; `}
              {ranks.length > 1 && `your own sale percentage rises from ${ranks[0]?.pct} to ${ranks[ranks.length - 1]?.pct}.`}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[oklch(14%_.05_260)] text-white">
                  <th className="py-4 pl-6 pr-4 text-left text-xs font-bold uppercase tracking-wider">#</th>
                  <th className="py-4 px-4 text-left text-xs font-bold uppercase tracking-wider">Rank</th>
                  <th className="py-4 px-4 text-right text-xs font-bold uppercase tracking-wider">Joining</th>
                  <th className="py-4 pl-4 pr-6 text-right text-xs font-bold uppercase tracking-wider">Own Sale %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranks.slice(0, 7).map((r, i) => (
                  <tr key={r.rank} className="hover:bg-[oklch(62%_.19_43)]/5 transition-colors">
                    <td className="py-3.5 pl-6 pr-4 text-gray-400 font-medium">{String(i + 1).padStart(2, '0')}</td>
                    <td className="py-3.5 px-4 font-semibold text-[oklch(14%_.05_260)]">
                      {r.rank}
                      {r.joining === 'Free' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-[oklch(62%_.19_43)]/10 px-2 py-0.5 text-xs font-semibold text-[oklch(54%_.19_40)]">
                          Entry
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-600">{r.joining}</td>
                    <td className="py-3.5 pl-4 pr-6 text-right font-bold text-[oklch(54%_.19_40)]">{r.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/plans"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[oklch(54%_.19_40)] hover:text-[oklch(62%_.19_43)] transition-colors"
            >
              See all {ranks.length} ranks
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════ REWARDS — real photos ══════════════════════ */}
      <section className="py-20 bg-[oklch(14%_.05_260)]">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Exclusive Benefits</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">From smartphone to a house fund</h2>
            <p className="mt-3 mx-auto max-w-xl text-base text-white/50">
              Beyond commissions — unlock experiences and assets that celebrate your success.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {REWARDS.map((r) => (
              <div key={r.title} className="group rounded-2xl overflow-hidden border border-white/10 hover:border-[oklch(72%_.18_48)]/30 transition-all duration-300">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={r.img}
                    alt={r.alt}
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute top-3 left-3 rounded-full bg-[oklch(62%_.19_43)]/90 px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
                    {r.tag}
                  </span>
                </div>
                <div className="p-5 bg-white/5">
                  <h3 className="text-base font-bold text-white mb-2">{r.title}</h3>
                  <div className="flex gap-3 text-xs text-white/60 mb-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[oklch(72%_.18_48)]">●</span>
                      {r.joining} Fresh Joining
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[oklch(72%_.18_48)]">●</span>
                      {r.sales} Sales
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/rewards"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[oklch(72%_.18_48)] hover:text-white transition-colors"
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
            className="rounded-3xl px-8 py-14 text-center shadow-elegant"
            style={{ background: 'linear-gradient(135deg, oklch(62% .19 43) 0%, oklch(54% .19 40) 100%)' }}
          >
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Start your Mission 90 Days Training</h2>
            <p className="mt-4 mx-auto max-w-lg text-lg text-white/70">
              Get your sponsor ID in minutes and unlock direct income, level commissions, and lifetime rewards.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-[oklch(54%_.19_40)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
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
