import { useCmsContent } from '@/lib/queries'

const SB = 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery'

export const EVENTS = [
  {
    date: 'Sep 24, 2026',
    location: 'GOA',
    title: 'ALL ACHIVERS FLIGHT ON 24 SEP 2026 FOR GOA',
    desc: 'SALE 50 SQYDS PLOT AND ACHIEVE GOA TOUR',
    img: `${SB}/1787564525260-y7459u.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY0NTI1MjYwLXk3NDU5dS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY0NTI3LCJleHAiOjIxMDI5MjQ1Mjd9.jtp0OgHaB3MUKvnaW32YkcLaf7w5-FNCTemkQUXG2Nw`,
  },
  {
    date: 'Sep 21, 2026',
    location: 'HOTEL GURGAON',
    title: 'SUCESS CELEBRATION PROGRAMMEE',
    desc: 'ALL ACHIVER AND NEW RANK',
    img: `${SB}/1787564650959-whbn8i.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY0NjUwOTU5LXdoYm44aS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY0NjUzLCJleHAiOjIxMDI5MjQ2NTN9.C80LNFUx_klX3BkTtbe_U2LR8hj0Qic8ON-Q68GfsxM`,
  },
  {
    date: 'Sep 15, 2026',
    location: 'GURGAON',
    title: 'Learning & Development Program',
    desc: '',
    img: `${SB}/1783952499755-s0rko0.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzOTUyNDk5NzU1LXMwcmtvMC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzOTUyNTA0LCJleHAiOjIwOTkzMTI1MDR9.bV9JTzfKzvT7oEDcH12ye0k4TqQFtChEVEqZnlu4mzs`,
  },
  {
    date: 'Aug 15, 2026',
    location: 'DHABI CITY MARK HOTEL GURGAON',
    title: 'LDP MEETING',
    desc: 'LDP PROGRAMMEE HELD ON EVERY MONTH',
    img: `${SB}/1787564391532-znos1i.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY0MzkxNTMyLXpub3MxaS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY0Mzk0LCJleHAiOjIxMDI5MjQzOTR9.PXGRNphIzDlO45fGIieg5wRiJc8X8L5219-X9NbbORs`,
  },
  {
    date: 'Jul 6, 2026',
    location: 'DELHI',
    title: 'Site Launch',
    desc: 'Site Launch, Business Plan Launch, Award Ceremony',
    img: `${SB}/1783318484718-v9v0ff.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE4NDg0NzE4LXY5djBmZi5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE4NDg3LCJleHAiOjIwOTg2Nzg0ODd9.-eSrqfCKZ4UupLY5UNU1xI3SOqjRTnzrarWSWAi95CI`,
  },
]

const SCHEDULE = [
  { time: '12:00 PM – 12:30 PM', hi: 'अतिथियों का आगमन और स्वागत', en: 'Registration & Welcome' },
  { time: '12:30 PM – 12:45 PM', hi: 'दीप प्रज्वलन', en: 'Lamp Lighting Ceremony' },
  { time: '12:45 PM – 01:30 PM', hi: 'स्वागत संबोधन और परिचय', en: 'Introduction' },
  { time: '01:30 PM – 02:30 PM', hi: 'लंच ब्रेक', en: 'Lunch' },
  { time: '02:30 PM – 03:15 PM', hi: 'साइट लॉन्च', en: 'Site Launch' },
  { time: '03:15 PM – 04:00 PM', hi: 'बिज़नेस प्लान लॉन्च', en: 'Business Plan Launch' },
  { time: '04:00 PM – 04:45 PM', hi: 'अवार्ड सेरेमनी', en: 'Award Ceremony' },
  { time: '04:45 PM – 05:00 PM', hi: 'धन्यवाद ज्ञापन और समापन', en: 'Vote of Thanks & Conclusion' },
]

export function EventsPage() {
  const { data: rows = [] } = useCmsContent<{ title: string; description: string; event_date: string; location: string; image_url: string }>('events', { activeOnly: true })
  const events = rows.length
    ? rows.map((r) => ({ date: r.event_date, location: r.location, title: r.title, desc: r.description, img: r.image_url }))
    : EVENTS
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
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Upcoming</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Events</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            Meets, launches and achiever ceremonies.
          </p>
        </div>
      </section>

      {/* Events list */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)] mb-8">Company Events</p>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <div key={ev.title} className="rounded-2xl border border-gray-100 shadow-sm hover:shadow-elegant transition-all overflow-hidden group">
                <div className="h-52 overflow-hidden bg-[oklch(20%_.06_260)]">
                  <img src={ev.img} alt={ev.title} loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-[oklch(62%_.19_43)] bg-[oklch(62%_.19_43)]/10 px-2 py-0.5 rounded-full">{ev.date}</span>
                    <span className="text-xs text-gray-400 font-medium truncate">{ev.location}</span>
                  </div>
                  <h3 className="text-sm font-bold text-[oklch(14%_.05_260)] leading-snug">{ev.title}</h3>
                  {ev.desc && <p className="mt-1 text-xs text-gray-500">{ev.desc}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ceremony Schedule */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)] mb-2">Ceremony Schedule</p>
          <h2 className="text-2xl font-extrabold text-[oklch(14%_.05_260)] mb-2">कार्यक्रम की समय-सूची (Event Schedule)</h2>
          <p className="text-sm text-gray-500 mb-8">Full day schedule for our upcoming ceremony.</p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-[oklch(20%_.06_260)] text-white">
                  <th className="py-3 px-5 text-left font-semibold text-xs">समय (Time)</th>
                  <th className="py-3 px-5 text-left font-semibold text-xs">कार्यक्रम का विवरण (Programme Details)</th>
                </tr>
              </thead>
              <tbody>
                {SCHEDULE.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="py-3 px-5 font-medium text-[oklch(62%_.19_43)] whitespace-nowrap">{row.time}</td>
                    <td className="py-3 px-5 text-gray-700">
                      <div>{row.hi}</div>
                      <div className="text-gray-400 text-xs">({row.en})</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="py-12 bg-white text-center">
        <div className="mx-auto max-w-md px-6">
          <h2 className="text-xl font-extrabold text-[oklch(14%_.05_260)]">Stay Updated</h2>
          <p className="mt-2 text-sm text-gray-500">Get event reminders and announcements on WhatsApp.</p>
          <a href="https://wa.me/919211809636" target="_blank" rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}>
            <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Chat on WhatsApp
          </a>
        </div>
      </section>
    </>
  )
}
