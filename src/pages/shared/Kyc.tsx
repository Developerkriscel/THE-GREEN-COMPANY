import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, History, Info, Upload, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useKycEvents, useMyKyc } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Spinner, useToast,
} from '@/components/ui'
import { KycBadge } from '@/components/status'
import { date, dateTime, maskId } from '@/lib/format'
import type { KycEvent } from '@/lib/types'

/**
 * KYC submission: identity, bank proof and a nominee, then the office
 * verifies. Documents go to the private `kyc` bucket under the member's own
 * uid prefix; only the member and the office can read them back. Full
 * Aadhaar numbers are never stored — only the last four digits (UIDAI rule).
 */

const RELATIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other']
const DOCS: [key: DocKey, label: string][] = [
  ['id_doc_path', 'Photo ID (PAN / Aadhaar front + back)'],
  ['address_doc_path', 'Address proof'],
  ['photo_path', 'Passport-size photo'],
  ['bank_doc_path', 'Bank passbook / cancelled cheque'],
  ['nominee_doc_path', 'Nominee ID proof'],
]
type DocKey = 'id_doc_path' | 'address_doc_path' | 'photo_path' | 'bank_doc_path' | 'nominee_doc_path'

const EVENT: Record<string, { label: string; tone: 'green' | 'red' | 'amber' | 'blue' | 'neutral' }> = {
  submitted: { label: 'Submitted', tone: 'blue' },
  resubmitted: { label: 'Resubmitted for re-review', tone: 'amber' },
  updated: { label: 'Details updated', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function KycPage() {
  const { profile } = useAuth()
  const { data: kyc, isLoading } = useMyKyc(profile?.id)
  const { data: events = [] } = useKycEvents(profile?.id)
  const qc = useQueryClient()
  const { push } = useToast()
  const [files, setFiles] = useState<Partial<Record<DocKey, File | null>>>({})
  const [f, setF] = useState({
    legal_name: '', dob: '', id_type: 'aadhaar', id_number: '', kyc_address: '',
    nominee_name: '', nominee_relation: '', nominee_dob: '', nominee_phone: '', nominee_aadhaar: '',
    nominee_pan: '', nominee_address: '', nominee_share: '100',
  })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (!kyc && !profile) return
    setF((x) => ({
      ...x,
      legal_name: kyc?.legal_name ?? profile?.full_name ?? '',
      dob: kyc?.dob?.slice(0, 10) ?? '',
      id_type: kyc?.id_type ?? 'aadhaar',
      kyc_address: kyc?.kyc_address ?? [profile?.address, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(', '),
      nominee_name: kyc?.nominee_name ?? '',
      nominee_relation: kyc?.nominee_relation ?? '',
      nominee_dob: kyc?.nominee_dob?.slice(0, 10) ?? '',
      nominee_phone: kyc?.nominee_phone ?? '',
      nominee_pan: kyc?.nominee_pan ?? '',
      nominee_address: kyc?.nominee_address ?? '',
      nominee_share: kyc?.nominee_share != null ? String(Number(kyc.nominee_share)) : '100',
    }))
  }, [kyc, profile])

  const submit = useMutation({
    mutationFn: async () => {
      const idDigits = f.id_number.replace(/\s/g, '')
      if (!kyc && idDigits.length < 4) throw new Error('Enter your ID number.')
      if (f.nominee_name.trim() && !f.nominee_relation) throw new Error('Choose the nominee’s relationship to you.')
      const nomAadhaar = f.nominee_aadhaar.replace(/\D/g, '')
      if (nomAadhaar && nomAadhaar.length !== 12) throw new Error('The nominee’s Aadhaar number has 12 digits.')
      const share = Number(f.nominee_share || 0)
      if (f.nominee_name.trim() && (share <= 0 || share > 100)) throw new Error('Nominee share must be between 1 and 100%.')

      const uploads: Partial<Record<DocKey, string>> = {}
      for (const [key, file] of Object.entries(files) as [DocKey, File | null][]) {
        if (!file) continue
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is over 5 MB.`)
        const path = `${profile!.id}/${key}-${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const { error } = await supabase.storage.from('kyc').upload(path, file, { upsert: true })
        if (error) throw new Error(error.message)
        uploads[key] = path
      }

      const payload = {
        user_id: profile!.id,
        legal_name: f.legal_name.trim() || null,
        dob: f.dob || null,
        kyc_address: f.kyc_address.trim() || null,
        id_type: f.id_type,
        ...(idDigits ? { id_last4: idDigits.slice(-4) } : {}),
        nominee_name: f.nominee_name.trim() || null,
        nominee_relation: f.nominee_relation || null,
        nominee_dob: f.nominee_dob || null,
        nominee_phone: f.nominee_phone.trim() || null,
        ...(nomAadhaar ? { nominee_aadhaar_last4: nomAadhaar.slice(-4) } : {}),
        nominee_pan: f.nominee_pan.trim().toUpperCase() || null,
        nominee_address: f.nominee_address.trim() || null,
        nominee_share: f.nominee_name.trim() ? share : null,
        status: 'pending' as const,
        ...uploads,
      }

      const res = kyc
        ? await supabase.from('kyc').update(payload).eq('id', kyc.id)
        : await supabase.from('kyc').insert(payload)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      push('success', kyc?.status === 'rejected' ? 'Sent back to the office for re-review.' : 'KYC submitted for verification.')
      setFiles({})
      void qc.invalidateQueries({ queryKey: ['kyc', profile?.id] })
      void qc.invalidateQueries({ queryKey: ['kyc-events', profile?.id] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />

  const locked = kyc?.status === 'verified'

  return (
    <>
      <PageHeader
        title="KYC verification"
        description="Submit identity & bank proof and name a nominee. Withdrawals stay locked until the office approves."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Current status" action={kyc ? <KycBadge status={kyc.status} /> : <Badge tone="neutral">Not submitted</Badge>} />
            <CardBody className="text-sm text-slate-700">
              {!kyc && 'KYC not started. Fill in the form below and submit it for verification.'}
              {kyc?.status === 'pending' && <>Submitted — the office is reviewing it{kyc.submissions && kyc.submissions > 1 ? ' (re-review)' : ''}.</>}
              {kyc?.status === 'rejected' && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  <strong>Rejected:</strong> {kyc.reject_reason ?? 'Please check your details and documents.'} Correct them below and resubmit.
                </p>
              )}
              {locked && <>Verified on <strong>{date(kyc.reviewed_at)}</strong>. Contact the office if any detail needs to change.</>}
            </CardBody>
          </Card>

          {locked ? (
            <Card>
              <CardHeader title="On file" />
              <CardBody>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Item k="Name as per ID" v={kyc.legal_name} />
                  <Item k="Date of birth" v={kyc.dob ? date(kyc.dob) : null} />
                  <Item k="ID" v={`${kyc.id_type} · ${maskId(kyc.id_last4)}`} />
                  <Item k="Nominee" v={kyc.nominee_name ? `${kyc.nominee_name} (${kyc.nominee_relation ?? '—'}) · ${Number(kyc.nominee_share ?? 100)}%` : null} />
                </dl>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title={kyc ? 'Update and resubmit' : 'KYC submission'} subtitle="Enter details exactly as printed on your documents." />
              <CardBody>
                <form className="space-y-6" onSubmit={(e: FormEvent) => { e.preventDefault(); submit.mutate() }}>
                  <Section title="Personal">
                    <Field label="Full name (as per PAN)" required><Input required value={f.legal_name} onChange={(e) => set('legal_name', e.target.value)} /></Field>
                    <Field label="Date of birth" required><Input type="date" required value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
                    <Field label="ID type" required>
                      <Select value={f.id_type} onChange={(e) => set('id_type', e.target.value)}>
                        <option value="aadhaar">Aadhaar</option>
                        <option value="pan">PAN</option>
                        <option value="passport">Passport</option>
                        <option value="voter_id">Voter ID</option>
                        <option value="driving_licence">Driving licence</option>
                      </Select>
                    </Field>
                    <Field label="ID number" required={!kyc} hint={kyc?.id_last4 ? `On file: ${maskId(kyc.id_last4)}. Only the last 4 digits are stored.` : 'Only the last 4 digits are stored.'}>
                      <Input value={f.id_number} onChange={(e) => set('id_number', e.target.value)} placeholder="1234 5678 9012" />
                    </Field>
                    <div className="sm:col-span-2"><Field label="Address (as per Aadhaar)" required><Input required value={f.kyc_address} onChange={(e) => set('kyc_address', e.target.value)} /></Field></div>
                  </Section>

                  <Section title="Bank account">
                    <div className="sm:col-span-2 rounded-xl bg-brand-gold/[0.07] px-4 py-3 text-sm text-slate-700">
                      Payouts go to the bank account on your <Link to="/sponsor/bank" className="font-semibold text-brand-700 underline">Profile &amp; Bank</Link> page
                      {profile?.bank_account ? <> — currently <b>{profile.bank_name ?? 'bank'}</b> ending <b>{String(profile.bank_account).slice(-4)}</b>.</> : ' — add it there.'}
                      {' '}Upload the passbook or a cancelled cheque below as proof.
                    </div>
                  </Section>

                  <Section title="Nominee details" hint="Your nominee receives your benefits and pending payouts in case of unforeseen events.">
                    <Field label="Nominee full name"><Input value={f.nominee_name} onChange={(e) => set('nominee_name', e.target.value)} /></Field>
                    <Field label="Relationship">
                      <Select value={f.nominee_relation} onChange={(e) => set('nominee_relation', e.target.value)}>
                        <option value="">Choose…</option>
                        {RELATIONS.map((r) => <option key={r}>{r}</option>)}
                      </Select>
                    </Field>
                    <Field label="Nominee date of birth"><Input type="date" value={f.nominee_dob} onChange={(e) => set('nominee_dob', e.target.value)} /></Field>
                    <Field label="Nominee phone"><Input inputMode="tel" value={f.nominee_phone} onChange={(e) => set('nominee_phone', e.target.value)} placeholder="10-digit mobile" /></Field>
                    <Field label="Nominee Aadhaar" hint={kyc?.nominee_aadhaar_last4 ? `On file: ${maskId(kyc.nominee_aadhaar_last4)}` : 'Only the last 4 digits are stored.'}>
                      <Input inputMode="numeric" value={f.nominee_aadhaar} onChange={(e) => set('nominee_aadhaar', e.target.value)} placeholder="1234 5678 9012" />
                    </Field>
                    <Field label="Nominee PAN (optional)"><Input value={f.nominee_pan} onChange={(e) => set('nominee_pan', e.target.value)} placeholder="ABCDE1234F" /></Field>
                    <div className="sm:col-span-2"><Field label="Nominee address"><Input value={f.nominee_address} onChange={(e) => set('nominee_address', e.target.value)} /></Field></div>
                    <Field label="Share (%)"><Input inputMode="numeric" value={f.nominee_share} onChange={(e) => set('nominee_share', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
                  </Section>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">Documents</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {DOCS.map(([key, label]) => (
                        <FileInput key={key} label={label} current={kyc?.[key]} onChange={(file) => setFiles((s) => ({ ...s, [key]: file }))} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">JPG, PNG or PDF, up to 5 MB each. Leave one blank to keep the file already uploaded.</p>
                  </div>

                  <Button type="submit" loading={submit.isPending}>
                    {kyc ? (kyc.status === 'rejected' ? 'Resubmit for re-review' : 'Update submission') : 'Submit for verification'}
                  </Button>
                </form>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <HistoryCard events={events} />
          <Card className="h-fit">
            <CardHeader title="How your data is handled" />
            <CardBody>
              <ul className="space-y-3 text-xs text-slate-600">
                {[
                  'We collect only what a property transaction genuinely requires.',
                  'Full Aadhaar and ID numbers are never stored or displayed — only the last four digits.',
                  'Documents live in a private bucket. Every access by the office is written to the audit log.',
                  'No other member can see your KYC, at any rank.',
                ].map((t) => (
                  <li key={t} className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{t}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

export function HistoryCard({ events }: { events: KycEvent[] }) {
  return (
    <Card>
      <CardHeader title="Status change history" action={<Badge tone="neutral">{events.length} entr{events.length === 1 ? 'y' : 'ies'}</Badge>} />
      {events.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No activity yet.</p> : (
        <ol className="space-y-3 px-5 py-4">
          {events.map((e) => {
            const meta = EVENT[e.event] ?? { label: e.event, tone: 'neutral' as const }
            return (
              <li key={e.id} className="flex gap-3">
                <span className="mt-0.5">
                  {e.event === 'verified' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : e.event === 'rejected' ? <XCircle className="h-4 w-4 text-rose-600" />
                    : <History className="h-4 w-4 text-brand-gold-dark" />}
                </span>
                <div className="min-w-0">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <p className="mt-0.5 text-xs text-slate-500">{dateTime(e.created_at)}</p>
                  {e.note && <p className="mt-1 text-xs text-slate-700">{e.note}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-brand-darker">{v || '—'}</dd>
    </div>
  )
}

function FileInput({ label, onChange, current }: { label: string; onChange: (f: File | null) => void; current?: string | null }) {
  const [name, setName] = useState<string | null>(null)
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 hover:border-brand-gold hover:bg-brand-gold/[0.05]">
        <Upload className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate text-xs text-slate-600">
          {name ?? (current ? 'Uploaded — choose a file to replace it' : 'Choose a file')}
        </span>
        <input type="file" accept="image/*,application/pdf" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0] ?? null; setName(file?.name ?? null); onChange(file) }} />
      </label>
    </div>
  )
}
