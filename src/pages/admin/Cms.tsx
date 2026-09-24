import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProjects, type Banner } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal,
  PageHeader, Select, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { IconBtn, AdminProjects } from '@/pages/admin/Projects'
import { AdminPlots } from '@/pages/admin/Plots'
import { CmsContentTab } from '@/pages/admin/CmsContentTab'
import { DEFAULT_TEAM, DEFAULT_ACHIEVERS, DEFAULT_EVENTS, DEFAULT_NEWS, DEFAULT_REWARDS, DEFAULT_PLAN_RANKS, DEFAULT_PLAN_LEVELS, TEAM_CATEGORIES } from '@/lib/site-content'
import { WELCOME_DEFAULTS, resolveWelcomeLetter, WelcomeLetterView, type WelcomeLetter } from '@/lib/welcome-letter'
import { dateTime, num } from '@/lib/format'

interface CmsPageRow { id: string; slug: string; title: string; body: string; published: boolean; updated_at: string }
interface GalleryPhoto { id: string; url: string; caption: string | null; sort_order: number; is_active: boolean; created_at: string }

type Tab = 'hero' | 'featured' | 'plots' | 'team' | 'gallery' | 'achievers' | 'rewards' | 'plans' | 'events' | 'news' | 'banners' | 'welcome' | 'pages' | 'contact'

export function AdminCms() {
  const [tab, setTab] = useState<Tab>('hero')

  return (
    <>
      <PageHeader
        title="Website CMS"
        description="Manage content shown on the public website. Edits go live immediately."
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {([
          ['hero', 'Home / Hero'],
          ['featured', 'Projects'],
          ['plots', 'Plots'],
          ['team', 'Team'],
          ['gallery', 'Gallery'],
          ['achievers', 'Achievers'],
          ['rewards', 'Rewards'],
          ['plans', 'Plans'],
          ['events', 'Events'],
          ['news', 'News'],
          ['banners', 'Banners'],
          ['welcome', 'Welcome Letter'],
          ['pages', 'Pages'],
          ['contact', 'Site Settings'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
              (tab === key ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'hero' && <HomeHeroTab />}
      {tab === 'featured' && <AdminProjects embedded />}
      {tab === 'plots' && <AdminPlots embedded />}
      {tab === 'team' && (
        <CmsContentTab
          table="team_members"
          title="Team members"
          subtitle="Directors, managing directors, branch managers and rank achievers on the public Team page."
          imageField="photo_url"
          titleField="name"
          subtitleField="designation"
          defaults={DEFAULT_TEAM}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'designation', label: 'Designation', required: true },
            { name: 'category', label: 'Category', type: 'select', options: TEAM_CATEGORIES },
            { name: 'photo_url', label: 'Photo URL' },
          ]}
        />
      )}
      {tab === 'gallery' && <GalleryTab />}
      {tab === 'achievers' && (
        <CmsContentTab
          table="achievers"
          title="Achievers"
          subtitle="Top achievers featured on the home page."
          imageField="photo_url"
          titleField="name"
          subtitleField="rank"
          defaults={DEFAULT_ACHIEVERS}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'rank', label: 'Rank' },
            { name: 'achievement', label: 'Achievement' },
            { name: 'photo_url', label: 'Photo URL' },
          ]}
        />
      )}
      {tab === 'rewards' && (
        <CmsContentTab
          table="rewards"
          title="Rewards"
          subtitle="Milestone rewards shown on the public Rewards page."
          imageField="image_url"
          titleField="title"
          subtitleField="joining"
          defaults={DEFAULT_REWARDS}
          fields={[
            { name: 'level', label: 'Level', required: true },
            { name: 'title', label: 'Title', required: true },
            { name: 'joining', label: 'Joining target' },
            { name: 'sales', label: 'Sales target' },
            { name: 'image_url', label: 'Image URL' },
            { name: 'trending', label: 'Trending', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] },
          ]}
        />
      )}
      {tab === 'plans' && (
        <div className="space-y-6">
          <CmsContentTab
            table="plan_ranks"
            title="Rank & income rows"
            subtitle="The Rank & Income table on the public Plans page."
            titleField="rank"
            subtitleField="joining"
            defaults={DEFAULT_PLAN_RANKS}
            fields={[
              { name: 'rank', label: 'Rank', required: true },
              { name: 'joining', label: 'Joining (₹)' },
              { name: 'direct', label: 'Direct income' },
              { name: 'pct', label: 'Sale %' },
              { name: 'features', label: 'Features', type: 'textarea' },
              { name: 'elite', label: 'Elite rank', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] },
            ]}
          />
          <CmsContentTab
            table="plan_levels"
            title="Level payout rows"
            subtitle="The level-wise payout ladder (₹ / SQYDS) and the income estimator."
            titleField="level"
            subtitleField="rate"
            defaults={DEFAULT_PLAN_LEVELS}
            fields={[
              { name: 'level', label: 'Level', required: true },
              { name: 'rate', label: 'Rate (₹/SQYDS)', required: true },
              { name: 'tag', label: 'Tag (e.g. MOST REWARDING)' },
            ]}
          />
        </div>
      )}
      {tab === 'events' && (
        <CmsContentTab
          table="events"
          title="Events"
          subtitle="Meets, launches and achiever ceremonies on the public Events page."
          imageField="image_url"
          titleField="title"
          subtitleField="location"
          defaults={DEFAULT_EVENTS}
          fields={[
            { name: 'title', label: 'Title', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'event_date', label: 'Date' },
            { name: 'location', label: 'Location' },
            { name: 'image_url', label: 'Image URL' },
          ]}
        />
      )}
      {tab === 'news' && (
        <CmsContentTab
          table="news_posts"
          title="News"
          subtitle="Announcements and updates on the public News page."
          imageField="image_url"
          titleField="title"
          subtitleField="news_date"
          defaults={DEFAULT_NEWS}
          fields={[
            { name: 'title', label: 'Title', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'news_date', label: 'Date' },
            { name: 'image_url', label: 'Image URL' },
          ]}
        />
      )}
      {tab === 'banners' && <BannersTab />}
      {tab === 'welcome' && <WelcomeLetterTab />}
      {tab === 'pages' && <PagesTab />}
      {tab === 'contact' && <ContactTab />}
    </>
  )
}

