import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import {
  Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Spinner, useToast,
} from '@/components/ui'
import { KycBadge } from '@/components/status'
import { date, maskId } from '@/lib/format'

/**
 * KYC submission. Documents go to the private `kyc` bucket under the user's own
 * uid prefix — storage policy allows a write only into `kyc/{auth.uid()}/…`,
 * and only the owner and an admin can read them back.
 */
export function KycPage() {
  const { profile } = useAuth()
  const { data: kyc, isLoading } = useMyKyc(profile?.id)
  const qc = useQueryClient()
  const { push } = useToast()
  const [files, setFiles] = useState<Record<string, File | null>>({})

  const submit = useMutation({
    mutationFn: async (form: { idType: string; idLast4: string }) => {
      const uploads: Record<string, string> = {}

      for (const [key, file] of Object.entries(files)) {
        if (!file) continue
        const path = `${profile!.id}/${key}-${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from('kyc').upload(path, file, { upsert: true })
        if (error) throw new Error(error.message)
        uploads[key] = path
      }

      const payload = {
        user_id: profile!.id,
        id_type: form.idType,
        id_last4: form.idLast4.slice(-4),
        status: 'pending' as const,
        ...(uploads.id_doc_path ? { id_doc_path: uploads.id_doc_path } : {}),
        ...(uploads.address_doc_path ? { address_doc_path: uploads.address_doc_path } : {}),
        ...(uploads.photo_path ? { photo_path: uploads.photo_path } : {}),
      }

      const res = kyc
        ? await supabase.from('kyc').update(payload).eq('id', kyc.id)
        : await supabase.from('kyc').insert(payload)
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      push('success', 'KYC submitted for verification.')
      setFiles({})
      void qc.invalidateQueries({ queryKey: ['kyc', profile?.id] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  if (isLoading) return <Spinner />

  const locked = kyc?.status === 'verified'

  return (
    <>
      <PageHeader
        title="My KYC"
        description="Required before commission can be paid out. Your documents are stored encrypted and are visible only to you and an administrator."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Identity verification"
            action={kyc ? <KycBadge status={kyc.status} /> : undefined}
          />
          <CardBody>
            {locked ? (
              <div className="space-y-3 text-sm">
                <p className="text-slate-700">
                  Your KYC was verified on <strong>{date(kyc.reviewed_at)}</strong>. Contact an administrator
                  if any detail needs to change.
                </p>
                <p className="text-xs text-slate-500">
                  ID on file: {kyc.id_type} · {maskId(kyc.id_last4)}
                </p>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  submit.mutate({
                    idType: String(f.get('id_type')),
                    idLast4: String(f.get('id_number')),
                  })
                }}
              >
                {kyc?.status === 'rejected' && kyc.reject_reason && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <strong>Rejected:</strong> {kyc.reject_reason}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="ID type" required>
                    <Select name="id_type" defaultValue={kyc?.id_type ?? 'aadhaar'}>
                      <option value="aadhaar">Aadhaar</option>
                      <option value="pan">PAN</option>
                      <option value="passport">Passport</option>
                      <option value="voter_id">Voter ID</option>
                      <option value="driving_licence">Driving licence</option>
                    </Select>
                  </Field>
                  <Field
                    label="ID number"
                    hint="Only the last 4 digits are stored in the database."
                    required
                  >
                    <Input name="id_number" required placeholder="XXXX XXXX 1234" />
                  </Field>
                </div>

                <FileInput label="Photo ID document" onChange={(f) => setFiles((s) => ({ ...s, id_doc_path: f }))} current={kyc?.id_doc_path} />
                <FileInput label="Address proof" onChange={(f) => setFiles((s) => ({ ...s, address_doc_path: f }))} current={kyc?.address_doc_path} />
                <FileInput label="Passport-size photo" onChange={(f) => setFiles((s) => ({ ...s, photo_path: f }))} current={kyc?.photo_path} />

                <Button type="submit" loading={submit.isPending}>
                  {kyc ? 'Resubmit for verification' : 'Submit KYC'}
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader title="How your data is handled" />
          <CardBody>
            <ul className="space-y-3 text-xs text-slate-600">
              <li className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                We collect only what a property transaction genuinely requires.
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                Full ID numbers are never stored or displayed — only the last four digits.
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                Documents live in a private bucket. Every access is written to the audit log.
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                No other sales partner can see your KYC, at any rank.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  )
}

function FileInput({
  label,
  onChange,
  current,
}: {
  label: string
  onChange: (f: File | null) => void
  current?: string | null
}) {
  const [name, setName] = useState<string | null>(null)
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 hover:border-brand-500 hover:bg-brand-50/40">
        <Upload className="h-4 w-4 text-slate-400" />
        <span className="text-xs text-slate-600">
          {name ?? (current ? 'Uploaded — choose a new file to replace it' : 'Choose a file (JPG, PNG or PDF)')}
        </span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            setName(file?.name ?? null)
            onChange(file)
          }}
        />
      </label>
    </div>
  )
}
