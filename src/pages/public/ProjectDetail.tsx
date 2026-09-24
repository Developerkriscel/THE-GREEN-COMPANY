import { Link, useParams } from 'react-router-dom'
import { Check, Download, MapPin } from 'lucide-react'
import { useProject, usePublicPlots } from '@/lib/queries'
import { Badge, Button, Card, CardBody, EmptyState, Spinner, Table, Td, Th } from '@/components/ui'
import { money, num } from '@/lib/format'
import { EnquiryForm } from '@/pages/public/Contact'

export function ProjectDetail() {
  const { slug } = useParams()
  const { data: project, isLoading } = useProject(slug)
  const { data: plots = [] } = usePublicPlots(project?.id)

  if (isLoading) return <Spinner />
  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          title="Project not found"
          description="It may have been unpublished."
          action={
            <Link to="/projects">
              <Button variant="outline">Back to projects</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const available = plots.filter((p) => p.availability === 'available').length

  return (
    <div>
      <div className="relative h-64 w-full overflow-hidden bg-slate-200 sm:h-96">
        {project.hero_image ? (
          <img src={project.hero_image} alt={project.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-800 to-brand-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
        <div className="absolute bottom-0 w-full">
          <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6">
            <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">{project.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
              <MapPin className="h-4 w-4" /> {project.location}
              {project.city ? `, ${project.city}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Price from" value={project.price_from ? money(project.price_from) : '—'} />
            <Stat
              label="Plot sizes"
              value={
                project.size_from
                  ? `${num(project.size_from)}–${num(project.size_to)} ${project.size_unit}`
                  : '—'
              }
            />
            <Stat label="Total plots" value={num(plots.length)} />
            <Stat label="Available" value={num(available)} />
          </div>

          {project.description && (
            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900">About this project</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {project.description}
              </p>
            </section>
          )}

          {project.amenities.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900">Amenities</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {project.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-brand-600" /> {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {project.gallery.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900">Gallery</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {project.gallery.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-display text-xl font-semibold text-slate-900">Plot availability</h2>
            <p className="mt-1 text-xs text-slate-500">
              Indicative status. Contact us to confirm a specific plot before booking.
            </p>
            <Card className="mt-3">
              {plots.length === 0 ? (
                <EmptyState title="Plot list coming soon" description="Enquire for the current inventory." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Plot</Th>
                      <Th>Size</Th>
                      <Th>Dimensions</Th>
                      <Th>Facing</Th>
                      <Th>Price</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plots.map((p) => (
                      <tr key={p.id}>
                        <Td className="font-medium text-slate-900">{p.number}</Td>
                        <Td>{p.size ? `${num(p.size)} ${p.size_unit}` : '—'}</Td>
                        <Td>{p.dimensions ?? '—'}</Td>
                        <Td>{p.facing ?? '—'}</Td>
                        <Td>{money(p.price)}</Td>
                        <Td>
                          {p.availability === 'available' ? (
                            <Badge tone="green">Available</Badge>
                          ) : (
                            <Badge tone="neutral">Unavailable</Badge>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </section>

          {project.map_embed && (
            <section>
              <h2 className="font-display text-xl font-semibold text-slate-900">Location</h2>
              <div
                className="mt-3 aspect-video w-full overflow-hidden rounded-xl border border-slate-200 [&_iframe]:h-full [&_iframe]:w-full"
                dangerouslySetInnerHTML={{ __html: project.map_embed }}
              />
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-slate-900">Enquire about {project.name}</h3>
              <p className="mt-1 text-xs text-slate-500">
                We will call you back and arrange a site visit.
              </p>
              <div className="mt-4">
                <EnquiryForm projectId={project.id} compact />
              </div>
            </CardBody>
          </Card>

          {project.brochure_path && (
            <a href={project.brochure_path} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4" /> Download brochure
              </Button>
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
