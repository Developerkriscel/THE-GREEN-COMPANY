import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfiles, useRanks } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal,
  PageHeader, Select, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { IconBtn } from '@/pages/admin/Projects'
import { num, pct } from '@/lib/format'
import type { Rank } from '@/lib/types'

/**
 * Ranks are a title plus a commission rate on the rep's OWN sales. There is
 * deliberately no second rate column — no sponsor rate, no level rate, no
 * generation income. A rate here can never pay anyone for someone else's sale.
 */
export function AdminRanks() {
  const { data: ranks = [], isLoading } = useRanks()
  const { data: reps = [] } = useProfiles({ role: 'rep' })
  const [editing, setEditing] = useState<Rank | null>(null)
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const qc = useQueryClient()
  const { push } = useToast()

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown> & { id?: string }) => {
      const { id, ...rest } = payload
      const res = id
        ? await supabase.from('ranks').update(rest).eq('id', id)
        : await supabase.from('ranks').insert(rest)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      push('success', 'Rank saved.')
      setEditing(null)
      setCreating(false)
      void qc.invalidateQueries({ queryKey: ['ranks'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ranks').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Rank deleted. Reps who held it keep their profile but no rank.')
      void qc.invalidateQueries({ queryKey: ['ranks'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const assign = useMutation({
    mutationFn: async ({ repId, rankId }: { repId: string; rankId: string | null }) => {
      const { error } = await supabase.from('profiles').update({ rank_id: rankId }).eq('id', repId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Rank assigned. The change is recorded in the audit log.')
      setAssigning(false)
      void qc.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save.mutate({
      id: editing?.id,
      name: String(f.get('name')),
      seniority: Number(f.get('seniority')),
      own_sale_rate: Number(f.get('own_sale_rate')),
      description: String(f.get('description') ?? '') || null,
      active: f.get('active') === 'true',
    })
  }

  const repsByRank = (rankId: string) => reps.filter((r) => r.rank_id === rankId).length

  return (
    <>
      <PageHeader
        title="Ranks & commission tiers"
        description="A rank sets the rep's title and their commission rate on the plots they personally sell."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAssigning(true)}>Assign a rank</Button>
            <Button onClick={() => { setEditing(null); setCreating(true) }}>
              <Plus className="h-4 w-4" /> New rank
            </Button>
          </div>
        }
      />

      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardBody className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Rank grants a title and an own-sale rate only.</p>
            <p className="mt-1 text-amber-800">
              It never grants a share of another person's sale, a joining-fee income, a recruitment or
              "sponsor" payout, or any level or generation income. Rank advancement is assigned by an
              administrator on real sales performance, and is never purchased.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`${num(ranks.length)} ranks`} subtitle="Ordered by seniority" />
        {isLoading ? (
          <Spinner />
        ) : ranks.length === 0 ? (
          <EmptyState title="No ranks defined" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Rank</Th>
                <Th>Own-sale commission</Th>
                <Th>Reps holding it</Th>
                <Th>Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="text-xs text-slate-500">{r.seniority}</Td>
                  <Td>
                    <p className="font-medium text-slate-900">{r.name}</p>
                    {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
                  </Td>
                  <Td className="font-medium text-brand-800">{pct(r.own_sale_rate)}</Td>
                  <Td className="text-xs">{num(repsByRank(r.id))}</Td>
                  <Td>
                    <Badge tone={r.active ? 'green' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <IconBtn title="Edit" onClick={() => { setCreating(false); setEditing(r) }}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="Delete"
                        onClick={() => {
                          if (confirm(`Delete the rank "${r.name}"? Reps holding it will have no rank until reassigned.`))
                            remove.mutate(r.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
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
        title={editing ? `Edit ${editing.name}` : 'New rank'}
      >
        <form id="rank-form" onSubmit={onSubmit} className="space-y-3">
          <Field label="Rank name" required>
            <Input name="name" required defaultValue={editing?.name} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Seniority order" hint="1 is the entry rank." required>
              <Input name="seniority" type="number" min={1} required defaultValue={editing?.seniority ?? ranks.length + 1} />
            </Field>
            <Field label="Own-sale commission (%)" hint="Applied only to this rep's own sales." required>
              <Input name="own_sale_rate" type="number" step="0.01" min={0} max={100} required defaultValue={editing?.own_sale_rate ?? 7} />
            </Field>
          </div>
          <Field label="Active">
            <Select name="active" defaultValue={String(editing?.active ?? true)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={2} defaultValue={editing?.description ?? ''} />
          </Field>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button>
          <Button type="submit" form="rank-form" loading={save.isPending}>Save rank</Button>
        </div>
      </Modal>

      <Modal
        open={assigning}
        onClose={() => setAssigning(false)}
        title="Assign a rank to a rep"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigning(false)}>Cancel</Button>
            <Button type="submit" form="assign-form" loading={assign.isPending}>Assign</Button>
          </>
        }
      >
        <form
          id="assign-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            assign.mutate({ repId: String(f.get('rep_id')), rankId: (f.get('rank_id') as string) || null })
          }}
        >
          <Field label="Sales rep" required>
            <Select name="rep_id" required defaultValue="">
              <option value="">Select a rep</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.user_code}) — {r.rank?.name ?? 'no rank'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rank" required>
            <Select name="rank_id" required defaultValue="">
              <option value="">No rank</option>
              {ranks.filter((r) => r.active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {pct(r.own_sale_rate)}
                </option>
              ))}
            </Select>
          </Field>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Promotion should reflect the rep's own sales performance. It changes their own-sale rate and
            their badge — nothing about who they can see or what anyone else earns.
          </p>
        </form>
      </Modal>
    </>
  )
}
