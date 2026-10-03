import { BRAND } from '@/lib/brand'
const SB = 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery'

export function AboutPage() {
  const LOGO = BRAND.markSquare

  const DIRECTORS = [
    {
      name: 'Mr. Amitesh Pandey',
      title: 'Director',
      img: `${SB}/1783281809391-10ofwp.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxODA5MzkxLTEwb2Z3cC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxODExLCJleHAiOjIwOTg2NDE4MTF9.-9sDYA62vlZ0CaSf0Ey4S0l7WqzPNEUfVSUhRs6VNak`,
      bio: `A visionary leader driving ${BRAND.name}'s growth with deep industry expertise and a passion for creating real value for every stakeholder.`,
    },
    {
      name: 'Mr. Vikash Singh',
      title: 'Director',
      img: `${SB}/1783281831087-5ifxsi.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxODMxMDg3LTVpZnhzaS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxODMyLCJleHAiOjIwOTg2NDE4MzJ9.SysCp5h28xKPO1KdFp3AJf1LZoPV1jhGwbJJnveblbs`,
      bio: 'Leading operations and strategy with a focus on transparency, ethical business, and empowering associates to achieve long-term success.',
    },
    {
      name: 'Mr. Om Prakash Kumar',
      title: 'Managing Director',
      img: `${SB}/1783281568648-97y54j.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxNTY4NjQ4LTk3eTU0ai5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxNTcxLCJleHAiOjIwOTg2NDE1NzF9.N2pyp9iUOgQ3x_TRPix5mdH9EBwRPtVOXPRE7LxZDKI`,
      bio: 'A dedicated professional ensuring excellence in operations and management, committed to the company\'s long-term vision and associate success.',
    },
  ]

  const VALUES = [
    'Integrity', 'Transparency', 'Trust', 'Professionalism',
    'Leadership', 'Customer Satisfaction', 'Teamwork', 'Continuous Learning',
  ]

  const WHY = [
    'Experienced Leadership', 'Transparent Business Model', 'Premium Real Estate Projects',
    'Professional Training & Support', 'Attractive Rewards & Recognition', 'Multiple Income Opportunities',
    'Long-Term Career Growth', 'Ethical & Sustainable Business',
  ]

  const MISSION = [
    'Deliver transparent and trustworthy business opportunities.',
    'Provide world-class training to every associate.',
    'Develop future leaders through our 90-Day Mission Training.',
    'Create long-term financial growth for every partner.',
    'Build a strong community based on honesty, commitment, and success.',
  ]

  const STATS = [
    { value: '2,500+', label: 'Active Partners across India' },
    { value: '120+', label: 'Cities Reached nationwide' },
    { value: '₹50+', label: 'Payouts distributed (₹ Cr)' },
    { value: '12', label: 'Rank Levels to grow through' },
  ]

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
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">About Us</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">{BRAND.tagline}</h1>
          <p className="mx-auto max-w-2xl text-lg text-white/60">
            {BRAND.name} began its journey in the real estate industry in 2010 with a clear vision of creating long-term value for customers and business partners.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-brand-darker py-12">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map(s => (
              <div key={s.label}>
                <p className="text-3xl font-extrabold text-brand-primary-glow">{s.value}</p>
                <p className="mt-1 text-xs text-white/50 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Our Journey</span>
              <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">Trusted Since 2010</h2>
              <p className="mt-4 text-gray-600 leading-relaxed">
                With years of experience in the real estate sector, {BRAND.name} has earned the confidence of thousands of customers and partners. Our commitment is to deliver genuine investment opportunities, professional guidance, and long-term wealth creation through ethical business practices.
              </p>
              <div className="mt-8">
                <p className="font-bold text-brand-darker mb-3">Our Vision</p>
                <p className="text-gray-600 leading-relaxed">
                  To create real value in people's lives by providing sustainable real estate investment opportunities and empowering individuals to achieve financial freedom.
                </p>
              </div>
              <div className="mt-8">
                <p className="font-bold text-brand-darker mb-3">Our Mission</p>
                <ul className="space-y-2">
                  {MISSION.map(m => (
                    <li key={m} className="flex items-start gap-2.5 text-sm text-gray-600">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-center">
              <img src={LOGO} alt={BRAND.name} className="w-64 h-auto drop-shadow-xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Directors */}
      <section className="py-20 bg-gray-50">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Leadership</span>
            <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">Meet Our Directors</h2>
            <div className="gold-rule" aria-hidden><i /></div>
            <p className="mt-3 text-gray-500">Guiding {BRAND.name} with vision, integrity, and a commitment to excellence.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {DIRECTORS.map(d => (
              <div key={d.name} className="rounded-2xl bg-white border border-gray-100 overflow-hidden shadow-sm hover:shadow-elegant transition-all group">
                <div className="h-64 overflow-hidden bg-brand-dark">
                  <img src={d.img} alt={d.name} className="h-full w-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <span className="text-xs font-bold uppercase tracking-widest text-brand-primary">{d.title}</span>
                  <h3 className="mt-1 text-lg font-bold text-brand-darker">{d.name}</h3>
                  <p className="mt-2 text-sm text-gray-500 leading-relaxed">{d.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-20 bg-brand-darker">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Our Core Values</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white">What We Stand For</h2>
            <div className="gold-rule" aria-hidden><i /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {VALUES.map(v => (
              <div key={v} className="rounded-xl border border-white/10 bg-white/5 p-5 text-center hover:bg-white/10 hover:border-brand-primary-glow/30 transition-all">
                <div className="mb-3 mx-auto h-10 w-10 rounded-full flex items-center justify-center bg-gold-metal shadow-elegant">
                  <svg className="h-5 w-5 text-brand-darker" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-white">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Why Choose Us</span>
            <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">Why Choose {BRAND.name}?</h2>
            <div className="gold-rule" aria-hidden><i /></div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WHY.map(w => (
              <div key={w} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 hover:border-brand-primary/30 hover:shadow-elegant transition-all">
                <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center bg-gold-metal shadow-elegant">
                  <svg className="h-4 w-4 text-brand-darker" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-brand-darker">{w}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 90-Day Success Mission */}
      <section className="py-20 bg-gray-50">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-start">
            <div>
              <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">90 Days Training</span>
              <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">90-Day Success Mission</h2>
              <p className="mt-4 text-gray-500 leading-relaxed">
                A structured 90-day training program that equips every new associate with the skills, mindset, and network to succeed fast.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Understand the business model',
                  'Improve communication skills',
                  'Learn professional sales techniques',
                  'Develop leadership qualities',
                  'Build strong teams',
                  'Achieve financial goals faster',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Growth Philosophy</span>
              <h2 className="mt-3 text-3xl font-extrabold text-brand-darker">Knowledge, Consistency, Teamwork, Ethics.</h2>
              <p className="mt-4 text-gray-500 leading-relaxed">
                Success emerges through these four pillars. Every challenge is a learning opportunity — and together we rise further than anyone can alone.
              </p>

              <div className="mt-8">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-darker mb-4">Recognition & Rewards</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    'Cash Rewards',
                    'Smartphones',
                    'Laptops',
                    'Domestic & International Tours',
                    'Motorcycles',
                    'Cars',
                    'Leadership Awards',
                    'Stage Recognition',
                  ].map(r => (
                    <div key={r} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-4 py-3">
                      <span className="text-brand-primary">🏆</span>
                      <span className="text-sm font-medium text-gray-700">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-leaf-deep py-20">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 text-center">
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-white/70">Join Us</span>
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Join the {BRAND.short} Family</h2>
          <p className="mt-4 mx-auto max-w-2xl text-white/70 leading-relaxed">
            Become part of a growing entrepreneur community and start your 90-Day Success Training Program today. Every associate receives complete guidance, structured training, and continuous support.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a href="/register" className="btn-gold rounded-xl px-8 py-3.5 text-sm">
              Join Today — Free
            </a>
            <a href="/projects" className="rounded-xl border border-white/40 px-8 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all">
              Explore Projects
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
