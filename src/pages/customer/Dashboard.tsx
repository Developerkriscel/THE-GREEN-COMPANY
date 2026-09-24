import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, FileText, Home } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useBookings, useEmis } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Spinner,
  StatTile, useToast,
} from '@/components/ui'
import { ApprovalBadge, ApprovalTimeline } from '@/components/status'
import { date, money, moneyShort, num } from '@/lib/format'

export function CustomerDashboard() {
  const { profile } = useAuth()
  const { data: bookings = [], isLoading } = useBookings({})
  const { data: emis = [] } = useEmis({})
  const qc = useQueryClient()
  const { push } = useToast()

  // The customer's own T&C tick. The flow is: customer tick -> rep -> reviewer -> admin.
  const acceptTerms = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ terms_accepted_customer: true })
        .eq('id', bookingId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Thank you — your agreement has been recorded.')
      void qc.invalidateQueries({ queryKey: ['bookings'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />

  const due = emis.filter((e) => ['pending', 'overdue'].includes(e.status))
  const nextDue = due.sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0]
  const paidTotal = emis.filter((e) => e.status === 'paid').reduce((t, e) => t + Number(e.amount), 0)

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? ''}`}
        description="Track your bookings, payments and documents."
        action={<Badge tone="neutral">{profile?.user_code}</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="My bookings" value={num(bookings.length)} tone="blue" icon={<Home className="h-4 w-4" />} />
        <StatTile label="Paid so far" value={moneyShort(paidTotal)} tone="green" />
        <StatTile
          label="Next installment"
          value={nextDue ? money(nextDue.amount) : '—'}
          hint={nextDue ? `Due ${date(nextDue.due_date)}` : 'Nothing due'}
          tone={nextDue?.status === 'overdue' ? 'red' : 'amber'}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <StatTile label="Outstanding installments" value={num(due.length)} />
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="Once a booking is raised for you, it will appear here with its live approval status."
        />
      ) : (
        <div className="space-y-6">
          {bookings.map((b) => (
            <Card key={b.id}>
              <CardHeader
                title={`${b.project?.name ?? 'Project'} — Plot ${b.plot?.number ?? '—'}`}
                subtitle={`Reference ${b.reference}`}
                action={<ApprovalBadge status={b.status} />}
              />
              <CardBody className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <Row label="Sale value" value={money(b.sale_value)} />
                  <Row label="Token paid" value={money(b.token_amount)} />
                  <Row
                    label="Payment plan"
                    value={b.payment_plan === 'emi' ? `${b.emi_count} installments of ${money(b.emi_amount)}` : 'Full payment'}
                  />
                  <Row label="Booked on" value={date(b.created_at)} />
                  {b.registry_path && <Row label="Registry" value={`Completed ${date(b.registry_at)}`} />}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Link to={`/portal/bookings/${b.id}`}>
                      <Button size="sm" variant="outline">View details</Button>
                    </Link>
                    <Link to="/portal/documents">
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4" /> Documents
                      </Button>
                    </Link>
                  </div>

                  {!b.terms_accepted_customer && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-900">Your agreement is needed</p>
                      <p className="mt-1 text-xs text-amber-800">
                        Confirm you agree with the{' '}
                        <Link to="/page/terms" target="_blank" className="underline">
                          Terms &amp; Conditions
                        </Link>{' '}
                        so your sales partner can take this booking forward.
                      </p>
                      <Button
                        size="sm"
                        className="mt-2"
                        loading={acceptTerms.isPending}
                        onClick={() => acceptTerms.mutate(b.id)}
                      >
                        <Check className="h-4 w-4" /> I agree
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Approval progress
                  </p>
                  <ApprovalTimeline
                    status={b.status}
                    step1At={b.step1_at}
                    step2At={b.step2_at}
                    step3At={b.step3_at}
                    rejectStep={b.reject_step}
                    rejectRemark={b.reject_remark}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  )
}
