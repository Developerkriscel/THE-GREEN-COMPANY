import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useLeads, usePlots, useProjects } from '@/lib/queries'
import { BookingsView } from '@/pages/shared/BookingsView'
import { Button, Field, Input, Modal, Select, useToast } from '@/components/ui'
import { money } from '@/lib/format'

export function RepBookings() {
  const [creating, setCreating] = useState(false)
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { push } = useToast()

  const { data: projects = [] } = useProjects({ publishedOnly: true })
  const [projectId, setProjectId] = useState('')
  const { data: plots = [] } = usePlots(projectId || undefined)
  const { data: leads = [] } = useLeads({})

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const plotId = String(f.get('plot_id'))
      const plot = plots.find((p) => p.id === plotId)
      if (!plot) throw new Error('Select a plot.')

      const plan = String(f.get('payment_plan')) as 'full' | 'emi'
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          plot_id: plot.id,
          project_id: plot.project_id,
          rep_id: profile!.id,
          lead_id: (f.get('lead_id') as string) || null,
          status: 'draft',
          sale_value: Number(f.get('sale_value') ?? 0),
          token_amount: Number(f.get('token_amount') ?? 0),
          payment_plan: plan,
          emi_count: plan === 'emi' ? Number(f.get('emi_count') ?? 0) : 0,
          emi_amount: plan === 'emi' ? Number(f.get('emi_amount') ?? 0) : 0,
          emi_start: plan === 'emi' ? (f.get('emi_start') as string) || null : null,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    onSuccess: (id) => {
      push('success', 'Draft booking created. Open it and submit for approval.')
      setCreating(false)
      void qc.invalidateQueries({ queryKey: ['bookings'] })
      navigate(`/app/bookings/${id}`)
    },
    onError: (e: Error) => push('error', e.message),
  })

  return (
    <>
      <BookingsView
        title="My bookings"
        description="Bookings you have raised. Each moves through review and final admin approval before it is confirmed."
        basePath="/app/bookings"
        onNew={() => setCreating(true)}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Raise a token / booking"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="new-booking" loading={create.isPending}>Create draft</Button>
          </>
        }
      >
        <form
          id="new-booking"
          className="space-y-3"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            create.mutate(new FormData(e.currentTarget))
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project" required>
              <Select
                name="project_id"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Plot" hint="Only available plots can be booked." required>
              <Select name="plot_id" required defaultValue="" disabled={!projectId}>
                <option value="">{projectId ? 'Select a plot' : 'Choose a project first'}</option>
                {plots
                  .filter((p) => p.status === 'available')
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.number} — {money(p.price)}</option>
                  ))}
              </Select>
            </Field>
          </div>

          <Field label="Link to a lead" hint="Optional, but keeps your pipeline tidy.">
            <Select name="lead_id" defaultValue="">
              <option value="">Not linked</option>
              {leads
                .filter((l) => l.status !== 'lost')
                .map((l) => (
                  <option key={l.id} value={l.id}>{l.name} — {l.mobile}</option>
                ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sale value (₹)" required>
              <Input name="sale_value" type="number" required min={0} />
            </Field>
            <Field label="Token amount (₹)">
              <Input name="token_amount" type="number" min={0} defaultValue={0} />
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
            This creates a <strong>draft</strong>. The plot is reserved only once you submit it (Step 1), and
            the booking is confirmed only after an administrator's final approval (Step 3).
          </p>
        </form>
      </Modal>
    </>
  )
}
