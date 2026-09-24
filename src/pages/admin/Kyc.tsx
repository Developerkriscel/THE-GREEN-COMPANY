import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Eye, X } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import { useKycQueue } from '@/lib/queries'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Select,
  Spinner, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { KycBadge } from '@/components/status'
import { date, maskId, num, titleCase } from '@/lib/format'
import type { Kyc } from '@/lib/types'

/**
 * KYC verification queue. Opening a document writes an access entry to the
 * audit log — reads matter here, not just writes.
 */
export function AdminKyc() {
  const [status, setStatus] = useState('pending')
  const { data = [], isLoading } = useKycQueue(status || undefined)
  const [rejecting, setRejecting] = useState<Kyc | null>(null)
  const qc = useQueryClient()
  const { push } = useToast()

  const decide = useMutation({
    mutationFn: async ({ id, next, reason }: { id: string; next: 'verified' | 'rejected'; reason?: string }) => {
      const { error } = await supabase
        .from('kyc')
        .update({ status: next, reject_reason: reason ?? null })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'KYC updated. The member has been notified.')
      setRejecting(null)
      void qc.invalidateQueries({ queryKey: ['kyc-queue'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  async function viewDoc(record: Kyc, path: string | null, label: string) {
    if (!path) return push('error', `No ${label} on file.`)
    try {
      // A KYC read is an auditable event — log it before opening the file.
      await supabase.rpc('log_kyc_access', { p_kyc_id: record.id, p_document: label })
      await openPrivateFile('kyc', path)
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Could not open the document')
    }
  }

  return (
    <>
      <PageHeader
        title="KYC verification"
        description="ID numbers are never shown in full. Every document you open is written to the audit log."
      />

      <Card>
        <CardHeader
          title={`${num(data.length)} records`}
          action={
            <Select className="h-8 w-40 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </Select>
          }
        />

        {isLoading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState title="Nothing to verify" description="New submissions will appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>ID type</Th>
                <Th>ID (masked)</Th>
                <Th>Documents</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((k) => (
                <tr key={k.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{k.user?.full_name ?? '—'}</p>
                    <p className="text-xs text-slate-500">
                      {k.user?.user_code} · <Badge tone="blue">{k.user?.role}</Badge>
                    </p>
                  </Td>
                  <Td className="text-xs">{titleCase(k.id_type)}</Td>
                  <Td className="font-mono text-xs">{maskId(k.id_last4)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {[
                        ['ID', k.id_doc_path],
                        ['Address', k.address_doc_path],
                        ['Photo', k.photo_path],
                      ].map(([label, path]) => (
                        <Button
                          key={label as string}
                          size="sm"
                          variant="ghost"
                          disabled={!path}
                          onClick={() => void viewDoc(k, path as string | null, label as string)}
                        >
                          <Eye className="h-3.5 w-3.5" /> {label as string}
                        </Button>
                      ))}
                    </div>
                  </Td>
                  <Td><KycBadge status={k.status} /></Td>
                  <Td className="text-xs">{date(k.created_at)}</Td>
                  <Td>
                    {k.status === 'pending' && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          loading={decide.isPending}
                          onClick={() => decide.mutate({ id: k.id, next: 'verified' })}
                        >
                          <Check className="h-3.5 w-3.5" /> Verify
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejecting(k)}>
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
        title="Reject this KYC submission"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" type="submit" form="kyc-reject" loading={decide.isPending}>Reject</Button>
          </>
        }
      >
        <form
          id="kyc-reject"
          onSubmit={(e) => {
            e.preventDefault()
            const reason = String(new FormData(e.currentTarget).get('reason') ?? '')
            if (rejecting) decide.mutate({ id: rejecting.id, next: 'rejected', reason })
          }}
        >
          <Field label="Reason" hint="Shown to the member so they can resubmit correctly." required>
            <Textarea name="reason" required rows={3} placeholder="e.g. Address proof is illegible." />
          </Field>
        </form>
      </Modal>
    </>
  )
}
