import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, CheckCircle2, Eye, X } from 'lucide-react'
import { supabase, openPrivateFile } from '@/lib/supabase'
import { useKycEvents, useKycQueue, useSetMemberFrozen } from '@/lib/queries'
import {
  Badge, Button, Card, EmptyState, Field, Modal, PageHeader,
  Spinner, StatTile, Table, Td, Textarea, Th, useToast,
} from '@/components/ui'
import { KycBadge } from '@/components/status'
import { HistoryCard } from '@/pages/shared/Kyc'
import { date, maskId, num, titleCase } from '@/lib/format'
import type { Kyc } from '@/lib/types'

/**
 * KYC verifications. Approving unlocks withdrawals. Every status change is
 * logged (kyc_events), and opening a document writes an access entry to the
 * audit log — reads matter here, not just writes.
 *
 * Re-review = pending again after a rejection (submissions > 1).
 * Frozen    = the member's account is frozen, whatever their KYC says.
 */

type Tab = 'pending' | 're_review' | 'verified' | 'rejected' | 'frozen' | 'all'
const TABS: [Tab, string][] = [
  ['pending', 'Pending'], ['re_review', 'Re-review'], ['verified', 'Verified'],
  ['rejected', 'Rejected'], ['frozen', 'Frozen'], ['all', 'All'],
]

const inTab = (k: Kyc, t: Tab) => {
  const frozen = Boolean(k.user?.frozen)
  switch (t) {
    case 'pending': return k.status === 'pending' && (k.submissions ?? 1) <= 1
    case 're_review': return k.status === 'pending' && (k.submissions ?? 1) > 1
    case 'verified': return k.status === 'verified'
    case 'rejected': return k.status === 'rejected'
    case 'frozen': return frozen
    default: return true
  }
}

