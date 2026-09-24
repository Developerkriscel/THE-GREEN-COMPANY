import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePlots, useProjects } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select,
  Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { IconBtn } from '@/pages/admin/Projects'
import { PlotBadge } from '@/components/status'
import { downloadCsv, money, num } from '@/lib/format'
import type { Plot, PlotStatus } from '@/lib/types'

const STATUSES: PlotStatus[] = ['available', 'token', 'booked', 'registered', 'sold', 'blocked']

export function AdminPlots({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: projects = [] } = useProjects()
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const { data = [], isLoading } = usePlots(projectId || undefined)
  const [editing, setEditing] = useState<Plot | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const qc = useQueryClient()
  const { push } = useToast()

  const filtered = data.filter((p) => !status || p.status === status)

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown> & { id?: string }) => {
      const { id, ...rest } = payload
      const res = id
        ? await supabase.from('plots').update(rest).eq('id', id)
        : await supabase.from('plots').insert(rest)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      push('success', 'Plot saved.')
      setEditing(null)
      setCreating(false)
      void qc.invalidateQueries({ queryKey: ['plots'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const bulkImport = useMutation({
    mutationFn: async ({ projectId, csv }: { projectId: string; csv: string }) => {
      const lines = csv.trim().split(/\r?\n/).filter(Boolean)
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
      const rows = lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim())
        const get = (key: string) => cells[header.indexOf(key)] ?? ''
        return {
          project_id: projectId,
          number: get('number'),
          size: get('size') ? Number(get('size')) : null,
          size_unit: get('size_unit') || 'sqft',
          dimensions: get('dimensions') || null,
          facing: get('facing') || null,
          price: get('price') ? Number(get('price')) : 0,
          status: (STATUSES.includes(get('status') as PlotStatus) ? get('status') : 'available') as PlotStatus,
        }
      })
      if (!rows.length) throw new Error('No data rows found in that CSV.')
      const { error } = await supabase.from('plots').upsert(rows, { onConflict: 'project_id,number' })
      if (error) throw new Error(error.message)
      return rows.length
    },
    onSuccess: (n) => {
      push('success', `Imported ${n} plots.`)
      setImporting(false)
      void qc.invalidateQueries({ queryKey: ['plots'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save.mutate({
      id: editing?.id,
      project_id: String(f.get('project_id')),
      number: String(f.get('number')),
      size: f.get('size') ? Number(f.get('size')) : null,
      size_unit: String(f.get('size_unit') || 'sqft'),
      dimensions: String(f.get('dimensions') ?? '') || null,
      facing: String(f.get('facing') ?? '') || null,
      price: Number(f.get('price') ?? 0),
      status: String(f.get('status')) as PlotStatus,
      notes: String(f.get('notes') ?? '') || null,
    })
  }

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setImporting(true)}>
        <Upload className="h-4 w-4" /> Bulk import
      </Button>
      <Button onClick={() => { setEditing(null); setCreating(true) }}>
        <Plus className="h-4 w-4" /> New plot
      </Button>
    </div>
  )

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Plot inventory</h2>
            <p className="text-sm text-slate-500">What can be sold. Availability shows on each project's public page; status is driven by the booking workflow.</p>
          </div>
          {actions}
        </div>
      ) : (
        <PageHeader
          title="Plot inventory"
          description="The source of truth for what can be sold. Plot status is driven automatically by the booking workflow."
          action={actions}
        />
      )}

      <Card>
        <CardHeader
          title={`${num(filtered.length)} plots`}
          action={
            <div className="flex flex-wrap gap-2">
              <Select className="w-48" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    'plots',
                    filtered.map((p) => ({
                      project: p.project?.name ?? '',
                      number: p.number,
                      size: p.size,
                      size_unit: p.size_unit,
                      dimensions: p.dimensions,
                      facing: p.facing,
                      price: p.price,
                      status: p.status,
                    })),
                  )
                }
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No plots" description="Add plots individually or import a CSV." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Plot</Th>
                <Th>Project</Th>
                <Th>Size</Th>
                <Th>Facing</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{p.number}</Td>
                  <Td className="text-xs">{p.project?.name ?? '—'}</Td>
                  <Td className="text-xs">{p.size ? `${num(p.size)} ${p.size_unit}` : '—'}{p.dimensions ? ` · ${p.dimensions}` : ''}</Td>
                  <Td className="text-xs">{p.facing ?? '—'}</Td>
                  <Td>{money(p.price)}</Td>
                  <Td><PlotBadge status={p.status} /></Td>
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
        title={editing ? `Edit plot ${editing.number}` : 'New plot'}
      >
        <form id="plot-form" onSubmit={onSubmit} className="space-y-3">
          <Field label="Project" required>
            <Select name="project_id" required defaultValue={editing?.project_id ?? projectId}>
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plot number" required>
              <Input name="number" required defaultValue={editing?.number} />
            </Field>
            <Field label="Status" required>
              <Select name="status" defaultValue={editing?.status ?? 'available'}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Size">
              <Input name="size" type="number" step="0.01" defaultValue={editing?.size ?? ''} />
            </Field>
            <Field label="Size unit">
              <Select name="size_unit" defaultValue={editing?.size_unit ?? 'sqft'}>
                <option value="sqft">sq ft</option>
                <option value="sqyd">sq yd</option>
                <option value="acre">acre</option>
              </Select>
            </Field>
            <Field label="Dimensions">
              <Input name="dimensions" defaultValue={editing?.dimensions ?? ''} placeholder="30 x 40" />
            </Field>
            <Field label="Facing">
              <Input name="facing" defaultValue={editing?.facing ?? ''} placeholder="East" />
            </Field>
          </div>
          <Field label="Price (₹)" required>
            <Input name="price" type="number" required defaultValue={editing?.price ?? 0} />
          </Field>
          <Field label="Internal notes" hint="Never shown on the public website.">
            <Textarea name="notes" rows={2} defaultValue={editing?.notes ?? ''} />
          </Field>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button>
          <Button type="submit" form="plot-form" loading={save.isPending}>Save plot</Button>
        </div>
      </Modal>

      <Modal open={importing} onClose={() => setImporting(false)} title="Bulk import plots" size="lg">
        <form
          id="import-form"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            bulkImport.mutate({ projectId: String(f.get('project_id')), csv: String(f.get('csv')) })
          }}
          className="space-y-3"
        >
          <Field label="Project" required>
            <Select name="project_id" required defaultValue={projectId}>
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="CSV data"
            hint="Header row required. Columns: number, size, size_unit, dimensions, facing, price, status. Existing plot numbers are updated."
            required
          >
            <Textarea
              name="csv"
              required
              rows={10}
              className="font-mono text-xs"
              placeholder={'number,size,size_unit,dimensions,facing,price,status\nA-101,1200,sqft,30 x 40,East,2400000,available'}
            />
          </Field>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setImporting(false)}>Cancel</Button>
          <Button type="submit" form="import-form" loading={bulkImport.isPending}>Import</Button>
        </div>
      </Modal>
    </>
  )
}
