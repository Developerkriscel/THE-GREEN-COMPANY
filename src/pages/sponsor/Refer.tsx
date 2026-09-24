import { useEffect, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, MessageCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMyReferrals, useSponsorProfile, useSubmitReferral } from '@/lib/sponsor'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Table, Td, Th, useToast,
} from '@/components/ui'
import { Notice, SkeletonRows } from '@/components/sponsor'
import { date, num } from '@/lib/format'

/**
 * Module 10 — bring someone into the team without the office placing them by hand.
 *
 * A submission creates a REQUEST, never a member: the form says so plainly, so
 * nobody waits for a person to appear in their tree that the office has not yet
 * activated. The referral link is not a credential — it only pre-fills the
 * sponsor on the public join form.
 */
export function SponsorRefer() {
  const { profile } = useAuth()
  const me = profile?.id
  const toast = useToast()

  const { data: member } = useSponsorProfile(me)
  const { data: referrals = [], isLoading } = useMyReferrals(me)
  const submit = useSubmitReferral(me)

  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ full_name: '', mobile: '', email: '', city: '', state: '' })
  const qrRef = useRef<HTMLCanvasElement>(null)

  const code = member?.member_code ?? ''
  // /join?ref=CODE is the shape the live site uses; /register still
  // redirects there, so links already handed out keep working.
  const link = `${window.location.origin}/join?ref=${code}`

  // Drawn locally rather than fetched from a QR image service: the referral
  // link identifies the member, and it should not be handed to a third party.
  // The spec is explicit that field teams need the code more than the link.
  useEffect(() => {
    if (!code || !qrRef.current) return
    void QRCode.toCanvas(qrRef.current, link, {
      width: 168,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  }, [code, link])

  const downloadQr = () => {
    const url = qrRef.current?.toDataURL('image/png')
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `referral-${code}.png`
    a.click()
  }
  const onHold = Boolean(member?.frozen) || member?.status === 'suspended'

  const joined = referrals.filter((r) => r.status === 'active' || r.status === 'registered').length
  const waiting = referrals.filter((r) => r.status === 'invited').length

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.push('error', 'Could not copy — select the link and copy it manually.')
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submit.mutate(
      {
        full_name: form.full_name.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.push('success', 'Sent to the office for review')
          setForm({ full_name: '', mobile: '', email: '', city: '', state: '' })
        },
        onError: (err) => toast.push('error', (err as Error).message),
      },
    )
  }

  if (onHold) {
    return (
      <>
        <PageHeader title="Refer a Member" />
        <Notice tone="error" title="Your account is on hold.">
          You cannot add members while your account is on hold. Please contact the office.
        </Notice>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Refer a Member" description="Grow your team — everyone who joins through you sits at level 1." />

      <Card className="mb-6">
        <CardHeader title="Your referral link" subtitle="Permanent, and it never expires" />
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={link} className="min-w-0 flex-1 font-mono text-xs" />
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join my team at Royal Symo: ${link}`)}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Button variant="outline">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Anyone who registers through this link is placed under you as a direct member. The link
            gives no access to your account or anyone else's.
          </p>

          {/* For in-person recruiting a code beats a link — show it large enough to scan. */}
          <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-slate-200 pt-5">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <canvas ref={qrRef} className="block h-[168px] w-[168px]" />
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-semibold text-slate-900">Scan to join your team</p>
              <p className="mt-1 text-xs text-slate-500">
                Show this on your phone, or print it on a card. It opens the join form with you
                already set as the sponsor.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={downloadQr}>
                <Download className="h-4 w-4" /> Download QR
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Add a member" subtitle="Your request will be reviewed by the office" />
          <form onSubmit={onSubmit} className="space-y-3 p-5">
            <Field label="Full name" required>
              <Input
                required
                minLength={2}
                maxLength={60}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile number" required hint="10 digits">
                <Input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </Field>
              <Field label="Email (optional)">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </Field>
            </div>
            <Field label="Sponsor" hint="Fixed to you — a member can only be added under themselves">
              <Input readOnly value={`${member?.full_name ?? ''} (${code})`} className="bg-slate-50" />
            </Field>
            <Button type="submit" loading={submit.isPending}>
              Send to the office
            </Button>
            <p className="text-xs text-slate-500">
              This creates a request, not a member. They appear in your team once the office activates them.
            </p>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Your invitations"
            subtitle={`${num(referrals.length)} sent · ${num(joined)} joined · ${num(waiting)} pending`}
          />
          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : referrals.length === 0 ? (
            <EmptyState
              title="No invitations yet"
              description="Share your link or add someone with the form — they will show up here."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Mobile</Th>
                  <Th>Sent</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-800">{r.full_name}</Td>
                    <Td className="font-mono text-xs text-slate-600">
                      {r.status === 'invited' ? r.mobile : `••••••${r.mobile.slice(-4)}`}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{date(r.created_at)}</Td>
                    <Td>
                      <Badge
                        tone={
                          r.status === 'active' ? 'green' : r.status === 'rejected' ? 'red' : r.status === 'registered' ? 'blue' : 'amber'
                        }
                      >
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </Badge>
                      {r.status === 'rejected' && r.reject_reason && (
                        <p className="mt-1 text-[11px] text-red-700">{r.reject_reason}</p>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