export function AdminKyc() {
  const [tab, setTab] = useState<Tab>('pending')
  const { data: all = [], isLoading } = useKycQueue()
  const [open, setOpen] = useState<Kyc | null>(null)
  const counts = useMemo(() => Object.fromEntries(TABS.map(([t]) => [t, all.filter((k) => inTab(k, t)).length])) as Record<Tab, number>, [all])
  const rows = all.filter((k) => inTab(k, tab))

  return (
    <>
      <PageHeader
        title="KYC verifications"
        description="Review documents. Approving unlocks withdrawals for the member. Every status change is logged, and every document you open is written to the audit trail."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Pending" value={num(counts.pending)} tone={counts.pending ? 'amber' : 'neutral'} />
        <StatTile label="Re-review queue" value={num(counts.re_review)} tone={counts.re_review ? 'amber' : 'neutral'} hint="Resubmitted after a rejection" />
        <StatTile label="Verified" value={num(counts.verified)} tone="green" />
        <StatTile label="Frozen members" value={num(counts.frozen)} tone={counts.frozen ? 'red' : 'neutral'} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-brand-gold/20">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? 'bg-gold-metal text-brand-darker shadow-sm' : 'text-slate-600 hover:bg-brand-gold/10'}`}>
            {label} <span className="text-xs opacity-70">({counts[t]})</span>
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="No KYC in this view" description="New submissions will appear under Pending." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Member</Th><Th>ID</Th><Th>Nominee</Th><Th>Status</Th><Th>Submitted</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(k)}>
                  <Td>
                    <p className="font-medium text-slate-900">{k.user?.full_name ?? '—'}</p>
                    <p className="text-xs text-slate-500">{k.user?.member_code ?? k.user?.user_code}{k.user?.frozen && <> · <Badge tone="red">Frozen</Badge></>}</p>
                  </Td>
                  <Td className="text-xs">{titleCase(k.id_type)} <span className="font-mono">{maskId(k.id_last4)}</span></Td>
                  <Td className="text-xs">{k.nominee_name ? `${k.nominee_name} (${k.nominee_relation ?? '—'})` : <span className="text-amber-700">None</span>}</Td>
                  <Td>
                    <KycBadge status={k.status} />
                    {k.status === 'pending' && (k.submissions ?? 1) > 1 && <Badge tone="amber">Re-review</Badge>}
                  </Td>
                  <Td className="text-xs">{date(k.created_at)}</Td>
                  <Td className="text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setOpen(k) }}><Eye className="h-3.5 w-3.5" /> Review</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {open && <ReviewModal kyc={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function ReviewModal({ kyc: k, onClose }: { kyc: Kyc; onClose: () => void }) {
  const qc = useQueryClient()
  const { push } = useToast()
  const { data: events = [] } = useKycEvents(k.user_id)
  const setFrozen = useSetMemberFrozen()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const decide = useMutation({
    mutationFn: async ({ next, reason }: { next: 'verified' | 'rejected'; reason?: string }) => {
      const { error } = await supabase.from('kyc').update({ status: next, reject_reason: reason ?? null }).eq('id', k.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      push('success', v.next === 'verified' ? 'KYC verified — withdrawals are open for this member.' : 'KYC rejected. The member has been told why.')
      void qc.invalidateQueries({ queryKey: ['kyc-queue'] })
      void qc.invalidateQueries({ queryKey: ['kyc-events', k.user_id] })
      onClose()
    },
    onError: (e: Error) => push('error', e.message),
  })

  async function viewDoc(path: string | null | undefined, label: string) {
    if (!path) return push('error', `No ${label} on file.`)
    try {
      await supabase.rpc('log_kyc_access', { p_kyc_id: k.id, p_document: label })
      await openPrivateFile('kyc', path)
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Could not open the document')
    }
  }

  const docs: [string, string | null | undefined][] = [
    ['Photo ID', k.id_doc_path], ['Address proof', k.address_doc_path], ['Photo', k.photo_path],
    ['Bank proof', k.bank_doc_path], ['Nominee ID', k.nominee_doc_path],
  ]

  return (
    <Modal open onClose={onClose} size="lg" title={`KYC — ${k.user?.full_name ?? 'member'}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant={k.user?.frozen ? 'outline' : 'danger'} size="sm"
            onClick={() => setFrozen.mutate({ id: k.user_id, frozen: !k.user?.frozen }, {
              onSuccess: () => { push('success', k.user?.frozen ? 'Account unfrozen.' : 'Account frozen — no withdrawals or new sales.'); void qc.invalidateQueries({ queryKey: ['kyc-queue'] }); onClose() },
              onError: (e) => push('error', (e as Error).message),
            })}>
            {k.user?.frozen ? <><CheckCircle2 className="h-4 w-4" /> Unfreeze account</> : <><Ban className="h-4 w-4" /> Freeze account</>}
          </Button>
          {k.status === 'pending' && !rejecting && (
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => setRejecting(true)}><X className="h-4 w-4" /> Reject</Button>
              <Button loading={decide.isPending} onClick={() => decide.mutate({ next: 'verified' })}><Check className="h-4 w-4" /> Verify</Button>
            </div>
          )}
        </div>
      }>
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4 text-sm">
          <Block title="Personal">
            <Row k="Member" v={`${k.user?.full_name ?? '—'} · ${k.user?.member_code ?? k.user?.user_code ?? ''}`} />
            <Row k="Name as per PAN" v={k.legal_name} />
            <Row k="Date of birth" v={k.dob ? date(k.dob) : null} />
            <Row k="ID" v={`${titleCase(k.id_type)} · ${maskId(k.id_last4)}`} />
            <Row k="Address" v={k.kyc_address} />
          </Block>
          <Block title="Nominee">
            {k.nominee_name ? <>
              <Row k="Name" v={`${k.nominee_name} (${k.nominee_relation ?? '—'})`} />
              <Row k="Date of birth" v={k.nominee_dob ? date(k.nominee_dob) : null} />
              <Row k="Phone" v={k.nominee_phone} />
              <Row k="Aadhaar" v={k.nominee_aadhaar_last4 ? maskId(k.nominee_aadhaar_last4) : null} />
              <Row k="PAN" v={k.nominee_pan} />
              <Row k="Address" v={k.nominee_address} />
              <Row k="Share" v={k.nominee_share != null ? `${Number(k.nominee_share)}%` : null} />
            </> : <p className="text-amber-700">No nominee named.</p>}
          </Block>
          <Block title="Documents">
            <div className="flex flex-wrap gap-1.5">
              {docs.map(([label, path]) => (
                <Button key={label} size="sm" variant="outline" disabled={!path} onClick={() => void viewDoc(path, label)}>
                  <Eye className="h-3.5 w-3.5" /> {label}
                </Button>
              ))}
            </div>
          </Block>
          {rejecting && (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <Field label="Reason" hint="Shown to the member so they can correct it and resubmit." required>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Address proof is not readable." />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
                <Button variant="danger" size="sm" disabled={reason.trim().length < 3} loading={decide.isPending}
                  onClick={() => decide.mutate({ next: 'rejected', reason: reason.trim() })}>Reject KYC</Button>
              </div>
            </div>
          )}
        </div>
        <HistoryCard events={events} />
      </div>
    </Modal>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">{title}</p>
      <div className="rounded-xl border border-slate-100 px-3 py-1">{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-brand-darker">{v || '—'}</span>
    </div>
  )
}
