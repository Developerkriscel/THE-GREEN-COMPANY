import { useState, type FormEvent } from 'react'
import { DocUpload, ImageUpload, MultiImageUpload } from '@/components/MediaUpload'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { mustWrite, supabase } from '@/lib/supabase'
import { useProjects } from '@/lib/queries'
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea, Th, useToast, RecordCard, Responsive,
} from '@/components/ui'
import { date, money } from '@/lib/format'
import type { Project } from '@/lib/types'

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function AdminProjects({ embedded = false }: { embedded?: boolean } = {}) {
  const { data = [], isLoading, error } = useProjects()
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const qc = useQueryClient()
  const { push } = useToast()

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown> & { id?: string }) => {
      const { id, ...rest } = payload
      await mustWrite(() => id
        ? supabase.from('projects').update(rest).eq('id', id).select('id')
        : supabase.from('projects').insert(rest).select('id'))
    },
    onSuccess: () => {
      push('success', 'Project saved.')
      setEditing(null)
      setCreating(false)
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const toggle = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: 'published' | 'featured'; value: boolean }) => {
      await mustWrite(() => supabase.from('projects').update({ [field]: value }).eq('id', id).select('id'))
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects'] }),
    onError: (e: Error) => push('error', e.message),
  })

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      await mustWrite(() => supabase
        .from('projects')
        .update({ deleted_at: new Date().toISOString(), published: false })
        .eq('id', id)
        .select('id'))
    },
    onSuccess: () => {
      push('success', 'Project archived. It stays in the audit log and can be restored.')
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name'))
    save.mutate({
      id: editing?.id,
      name,
      slug: String(f.get('slug') || slugify(name)),
      location: String(f.get('location') ?? ''),
      city: String(f.get('city') ?? '') || null,
      state: String(f.get('state') ?? '') || null,
      description: String(f.get('description') ?? '') || null,
      amenities: String(f.get('amenities') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      hero_image: String(f.get('hero_image') ?? '') || null,
      gallery: String(f.get('gallery') ?? '')
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      brochure_path: String(f.get('brochure_path') ?? '') || null,
      map_embed: String(f.get('map_embed') ?? '') || null,
      price_from: f.get('price_from') ? Number(f.get('price_from')) : null,
      price_to: f.get('price_to') ? Number(f.get('price_to')) : null,
      size_from: f.get('size_from') ? Number(f.get('size_from')) : null,
      size_to: f.get('size_to') ? Number(f.get('size_to')) : null,
      size_unit: String(f.get('size_unit') || 'sqft'),
      sort_order: Number(f.get('sort_order') ?? 0),
      published: f.get('published') === 'true',
      featured: f.get('featured') === 'true',
      sold_out: f.get('sold_out') === 'true',
    })
  }

  const open = creating || Boolean(editing)

  const newBtn = (
    <Button onClick={() => { setEditing(null); setCreating(true) }}>
      <Plus className="h-4 w-4" /> New project
    </Button>
  )

  // The same row actions for the table and the phone cards.
  const projectActions = (p: Project) => (
    <div className="flex justify-end gap-1">
                      <IconBtn
                        title={p.published ? 'Unpublish' : 'Publish'}
                        onClick={() => toggle.mutate({ id: p.id, field: 'published', value: !p.published })}
                      >
                        {p.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </IconBtn>
                      <IconBtn
                        title={p.featured ? 'Remove from featured' : 'Mark featured'}
                        onClick={() => toggle.mutate({ id: p.id, field: 'featured', value: !p.featured })}
                      >
                        <Star className={'h-4 w-4 ' + (p.featured ? 'fill-amber-400 text-amber-500' : '')} />
                      </IconBtn>
                      <IconBtn title="Edit" onClick={() => { setCreating(false); setEditing(p) }}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="Archive"
                        onClick={() => {
                          if (confirm(`Archive "${p.name}"? It will be hidden from the website and logged in the audit trail.`))
                            softDelete.mutate(p.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </IconBtn>
                    </div>
  )

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
            <p className="text-sm text-slate-500">Manage the projects shown on the public website. Unpublished projects are invisible to visitors.</p>
          </div>
          {newBtn}
        </div>
      ) : (
        <PageHeader
          title="Projects"
          description="Everything shown on the public website. Unpublished projects are invisible to visitors."
          action={newBtn}
        />
      )}

      {error && <ErrorState error={error} />}
      <Card>
        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title="No projects yet" description="Create your first project to start listing plots." />
        ) : (
          <Responsive table={<Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Location</Th>
                <Th>Price range</Th>
                <Th>Visibility</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">/{p.slug}</p>
                  </Td>
                  <Td className="text-xs">{[p.location, p.city].filter(Boolean).join(', ') || '—'}</Td>
                  <Td className="text-xs">
                    {p.price_from ? `${money(p.price_from)} – ${money(p.price_to ?? p.price_from)}` : '—'}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={p.published ? 'green' : 'neutral'}>
                        {p.published ? 'Published' : 'Draft'}
                      </Badge>
                      {p.featured && <Badge tone="gold">Featured</Badge>}
                      {p.sold_out && <Badge tone="red">Sold out</Badge>}
                    </div>
                  </Td>
                  <Td className="text-xs">{date(p.created_at)}</Td>
                  <Td>
                    {projectActions(p)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>} cards={
            <div>
              {data.map((p) => (
                <RecordCard key={p.id}
                  title={p.name}
                  subtitle={[p.location, p.city].filter(Boolean).join(', ') || undefined}
                  badge={<><Badge tone={p.published ? 'green' : 'neutral'}>{p.published ? 'Published' : 'Draft'}</Badge>{p.featured && <Badge tone="gold">Featured</Badge>}</>}
                  rows={[
                    { label: 'Price', value: p.price_from ? `${money(p.price_from)} – ${money(p.price_to ?? p.price_from)}` : '—' },
                    { label: 'Created', value: date(p.created_at) },
                  ]}
                  actions={projectActions(p)} />
              ))}
            </div>
          } />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => { setEditing(null); setCreating(false) }}
        title={editing ? `Edit ${editing.name}` : 'New project'}
        size="lg"
      >
        <form id="project-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project name" required>
              <Input name="name" required defaultValue={editing?.name} />
            </Field>
            <Field label="URL slug" hint="Leave blank to generate from the name.">
              <Input name="slug" defaultValue={editing?.slug} placeholder="green-valley-phase-2" />
            </Field>
            <Field label="Location">
              <Input name="location" defaultValue={editing?.location} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={editing?.city ?? ''} />
            </Field>
            <Field label="State">
              <Input name="state" defaultValue={editing?.state ?? ''} />
            </Field>
            <Field label="Sort order">
              <Input name="sort_order" type="number" defaultValue={editing?.sort_order ?? 0} />
            </Field>
          </div>

          <Field label="Description">
            <Textarea name="description" rows={4} defaultValue={editing?.description ?? ''} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pre-launch rate (₹ per sq yd)">
              <Input name="price_from" type="number" defaultValue={editing?.price_from ?? ''} />
            </Field>
            <Field label="Launch rate (₹ per sq yd)" hint="Leave blank if there is only one rate. The website shows both side by side.">
              <Input name="price_to" type="number" defaultValue={editing?.price_to ?? ''} />
            </Field>
            <Field label="Size from">
              <Input name="size_from" type="number" defaultValue={editing?.size_from ?? ''} />
            </Field>
            <Field label="Size to">
              <Input name="size_to" type="number" defaultValue={editing?.size_to ?? ''} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Size unit">
              <Select name="size_unit" defaultValue={editing?.size_unit ?? 'sqft'}>
                <option value="sqft">sq ft</option>
                <option value="sqyd">sq yd</option>
                <option value="acre">acre</option>
              </Select>
            </Field>
            <Field label="Published">
              <Select name="published" defaultValue={String(editing?.published ?? false)}>
                <option value="false">Draft</option>
                <option value="true">Published</option>
              </Select>
            </Field>
            <Field label="Featured">
              <Select name="featured" defaultValue={String(editing?.featured ?? false)}>
                <option value="false">No</option>
                <option value="true">Yes — show in carousel</option>
              </Select>
            </Field>
            <Field label="Sold out" hint="Shows a “Sold out” badge on the website.">
              <Select name="sold_out" defaultValue={String(editing?.sold_out ?? false)}>
                <option value="false">No — booking open</option>
                <option value="true">Yes — sold out</option>
              </Select>
            </Field>
          </div>

          <Field label="Amenities" hint="Comma separated.">
            <Input name="amenities" defaultValue={editing?.amenities?.join(', ') ?? ''} placeholder="Gated, Park, 30ft roads" />
          </Field>
          <Field label="Main image" hint="Shown on the project card and at the top of the project page.">
            <ImageUpload key={`hero-${editing?.id ?? 'new'}`} name="hero_image" folder="projects" defaultValue={editing?.hero_image ?? null} />
          </Field>
          <Field label="Gallery images">
            <MultiImageUpload key={`gal-${editing?.id ?? 'new'}`} name="gallery" folder="projects" defaultValue={editing?.gallery ?? []} />
          </Field>
          <Field label="Brochure (PDF)">
            <DocUpload key={`bro-${editing?.id ?? 'new'}`} name="brochure_path" folder="brochures" defaultValue={editing?.brochure_path ?? null} />
          </Field>
          <Field label="Map embed" hint="Paste the <iframe> snippet from your map provider.">
            <Textarea name="map_embed" rows={2} defaultValue={editing?.map_embed ?? ''} />
          </Field>
        </form>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setEditing(null); setCreating(false) }}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={save.isPending}>
            Save project
          </Button>
        </div>
      </Modal>
    </>
  )
}

export function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  )
}
