import { useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, Download, Eye, EyeOff } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Spinner,
  Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import {
  useCmsContent, useCmsUpsert, useCmsDelete, useCmsBulkInsert, type CmsTable,
} from '@/lib/queries'
import { num } from '@/lib/format'

export interface FieldCfg {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  required?: boolean
}

interface Row {
  id: string
  is_active: boolean
  sort_order: number
  [k: string]: unknown
}

export function CmsContentTab({
  table, title, subtitle, fields, imageField, titleField, subtitleField, defaults,
}: {
  table: CmsTable
  title: string
  subtitle: string
  fields: FieldCfg[]
  imageField?: string
  titleField: string
  subtitleField: string
  defaults: Record<string, unknown>[]
}) {
  const { data = [], isLoading } = useCmsContent<Row>(table)
  const upsert = useCmsUpsert(table)
  const del = useCmsDelete(table)
  const bulk = useCmsBulkInsert(table)
  const { push } = useToast()

  const [editing, setEditing] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)

  const nextSort = data.length ? Math.max(...data.map((r) => r.sort_order)) + 1 : 0

  return (
    <>
      <Card>
        <CardHeader
          title={`${num(data.length)} ${title.toLowerCase()}`}
          subtitle={subtitle}
          action={
            <div className="flex gap-2">
              {data.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={bulk.isPending}
                  onClick={() =>
                    bulk.mutate(defaults, {
                      onSuccess: () => push('success', 'Imported the current website content.'),
                      onError: (e) => push('error', (e as Error).message),
                    })
                  }
                >
                  <Download className="h-4 w-4" /> Import current content
                </Button>
              )}
              <Button size="sm" onClick={() => { setEditing(null); setCreating(true) }}>
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} description="Add one, or import the content already on the website." />
        ) : (
          <Table>
            <thead>
              <tr>
                {imageField && <Th />}
                <Th>{fields.find((f) => f.name === titleField)?.label ?? 'Name'}</Th>
                <Th>{fields.find((f) => f.name === subtitleField)?.label ?? ''}</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  {imageField && (
                    <Td>
                      {r[imageField] ? (
                        <img src={String(r[imageField])} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-slate-100" />
                      )}
                    </Td>
                  )}
                  <Td className="font-medium text-slate-900">{String(r[titleField] ?? '—')}</Td>
                  <Td className="text-slate-500">{String(r[subtitleField] ?? '—')}</Td>
                  <Td><Badge tone={r.is_active ? 'green' : 'neutral'}>{r.is_active ? 'Active' : 'Hidden'}</Badge></Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <button
                        title={r.is_active ? 'Hide' : 'Show'}
                        onClick={() => upsert.mutate({ id: r.id, is_active: !r.is_active })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {r.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        title="Edit"
                        onClick={() => { setCreating(false); setEditing(r) }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => { if (confirm('Delete this item?')) del.mutate(r.id, { onError: (e) => push('error', (e as Error).message) }) }}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
        title={editing ? `Edit ${title.replace(/s$/, '')}` : `New ${title.replace(/s$/, '')}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button>
            <Button type="submit" form="cms-content-form" loading={upsert.isPending}>Save</Button>
          </>
        }
      >
        <form
          id="cms-content-form"
          className="space-y-3"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const payload: Record<string, unknown> = { id: editing?.id }
            for (const fld of fields) payload[fld.name] = String(f.get(fld.name) ?? '')
            payload.sort_order = Number(f.get('sort_order') ?? nextSort)
            payload.is_active = f.get('is_active') === 'true'
            upsert.mutate(payload, {
              onSuccess: () => { push('success', 'Saved.'); setEditing(null); setCreating(false) },
              onError: (err) => push('error', (err as Error).message),
            })
          }}
        >
          {fields.map((fld) =>
            fld.type === 'textarea' ? (
              <Field key={fld.name} label={fld.label} required={fld.required}>
                <Textarea name={fld.name} rows={3} defaultValue={String(editing?.[fld.name] ?? '')} required={fld.required} />
              </Field>
            ) : fld.type === 'select' ? (
              <Field key={fld.name} label={fld.label} required={fld.required}>
                <Select name={fld.name} defaultValue={String(editing?.[fld.name] ?? fld.options?.[0]?.value ?? '')}>
                  {fld.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            ) : (
              <Field key={fld.name} label={fld.label} required={fld.required}>
                <Input name={fld.name} defaultValue={String(editing?.[fld.name] ?? '')} required={fld.required} />
              </Field>
            ),
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sort order"><Input name="sort_order" type="number" defaultValue={editing?.sort_order ?? nextSort} /></Field>
            <Field label="Visibility">
              <Select name="is_active" defaultValue={String(editing?.is_active ?? true)}>
                <option value="true">Active</option>
                <option value="false">Hidden</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </>
  )
}
