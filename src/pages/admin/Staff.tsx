import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Pause, Play, Settings2, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfiles, useRanks } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal,
  PageHeader, Select, Spinner, Table, Td, Th, useToast,
} from '@/components/ui'
import { IconBtn } from '@/pages/admin/Projects'
import { date, num, pct } from '@/lib/format'
import type { AppRole, Profile } from '@/lib/types'

/**
 * Staff management. Role, status, rank, manager and commission rate are all
 * admin-only columns — the profiles_guard trigger rejects a change to any of
 * them from a non-admin, whatever the UI allows.
 */
export function AdminStaff() {
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const { data = [], isLoading } = useProfiles({ role: role || undefined, status: status || undefined })
  const { data: ranks = [] } = useRanks()
  const { data: managers = [] } = useProfiles({ role: 'manager', status: 'active' })
  const [editing, setEditing] = useState<Profile | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const staff = data.filter((p) => p.role !== 'customer')
  const pending = staff.filter((p) => p.status === 'pending')

  const update = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from('profiles').update(payload).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Account updated. The change is in the audit log.')
      setEditing(null)
      void qc.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  function approve(p: Profile) {
    update.mutate({
      id: p.id,
      payload: { status: 'active', approved_at: new Date().toISOString() },
    })
  }

  return (
    <>
      <PageHeader
        title="Staff management"
        description="Approve new sign-ups, set roles and ranks, and suspend access."
      />

      {pending.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">
                  {num(pending.length)} account{pending.length === 1 ? '' : 's'} awaiting approval
                </p>
                <p className="text-amber-800">
                  A self-registered rep stays inactive until you activate them. Any role above base rep
                  requires your explicit approval.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setStatus('pending')}>
              Review them
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`${num(staff.length)} staff accounts`}
          action={
            <div className="flex gap-2">
              <Select className="h-8 w-36 text-xs" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="rep">Sales rep</option>
              </Select>
              <Select className="h-8 w-36 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </div>
          }
        />

        {isLoading ? (
          <Spinner />
        ) : staff.length === 0 ? (
          <EmptyState title="No accounts match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Role</Th>
                <Th>Rank</Th>
                <Th>Own-sale rate</Th>
                <Th>Reports to</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{p.full_name || '—'}</p>
                    <p className="text-xs text-slate-500">{p.user_code} · {p.email}</p>
                  </Td>
                  <Td><Badge tone={p.role === 'admin' ? 'violet' : p.role === 'manager' ? 'blue' : 'neutral'}>{p.role}</Badge></Td>
                  <Td className="text-xs">{p.rank?.name ?? '—'}</Td>
                  <Td className="text-xs">{pct(p.commission_rate ?? p.rank?.own_sale_rate ?? null)}</Td>
                  <Td className="text-xs">{p.manager?.full_name ?? '—'}</Td>
                  <Td>
                    <Badge tone={p.status === 'active' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}>
                      {p.status}
                    </Badge>
                  </Td>
                  <Td className="text-xs">{date(p.created_at)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {p.status === 'pending' && (
                        <Button size="sm" loading={update.isPending} onClick={() => approve(p)}>
                          <Check className="h-3.5 w-3.5" /> Activate
                        </Button>
                      )}
                      {p.status === 'active' && (
                        <IconBtn
                          title="Suspend"
                          onClick={() => {
                            if (confirm(`Suspend ${p.full_name}? They will keep their login but see no data.`))
                              update.mutate({ id: p.id, payload: { status: 'suspended' } })
                          }}
                        >
                          <Pause className="h-4 w-4" />
                        </IconBtn>
                      )}
                      {p.status === 'suspended' && (
                        <IconBtn title="Reactivate" onClick={() => update.mutate({ id: p.id, payload: { status: 'active' } })}>
                          <Play className="h-4 w-4" />
                        </IconBtn>
                      )}
                      <IconBtn title="Edit role, rank and manager" onClick={() => setEditing(p)}>
                        <Settings2 className="h-4 w-4" />
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
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Manage ${editing?.full_name ?? 'account'}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="staff-form" loading={update.isPending}>Save</Button>
          </>
        }
      >
        <form
          id="staff-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!editing) return
            const f = new FormData(e.currentTarget)
            update.mutate({
              id: editing.id,
              payload: {
                role: String(f.get('role')) as AppRole,
                status: String(f.get('status')),
                rank_id: (f.get('rank_id') as string) || null,
                manager_id: (f.get('manager_id') as string) || null,
                commission_rate: f.get('commission_rate') ? Number(f.get('commission_rate')) : null,
              },
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Access role" hint="Controls what data they can reach.">
              <Select name="role" defaultValue={editing?.role}>
                <option value="rep">Sales rep</option>
                <option value="manager">Manager (read-only over their reps)</option>
                <option value="admin">Administrator</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={editing?.status}>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </Field>
            <Field label="Rank" hint="Title + own-sale rate. Not an access level.">
              <Select name="rank_id" defaultValue={editing?.rank_id ?? ''}>
                <option value="">No rank</option>
                {ranks.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} — {pct(r.own_sale_rate)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reports to" hint="Read-only reporting line and step-2 reviewer.">
              <Select name="manager_id" defaultValue={editing?.manager_id ?? ''}>
                <option value="">No manager</option>
                {managers
                  .filter((m) => m.id !== editing?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Commission rate override (%)"
            hint="Leave blank to use the rank's rate. Applies only to this rep's own sales."
          >
            <Input name="commission_rate" type="number" step="0.01" min={0} max={100} defaultValue={editing?.commission_rate ?? ''} />
          </Field>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Promoting someone to <strong>manager</strong> gives them read-only visibility of their assigned
            reps' pipeline and the step-2 review tick. It never gives them a share of those reps' commission.
          </p>
        </form>
      </Modal>
    </>
  )
}
