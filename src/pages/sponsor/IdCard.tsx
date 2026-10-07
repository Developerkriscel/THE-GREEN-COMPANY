import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Camera, Download, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useMyKyc } from '@/lib/queries'
import { useMySponsor, useSponsorProfile } from '@/lib/sponsor'
import { useAvatarUrl } from '@/lib/avatar'
import { Button, PageHeader, useToast } from '@/components/ui'
import { Notice } from '@/components/sponsor'
import { date, initials } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import {
  C, CardFace, Code39, DEEP, GOLD, GOLD_LIGHT, Guilloche, INK, LEAF, ORANGE, PRINT_CSS, Row, VerifiedSeal, printIdCards, saveIdCardPdf,
} from '@/components/idcard'

/**
 * The member's identity card, laid out like a printed PVC card: portrait
 * CR80 (54 × 85.6 mm), a front with the photo and a back with the company's
 * head office and the card rules. Print produces both sides at true size.
 *
 * Deliberately carries no money, rank requirements or team figures: it is
 * shown to strangers. Every company detail comes from Business Settings.
 */

export function SponsorIdCard() {
  const { profile } = useAuth()
  const me = profile?.id
  const { data: member } = useSponsorProfile(me)
  const { data: sponsor } = useMySponsor(me)
  const { data: kyc } = useMyKyc(me)
  const { data: photo } = useAvatarUrl(member?.avatar_path)
  const verified = kyc?.status === 'verified'
  const facesRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const { push } = useToast()

  async function downloadPdf() {
    const faces = facesRef.current?.querySelectorAll<HTMLElement>('.id-face')
    if (!faces || faces.length < 2) return
    setSaving(true)
    try {
      await saveIdCardPdf([...faces], member?.member_code ?? 'member')
    } catch (e) {
      push('error', `Could not create the PDF: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHeader
        title="My ID Card"
        description="Your membership card. Print it on card stock (both sides) or show it on your phone."
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void downloadPdf()} loading={saving} disabled={!member}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={printIdCards}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        }
      />

      {!verified && (
        <div className="mb-5 print:hidden">
          <Notice tone="warn" title="Your card shows “KYC pending” until KYC is approved." to="/sponsor/kyc" action="Go to KYC">
            Complete your KYC so the card carries the verified seal.
          </Notice>
        </div>
      )}

      {member && !member.avatar_path && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200 print:hidden">
          <Camera className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1">Your card has no photo yet. A clear, front-facing photo makes it valid.</span>
          <Link to="/sponsor/profile" className="font-medium text-brand-700 hover:underline">Add a photo</Link>
        </div>
      )}

      <div ref={facesRef}>
      <IdCardFaces
        name={member?.full_name}
        rank={member?.rank?.name}
        code={member?.member_code ?? ''}
        joined={member?.created_at}
        sponsorCode={sponsor?.member_code}
        mobile={member?.phone}
        verified={verified}
        photoUrl={photo}
      />
      </div>

      <p className="mx-auto mt-6 max-w-[640px] text-center text-xs text-slate-500 print:hidden">
        The card shows no earnings or team figures, because it is meant to be shown to people outside your team.
        Contact the office if any detail is wrong.
      </p>
    </>
  )
}

/** The two card faces, from plain values: the page above loads them. */
export function IdCardFaces({
  name, rank, code, joined, sponsorCode, mobile, verified, photoUrl,
}: {
  name?: string | null
  rank?: string | null
  code: string
  joined?: string | null
  sponsorCode?: string | null
  mobile?: string | null
  verified: boolean
  photoUrl?: string | null
}) {
  const qrRef = useRef<HTMLCanvasElement>(null)
  const link = `${window.location.origin}/join?ref=${code}`

  useEffect(() => {
    if (!code || !qrRef.current) return
    void QRCode.toCanvas(qrRef.current, link, {
      width: 104,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: INK, light: '#ffffff' },
    })
  }, [code, link])

  return (
    <div className="id-print-area flex flex-wrap items-start justify-center gap-6">
      {/* ------------------------------------------------------------ FRONT */}
      <CardFace label="Front">
        <Guilloche />
        {/* Lanyard slot */}
        <div className="absolute left-1/2 top-[7px] z-20 h-[7px] w-[46px] -translate-x-1/2 rounded-full bg-white/90 ring-1 ring-black/20" />

        <div className="relative z-10 px-3 pb-3 pt-5 text-center text-white" style={{ background: `linear-gradient(160deg, ${DEEP} 0%, ${LEAF} 100%)` }}>
          <div className="flex items-center justify-center gap-2">
            <img src={BRAND.symbol} alt="" className="h-11 w-11 object-contain" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' }} />
            <div className="text-left leading-none">
              <p className="text-[12px] font-extrabold tracking-[0.05em]">{BRAND.short.toUpperCase()}</p>
              {BRAND.legalName.toUpperCase().startsWith(BRAND.short.toUpperCase()) && BRAND.legalName.length > BRAND.short.length ? (
                <p className="mt-[3px] text-[6.5px] font-semibold tracking-[0.2em] opacity-90">{BRAND.legalName.slice(BRAND.short.length).trim().toUpperCase()}</p>
              ) : (
                <p className="mt-[3px] text-[6.5px] font-semibold tracking-[0.06em] opacity-90">{BRAND.legalName.toUpperCase()}</p>
              )}
              <p className="mt-[3px] text-[7px] font-semibold italic" style={{ color: GOLD_LIGHT }}>{BRAND.tagline}</p>
            </div>
          </div>
          <div className="mx-auto mt-2 h-[2px] w-24" style={{ background: GOLD }} />
          <p className="mt-1.5 text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD_LIGHT }}>Identity Card</p>
        </div>

        {/* Photo, passport style */}
        <div className="relative z-10 -mt-1 flex justify-center pt-3">
          <div className="relative h-[118px] w-[94px] overflow-hidden rounded-[5px] p-[2px]" style={{ border: `2px solid ${GOLD}`, background: '#fff' }}>
            {photoUrl ? (
              <div role="img" aria-label={name ?? ''} className="h-full w-full rounded-[3px] bg-cover bg-center" style={{ backgroundImage: `url("${photoUrl}")` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[3px] bg-slate-100 text-3xl font-bold text-slate-400">
                {initials(name)}
              </div>
            )}
          </div>
          {verified && <VerifiedSeal />}
        </div>

        <div className="relative z-10 mt-3 px-4 text-center">
          <p className="text-[15px] font-extrabold uppercase leading-tight tracking-wide text-slate-900">{name ?? '—'}</p>
          <p className="mt-1 inline-block rounded-sm px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.14em] text-white" style={{ background: ORANGE }}>
            {rank ?? 'Member'}
          </p>
        </div>

        <dl className="relative z-10 mx-4 mt-3 space-y-[3px] text-[9.5px]">
          <Row k="ID No.">
            <span className="font-mono font-bold tracking-wider" style={{ color: LEAF }}>{code || '—'}</span>
          </Row>
          <Row k="Joined">{date(joined)}</Row>
          {mobile && <Row k="Mobile">{mobile}</Row>}
          <Row k="Sponsor">{sponsorCode ?? '—'}</Row>
          <Row k="Status">
            <span className="font-semibold" style={{ color: verified ? LEAF : C('primary-dark') }}>{verified ? 'KYC Verified' : 'KYC Pending'}</span>
          </Row>
        </dl>

        <div className="absolute inset-x-4 bottom-[26px] z-10 flex items-end justify-between gap-2">
          <div className="text-center">
            {code && <Code39 value={code} height={22} />}
            <p className="mt-[1px] font-mono text-[7px] tracking-[0.2em] text-slate-700">{code}</p>
          </div>
          <div className="text-center">
            <div className="mb-[2px] h-[16px] w-[92px] border-b border-slate-500" />
            <p className="text-[7px] font-semibold uppercase tracking-wider text-slate-600">Authorised Signatory</p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 py-[5px] text-center text-[8px] font-semibold tracking-[0.15em] text-white" style={{ background: DEEP }}>
          WWW.{BRAND.website.toUpperCase()}
        </div>
      </CardFace>

      {/* ------------------------------------------------------------- BACK */}
      <CardFace label="Back">
        <Guilloche />
        <div className="relative z-10 h-[8px]" style={{ background: DEEP }} />
        <div className="relative z-10 h-[2px]" style={{ background: GOLD }} />

        <div className="relative z-10 px-4 pt-3 text-center">
          <p className="text-[8.5px] leading-snug text-slate-700">
            This card is the property of <span className="font-bold">{BRAND.legalName}</span> and is issued to
            the holder named overleaf as an authorised channel partner.
          </p>
        </div>

        <div className="relative z-10 mt-3 flex flex-col items-center">
          <div className="rounded-[4px] bg-white p-[3px] ring-1 ring-slate-300">
            <canvas ref={qrRef} className="block h-[104px] w-[104px]" />
          </div>
          <p className="mt-1 text-[7.5px] font-semibold uppercase tracking-wider text-slate-600">Scan to join · {code}</p>
        </div>

        <ol className="relative z-10 mx-4 mt-3 list-decimal space-y-[2px] pl-3 text-[7.5px] leading-snug text-slate-700">
          <li>This card is non-transferable and must be shown on request.</li>
          <li>Valid only while the holder's membership is active.</li>
          <li>Payments are valid only against an official company slip.</li>
          <li>If found, please return it to the address below.</li>
        </ol>

        <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-2 pt-2 text-center text-white" style={{ background: `linear-gradient(160deg, ${DEEP} 0%, ${LEAF} 100%)` }}>
          <p className="text-[7px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD_LIGHT }}>Head Office</p>
          <p className="mt-[2px] text-[7.5px] leading-snug">{BRAND.address}</p>
          <p className="mt-[3px] text-[7.5px] leading-snug">
            WhatsApp {BRAND.whatsapp} · {BRAND.email}
          </p>
          <p className="mt-[2px] text-[7.5px] font-semibold">www.{BRAND.website}</p>
        </div>
      </CardFace>
    </div>
  )
}
