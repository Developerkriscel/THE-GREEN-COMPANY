import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useProjects } from '@/lib/queries'
import { EmptyState, ErrorState, Input, Select, Spinner } from '@/components/ui'

export function ProjectsPage() {
  const { data = [], isLoading, error } = useProjects({ publishedOnly: true })
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')

  const cities = useMemo(
    () => Array.from(new Set(data.map((p) => p.city).filter(Boolean))) as string[],
    [data],
  )

  const filtered = data.filter((p) => {
    const matchesSearch =
      !search ||
      `${p.name} ${p.location} ${p.city ?? ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesCity = !city || p.city === city
    return matchesSearch && matchesCity
  })

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
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Our Developments</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Built on Trust. Designed for Growth.</h1>
          <p className="mx-auto max-w-2xl text-lg text-white/60">
            From premium plots to integrated townships, every Royal Green Company project is engineered for long-term value.
          </p>
        </div>
      </section>

      {/* Projects list */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          {/* Filters */}
          <div className="mb-8 flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search by name or location"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select className="w-48" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          {error && <ErrorState error={error} />}
          {isLoading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No projects found" description="Try clearing the filters above." />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-gray-50 text-center">
        <div className="mx-auto max-w-lg px-6">
          <h2 className="text-2xl font-extrabold text-[oklch(14%_.05_260)]">Interested in a Project?</h2>
          <p className="mt-3 text-gray-500">Our sales team will arrange a site visit and walk you through plot options.</p>
          <a href="/contact"
            className="mt-6 inline-block rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, oklch(68% .18 48), oklch(54% .19 40))' }}>
            Contact Us
          </a>
        </div>
      </section>
    </>
  )
}

function ProjectCard({ project }: { project: Record<string, any> }) {
  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    'manglam-city-block-a': { label: 'Booking Open', color: 'text-green-700 bg-green-50' },
    'manglam-city-block-b': { label: 'Booking Open', color: 'text-green-700 bg-green-50' },
    'anjani-kunj': { label: 'Booking Open', color: 'text-green-700 bg-green-50' },
    'anjani-homes': { label: 'Booking Open', color: 'text-green-700 bg-green-50' },
    'symo-city-ayodhya': { label: 'Pre Booking', color: 'text-amber-700 bg-amber-50' },
    'royal-green-farm': { label: 'Pre Booking', color: 'text-amber-700 bg-amber-50' },
  }
  const status = STATUS_LABELS[project.slug]

  return (
    <Link
      to={`/projects/${project.slug}`}
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-elegant hover:border-[oklch(62%_.19_43)]/30 transition-all duration-300 overflow-hidden"
    >
      {/* Image / gradient placeholder */}
      {project.hero_image ? (
        <div className="h-44 overflow-hidden">
          <img
            src={project.hero_image}
            alt={project.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ) : (
        <div className="h-44 bg-gradient-to-br from-[oklch(20%_.06_260)] to-[oklch(62%_.19_43)] flex items-center justify-center relative overflow-hidden">
          <span className="text-6xl font-black text-white/20">{project.name?.[0]}</span>
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold uppercase tracking-widest text-[oklch(62%_.19_43)]">
            {project.city ?? 'India'}
          </p>
          {status && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${status.color}`}>
              {status.label}
            </span>
          )}
        </div>
        <h3 className="text-base font-bold text-[oklch(14%_.05_260)] group-hover:text-[oklch(54%_.19_40)] transition-colors leading-snug">
          {project.name}
        </h3>
        <p className="mt-1 text-sm text-gray-500 flex-1 line-clamp-2">{project.location}</p>

        <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
          <div>
            <p className="text-xs text-gray-400">From</p>
            <p className="text-sm font-bold text-[oklch(54%_.19_40)]">
              {project.price_from
                ? `₹${Number(project.price_from).toLocaleString('en-IN')} / sq yd`
                : 'Contact for price'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Size</p>
            <p className="text-sm font-semibold text-gray-700">
              {project.size_from
                ? `${Number(project.size_from).toLocaleString('en-IN')}–${Number(project.size_to).toLocaleString('en-IN')} sq yd`
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}
