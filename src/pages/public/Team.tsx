import { useCmsContent } from '@/lib/queries'

const SB = 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery'

export const DIRECTORS = [
  {
    name: 'Mr. Amitesh Pandey',
    role: 'Director',
    img: `${SB}/1783281809391-10ofwp.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxODA5MzkxLTEwb2Z3cC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxODExLCJleHAiOjIwOTg2NDE4MTF9.-9sDYA62vlZ0CaSf0Ey4S0l7WqzPNEUfVSUhRs6VNak`,
  },
  {
    name: 'Mr. Vikash Singh',
    role: 'Director',
    img: `${SB}/1783281831087-5ifxsi.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxODMxMDg3LTVpZnhzaS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxODMyLCJleHAiOjIwOTg2NDE4MzJ9.SysCp5h28xKPO1KdFp3AJf1LZoPV1jhGwbJJnveblbs`,
  },
]

export const MANAGING_DIRECTORS = [
  {
    name: 'Mr. Omprakash Kumar',
    role: 'Managing Director',
    img: `${SB}/1783281568648-97y54j.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxNTY4NjQ4LTk3eTU0ai5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxNTcxLCJleHAiOjIwOTg2NDE1NzF9.N2pyp9iUOgQ3x_TRPix5mdH9EBwRPtVOXPRE7LxZDKI`,
  },
]

export const BRANCH_MANAGERS = [
  {
    name: 'Jai Pal Singh',
    role: 'Branch Manager',
    img: `${SB}/1783951162580-vhfctg.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzOTUxMTYyNTgwLXZoZmN0Zy5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzOTUxMTY3LCJleHAiOjIwOTkzMTExNjd9.Jz1PzIqQihfe4PaD3T62-L1jvUhV4nOWZ5mr5WPsvjs`,
  },
  {
    name: 'Sunil Kumar',
    role: 'Branch Manager',
    img: `${SB}/1783951259853-dngudf.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzOTUxMjU5ODUzLWRuZ3VkZi5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzOTUxMjY0LCJleHAiOjIwOTkzMTEyNjR9.PENIP58JU3bPb0iRAh3Ml1IxQPplDqd3En4B2hithyc`,
  },
  {
    name: 'Nasir Ahmad',
    role: 'Branch Manager',
    img: `${SB}/1783951328232-q11x34.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzOTUxMzI4MjMyLXExMXgzNC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzOTUxMzMzLCJleHAiOjIwOTkzMTEzMzN9.gegujTWCQHPVn-p_voLqZqGEj4H30btz4eXb7668Ly0`,
  },
  {
    name: 'Dr Anand Kumar',
    role: 'Branch Manager',
    img: `${SB}/1787731682495-fooqdz.jpg?token=eyJraWQiOiIxNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NzMxNjgyNDk1LWZvb3Fkei5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NzMxNjgyLCJleHAiOjIxMDMwOTE2ODJ9.3L7Eg9Nw6yE1N-vhMEeUxL3ftCDyeQnUa1d5x75XXZo`,
  },
  {
    name: 'Dinesh Singh',
    role: 'Branch Manager',
    img: `${SB}/1787731694310-iryx8g.jpg?token=eyJraWQiOiIxNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NzMxNjk0MzEwLWlyeXg4Zy5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NzMxNjkzLCJleHAiOjIxMDMwOTE2OTN9.4TZVnNMrVNyqhTRB4tXqDLx384mViiN6MULkNuZRd1g`,
  },
]