/* --------------------------------------------------------------- home/hero */

const HERO_DEFAULTS = {
  badge: 'Mission 90 Days Training',
  title_lead: 'Build Your',
  title_accent: 'Financial Future',
  title_tail: 'with Royal Green Company',
  subtitle: "India's trusted royal green network. Earn direct sponsor income, level commissions and lifetime rewards — all the way up to Crown Diamond.",
  primary_cta_label: 'Join as Sponsor',
  primary_cta_link: '/register',
  secondary_cta_label: 'Explore Plans',
  secondary_cta_link: '/plans',
}

function HomeHeroTab() {
  const qc = useQueryClient()
  const { push } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings', 'home.hero'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('*').eq('key', 'home.hero').maybeSingle()
      if (error) throw new Error(error.message)
      return data as { key: string; value: Record<string, string> } | null
    },
  })

  const save = useMutation({
    mutationFn: async (value: Record<string, string>) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'home.hero', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { push('success', 'Hero content updated.'); void qc.invalidateQueries({ queryKey: ['site-settings'] }) },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />
  const v = { ...HERO_DEFAULTS, ...(data?.value ?? {}) }

  return (
    <Card>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            save.mutate(Object.fromEntries([...f.entries()].map(([k, val]) => [k, String(val)])) as Record<string, string>)
          }}
        >
          <Field label="Badge text"><Input name="badge" defaultValue={v.badge} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Title — lead"><Input name="title_lead" defaultValue={v.title_lead} /></Field>
            <Field label="Title — accent"><Input name="title_accent" defaultValue={v.title_accent} /></Field>
            <Field label="Title — tail"><Input name="title_tail" defaultValue={v.title_tail} /></Field>
          </div>
          <Field label="Subtitle"><Textarea name="subtitle" rows={3} defaultValue={v.subtitle} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Primary CTA label"><Input name="primary_cta_label" defaultValue={v.primary_cta_label} /></Field>
            <Field label="Primary CTA link"><Input name="primary_cta_link" defaultValue={v.primary_cta_link} /></Field>
            <Field label="Secondary CTA label"><Input name="secondary_cta_label" defaultValue={v.secondary_cta_label} /></Field>
            <Field label="Secondary CTA link"><Input name="secondary_cta_link" defaultValue={v.secondary_cta_link} /></Field>
          </div>
          <Button type="submit" loading={save.isPending}>Save hero</Button>
        </form>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------------------ welcome letter */

function WelcomeLetterTab() {
  const qc = useQueryClient()
  const { push } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings', 'welcome.letter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('*').eq('key', 'welcome.letter').maybeSingle()
      if (error) throw new Error(error.message)
      return data as { key: string; value: Partial<WelcomeLetter> } | null
    },
  })

  const save = useMutation({
    mutationFn: async (value: WelcomeLetter) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'welcome.letter', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { push('success', 'Welcome letter template saved.'); void qc.invalidateQueries({ queryKey: ['site-settings'] }) },
    onError: (e: Error) => push('error', e.message),
  })

  const [letter, setLetter] = useState<WelcomeLetter | null>(null)
  const value = letter ?? resolveWelcomeLetter(data?.value)
  const set = (k: keyof WelcomeLetter, v: unknown) => setLetter({ ...value, [k]: v })
  const setPara = (i: number, v: string) => setLetter({ ...value, paragraphs: value.paragraphs.map((x, j) => (j === i ? v : x)) })

  if (isLoading) return <Spinner />

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Welcome letter — default template"
          subtitle="The template every new member sees. Admins can override it per-member from the member dashboard."
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setLetter(WELCOME_DEFAULTS); }}>Reset defaults</Button>
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate(value)}>Save template</Button>
            </div>
          }
        />
        <CardBody>
          <p className="mb-4 text-xs text-slate-400">Placeholders: {'{{name}} {{id}} {{rank}} {{joined}} {{email}} {{phone}} {{sponsorName}} {{sponsorId}} {{date}}'}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand title"><Input value={value.brand_title} onChange={(e) => set('brand_title', e.target.value)} /></Field>
            <Field label="Subtitle"><Input value={value.subtitle} onChange={(e) => set('subtitle', e.target.value)} /></Field>
            <Field label="Reference prefix"><Input value={value.ref_prefix} onChange={(e) => set('ref_prefix', e.target.value)} /></Field>
            <Field label="Heading"><Input value={value.heading} onChange={(e) => set('heading', e.target.value)} /></Field>
          </div>
          <div className="mt-4"><Field label="Salutation"><Input value={value.salutation} onChange={(e) => set('salutation', e.target.value)} /></Field></div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Body paragraphs</p>
              <Button size="sm" variant="outline" onClick={() => setLetter({ ...value, paragraphs: [...value.paragraphs, ''] })}><Plus className="h-4 w-4" /> Add</Button>
            </div>
            <div className="space-y-2">
              {value.paragraphs.map((para, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 w-5 text-right text-xs text-slate-400">{i + 1}</span>
                  <Textarea value={para} rows={2} onChange={(e) => setPara(i, e.target.value)} className="flex-1" />
                  <button onClick={() => setLetter({ ...value, paragraphs: value.paragraphs.filter((_, j) => j !== i) })} className="mt-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Closing"><Input value={value.closing} onChange={(e) => set('closing', e.target.value)} /></Field>
            <Field label="Signatory"><Input value={value.signatory} onChange={(e) => set('signatory', e.target.value)} /></Field>
            <Field label="Company line"><Input value={value.company_line} onChange={(e) => set('company_line', e.target.value)} /></Field>
            <Field label="Footer slogan"><Input value={value.footer_slogan} onChange={(e) => set('footer_slogan', e.target.value)} /></Field>
          </div>
        </CardBody>
      </Card>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p>
        <WelcomeLetterView letter={value} member={null} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pages */

function PagesTab() {
  const qc = useQueryClient()
  const { push } = useToast()
  const [editing, setEditing] = useState<CmsPageRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { data = [], isLoading } = useQuery({
    queryKey: ['cms-pages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cms_pages').select('*').order('slug')
      if (error) throw new Error(error.message)
      return data as CmsPageRow[]
    },
  })

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown> & { id?: string }) => {
      const { id, ...rest } = payload
      const res = id
        ? await supabase.from('cms_pages').update(rest).eq('id', id)
        : await supabase.from('cms_pages').insert(rest)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      push('success', 'Page saved.')
      setEditing(null)
      setCreating(false)
      void qc.invalidateQueries({ queryKey: ['cms-pages'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  return (
    <>
      <Card>
        <CardHeader
          title={`${num(data.length)} pages`}
          action={
            <Button size="sm" onClick={() => { setEditing(null); setCreating(true) }}>
              <Plus className="h-4 w-4" /> New page
            </Button>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title="No pages" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>URL</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{p.title}</Td>
                  <Td className="font-mono text-xs text-slate-500">/page/{p.slug}</Td>
                  <Td><Badge tone={p.published ? 'green' : 'neutral'}>{p.published ? 'Published' : 'Draft'}</Badge></Td>
                  <Td className="text-xs">{dateTime(p.updated_at)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconBtn title="Edit" onClick={() => { setCreating(false); setEditing(p) }}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => { setEditing(null); setCreating(false) }}
        title={editing ? `Edit ${editing.title}` : 'New page'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button>
            <Button type="submit" form="cms-page-form" loading={save.isPending}>Save page</Button>
          </>
        }
      >
        <form
          id="cms-page-form"
          className="space-y-3"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            save.mutate({
              id: editing?.id,
              slug: String(f.get('slug')),
              title: String(f.get('title')),
              body: String(f.get('body')),
              published: f.get('published') === 'true',
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" required>
              <Input name="title" required defaultValue={editing?.title} />
            </Field>
            <Field label="Slug" hint="Reachable at /page/<slug>." required>
              <Input name="slug" required defaultValue={editing?.slug} />
            </Field>
          </div>
          <Field label="Published">
            <Select name="published" defaultValue={String(editing?.published ?? true)}>
              <option value="true">Published</option>
              <option value="false">Draft</option>
            </Select>
          </Field>
          <Field label="Content">
            <Textarea name="body" rows={12} defaultValue={editing?.body} />
          </Field>
        </form>
      </Modal>
    </>
  )
}

/* ---------------------------------------------------------------- banners */

/** An ISO instant back into the `YYYY-MM-DDTHH:mm` a datetime-local expects. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function BannersTab() {
  const qc = useQueryClient()
  const { push } = useToast()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['cms-banners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cms_banners').select('*').order('sort_order')
      if (error) throw new Error(error.message)
      return data as Banner[]
    },
  })

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      // Editing keeps the row's id, which matters: a dismissal is remembered
      // per banner id, so recreating a banner would resurface it for every
      // member who had already dismissed it.
      const { error } = editing
        ? await supabase.from('cms_banners').update(payload).eq('id', editing.id)
        : await supabase.from('cms_banners').insert(payload)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', editing ? 'Banner updated.' : 'Banner added.')
      setCreating(false)
      setEditing(null)
      void qc.invalidateQueries({ queryKey: ['cms-banners'] })
      void qc.invalidateQueries({ queryKey: ['banners'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cms_banners').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cms-banners'] }),
    onError: (e: Error) => push('error', e.message),
  })

  // Switching a banner off is the everyday action -- a sale ends, the strip
  // comes down -- and it must not mean deleting the copy.
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('cms_banners').update({ active }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cms-banners'] })
      void qc.invalidateQueries({ queryKey: ['banners'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  return (
    <>
      <Card>
        <CardHeader
          title={`${num(data.length)} banners`}
          action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New banner</Button>}
        />
        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title="No banners" description="A banner runs on the public home page, across the top of the sponsor panel, or both." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((b) => (
              <li key={b.id} className="flex items-center gap-4 px-5 py-3">
                {b.image_url && <img src={b.image_url} alt="" className="h-12 w-20 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{b.title}</p>
                  <p className="truncate text-xs text-slate-500">{b.subtitle ?? '—'}</p>
                </div>
                <Badge tone={b.audience === 'sponsor' ? 'violet' : b.audience === 'both' ? 'blue' : 'neutral'}>
                  {b.audience === 'sponsor' ? 'Sponsor panel' : b.audience === 'both' ? 'Website + panel' : 'Website'}
                </Badge>
                <Badge tone={b.tone === 'offer' ? 'gold' : b.tone === 'warn' ? 'amber' : b.tone === 'success' ? 'green' : 'blue'}>
                  {b.tone}
                </Badge>
                <button
                  onClick={() => toggle.mutate({ id: b.id, active: !b.active })}
                  title={b.active ? 'Switch off' : 'Switch on'}
                >
                  <Badge tone={b.active ? 'green' : 'neutral'}>{b.active ? 'Active' : 'Hidden'}</Badge>
                </button>
                <IconBtn title="Edit" onClick={() => { setCreating(false); setEditing(b) }}>
                  <Pencil className="h-4 w-4 text-slate-500" />
                </IconBtn>
                <IconBtn title="Delete" onClick={() => { if (confirm('Delete this banner?')) remove.mutate(b.id) }}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </IconBtn>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        key={editing?.id ?? 'new'}
        open={creating || Boolean(editing)}
        onClose={() => { setCreating(false); setEditing(null) }}
        title={editing ? `Edit ${editing.title}` : 'New banner'}
        footer={
          <>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null) }}>Cancel</Button>
            <Button type="submit" form="banner-form" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add banner'}
            </Button>
          </>
        }
      >
        <form
          id="banner-form"
          className="space-y-3"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            // A datetime-local field gives local wall-clock time with no zone;
            // send it as an instant so the window means the same thing to every
            // member whatever their device is set to.
            const asInstant = (v: FormDataEntryValue | null) => {
              const raw = String(v ?? '').trim()
              if (!raw) return null
              const d = new Date(raw)
              return Number.isNaN(d.getTime()) ? null : d.toISOString()
            }
            save.mutate({
              title: String(f.get('title')),
              subtitle: String(f.get('subtitle') ?? '') || null,
              image_url: String(f.get('image_url') ?? '') || null,
              cta_label: String(f.get('cta_label') ?? '') || null,
              cta_link: String(f.get('cta_link') ?? '') || null,
              sort_order: Number(f.get('sort_order') ?? 0),
              audience: String(f.get('audience') ?? 'public'),
              tone: String(f.get('tone') ?? 'info'),
              dismissible: f.get('dismissible') === 'on',
              starts_at: asInstant(f.get('starts_at')),
              ends_at: asInstant(f.get('ends_at')),
              active: editing?.active ?? true,
            })
          }}
        >
          <Field label="Title" required><Input name="title" required defaultValue={editing?.title ?? ''} /></Field>
          <Field label="Subtitle"><Input name="subtitle" defaultValue={editing?.subtitle ?? ''} /></Field>
          <Field label="Image URL"><Input name="image_url" defaultValue={editing?.image_url ?? ''} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button label"><Input name="cta_label" placeholder="Browse projects" defaultValue={editing?.cta_label ?? ''} /></Field>
            <Field label="Button link"><Input name="cta_link" placeholder="/projects" defaultValue={editing?.cta_link ?? ''} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Show to" hint="Where this banner appears.">
              <Select name="audience" defaultValue={editing?.audience ?? 'sponsor'}>
                <option value="sponsor">Sponsor panel</option>
                <option value="public">Public website</option>
                <option value="both">Both</option>
              </Select>
            </Field>
            <Field label="Style" hint="Offer is the bright promotional strip.">
              <Select name="tone" defaultValue={editing?.tone ?? 'info'}>
                <option value="info">Information</option>
                <option value="offer">Offer</option>
                <option value="success">Good news</option>
                <option value="warn">Warning</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" hint="Leave blank to start now.">
              <Input name="starts_at" type="datetime-local" defaultValue={toLocalInput(editing?.starts_at)} />
            </Field>
            <Field label="Ends" hint="Leave blank to run until switched off.">
              <Input name="ends_at" type="datetime-local" defaultValue={toLocalInput(editing?.ends_at)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sort order"><Input name="sort_order" type="number" defaultValue={editing?.sort_order ?? 0} /></Field>
            <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="dismissible" defaultChecked={editing?.dismissible ?? true} className="h-4 w-4 rounded border-slate-300" />
              Members can dismiss it
            </label>
          </div>
        </form>
      </Modal>
    </>
  )
}

/* ---------------------------------------------------------------- contact */

function ContactTab() {
  const qc = useQueryClient()
  const { push } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings', 'public.contact'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'public.contact')
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as { key: string; value: Record<string, string> } | null
    },
  })

  const save = useMutation({
    mutationFn: async (value: Record<string, string>) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'public.contact', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Contact details updated.')
      void qc.invalidateQueries({ queryKey: ['site-settings'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />
  const v = data?.value ?? {}

  return (
    <Card>
      <CardHeader title="Contact details" subtitle="Shown in the website footer and on the contact page." />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            save.mutate({
              company: String(f.get('company') ?? ''),
              phone: String(f.get('phone') ?? ''),
              email: String(f.get('email') ?? ''),
              whatsapp: String(f.get('whatsapp') ?? ''),
              address: String(f.get('address') ?? ''),
              hero_title: String(f.get('hero_title') ?? ''),
              hero_subtitle: String(f.get('hero_subtitle') ?? ''),
              branches: String(f.get('branches') ?? ''),
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name"><Input name="company" defaultValue={v.company ?? ''} /></Field>
            <Field label="Phone / WhatsApp display"><Input name="phone" defaultValue={v.phone ?? ''} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={v.email ?? ''} /></Field>
            <Field label="WhatsApp number (digits only)"><Input name="whatsapp" defaultValue={v.whatsapp ?? ''} /></Field>
          </div>
          <Field label="Head office address"><Textarea name="address" rows={2} defaultValue={v.address ?? ''} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact page heading"><Input name="hero_title" defaultValue={v.hero_title ?? ''} placeholder="Talk to Royal Green Company" /></Field>
            <Field label="Contact page subtitle"><Input name="hero_subtitle" defaultValue={v.hero_subtitle ?? ''} placeholder="Talk to a sales partner…" /></Field>
          </div>
          <Field label="Branches" hint="One branch per line — shown in the 'Our Branches' grid.">
            <Textarea name="branches" rows={5} defaultValue={v.branches ?? ''} placeholder={'ILD / Gurgaon\nSector 47 / Gurgaon\nDelhi'} />
          </Field>
          <Button type="submit" loading={save.isPending}>Save contact details</Button>
        </form>
      </CardBody>
    </Card>
  )
}

/* --------------------------------------------------------------- gallery */

function GalleryTab() {
  const qc = useQueryClient()
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['gallery-photos-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery_photos')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw new Error(error.message)
      return data as GalleryPhoto[]
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gallery_photos').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gallery-photos-admin'] }),
    onError: (e: Error) => push('error', e.message),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('gallery_photos').update({ is_active }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gallery-photos-admin'] }),
    onError: (e: Error) => push('error', e.message),
  })

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { push('error', 'Select a file first.'); return }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const key = `gallery/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('gallery')
        .upload(key, file, { contentType: file.type, upsert: false })
      if (upErr) throw new Error(upErr.message)

      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/gallery/${key}`

      const maxOrder = data.length ? Math.max(...data.map(p => p.sort_order)) : 0
      const { error: dbErr } = await supabase.from('gallery_photos').insert({
        url,
        caption: caption || null,
        sort_order: maxOrder + 1,
        is_active: true,
      })
      if (dbErr) throw new Error(dbErr.message)

      push('success', 'Photo uploaded.')
      setCaption('')
      if (fileRef.current) fileRef.current.value = ''
      void qc.invalidateQueries({ queryKey: ['gallery-photos-admin'] })
    } catch (e) {
      push('error', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Upload card */}
      <Card>
        <CardHeader title="Upload new photo" subtitle="Photos are stored in Cloudflare R2 and shown on the public gallery page." />
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1"><Field label="Photo file">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
              />
            </Field></div>
            <div className="flex-1"><Field label="Caption (optional)">
              <Input value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Award ceremony 2025" />
            </Field></div>
            <Button onClick={handleUpload} loading={uploading} className="shrink-0">
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Photos grid */}
      <Card>
        <CardHeader title={`${num(data.length)} photos`} />
        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title="No photos" description="Upload your first gallery photo above." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-5">
            {data.map((photo) => (
              <div key={photo.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img src={photo.url} alt={photo.caption ?? ''} className="h-32 w-full object-cover" loading="lazy" />
                {!photo.is_active && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-xs text-white font-bold">Hidden</span>
                  </div>
                )}
                <div className="absolute inset-0 hidden group-hover:flex items-end justify-between p-2 bg-gradient-to-t from-black/60 to-transparent">
                  <button
                    title={photo.is_active ? 'Hide from gallery' : 'Show in gallery'}
                    onClick={() => toggleActive.mutate({ id: photo.id, is_active: !photo.is_active })}
                    className="rounded-lg bg-white/20 p-1.5 text-white hover:bg-white/40 transition"
                  >
                    <Image className="h-4 w-4" />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => { if (confirm('Delete this photo?')) remove.mutate(photo.id) }}
                    className="rounded-lg bg-red-500/80 p-1.5 text-white hover:bg-red-600 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {photo.caption && (
                  <p className="px-2 py-1 text-[11px] text-slate-600 truncate">{photo.caption}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
