import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Camera, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import {
  Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, useToast,
} from '@/components/ui'
import { KycBadge, RankBadge } from '@/components/status'
import { date, pct } from '@/lib/format'
import { Avatar } from '@/components/Avatar'
import { useRemoveAvatar, useUploadAvatar } from '@/lib/avatar'

/** Internal role names are not member-facing language. */
const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  rep: 'Sponsor',
  customer: 'Customer',
}

export function ProfilePage() {
  const { profile, refreshProfile, updatePassword } = useAuth()
  const { data: kyc } = useMyKyc(profile?.id)
  const { push } = useToast()
  const [savingPw, setSavingPw] = useState(false)

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from('profiles').update(payload).eq('id', profile!.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      push('success', 'Profile updated.')
      await refreshProfile()
    },
    onError: (e: Error) => push('error', e.message),
  })

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    if (password.length < 8) return push('error', 'Password must be at least 8 characters.')
    if (password !== String(f.get('confirm'))) return push('error', 'The two passwords do not match.')

    setSavingPw(true)
    try {
      await updatePassword(password)
      push('success', 'Password updated.')
      e.currentTarget.reset()
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Could not update the password')
    } finally {
      setSavingPw(false)
    }
  }

  if (!profile) return null

  const isStaff = profile.role !== 'customer'

  return (
    <>
      <PageHeader title="My profile" description="Your details, your ID and your password." />

      <ProfilePhoto
        memberId={profile.id}
        path={profile.avatar_path}
        name={profile.full_name}
        onChanged={refreshProfile}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Personal details" subtitle="Name and contact details you can edit yourself." />
          <CardBody>
            <form
              className="space-y-3"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                save.mutate({
                  full_name: String(f.get('full_name')),
                  phone: String(f.get('phone') ?? '') || null,
                  address: String(f.get('address') ?? '') || null,
                  city: String(f.get('city') ?? '') || null,
                  state: String(f.get('state') ?? '') || null,
                  pincode: String(f.get('pincode') ?? '') || null,
                })
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name" required>
                  <Input name="full_name" required defaultValue={profile.full_name} />
                </Field>
                <Field label="Mobile number">
                  <Input name="phone" defaultValue={profile.phone ?? ''} inputMode="tel" />
                </Field>
                <Field label="City">
                  <Input name="city" defaultValue={profile.city ?? ''} />
                </Field>
                <Field label="State">
                  <Input name="state" defaultValue={profile.state ?? ''} />
                </Field>
                <Field label="Pincode">
                  <Input name="pincode" defaultValue={profile.pincode ?? ''} />
                </Field>
                <Field label="Email" hint="Contact an administrator to change this.">
                  <Input defaultValue={profile.email ?? ''} disabled />
                </Field>
              </div>
              <Field label="Address">
                <Input name="address" defaultValue={profile.address ?? ''} />
              </Field>
              <Button type="submit" loading={save.isPending}>Save changes</Button>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account" />
            <CardBody className="space-y-3 text-sm">
              <Row label="User ID" value={<span className="font-mono text-xs">{profile.user_code ?? '—'}</span>} />
              <Row label="Role" value={<Badge tone="blue">{ROLE_LABEL[profile.role] ?? profile.role}</Badge>} />
              <Row
                label="Status"
                value={
                  <Badge tone={profile.status === 'active' ? 'green' : profile.status === 'pending' ? 'amber' : 'red'}>
                    {profile.status}
                  </Badge>
                }
              />
              {isStaff && (
                <>
                  <Row label="Rank" value={profile.rank?.name ? <RankBadge name={profile.rank.name} /> : '—'} />
                  <Row
                    label="Own-sale commission"
                    value={pct(profile.commission_rate ?? profile.rank?.own_sale_rate ?? 0)}
                  />
                  <Row label="Reports to" value={profile.manager?.full_name ?? '—'} />
                </>
              )}
              <Row label="Member since" value={date(profile.created_at)} />
            </CardBody>
            {isStaff && (
              <div className="border-t border-slate-100 px-5 py-3">
                <p className="text-xs text-slate-500">
                  Your rank sets the commission rate on the plots <strong>you</strong> sell. It never entitles
                  you to a share of anyone else's sale.
                </p>
              </div>
            )}
          </Card>

          {isStaff && (
            <Card>
              <CardHeader
                title="KYC"
                action={kyc ? <KycBadge status={kyc.status} /> : <Badge tone="neutral">Not started</Badge>}
              />
              <CardBody className="text-sm text-slate-600">
                {kyc ? (
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    {kyc.status === 'verified'
                      ? `Verified on ${date(kyc.reviewed_at)}.`
                      : kyc.status === 'rejected'
                        ? kyc.reject_reason ?? 'Rejected — please resubmit.'
                        : 'Submitted and awaiting verification.'}
                  </p>
                ) : (
                  <p>Complete your KYC from the “My KYC” page so your commission can be paid out.</p>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Password" />
            <CardBody>
              <form className="space-y-3" onSubmit={onPassword}>
                <Field label="New password" hint="At least 8 characters." required>
                  <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password" required>
                  <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <Button type="submit" variant="secondary" className="w-full" loading={savingPw}>
                  <KeyRound className="h-4 w-4" /> Update password
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ photo */

/**
 * The member's photo. It appears on their ID card and to the office, so it
 * is asked for plainly: a clear face, not a logo.
 */
function ProfilePhoto({
  memberId, path, name, onChanged,
}: {
  memberId: string
  path: string | null | undefined
  name: string | null | undefined
  onChanged: () => Promise<void>
}) {
  const { push } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useUploadAvatar(memberId, path)
  const remove = useRemoveAvatar(memberId, path)

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Clear the input, so choosing the same file again still fires a change.
    e.target.value = ''
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      push('error', 'That photo is very large. Please choose one under 15 MB.')
      return
    }
    upload.mutate(file, {
      onSuccess: async () => { push('success', 'Photo updated.'); await onChanged() },
      onError: (err) => push('error', (err as Error).message),
    })
  }

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar path={path} name={name} size={88} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Profile photo</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Shown on your ID card and to the office. Use a clear photo of your face.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={pick}
              />
              <Button size="sm" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4" /> {path ? 'Change photo' : 'Upload photo'}
              </Button>
              {path && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={remove.isPending}
                  onClick={() => remove.mutate(undefined, {
                    onSuccess: async () => { push('success', 'Photo removed.'); await onChanged() },
                    onError: (err) => push('error', (err as Error).message),
                  })}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
