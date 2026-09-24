import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useSales, useSaleTransition } from '@/lib/queries'
import {
  Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Modal, PageHeader,
  Select, Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { ApprovalBadge } from '@/components/status'
import { date, money, num } from '@/lib/format'
import type { ApprovalStatus, SaleConfirmation } from '@/lib/types'

const STATUSES: ApprovalStatus[] = ['draft', 'step1_done', 'step2_approved', 'confirmed', 'rejected']

/**
 * Sale confirmations run the same 3-step chain as bookings. On admin
 * confirmation the server creates the commission record for the selling rep,
 * the EMI schedule and the customer's documents — none of which the client
 * can write directly.
 */
export function SalesView({ scope }: { scope: 'own' | 'all' }) {
  const { profile, isAdmin, isManager } = useAuth()
  const [status, setStatus] = useState('')
  const { data = [], isLoading, error } = useSales({ status: status || undefined })
  const transition = useSaleTransition()
  const { push } = useToast()

  const [submitting, setSubmitting] = useState<SaleConfirmation | null>(null)
  const [rejecting, setRejecting] = useState<SaleConfirmation | null>(null)
  const [terms, setTerms] = useState(false)

  function act(sale: SaleConfirmation, next: 'step1_done' | 'step2_approved' | 'confirmed') {
    transition.mutate(
      {
        id: sale.id,
        status: next,
        terms: next === 'step1_done' ? true : undefined,
        bookingId: sale.booking_id,
      },
      {
        onSuccess: () => {
          push('success', next === 'confirmed' ? 'Sale confirmed. Commission accrued for the selling rep.' : 'Sale updated.')
          setSubmitting(null)
          setTerms(false)
        },
        onError: (e) => push('error', e instanceof Error ? e.message : 'Update failed'),
      },
    )
  }

  return (
    <>
      <PageHeader
        title={scope === 'all' ? 'Plot Sales Verification' : 'My sales'}
        description={
          scope === 'all'
            ? "Verify sponsor-submitted sales. On confirmation, direct sponsor income is credited and the sale shows instantly in the sponsor's panel."
            : 'Confirming a sale creates the commission record for the rep who made that sale.'
        }
      />

      {error && <ErrorState error={error} />}

      <Card>
        <CardHeader
          title={`${num(data.length)} sales`}
          action={
            <Select className="h-8 w-44 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          }
        />

        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState
            title="No sale confirmations"
            description="A sale can be started once its booking is confirmed."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Sale value</Th>
                <Th>Sale date</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const isOwner = s.rep_id === profile?.id
                const canSubmit = (isOwner || isAdmin) && ['draft', 'rejected'].includes(s.status)
                const canReview = (isManager || isAdmin) && s.status === 'step1_done'
                const canFinal = isAdmin && s.status === 'step2_approved'

                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        to={`${isAdmin ? '/admin' : '/sponsor'}/bookings/${s.booking_id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {s.booking?.reference ?? s.booking_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td>{money(s.sale_value)}</Td>
                    <Td className="text-xs">{date(s.sale_date)}</Td>
                    <Td><ApprovalBadge status={s.status} /></Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {canSubmit && (
                          <Button size="sm" onClick={() => { setSubmitting(s); setTerms(false) }}>
                            Submit
                          </Button>
                        )}
                        {canReview && (
                          <>
                            <Button size="sm" onClick={() => act(s, 'step2_approved')}>
                              <Check className="h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setRejecting(s)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {canFinal && (
                          <>
                            <Button size="sm" onClick={() => act(s, 'confirmed')}>
                              <Check className="h-3.5 w-3.5" /> Confirm
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setRejecting(s)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(submitting)}
        onClose={() => setSubmitting(null)}
        title="Submit sale for approval"
        footer={
          <>
            <Button variant="outline" onClick={() => setSubmitting(null)}>Cancel</Button>
            <Button
              disabled={!terms}
              loading={transition.isPending}
              onClick={() => submitting && act(submitting, 'step1_done')}
            >
              Submit (Step 1)
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-600">
          Sale value: <strong>{money(submitting?.sale_value)}</strong>. Once submitted this goes to a
          reviewer, then to an administrator for final confirmation.
        </p>
        <Checkbox
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          label={
            <>
              I agree with the{' '}
              <Link to="/page/terms" target="_blank" className="text-brand-700 hover:underline">
                Terms &amp; Conditions
              </Link>{' '}
              and confirm the details of this sale are correct.
            </>
          }
        />
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this sale"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" type="submit" form="sale-reject" loading={transition.isPending}>
              Reject
            </Button>
          </>
        }
      >
        <form
          id="sale-reject"
          onSubmit={(e) => {
            e.preventDefault()
            const remark = String(new FormData(e.currentTarget).get('remark') ?? '')
            if (!rejecting) return
            transition.mutate(
              { id: rejecting.id, status: 'rejected', remark },
              {
                onSuccess: () => { push('success', 'Sale rejected.'); setRejecting(null) },
                onError: (err) => push('error', err instanceof Error ? err.message : 'Rejection failed'),
              },
            )
          }}
        >
          <Field label="Remark" hint="Required — the rep sees this." required>
            <Textarea name="remark" required rows={3} />
          </Field>
        </form>
      </Modal>
    </>
  )
}
