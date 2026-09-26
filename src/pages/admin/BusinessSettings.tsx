import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ExternalLink, ImageUp, Pencil, Plus, Power, Receipt, Trash2, Trophy } from 'lucide-react'
import { assetUrl, supabase } from '@/lib/supabase'
import { useRanks, useSiteSetting } from '@/lib/queries'
import { BRAND, BRAND_DEFAULTS, applyBrand, resolveBrand, type BrandSettings } from '@/lib/brand'
import { rankFeatures, joiningLabel } from '@/lib/plan'
import { money, num, pct } from '@/lib/format'
import type { Rank } from '@/lib/types'
import {
  Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal, PageHeader,
  Select, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'

/**
 * Business Settings — everything about the company and its plan that the
 * office should be able to change itself, without a developer or a deploy:
 *
 *   Company        name, legal name, tagline, contact details, logo
 *   Rank plan      every rank's percentages, salary, fees, reward and the
 *                  conditions to reach it — the same rows the income engine
 *                  pays on, and the public Plans/Home tables are built from
 *   Payouts        TDS, admin charge, minimum withdrawal
 *   Other content  where the rest (pages, banners, projects…) is edited
 */

type Tab = 'company' | 'plan' | 'payouts' | 'more'

export function AdminBusinessSettings() {
  const [tab, setTab] = useState<Tab>('company')
  const tabs: [Tab, string, ReactNode][] = [
    ['company', 'Company', <Building2 key="c" className="h-4 w-4" />],
    ['plan', 'Rank plan', <Trophy key="p" className="h-4 w-4" />],
    ['payouts', 'Payouts & deductions', <Receipt key="r" className="h-4 w-4" />],
    ['more', 'Other content', <ExternalLink key="m" className="h-4 w-4" />],
  ]
  return (
    <div>
      <PageHeader
        title="Business Settings"
        description="Company details, the rank plan and payout rules. Changes apply across the website, the sponsor panel and the income calculations as soon as you save."
      />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ' +
              (tab === key ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100')
            }
          >
            {icon} {label}
          </button>
        ))}
      </div>
      {tab === 'company' && <CompanyTab />}
      {tab === 'plan' && <RankPlanTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'more' && <MoreTab />}
    </div>
  )
}

/* ================================================================ Company */

const COMPANY_FIELDS: { key: keyof BrandSettings; label: string; hint?: string; required?: boolean }[] = [
  { key: 'name', label: 'Company name', hint: 'Used in headings, emails, the browser tab and the ID card.', required: true },
  { key: 'short', label: 'Short name', hint: 'Where space is tight: the sidebar and badges.', required: true },
  { key: 'legalName', label: 'Registered name', hint: 'Footer copyright, welcome letters and receipts.', required: true },
  { key: 'tagline', label: 'Tagline' },
  { key: 'website', label: 'Website (as shown)', hint: 'e.g. symocity.com' },
  { key: 'websiteUrl', label: 'Website link', hint: 'Full address, e.g. https://symocity.com' },
  { key: 'email', label: 'Contact email' },
  { key: 'phone', label: 'Contact phone' },
  { key: 'compliance', label: 'Compliance line', hint: 'e.g. RERA Compliant · Premium Real Estate Developer' },
]