export const RANK_ACHIEVERS = [
  {
    name: 'NEETA SINGH',
    role: 'Rank Achiever',
    img: `${SB}/1783281195603-rb7a59.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMjgxMTk1NjAzLXJiN2E1OS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMjgxMTk3LCJleHAiOjIwOTg2NDExOTd9.lkx572fL94A8d6UVz8F5khDSoECz26CJ2FyX5jVAsBs`,
  },
  {
    name: 'AMAN KUMAR JAISWAL',
    role: 'Rank Achiever',
    img: `${SB}/1783951431702-95u9oo.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzOTUxNDMxNzAyLTk1dTlvby5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzOTUxNDM2LCJleHAiOjIwOTkzMTE0MzZ9.Rv3b05bIRs6-sG3nhoImXECF_NqcWK3b0Sk0Z8GJxuI`,
  },
  {
    name: 'Mamata Rani',
    role: 'Rank Achiever',
    img: `${SB}/1783314357679-f12smk.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE0MzU3Njc5LWYxMnNtay5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE0MzYwLCJleHAiOjIwOTg2NzQzNjB9.vw5YUm5yrY-gZvKADUF6I5SccLlrjH2ChJANW5RWMK0`,
  },
  {
    name: 'NEETA SINGH',
    role: 'Rank Achiever',
    img: `${SB}/1783314422555-86kc9w.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE0NDIyNTU1LTg2a2M5dy5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE0NDI1LCJleHAiOjIwOTg2NzQ0MjV9.ntGe9x9SPDeNZtQq-OcqzOlHpHKLvSpF6j1p8tnyQjg`,
  },
  {
    name: 'Dinesh Singh',
    role: 'Rank Achiever',
    img: `${SB}/1783315297958-z1crpn.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1Mjk3OTU4LXoxY3Jwbi5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1MzAwLCJleHAiOjIwOTg2NzUzMDB9.3wLT08FnnU14HURrQGJDa1Tujmg9Uc2RQWuDy3gT35I`,
  },
  {
    name: 'AMRENDER SINGH',
    role: 'Rank Achiever',
    img: `${SB}/1783315369710-jhqo6j.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE1MzY5NzEwLWpocW82ai5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE1MzcyLCJleHAiOjIwOTg2NzUzNzJ9.sXajNPf3DgnTh3qmhUrLgKORwkws1S7tlpGiSfMjYcM`,
  },
]

function TeamGrid({ members }: { members: typeof DIRECTORS }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      {members.map((m) => (
        <div key={m.name + m.img} className="group rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-elegant overflow-hidden transition-all">
          <div className="h-56 overflow-hidden bg-[oklch(20%_.06_260)]">
            <img src={m.img} alt={m.name} loading="lazy"
              className="h-full w-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="p-4 text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-[oklch(62%_.19_43)]">{m.role}</span>
            <h3 className="mt-1 text-sm font-bold text-[oklch(14%_.05_260)]">{m.name}</h3>
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ badge, title, subtitle, children }: { badge: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="py-14 bg-white border-b border-gray-100 last:border-0">
      <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)] mb-1">{badge}</p>
        <h2 className="text-2xl font-extrabold text-[oklch(14%_.05_260)] mb-1">{title}</h2>
        <p className="text-sm text-gray-500 mb-8">{subtitle}</p>
        {children}
      </div>
    </section>
  )
}

type TeamCard = { name: string; role: string; img: string }

export function TeamPage() {
  const { data: rows = [] } = useCmsContent<{ name: string; designation: string; category: string; photo_url: string }>('team_members', { activeOnly: true })

  const byCat = (cat: string, fallback: TeamCard[]): TeamCard[] => {
    const matched = rows.filter((r) => r.category === cat).map((r) => ({ name: r.name, role: r.designation, img: r.photo_url }))
    return rows.length ? matched : fallback
  }
  const directors = byCat('director', DIRECTORS)
  const managingDirectors = byCat('managing_director', MANAGING_DIRECTORS)
  const branchManagers = byCat('branch_manager', BRANCH_MANAGERS)
  const rankAchievers = byCat('rank_achiever', RANK_ACHIEVERS)

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
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">OUR TEAM</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Leadership at Royal Green Company</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            Director, Managing Director, Branch Managers and Rank Achievers powering the RGC network.
          </p>
        </div>
      </section>

      {directors.length > 0 && (
        <Section badge="DIRECTOR" title="Director" subtitle="The visionary leadership steering Royal Green Company.">
          <TeamGrid members={directors} />
        </Section>
      )}

      {managingDirectors.length > 0 && (
        <Section badge="MANAGING DIRECTOR" title="Managing Director" subtitle="Driving strategy, finance and partner experience across the network.">
          <TeamGrid members={managingDirectors} />
        </Section>
      )}

      {branchManagers.length > 0 && (
        <Section badge="BRANCH MANAGER" title="Branch Manager" subtitle="Regional and functional heads running operations on the ground.">
          <TeamGrid members={branchManagers} />
        </Section>
      )}

      {rankAchievers.length > 0 && (
        <Section badge="RANK ACHIEVER" title="Rank Achiever" subtitle="Top performers who have climbed the RGC rank ladder.">
          <TeamGrid members={rankAchievers} />
        </Section>
      )}

      {/* Join CTA */}
      <section className="py-14 bg-gray-50 text-center">
        <div className="mx-auto max-w-lg px-6">
          <h2 className="text-2xl font-extrabold text-[oklch(14%_.05_260)]">Join Our Team</h2>
          <p className="mt-3 text-gray-500">Build your career with one of India's most trusted real estate networks.</p>
          <a href="/register"
            className="mt-6 inline-block rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, oklch(68% .18 48), oklch(54% .19 40))' }}>
            Become a Partner
          </a>
        </div>
      </section>
    </>
  )
}
