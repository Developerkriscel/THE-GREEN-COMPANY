import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, FileText, Upload, X } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useBooking, useBookingTransition, useDocuments, useEmis } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, ErrorState, Field,
  Modal, PageHeader, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { ApprovalBadge, ApprovalTimeline, EmiBadge } from '@/components/status'
import { date, dateTime, money, num, titleCase } from '@/lib/format'
import type { SaleConfirmation } from '@/lib/types'

export function BookingDetail() {
  const { id } = useParams()
  const { profile, isAdmin, isManager, isRep, isCustomer } = useAuth()
  const { data: booking, isLoading, error } = useBooking(id)
  const { data: emis = [] } = useEmis({ bookingId: id })
  const { data: documents = [] } = useDocuments(id)
  const transition = useBookingTransition()
  const qc = useQueryClient()
  const { push } = useToast()

  const [terms, setTerms] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const { data: sale } = useQuery({
    queryKey: ['sale-for-booking', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sale_confirmations')
        .select('*')
        .eq('booking_id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as SaleConfirmation | null
    },
  })

  const uploadRegistry = useMutation({
    mutationFn: async (file: File) => {
      const path = `${id}/registry-${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('registry').upload(path, file)
      if (upErr) throw new Error(upErr.message)

      const { error: bErr } = await supabase
        .from('bookings')
        .update({ registry_path: path, registry_at: new Date().toISOString() })
        .eq('id', id!)
      if (bErr) throw new Error(bErr.message)

      await supabase.from('documents').insert({
        booking_id: id,
        owner_id: booking?.customer_id,
        type: 'registry',
        title: 'Registry copy',
        storage_path: path,
      })
    },
    onSuccess: () => {
      push('success', 'Registry uploaded. The plot is now marked registered.')
      void qc.invalidateQueries({ queryKey: ['booking', id] })
      void qc.invalidateQueries({ queryKey: ['documents', id] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const createSale = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sale_confirmations').insert({
        booking_id: id,
        rep_id: booking?.rep_id,
        sale_value: booking?.sale_value ?? 0,
        status: 'draft',
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Sale confirmation created. Submit it to start the approval chain.')
      void qc.invalidateQueries({ queryKey: ['sale-for-booking', id] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorState error={error} />
  if (!booking) {
    return <EmptyState title="Booking not found" description="It may have been removed, or you may not have access to it." />
  }

  const isOwningRep = isRep && booking.rep_id === profile?.id
  const canSubmitStep1 =
    (isOwningRep || isAdmin) && ['draft', 'rejected'].includes(booking.status)
  const canReviewStep2 = (isManager || isAdmin) && booking.status === 'step1_done'
  const canFinalise = isAdmin && booking.status === 'step2_approved'

  function act(status: 'step1_done' | 'step2_approved' | 'confirmed', extra?: Record<string, unknown>) {
    transition.mutate(
      { id: booking!.id, status, ...extra },
      {
        onSuccess: () => push('success', 'Booking updated.'),
        onError: (e) => push('error', e instanceof Error ? e.message : 'Update failed'),
      },
    )
  }

  // Two panels only: the office or the member who sourced the sale.
  const back = isAdmin ? '/admin/bookings' : '/sponsor/sales'

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <PageHeader
        title={booking.reference}
        description={`${booking.project?.name ?? '—'} · Plot ${booking.plot?.number ?? '—'}`}
        action={<ApprovalBadge status={booking.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Booking details" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Detail label="Sale value" value={money(booking.sale_value)} />
              <Detail label="Token amount" value={money(booking.token_amount)} />
              <Detail label="Payment plan" value={booking.payment_plan === 'emi' ? `EMI × ${booking.emi_count} of ${money(booking.emi_amount)}` : 'Full payment'} />
              <Detail label="EMI starts" value={date(booking.emi_start)} />
              <Detail label="Customer" value={booking.customer?.full_name ?? '—'} sub={booking.customer?.user_code ?? undefined} />
              <Detail label="Sales partner" value={booking.rep?.full_name ?? '—'} sub={booking.rep?.user_code ?? undefined} />
              <Detail label="Plot size" value={booking.plot?.size ? `${num(booking.plot.size)} ${booking.plot.size_unit}` : '—'} />
              <Detail label="Raised on" value={dateTime(booking.created_at)} />
            </CardBody>
          </Card>

          {booking.payment_plan === 'emi' && (
            <Card>
              <CardHeader
                title="Payment schedule"
                subtitle={`${emis.filter((e) => e.status === 'paid').length} of ${emis.length} installments paid`}
              />
              {emis.length === 0 ? (
                <EmptyState title="No schedule yet" description="The EMI schedule is created when the sale is confirmed." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Due</Th>
                      <Th>Amount</Th>
                      <Th>Status</Th>
                      <Th>Verified</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {emis.map((e) => (
                      <tr key={e.id}>
                        <Td>{e.seq}</Td>
                        <Td className="text-xs">{date(e.due_date)}</Td>
                        <Td>{money(e.amount)}</Td>
                        <Td><EmiBadge status={e.status} /></Td>
                        <Td className="text-xs">{e.verified_at ? date(e.verified_at) : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Documents" subtitle="Generated paperwork and uploads for this booking" />
            {documents.length === 0 ? (
              <EmptyState title="No documents yet" description="The welcome letter and booking form are generated on final approval." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{d.title}</p>
                        <p className="text-xs text-slate-500">{titleCase(d.type)} · {date(d.created_at)}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void openPrivateFile(d.type === 'registry' ? 'registry' : 'documents', d.storage_path).catch(
                          (err) => push('error', err instanceof Error ? err.message : 'Could not open the file'),
                        )
                      }
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Approval chain" subtitle="Rep → reviewer → admin" />
            <CardBody>
              <ApprovalTimeline
                status={booking.status}
                step1At={booking.step1_at}
                step2At={booking.step2_at}
                step3At={booking.step3_at}
                rejectStep={booking.reject_step}
                rejectRemark={booking.reject_remark}
              />

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                {canSubmitStep1 && (
                  <>
                    <Checkbox
                      checked={terms}
                      onChange={(e) => setTerms(e.target.checked)}
                      label={
                        <>
                          I agree with the{' '}
                          <Link to="/page/terms" target="_blank" className="text-brand-700 hover:underline">
                            Terms &amp; Conditions
                          </Link>{' '}
                          on behalf of this booking.
                        </>
                      }
                    />
                    <Button
                      className="w-full"
                      disabled={!terms}
                      loading={transition.isPending}
                      onClick={() => act('step1_done', { terms: true })}
                    >
                      Submit for review (Step 1)
                    </Button>
                  </>
                )}

                {canReviewStep2 && (
                  <div className="flex gap-2">
                    <Button className="flex-1" loading={transition.isPending} onClick={() => act('step2_approved')}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button variant="danger" className="flex-1" onClick={() => setRejecting(true)}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}

                {canFinalise && (
                  <div className="flex gap-2">
                    <Button className="flex-1" loading={transition.isPending} onClick={() => act('confirmed')}>
                      <Check className="h-4 w-4" /> Final approval
                    </Button>
                    <Button variant="danger" className="flex-1" onClick={() => setRejecting(true)}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}

                {!canSubmitStep1 && !canReviewStep2 && !canFinalise && (
                  <p className="text-xs text-slate-500">
                    {booking.status === 'confirmed'
                      ? 'This booking is confirmed. No further approval is needed.'
                      : 'No action is available to you at this step.'}
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          {booking.status === 'confirmed' && (isOwningRep || isAdmin) && (
            <Card>
              <CardHeader title="Sale confirmation" subtitle="Converts this booking into a confirmed sale" />
              <CardBody>
                {sale ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Status</span>
                      <ApprovalBadge status={sale.status} />
                    </div>
                    <Link to={isAdmin ? '/admin/sales' : '/sponsor/sales'}>
                      <Button variant="outline" className="w-full">Open sale</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-slate-500">
                      On admin confirmation this creates the commission record, the welcome letter and the
                      EMI schedule.
                    </p>
                    <Button className="w-full" loading={createSale.isPending} onClick={() => createSale.mutate()}>
                      Start sale confirmation
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          )}

          {isAdmin && (
            <Card>
              <CardHeader title="Registry" subtitle="Upload the legal registry copy" />
              <CardBody>
                {booking.registry_path ? (
                  <div className="space-y-2">
                    <Badge tone="violet">Registered {date(booking.registry_at)}</Badge>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => void openPrivateFile('registry', booking.registry_path!)}
                    >
                      View registry copy
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center hover:border-brand-500 hover:bg-brand-50/50">
                    <Upload className="h-5 w-5 text-slate-400" />
                    <span className="text-xs text-slate-600">
                      {uploadRegistry.isPending ? 'Uploading…' : 'Click to upload a PDF or scan'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) uploadRegistry.mutate(file)
                      }}
                    />
                  </label>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this booking"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button variant="danger" type="submit" form="reject-form" loading={transition.isPending}>
              Reject and return to rep
            </Button>
          </>
        }
      >
        <form
          id="reject-form"
          onSubmit={(e) => {
            e.preventDefault()
            const remark = String(new FormData(e.currentTarget).get('remark') ?? '')
            transition.mutate(
              { id: booking.id, status: 'rejected', remark },
              {
                onSuccess: () => { push('success', 'Booking rejected and returned to the rep.'); setRejecting(false) },
                onError: (err) => push('error', err instanceof Error ? err.message : 'Rejection failed'),
              },
            )
          }}
        >
          <Field label="Remark" hint="The rep sees this. A remark is required." required>
            <Textarea name="remark" required rows={3} placeholder="What needs to change before this can be approved?" />
          </Field>
        </form>
      </Modal>
    </>
  )
}

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