function CompanyTab() {
  const { data: stored, isLoading } = useSiteSetting('public.brand')
  const [form, setForm] = useState<BrandSettings>(BRAND_DEFAULTS)
  const [valuesText, setValuesText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  useEffect(() => {
    const b = resolveBrand(stored as Partial<BrandSettings> | null)
    setForm(b)
    setValuesText(b.values.join('\n'))
  }, [stored])

  const save = useMutation({
    mutationFn: async (value: BrandSettings) => {
      const { error } = await supabase.from('site_settings').upsert(
        { key: 'public.brand', value, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      if (error) throw new Error(error.message)
      return value
    },
    onSuccess: (value) => {
      applyBrand(value)
      void qc.invalidateQueries({ queryKey: ['site-settings', 'public.brand'] })
      push('success', 'Company details saved. Reloading so every page shows them…')
      // Several pages build text from the company name when they first load;
      // a reload is the one way to be sure none shows the old name.
      setTimeout(() => window.location.reload(), 1200)
    },
    onError: (e: Error) => push('error', e.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    for (const f of COMPANY_FIELDS) {
      if (f.required && !String(form[f.key] ?? '').trim()) {
        push('error', `${f.label} cannot be empty.`)
        return
      }
    }
    if (form.websiteUrl && !/^https?:\/\//i.test(form.websiteUrl.trim())) {
      push('error', 'The website link must start with http:// or https://')
      return
    }
    const values = valuesText.split('\n').map((v) => v.trim()).filter(Boolean)
    save.mutate({ ...form, values })
  }

  async function uploadLogo() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      push('error', 'Please choose a PNG, JPG or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      push('error', 'Please choose an image under 2 MB.')
      return
    }
    setUploading(true)
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const key = `brand/logo-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('public-assets').upload(key, file, { contentType: file.type })
      if (error) throw new Error(error.message)
      // Kept relative: the live site and a developer's machine share one database.
      setForm((f) => ({ ...f, logoUrl: `/storage/v1/object/public/public-assets/${key}` }))
      push('success', 'Logo uploaded. Press “Save company details” to use it.')
    } catch (e) {
      push('error', (e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (isLoading) return <Spinner label="Loading company details…" />
  const logo = assetUrl(form.logoUrl) ?? '/brand-mark-512.png'

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader title="Logo" subtitle="Shown in the header, the sidebar, the ID card and as the browser-tab icon. A square image works best." />
        <CardBody className="flex flex-wrap items-center gap-5">
          <img src={logo} alt="Logo" className="h-20 w-20 rounded-xl bg-white object-contain ring-1 ring-slate-200" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={() => void uploadLogo()} />
            <Button type="button" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              <ImageUp className="h-4 w-4" /> Upload new logo
            </Button>
            {form.logoUrl && (
              <Button type="button" variant="ghost" onClick={() => setForm((f) => ({ ...f, logoUrl: null }))}>
                Use the built-in logo
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Company details" subtitle="Appear on the website, in the panels, on documents and in emails." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {COMPANY_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} required={f.required}>
              <Input
                value={String(form[f.key] ?? '')}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label="Brand values" hint="One per line — shown in the website footer.">
              <Textarea rows={3} value={valuesText} onChange={(e) => setValuesText(e.target.value)} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>Save company details</Button>
      </div>
    </form>
  )
}

/* ============================================================== Rank plan */

type RankForm = {
  id?: string
  name: string
  seniority: string
  active: boolean
  description: string
  own_sale_rate: string
  override_pct: string
  salary: string
  joining_fee: string
  training_fee: string
  training_note: string
  reward_title: string
  reward_sqyd: string
  req_direct: string
  req_team: string
  req_legs: string
  req_rank_sen: string
  req_rank_count: string
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(Number.isFinite(Number(v)) ? Number(v) : v))

function toForm(r: Rank | null, nextSeniority: number): RankForm {
  return {
    id: r?.id,
    name: r?.name ?? '',
    seniority: s(r?.seniority ?? nextSeniority),
    active: r?.active ?? true,
    description: r?.description ?? '',
    own_sale_rate: s(r?.own_sale_rate ?? 0),
    override_pct: s(r?.override_pct ?? 0),
    salary: s(r?.salary ?? 0),
    joining_fee: s(r?.joining_fee ?? 0),
    training_fee: s(r?.training_fee ?? 0),
    training_note: r?.training_note ?? '',
    reward_title: r?.reward_title ?? '',
    reward_sqyd: s(r?.reward_sqyd ?? 0),
    req_direct: s(r?.req_direct ?? 0),
    req_team: s(r?.req_team ?? 0),
    req_legs: s(r?.req_legs ?? 0),
    req_rank_sen: r?.req_rank_sen == null ? '' : String(r.req_rank_sen),
    req_rank_count: s(r?.req_rank_count ?? 0),
  }
}

function qualification(r: Rank, byLevel: Map<number, string>) {
  const parts: string[] = []
  if (r.req_direct) parts.push(`${r.req_direct} direct`)
  if (r.req_team) parts.push(`${r.req_team} team`)
  if (r.req_rank_count && r.req_rank_sen != null) parts.push(`${r.req_rank_count} × ${byLevel.get(r.req_rank_sen) ?? `level ${r.req_rank_sen}`}`)
  if (r.req_legs) parts.push(`${r.req_legs} legs`)
  return parts.join(' · ') || 'Entry rank'
}

function RankPlanTab() {
  const { data: ranks = [], isLoading } = useRanks()
  const [editing, setEditing] = useState<RankForm | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  // How many members hold each rank — a rank in use cannot be deleted.
  const { data: holders = new Map<string, number>() } = useQuery({
    queryKey: ['rank-holders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('rank_id').is('deleted_at', null).not('rank_id', 'is', null)
      if (error) throw new Error(error.message)
      const m = new Map<string, number>()
      for (const row of (data ?? []) as { rank_id: string }[]) m.set(row.rank_id, (m.get(row.rank_id) ?? 0) + 1)
      return m
    },
  })

  const byLevel = useMemo(() => new Map(ranks.map((r) => [r.seniority, r.name])), [ranks])
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ranks'] })
    void qc.invalidateQueries({ queryKey: ['rank-ladder'] })
    void qc.invalidateQueries({ queryKey: ['rank-holders'] })
  }

  const save = useMutation({
    mutationFn: async (f: RankForm) => {
      const n = (v: string) => (v.trim() === '' ? 0 : Number(v))
      const payload = {
        name: f.name.trim(),
        seniority: n(f.seniority),
        active: f.active,
        description: f.description.trim() || null,
        own_sale_rate: n(f.own_sale_rate),
        override_pct: n(f.override_pct),
        salary: n(f.salary),
        joining_fee: n(f.joining_fee),
        training_fee: n(f.training_fee),
        training_note: f.training_note.trim() || null,
        reward_title: f.reward_title.trim() || null,
        reward_sqyd: n(f.reward_sqyd),
        req_direct: n(f.req_direct),
        req_team: n(f.req_team),
        req_legs: n(f.req_legs),
        req_rank_sen: f.req_rank_sen === '' ? null : Number(f.req_rank_sen),
        req_rank_count: n(f.req_rank_count),
      }
      const res = f.id
        ? await supabase.from('ranks').update(payload).eq('id', f.id)
        : await supabase.from('ranks').insert(payload)
      if (res.error) {
        if (/ranks_seniority_unique|duplicate key/i.test(res.error.message)) {
          throw new Error(`Another rank already uses level ${payload.seniority}. Give each rank its own level.`)
        }
        throw new Error(res.error.message)
      }
    },
    onSuccess: () => {
      push('success', 'Rank saved. The website plan and income calculations now use the new figures.')
      setEditing(null)
      refresh()
    },
    onError: (e: Error) => push('error', e.message),
  })

  const toggle = useMutation({
    mutationFn: async (r: Rank) => {
      const { error } = await supabase.from('ranks').update({ active: !r.active }).eq('id', r.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
    onError: (e: Error) => push('error', e.message),
  })

  const remove = useMutation({
    mutationFn: async (r: Rank) => {
      const { error } = await supabase.from('ranks').delete().eq('id', r.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { push('success', 'Rank deleted.'); refresh() },
    onError: (e: Error) => push('error', e.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const f = editing
    if (!f.name.trim()) return push('error', 'Give the rank a name.')
    const level = Number(f.seniority)
    if (!Number.isInteger(level) || level < 1) return push('error', 'Level must be a whole number, 1 or more.')
    for (const [label, v] of [['Own sale %', f.own_sale_rate], ['Sponsor %', f.override_pct]] as const) {
      const x = Number(v || 0)
      if (!Number.isFinite(x) || x < 0 || x > 100) return push('error', `${label} must be between 0 and 100.`)
    }
    for (const [label, v] of [
      ['Monthly salary', f.salary], ['Joining fee', f.joining_fee], ['Training fee', f.training_fee],
      ['Reward sq yd', f.reward_sqyd], ['Direct members', f.req_direct], ['Team size', f.req_team],
      ['Legs', f.req_legs], ['Rank holders needed', f.req_rank_count],
    ] as const) {
      const x = Number(v || 0)
      if (!Number.isFinite(x) || x < 0) return push('error', `${label} cannot be negative.`)
    }
    save.mutate(f)
  }

  if (isLoading) return <Spinner label="Loading the rank plan…" />
  const set = <K extends keyof RankForm>(k: K, v: RankForm[K]) => setEditing((f) => (f ? { ...f, [k]: v } : f))
  const nextLevel = ranks.length ? Math.max(...ranks.map((r) => r.seniority)) + 1 : 1

  return (
    <Card>
      <CardHeader
        title="Rank plan"
        subtitle="The income engine pays on these figures, and the public Plans and Home pages show them. Switch a rank off to hide it; a rank members hold cannot be deleted."
        action={<Button size="sm" onClick={() => setEditing(toForm(null, nextLevel))}><Plus className="h-4 w-4" /> Add rank</Button>}
      />
      <Table>
        <thead>
          <tr>
            <Th>Level</Th><Th>Rank</Th><Th className="text-right">Own sale</Th><Th className="text-right">Sponsor</Th>
            <Th className="text-right">Salary / mo</Th><Th className="text-right">Joining</Th><Th>Reward &amp; perks</Th>
            <Th>To qualify</Th><Th className="text-right">Members</Th><Th></Th>
          </tr>
        </thead>
        <tbody>
          {ranks.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
              <Td className="font-mono text-slate-500">{r.seniority}</Td>
              <Td className="font-medium text-slate-900">
                {r.name} {!r.active && <Badge tone="neutral" className="ml-1">Off</Badge>}
              </Td>
              <Td className="text-right font-semibold">{pct(Number(r.own_sale_rate))}</Td>
              <Td className="text-right">{Number(r.override_pct ?? 0) > 0 ? pct(Number(r.override_pct)) : '—'}</Td>
              <Td className="text-right">{Number(r.salary ?? 0) > 0 ? money(Number(r.salary)) : '—'}</Td>
              <Td className="text-right">{joiningLabel(r)}</Td>
              <Td className="max-w-[240px] text-xs text-slate-600">{rankFeatures(r) || '—'}</Td>
              <Td className="text-xs text-slate-600">{qualification(r, byLevel)}</Td>
              <Td className="text-right">{num(holders.get(r.id) ?? 0)}</Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(toForm(r, nextLevel))}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" title={r.active ? 'Switch off' : 'Switch on'} onClick={() => toggle.mutate(r)}><Power className="h-4 w-4" /></Button>
                  <Button
                    size="sm" variant="ghost" title="Delete"
                    disabled={(holders.get(r.id) ?? 0) > 0}
                    onClick={() => { if (window.confirm(`Delete the rank “${r.name}”? This cannot be undone.`)) remove.mutate(r) }}
                  ><Trash2 className="h-4 w-4" /></Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name || 'rank'}` : 'Add a rank'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="rank-form" loading={save.isPending}>Save rank</Button>
          </>
        }
      >
        {editing && (
          <form id="rank-form" onSubmit={submit} className="space-y-5">
            <Section title="Rank">
              <Field label="Name" required><Input value={editing.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Level" hint="1 is the entry rank; higher is more senior." required>
                <Input type="number" min={1} step={1} value={editing.seniority} onChange={(e) => set('seniority', e.target.value)} />
              </Field>
              <Field label="Shown on the website">
                <Select value={editing.active ? 'on' : 'off'} onChange={(e) => set('active', e.target.value === 'on')}>
                  <option value="on">On</option><option value="off">Off (hidden)</option>
                </Select>
              </Field>
              <Field label="Description (optional)"><Input value={editing.description} onChange={(e) => set('description', e.target.value)} /></Field>
            </Section>

            <Section title="Income">
              <Field label="Own sale %" hint="Paid on the member's own sales (direct slab)." required>
                <Input type="number" min={0} max={100} step="0.01" value={editing.own_sale_rate} onChange={(e) => set('own_sale_rate', e.target.value)} />
              </Field>
              <Field label="Sponsor %" hint="Paid on a direct recruit's sale (sponsor slab).">
                <Input type="number" min={0} max={100} step="0.01" value={editing.override_pct} onChange={(e) => set('override_pct', e.target.value)} />
              </Field>
              <Field label="Monthly salary (₹)">
                <Input type="number" min={0} step="1" value={editing.salary} onChange={(e) => set('salary', e.target.value)} />
              </Field>
            </Section>

            <Section title="Joining & training">
              <Field label="Joining fee (₹)" hint="0 shows as “Free”.">
                <Input type="number" min={0} step="1" value={editing.joining_fee} onChange={(e) => set('joining_fee', e.target.value)} />
              </Field>
              <Field label="Training fee (₹)">
                <Input type="number" min={0} step="1" value={editing.training_fee} onChange={(e) => set('training_fee', e.target.value)} />
              </Field>
              <Field label="Training perk" hint="e.g. Free · 3 tickets + 20%">
                <Input value={editing.training_note} onChange={(e) => set('training_note', e.target.value)} />
              </Field>
            </Section>

            <Section title="Reward">
              <Field label="Reward" hint="e.g. Laptop, Car — Ertiga">
                <Input value={editing.reward_title} onChange={(e) => set('reward_title', e.target.value)} />
              </Field>
              <Field label="Earned at (sq yd sold)">
                <Input type="number" min={0} step="1" value={editing.reward_sqyd} onChange={(e) => set('reward_sqyd', e.target.value)} />
              </Field>
            </Section>

            <Section title="To qualify">
              <Field label="Direct members"><Input type="number" min={0} step="1" value={editing.req_direct} onChange={(e) => set('req_direct', e.target.value)} /></Field>
              <Field label="Team size (group)"><Input type="number" min={0} step="1" value={editing.req_team} onChange={(e) => set('req_team', e.target.value)} /></Field>
              <Field label="Legs"><Input type="number" min={0} step="1" value={editing.req_legs} onChange={(e) => set('req_legs', e.target.value)} /></Field>
              <Field label="Needs members holding">
                <Select value={editing.req_rank_sen} onChange={(e) => set('req_rank_sen', e.target.value)}>
                  <option value="">No rank condition</option>
                  {ranks.filter((r) => r.id !== editing.id).map((r) => (
                    <option key={r.id} value={r.seniority}>{r.name} (level {r.seniority})</option>
                  ))}
                </Select>
              </Field>
              <Field label="How many of them">
                <Input type="number" min={0} step="1" value={editing.req_rank_count} onChange={(e) => set('req_rank_count', e.target.value)} />
              </Field>
            </Section>
          </form>
        )}
      </Modal>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

/* ================================================================ Payouts */

function PayoutsTab() {
  const { data: stored, isLoading } = useSiteSetting('sponsor.rates')
  const [form, setForm] = useState({ tds_pct: '5', admin_pct: '3', min_withdrawal: '500' })
  const qc = useQueryClient()
  const { push } = useToast()

  useEffect(() => {
    if (stored) setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, String(v)])) }))
  }, [stored])

  const save = useMutation({
    mutationFn: async () => {
      const value = { ...(stored ?? {}), ...form }
      const { error } = await supabase.from('site_settings').upsert(
        { key: 'sponsor.rates', value, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Payout rules saved. They apply to income credited from now on.')
      void qc.invalidateQueries({ queryKey: ['site-settings', 'sponsor.rates'] })
      void qc.invalidateQueries({ queryKey: ['sponsor-rates'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const tds = Number(form.tds_pct), adm = Number(form.admin_pct), min = Number(form.min_withdrawal)
    if (![tds, adm].every((x) => Number.isFinite(x) && x >= 0 && x <= 100)) return push('error', 'Percentages must be between 0 and 100.')
    if (tds + adm >= 100) return push('error', 'TDS and admin charge together must be under 100%.')
    if (!Number.isFinite(min) || min < 0) return push('error', 'The minimum withdrawal cannot be negative.')
    save.mutate()
  }

  if (isLoading) return <Spinner label="Loading payout rules…" />
  const example = 10000
  const net = example - (example * Number(form.tds_pct || 0)) / 100 - (example * Number(form.admin_pct || 0)) / 100

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader title="Payouts & deductions" subtitle="Deducted from every income credit. Income already credited keeps the rates it was credited at." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="TDS %"><Input type="number" min={0} max={100} step="0.01" value={form.tds_pct} onChange={(e) => setForm({ ...form, tds_pct: e.target.value })} /></Field>
          <Field label="Admin charge %"><Input type="number" min={0} max={100} step="0.01" value={form.admin_pct} onChange={(e) => setForm({ ...form, admin_pct: e.target.value })} /></Field>
          <Field label="Minimum withdrawal (₹)"><Input type="number" min={0} step="1" value={form.min_withdrawal} onChange={(e) => setForm({ ...form, min_withdrawal: e.target.value })} /></Field>
          <p className="text-sm text-slate-600 sm:col-span-3">
            Example: on an income of {money(example)} the member receives <strong>{money(net)}</strong>
            {' '}({pct(Number(form.tds_pct || 0))} TDS and {pct(Number(form.admin_pct || 0))} admin charge deducted).
          </p>
        </CardBody>
      </Card>
      <div className="mt-5 flex justify-end">
        <Button type="submit" loading={save.isPending}>Save payout rules</Button>
      </div>
    </form>
  )
}

/* ========================================================== Other content */

function MoreTab() {
  const items: [string, string, string][] = [
    ['Terms & Conditions, About and other pages', 'Website CMS → Pages', '/admin/cms'],
    ['Contact page (address, WhatsApp, branches)', 'Website CMS → Contact', '/admin/cms'],
    ['Home page hero, banners and announcement bar', 'Website CMS → Hero / Banners', '/admin/cms'],
    ['Level-wise payout (₹ per sq yd)', 'Website CMS → Plans', '/admin/cms'],
    ['Rewards gallery, achievers, team, events and news', 'Website CMS', '/admin/cms'],
    ['Welcome letter wording', 'Website CMS → Welcome letter', '/admin/cms'],
    ['Projects and plots for sale', 'Website CMS → Featured projects / Plots', '/admin/cms'],
  ]
  return (
    <Card>
      <CardHeader title="Everything else you can edit" subtitle={`All of ${BRAND.name}'s website content is editable from the admin panel.`} />
      <ul className="divide-y divide-slate-100">
        {items.map(([what, where, to]) => (
          <li key={what} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{what}</p>
              <p className="text-xs text-slate-500">{where}</p>
            </div>
            <Link to={to} className="text-sm font-medium text-brand-700 hover:underline">Open</Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
