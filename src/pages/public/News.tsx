import { useCmsContent } from '@/lib/queries'

const SB = 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery'

export const NEWS = [
  {
    date: 'Aug 24, 2026',
    title: 'TOKEN GIFT',
    desc: 'TOKEN AND BOOKING GIFT',
    img: `${SB}/1787564931119-eu8pws.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY0OTMxMTE5LWV1OHB3cy5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY0OTMzLCJleHAiOjIxMDI5MjQ5MzN9.p6h4SeJGEmExVaHLoe11sjJtUaSJ2kRr6zbz4krQcZQ`,
  },
  {
    date: 'Aug 24, 2026',
    title: 'CAR JITO',
    desc: 'CAR JEETO',
    img: `${SB}/1787566476301-9zij71.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY2NDc2MzAxLTl6aWo3MS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY2NDc4LCJleHAiOjIxMDI5MjY0Nzh9.eoMJtPfEJj7eiWxopYFNMoDtGIlQx0mv4JMDwoGUQXg`,
  },
  {
    date: 'Jul 16, 2026',
    title: 'GOA CONTEST',
    desc: '200 SQYDS SALES THAN YOU WILL QUALIFY FOR GOA',
    img: `${SB}/1787566651523-gzbavv.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY2NjUxNTIzLWd6YmF2di5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY2NjUzLCJleHAiOjIxMDI5MjY2NTN9.-NE1T0akWbCCD34OYLfmfbwRrap55snQl0q-2CV8fyc`,
  },
]

export function NewsPage() {
  const { data: rows = [] } = useCmsContent<{ title: string; description: string; news_date: string; image_url: string }>('news_posts', { activeOnly: true })
  const news = rows.length
    ? rows.map((r) => ({ date: r.news_date, title: r.title, desc: r.description, img: r.image_url }))
    : NEWS
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
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Latest Updates</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">News</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            Announcements and updates from Royal Green Company.
          </p>
        </div>
      </section>

      {/* News grid */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((item) => (
              <article key={item.title} className="rounded-2xl border border-gray-100 shadow-sm hover:shadow-elegant transition-all overflow-hidden group">
                <div className="h-56 overflow-hidden bg-[oklch(20%_.06_260)]">
                  <img src={item.img} alt={item.title} loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-5">
                  <span className="text-xs font-bold text-[oklch(62%_.19_43)] bg-[oklch(62%_.19_43)]/10 px-2 py-0.5 rounded-full">{item.date}</span>
                  <h3 className="mt-3 text-base font-extrabold text-[oklch(14%_.05_260)]">{item.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-gray-50 text-center">
        <div className="mx-auto max-w-md px-6">
          <h2 className="text-xl font-extrabold text-[oklch(14%_.05_260)]">Stay in the Loop</h2>
          <p className="mt-2 text-sm text-gray-500">Follow us on WhatsApp for the latest Royal Green updates.</p>
          <a href="https://wa.me/919211809636" target="_blank" rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}>
            Follow on WhatsApp
          </a>
        </div>
      </section>
    </>
  )
}
