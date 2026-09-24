import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Download, Info, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCommissions } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select,
  Spinner, StatTile, Table, Td, Th, useToast,
} from '@/components/ui'
import { CommissionBadge } from '@/components/status'
import { date, downloadCsv, money, moneyShort, num, pct } from '@/lib/format'
import type { Commission, CommissionStatus } from '@/lib/types'

const STATUSES: CommissionStatus[] = ['accrued', 'approved', 'paid', 'cancelled']

/**
 * Commission ledger. Every row was created by the sale-confirmation trigger
 * for the rep who personally made that sale — there is no INSERT path from the
 * client, and no way to credit a second person on a sale.
 */
export function AdminCommissions() {
  const [status, setStatus] = useState('')
  const { data = [], isLoading } = useCommissions({ status: status || undefined })
  const { data: all = [] } = useCommissions({})
  const [paying, setPaying] = useState<Commission | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('commissions').update({ status: 'approved' }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Commission approved.')
      void qc.invalidateQueries({ queryKey: ['commissions'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const markPaid = useMutation({
    mutationFn: async ({ id, reference }: { id: string; reference: string }) => {
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'paid', payout_reference: reference })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Marked paid.')
      setPaying(null)
      void qc.invalidateQueries({ queryKey: ['commissions'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  const sum = (s: CommissionStatus) =>
    all.filter((c) => c.status === s).reduce((t, c) => t + Number(c.net_amount), 0)

  return (
    <>
      <PageHeader
        title="Commissions"
        description="Single-level: each record belongs to the rep who personally sold that plot."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Accrued" value={moneyShort(sum('accrued'))} hint={`${num(all.filter((c) => c.status === 'accrued').length)} records`} tone="amber" icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Approved, unpaid" value={moneyShort(sum('approved'))} hint="Ready for payout" tone="blue" icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Paid" value={moneyShort(sum('paid'))} hint="All time" tone="green" icon={<Wallet className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader
          title={`${num(data.length)} commission records`}
          action={
            <div className="flex gap-2">
              <Select className="h-8 w-40 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
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
                    'commissions',
                    data.map((c) => ({
                      booking: c.booking?.reference ?? '',
                      rep: c.rep?.full_name ?? '',
                      rep_code: c.rep?.user_code ?? '',
                      rank_at_sale: c.rank_at_sale,
                      sale_value: c.sale_value,
                      rate: c.rate_applied,
                      gross: c.gross_amount,
                      deductions: c.deductions,
                      net: c.net_amount,
                      status: c.status,
                      payout_reference: c.payout_reference,
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
          <EmptyState title="No commission records" description="Records are created automatically when you confirm a sale." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Rep</Th>
                <Th>Booking</Th>
                <Th>Sale value</Th>
                <Th>Rate</Th>
                <Th>Gross</Th>
                <Th>Deductions</Th>
                <Th>Net</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{c.rep?.full_name ?? '—'}</p>
                    <p className="text-xs text-slate-500">{c.rank_at_sale ?? '—'}</p>
                  </Td>
                  <Td className="text-xs">{c.booking?.reference ?? '—'}</Td>
                  <Td>{money(c.sale_value)}</Td>
                  <Td className="text-xs">{pct(c.rate_applied)}</Td>
                  <Td>{money(c.gross_amount)}</Td>
                  <Td className="text-xs text-slate-500">−{money(c.deductions)}</Td>
                  <Td className="font-medium text-slate-900">{money(c.net_amount)}</Td>
                  <Td><CommissionBadge status={c.status} /></Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {c.status === 'accrued' && (
                        <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(c.id)}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      {c.status === 'approved' && (
                        <Button size="sm" variant="secondary" onClick={() => setPaying(c)}>
                          Mark paid
                        </Button>
                      )}
                      {c.status === 'paid' && (
                        <span className="text-xs text-slate-500">{date(c.paid_at)}</span>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex items-start gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The rate is snapshotted at the moment of sale, so promoting a rep later never rewrites a
          historic payout.
        </div>
      </Card>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Record a payout"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button type="submit" form="payout-form" loading={markPaid.isPending}>Mark as paid</Button>
          </>
        }
      >
        <form
          id="payout-form"
          onSubmit={(e) => {
            e.preventDefault()
            const reference = String(new FormData(e.currentTarget).get('reference') ?? '')
            if (paying) markPaid.mutate({ id: paying.id, reference })
          }}
        >
          <p className="mb-3 text-sm text-slate-600">
            Paying <strong>{money(paying?.net_amount)}</strong> to {paying?.rep?.full_name}.
          </p>
          <Field label="Payout reference" hint="Bank UTR, cheque number or transfer reference. Required." required>
            <Input name="reference" required placeholder="UTR / cheque no." />
          </Field>
        </form>
      </Modal>
    </>
  )
}
