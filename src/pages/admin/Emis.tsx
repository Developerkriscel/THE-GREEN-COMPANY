import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Download, Eye, X } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import { useEmis } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Select, Spinner,
  StatTile, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { EmiBadge } from '@/components/status'
import { date, downloadCsv, money, moneyShort, num } from '@/lib/format'
import type { Emi, EmiStatus } from '@/lib/types'

const STATUSES: EmiStatus[] = ['pending', 'awaiting_verification', 'paid', 'overdue', 'rejected']

/**
 * Collection desk. Only an admin can move an installment to `paid` — the
 * emis_guard trigger rejects the transition for anyone else, and verification
 * automatically writes a payment row and a receipt.
 */
export function AdminEmis() {
  const [status, setStatus] = useState('awaiting_verification')
  const { data = [], isLoading } = useEmis({ status: status || undefined })
  const { data: all = [] } = useEmis({})
  const [rejecting, setRejecting] = useState<Emi | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const verify = useMutation({
    mutationFn: async ({ id, reference }: { id: string; reference?: string }) => {
      const { error } = await supabase
        .from('emis')
        .update({ status: 'paid', reference: reference ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)

      // The payment row and receipt number are created by a trigger; this turns
      // them into a PDF. Best-effort: a failed render must not un-verify a
      // payment that has genuinely been received.
      const { error: fnError } = await supabase.functions.invoke('generate-receipt', {
        body: { emi_id: id },
      })
      if (fnError) console.error('[emis] receipt generation failed', fnError.message)
    },
    onSuccess: () => {
      push('success', 'Payment verified. Receipt generated and the customer notified.')
      void qc.invalidateQueries({ queryKey: ['emis'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('emis')
        .update({ status: 'rejected', reject_reason: reason })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Slip rejected. The customer can upload a corrected one.')
      setRejecting(null)
      void qc.invalidateQueries({ queryKey: ['emis'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const sum = (s: EmiStatus) => all.filter((e) => e.status === s).reduce((t, e) => t + Number(e.amount), 0)

  return (
    <>
      <PageHeader
        title="EMI & payments"
        description="Verify uploaded slips, watch the collection position, and chase what is overdue."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Awaiting verification" value={moneyShort(sum('awaiting_verification'))} hint={`${num(all.filter((e) => e.status === 'awaiting_verification').length)} slips`} tone="amber" />
        <StatTile label="Collected" value={moneyShort(sum('paid'))} hint={`${num(all.filter((e) => e.status === 'paid').length)} installments`} tone="green" />
        <StatTile label="Due" value={moneyShort(sum('pending'))} hint={`${num(all.filter((e) => e.status === 'pending').length)} upcoming`} />
        <StatTile label="Overdue" value={moneyShort(sum('overdue'))} hint={`${num(all.filter((e) => e.status === 'overdue').length)} installments`} tone="red" />
      </div>

      <Card>
        <CardHeader
          title={`${num(data.length)} installments`}
          action={
            <div className="flex gap-2">
              <Select className="h-8 w-48 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    'emis',
                    data.map((e) => ({
                      booking: e.booking?.reference ?? '',
                      seq: e.seq,
                      due_date: e.due_date,
                      amount: e.amount,
                      status: e.status,
                      verified_at: e.verified_at,
                      reference: e.reference,
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
        ) : data.length === 0 ? (
          <EmptyState title="Nothing here" description="No installments match this filter." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>#</Th>
                <Th>Due</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Slip</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{e.booking?.reference ?? '—'}</Td>
                  <Td>{e.seq}</Td>
                  <Td className="text-xs">{date(e.due_date)}</Td>
                  <Td>{money(e.amount)}</Td>
                  <Td><EmiBadge status={e.status} /></Td>
                  <Td>
                    {e.slip_path ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void openPrivateFile('emi-slips', e.slip_path!).catch((err) =>
                            push('error', err instanceof Error ? err.message : 'Could not open the slip'),
                          )
                        }
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    {e.status === 'awaiting_verification' && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate({ id: e.id })}>
                          <Check className="h-3.5 w-3.5" /> Verify
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejecting(e)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this payment slip"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" type="submit" form="emi-reject" loading={reject.isPending}>
              Reject slip
            </Button>
          </>
        }
      >
        <form
          id="emi-reject"
          onSubmit={(e) => {
            e.preventDefault()
            const reason = String(new FormData(e.currentTarget).get('reason') ?? '')
            if (rejecting) reject.mutate({ id: rejecting.id, reason })
          }}
        >
          <Field label="Reason" hint="Shown to the customer so they can correct it." required>
            <Textarea name="reason" required rows={3} placeholder="e.g. The amount on the slip does not match the installment." />
          </Field>
        </form>
      </Modal>
    </>
  )
}
