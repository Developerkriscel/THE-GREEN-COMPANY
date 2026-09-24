import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Upload } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import { useEmis } from '@/lib/queries'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Spinner,
  StatTile, Table, Td, Th, useToast,
} from '@/components/ui'
import { EmiBadge } from '@/components/status'
import { date, money, moneyShort, num } from '@/lib/format'
import type { Emi } from '@/lib/types'

/**
 * Customer payment view. Uploading a slip is the only write a customer has on
 * an EMI row: the emis_guard trigger allows exactly
 * pending/overdue/rejected -> awaiting_verification, and nothing else.
 */
export function CustomerEmis() {
  const { data = [], isLoading } = useEmis({})
  const [uploading, setUploading] = useState<Emi | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const upload = useMutation({
    mutationFn: async ({ emi, file, reference }: { emi: Emi; file: File; reference: string }) => {
      const path = `${emi.booking_id}/emi-${emi.seq}-${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('emi-slips').upload(path, file)
      if (upErr) throw new Error(upErr.message)

      const { error } = await supabase
        .from('emis')
        .update({ slip_path: path, reference: reference || null, status: 'awaiting_verification' })
        .eq('id', emi.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Slip uploaded. Our team will verify it shortly.')
      setUploading(null)
      void qc.invalidateQueries({ queryKey: ['emis'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />

  const sum = (fn: (e: Emi) => boolean) => data.filter(fn).reduce((t, e) => t + Number(e.amount), 0)

  return (
    <>
      <PageHeader
        title="Payments & EMI"
        description="Upload your payment slip for each installment. Our team verifies it and issues your receipt."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Paid" value={moneyShort(sum((e) => e.status === 'paid'))} tone="green" />
        <StatTile label="Awaiting verification" value={moneyShort(sum((e) => e.status === 'awaiting_verification'))} tone="amber" />
        <StatTile label="Upcoming" value={moneyShort(sum((e) => e.status === 'pending'))} />
        <StatTile label="Overdue" value={moneyShort(sum((e) => e.status === 'overdue'))} tone="red" />
      </div>

      <Card>
        <CardHeader title={`${num(data.length)} installments`} />
        {data.length === 0 ? (
          <EmptyState
            title="No installments"
            description="Your payment schedule is created once your sale is confirmed."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Booking</Th>
                <Th>Due date</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>{e.seq}</Td>
                  <Td className="text-xs">{e.booking?.reference ?? '—'}</Td>
                  <Td className="text-xs">{date(e.due_date)}</Td>
                  <Td className="font-medium text-slate-900">{money(e.amount)}</Td>
                  <Td>
                    <EmiBadge status={e.status} />
                    {e.status === 'rejected' && e.reject_reason && (
                      <p className="mt-0.5 text-[11px] text-red-600">{e.reject_reason}</p>
                    )}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {e.slip_path && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void openPrivateFile('emi-slips', e.slip_path!).catch((err) =>
                              push('error', err instanceof Error ? err.message : 'Could not open the slip'),
                            )
                          }
                        >
                          <Eye className="h-3.5 w-3.5" /> My slip
                        </Button>
                      )}
                      {['pending', 'overdue', 'rejected'].includes(e.status) && (
                        <Button size="sm" onClick={() => setUploading(e)}>
                          <Upload className="h-3.5 w-3.5" /> Upload slip
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(uploading)}
        onClose={() => setUploading(null)}
        title={`Upload payment slip — installment #${uploading?.seq ?? ''}`}
      >
        <form
          id="slip-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const file = f.get('file') as File
            if (!file || !file.size) return push('error', 'Choose a file to upload.')
            if (uploading) upload.mutate({ emi: uploading, file, reference: String(f.get('reference') ?? '') })
          }}
        >
          <p className="text-sm text-slate-600">
            Amount due: <strong>{money(uploading?.amount)}</strong> · Due {date(uploading?.due_date)}
          </p>
          <Field label="Payment reference" hint="UTR, transaction ID or cheque number.">
            <Input name="reference" placeholder="e.g. UTR123456789" />
          </Field>
          <Field label="Payment slip" hint="JPG, PNG or PDF, up to 5 MB." required>
            <Input name="file" type="file" required accept="image/*,application/pdf" />
          </Field>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Your slip is stored privately and is visible only to you and our verification team. Once
            verified, your receipt appears under Documents.
          </p>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUploading(null)}>Cancel</Button>
          <Button type="submit" form="slip-form" loading={upload.isPending}>Upload</Button>
        </div>
      </Modal>
    </>
  )
}
