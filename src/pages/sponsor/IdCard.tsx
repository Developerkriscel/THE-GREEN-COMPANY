import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { Camera, Printer } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import { useMySponsor, useSponsorProfile } from '@/lib/sponsor'
import { Badge, Button, Card, PageHeader } from '@/components/ui'
import { Notice } from '@/components/sponsor'
import { date } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'

/**
 * The member's identity card — the thing a field agent is actually asked for
 * when they introduce themselves. Printable at card size; the QR resolves to
 * their referral link so a prospect can join from the card itself.
 *
 * Deliberately carries no money, rank requirements or team figures: it is
 * shown to strangers.
 */
export function SponsorIdCard() {
  const { profile } = useAuth()
  const me = profile?.id
  const { data: member } = useSponsorProfile(me)
  const { data: sponsor } = useMySponsor(me)
  const { data: kyc } = useMyKyc(me)
  const qrRef = useRef<HTMLCanvasElement>(null)

  const code = member?.member_code ?? ''
  // /join?ref=CODE is the shape the live site uses; /register still
  // redirects there, so links already handed out keep working.
  const link = `${window.location.origin}/join?ref=${code}`

  useEffect(() => {
    if (!code || !qrRef.current) return
    void QRCode.toCanvas(qrRef.current, link, {
      width: 88,
      margin: 0,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  }, [code, link])

  const verified = kyc?.status === 'verified'

  return (
    <>
      <PageHeader
        title="My ID Card"
        description="Your membership card — show it, or print it for the field."
        action={
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        }
      />

      {!verified && (
        <div className="mb-5 print:hidden">
          <Notice tone="warn" title="Your card is marked unverified until KYC is approved." to="/sponsor/kyc" action="Go to KYC">
            Complete your KYC so the card shows as verified.
          </Notice>
        </div>
      )}

      {member && !member.avatar_path && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200 print:hidden">
          <Camera className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1">Your card has no photo yet — it shows your initials instead.</span>
          <Link to="/sponsor/profile" className="font-medium text-brand-700 hover:underline">Add a photo</Link>
        </div>
      )}

      {/* 86 × 54 mm is a standard ID card; the ratio is kept so print matches screen. */}
      <div className="flex justify-center">
        <Card className="w-full max-w-[420px] overflow-hidden print:border-black print:shadow-none">
          <div className="flex items-center gap-3 bg-brand-700 px-5 py-4 text-white">
            <img src={BRAND.markSquare} alt="" className="h-10 w-10 rounded-lg bg-white object-cover" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                {BRAND.name}
              </p>
              <p className="text-lg font-bold leading-tight">Member Identity Card</p>
            </div>
          </div>

          <div className="flex gap-4 p-5">
            <Avatar
              path={member?.avatar_path}
              name={member?.full_name}
              size={84}
              rounded="xl"
              className="ring-2 ring-slate-100"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</p>
              <p className="truncate text-base font-bold text-slate-900">{member?.full_name ?? '—'}</p>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Member ID</p>
              <p className="font-mono text-sm font-semibold text-brand-700">{code || '—'}</p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rank</p>
                  <p className="text-xs font-medium text-slate-800">{member?.rank?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Joined</p>
                  <p className="text-xs font-medium text-slate-800">{date(member?.created_at)}</p>
                </div>
              </div>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sponsor</p>
              <p className="truncate text-xs text-slate-700">
                {sponsor?.full_name ? `${sponsor.full_name} (${sponsor.member_code})` : 'Network root'}
              </p>
            </div>
          </div>

          {/* The QR sits on its own row: beside the photo and the details it
              left them a sliver of the card and the rank ran into the date. */}
          <div className="flex items-center gap-4 px-5 pb-5">
            <canvas ref={qrRef} className="h-[88px] w-[88px] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">Scan to join</p>
              <p className="text-[11px] leading-snug text-slate-500">
                Opens registration with {member?.full_name?.split(' ')[0] ?? 'this member'} as the sponsor.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
            <Badge tone={verified ? 'green' : 'amber'} className="shrink-0 whitespace-nowrap">
              {verified ? 'KYC verified' : 'KYC pending'}
            </Badge>
            <p className="text-right text-[10px] text-slate-400">
              Valid while the membership is active · www.{BRAND.website}
            </p>
          </div>
        </Card>
      </div>

      <p className="mx-auto mt-5 max-w-[420px] text-xs text-slate-500 print:hidden">
        This card shows no earnings or team figures — it is meant to be shown to people outside your
        team. Contact the office if any detail is wrong.
      </p>
    </>
  )
}
