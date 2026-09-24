import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRightLeft, Mail, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useLead, useLeadActivities, usePlots, useSaveLead } from '@/lib/queries'
import {
  Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, Modal,
  PageHeader, Select, Spinner, Textarea, useToast,
} from '@/components/ui'
import { LeadBadge } from '@/components/status'
import { ago, date, dateTime, money } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'

const PIPELINE: LeadStatus[] = ['new', 'contacted', 'visit_scheduled', 'negotiation', 'converted', 'lost']

export function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin, isManager } = useAuth()
  const { data: lead, isLoading, error } = useLead(id)
  const { data: activities = [] } = useLeadActivities(id)
  const { data: plots = [] } = usePlots(lead?.project_id ?? undefined)
  const save = useSaveLead()
  const qc = useQueryClient()
  const { push } = useToast()
  const [converting, setConverting] = useState(false)

  const readOnly = isManager

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from('lead_activities')
        .insert({ lead_id: id, actor_id: profile?.id, kind: 'note', body })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lead-activities', id] }),
    onError: (e: Error) => push('error', e.message),
  })

  // Convert-to-booking: creates a draft booking owned by this lead's rep.
  const convert = useMutation({
    mutationFn: async (form: { plotId: string; saleValue: number; token: number; plan: 'full' | 'emi'; emiCount: number; emiAmount: number; emiStart: string }) => {
      const plot = plots.find((p) => p.id === form.plotId)
      if (!plot) throw new Error('Select a plot to book.')

      const { data, error } = await supabase
        .from('bookings')
        .insert({
          plot_id: plot.id,
          project_id: plot.project_id,
          rep_id: lead?.owner_id ?? profile?.id,
          lead_id: lead?.id,
          status: 'draft',
          sale_value: form.saleValue,
          token_amount: form.token,
          payment_plan: form.plan,
          emi_count: form.plan === 'emi' ? form.emiCount : 0,
          emi_amount: form.plan === 'emi' ? form.emiAmount : 0,
          emi_start: form.plan === 'emi' ? form.emiStart || null : null,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      await supabase
        .from('leads')
        .update({ status: 'converted', converted_booking_id: data.id })
        .eq('id', id!)

      return data.id as string
    },
    onSuccess: (bookingId) => {
      push('success', 'Draft booking created. Submit it to start the approval chain.')
      setConverting(false)
      navigate(isAdmin ? `/admin/bookings/${bookingId}` : `/app/bookings/${bookingId}`)
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorState error={error} />
  if (!lead) return <EmptyState title="Lead not found" description="It may have been removed, or you may not have access." />

  const base = isAdmin ? '/admin' : '/sponsor'

  return (
    <>
      <Link to={`${base}/leads`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <PageHeader
        title={lead.name}
        description={lead.project?.name ? `Interested in ${lead.project.name}` : undefined}
        action={
          <div className="flex items-center gap-2">
            <LeadBadge status={lead.status} />
            {!readOnly && lead.status !== 'converted' && (
              <Button onClick={() => setConverting(true)}>
                <ArrowRightLeft className="h-4 w-4" /> Convert to booking
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Lead details" subtitle="Visible only to the owning rep, their manager and administrators" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Detail label="Mobile" value={lead.mobile} icon={<Phone className="h-3.5 w-3.5" />} />
              <Detail label="Email" value={lead.email ?? '—'} icon={<Mail className="h-3.5 w-3.5" />} />
              <Detail label="Budget" value={money(lead.budget)} />
              <Detail label="Visit date" value={date(lead.visit_date)} />
              <Detail label="Token" value={money(lead.token_amount)} />
              <Detail label="Plot of interest" value={lead.plot_number ?? '—'} />
              <Detail label="Source" value={lead.source} />
              <Detail label="Next follow-up" value={date(lead.next_follow_up)} />
              <Detail label="Owner" value={lead.owner?.full_name ?? 'Unassigned'} />
              <Detail label="Created" value={dateTime(lead.created_at)} />
            </CardBody>
            {lead.remark && (
              <div className="border-t border-slate-100 px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Remark</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{lead.remark}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity timeline" />
            <CardBody>
              {!readOnly && (
                <form
                  className="mb-4 flex gap-2"
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const body = String(fd.get('body') ?? '').trim()
                    if (body) {
                      addNote.mutate(body)
                      e.currentTarget.reset()
                    }
                  }}
                >
                  <Input name="body" placeholder="Log a call, visit or note…" />
                  <Button type="submit" loading={addNote.isPending}>Add</Button>
                </form>
              )}

              {activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No activity logged yet.</p>
              ) : (
                <ol className="space-y-3">
                  {activities.map((a) => (
                    <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                      <p className="text-sm text-slate-800">{a.body}</p>
                      <p className="text-xs text-slate-500">
                        {a.actor?.full_name ?? 'System'} · {ago(a.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        {!readOnly && (
          <Card className="h-fit">
            <CardHeader title="Update pipeline" />
            <CardBody>
              <form
                className="space-y-3"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  save.mutate(
                    {
                      id: lead.id,
                      status: String(fd.get('status')) as LeadStatus,
                      next_follow_up: (fd.get('next_follow_up') as string) || null,
                      remark: String(fd.get('remark') ?? '') || null,
                    },
                    { onSuccess: () => push('success', 'Lead updated.') },
                  )
                }}
              >
                <Field label="Status">
                  <Select name="status" defaultValue={lead.status}>
                    {PIPELINE.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Next follow-up">
                  <Input name="next_follow_up" type="date" defaultValue={lead.next_follow_up ?? ''} />
                </Field>
                <Field label="Remark">
                  <Textarea name="remark" rows={3} defaultValue={lead.remark ?? ''} />
                </Field>
                <Button type="submit" className="w-full" loading={save.isPending}>Save</Button>
              </form>
            </CardBody>
          </Card>
        )}
      </div>

      <Modal open={converting} onClose={() => setConverting(false)} title="Convert lead to a booking" size="lg">
        <form
          id="convert-form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            convert.mutate({
              plotId: String(fd.get('plot_id')),
              saleValue: Number(fd.get('sale_value') ?? 0),
              token: Number(fd.get('token_amount') ?? 0),
              plan: String(fd.get('payment_plan')) as 'full' | 'emi',
              emiCount: Number(fd.get('emi_count') ?? 0),
              emiAmount: Number(fd.get('emi_amount') ?? 0),
              emiStart: String(fd.get('emi_start') ?? ''),
            })
          }}
          className="space-y-3"
        >
          <Field label="Plot" hint="Only plots in this lead's project are listed." required>
            <Select name="plot_id" required defaultValue="">
              <option value="">Select a plot</option>
              {plots
                .filter((p) => p.status === 'available')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} — {money(p.price)}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sale value (₹)" required>
              <Input name="sale_value" type="number" required defaultValue={lead.budget ?? ''} />
            </Field>
            <Field label="Token amount (₹)">
              <Input name="token_amount" type="number" defaultValue={lead.token_amount ?? 0} />
            </Field>
            <Field label="Payment plan">
              <Select name="payment_plan" defaultValue="full">
                <option value="full">Full payment</option>
                <option value="emi">EMI</option>
              </Select>
            </Field>
            <Field label="EMI start date">
              <Input name="emi_start" type="date" />
            </Field>
            <Field label="Number of installments">
              <Input name="emi_count" type="number" min={0} defaultValue={0} />
            </Field>
            <Field label="Installment amount (₹)">
              <Input name="emi_amount" type="number" min={0} defaultValue={0} />
            </Field>
          </div>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            This creates a <strong>draft</strong> booking. It becomes a reservation only after you submit it
            and it passes review and final admin approval.
          </p>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConverting(false)}>Cancel</Button>
          <Button type="submit" form="convert-form" loading={convert.isPending}>Create draft booking</Button>
        </div>
      </Modal>
    </>
  )
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-slate-900">
        {icon}
        {value}
      </p>
    </div>
  )
}
