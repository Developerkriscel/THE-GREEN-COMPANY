import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/**
 * The member's identity card, laid out like a printed PVC card: portrait
 * CR80 (54 × 85.6 mm), a front with the photo and a back with the company's
 * head office and the card rules. Print produces both sides at true size.
 *
 * Deliberately carries no money, rank requirements or team figures: it is
 * shown to strangers. Every company detail comes from Business Settings.
 */

/* The logo's colours, from the site palette (src/index.css): the leaf green
   for the bands, the coin gold for trim and seal, the orange leaf for the
   designation. */
const C = (k: string, a?: number) => `rgb(var(--c-${k})${a !== undefined ? ` / ${a}` : ''})`
const DEEP = C('darker')
const LEAF = C('leaf-dark')
const GOLD = C('gold')
const GOLD_LIGHT = C('gold-light')
const ORANGE = C('orange')
/** The QR and barcode libraries need a literal colour: the palette's darkest green. */
const INK = '#141f0a'

/** Card size on screen; print uses millimetres (see the print rules below). */
const W = 300
const H = Math.round((W * 85.6) / 54)

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

  // Print only the two card faces: everything else on the page is hidden
  // for the length of the print dialog.
  function print() {
    document.body.classList.add('printing-id-card')
    const done = () => {
      document.body.classList.remove('printing-id-card')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
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
            <Button variant="outline" size="sm" onClick={print}>
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

/**
 * A PDF at true card size (54 × 85.6 mm), one page per face, front then
 * back: the format card printers take. Each face is captured at about
 * 700 dpi. The libraries load only when someone asks for a PDF.
 */
export async function saveIdCardPdf(faces: HTMLElement[], memberCode: string) {
  const [images, { jsPDF }] = await Promise.all([captureIdCardFaces(faces), import('jspdf')])
  const pdf = new jsPDF({ unit: 'mm', format: [54, 85.6], orientation: 'portrait', compress: true })
  images.forEach((png, i) => {
    if (i > 0) pdf.addPage([54, 85.6], 'portrait')
    pdf.addImage(png, 'PNG', 0, 0, 54, 85.6, undefined, 'FAST')
  })
  pdf.setProperties({ title: `${BRAND.name} ID card ${memberCode}`, author: BRAND.legalName })
  pdf.save(`${BRAND.short}-ID-Card-${memberCode}.pdf`)
}

/** Each face as a PNG data URL, rendered at 5x (about 700 dpi at card size). */
export async function captureIdCardFaces(faces: HTMLElement[]) {
  const { default: html2canvas } = await import('html2canvas-pro')
  const out: string[] = []
  for (const face of faces) {
    const canvas = await html2canvas(face, {
      scale: 5,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      onclone: (doc) => doc.querySelectorAll<HTMLElement>('.id-face').forEach((f) => { f.style.boxShadow = 'none' }),
    })
    out.push(canvas.toDataURL('image/png'))
  }
  return out
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
            <img src={BRAND.markSquare} alt="" className="h-11 w-11 object-contain" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' }} />
            <div className="text-left leading-none">
              <p className="text-[17px] font-extrabold tracking-[0.12em]">{BRAND.short.toUpperCase()}</p>
              <p className="mt-[3px] text-[6.5px] font-semibold tracking-[0.06em] opacity-90">{BRAND.legalName.toUpperCase()}</p>
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

function CardFace({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="id-face-wrap m-0 text-center">
      <div
        className="id-face relative overflow-hidden rounded-[14px] bg-white text-left shadow-[0_10px_30px_-10px_rgba(15,81,50,0.45)] ring-1 ring-black/10"
        style={{ width: W, height: H }}
      >
        {children}
      </div>
      <figcaption className="mt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 print:hidden">{label}</figcaption>
    </figure>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[62px_8px_1fr] items-baseline">
      <dt className="font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
      <span className="text-slate-400">:</span>
      <dd className="m-0 font-medium text-slate-900">{children}</dd>
    </div>
  )
}

/*
 * Code 39 barcode of the member ID, as printed on most staff and member
 * cards; any handheld scanner reads it. Each character is five bars and four
 * spaces, three of them wide; `*` marks the start and the end.
 */
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn',
  F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn',
  P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '*': 'nwnnwnwnn',
}

export function code39Bars(value: string, narrow = 1, wide = 2.5) {
  const chars = `*${value.toUpperCase().replace(/[^0-9A-Z-]/g, '')}*`.split('')
  const bars: { x: number; w: number }[] = []
  let x = 0
  chars.forEach((ch, ci) => {
    CODE39[ch].split('').forEach((e, i) => {
      const w = e === 'w' ? wide : narrow
      if (i % 2 === 0) bars.push({ x, w })
      x += w
    })
    if (ci < chars.length - 1) x += narrow // gap between characters
  })
  return { bars, width: x }
}

function Code39({ value, height }: { value: string; height: number }) {
  const { bars, width } = code39Bars(value)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={Math.min(150, width * 0.95)} height={height} preserveAspectRatio="none" aria-label={`Barcode ${value}`}>
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill={INK} />)}
    </svg>
  )
}

/** Fine security-print linework in the background, as on printed cards. */
function Guilloche() {
  return (
    <>
      <GuillocheLines />
      <img src={BRAND.markSquare} alt="" aria-hidden className="pointer-events-none absolute z-0 h-[140px] w-[140px] object-contain opacity-[0.06]"
        style={{ left: W / 2 - 70, top: H / 2 - 20 }} />
    </>
  )
}

function GuillocheLines() {
  const paths = Array.from({ length: 14 }, (_, i) => {
    const y = 40 + i * 32
    return `M -20 ${y} C 60 ${y - 40}, 120 ${y + 40}, 200 ${y} S 340 ${y - 40}, 420 ${y}`
  })
  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={LEAF} strokeOpacity={0.07} strokeWidth={0.8} />
      ))}
    </svg>
  )
}

function VerifiedSeal() {
  return (
    <div
      className="absolute bottom-[-6px] left-1/2 ml-[34px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-center text-[5.5px] font-extrabold uppercase leading-[1.05] text-white"
      style={{ background: `radial-gradient(circle at 35% 30%, ${GOLD_LIGHT}, ${GOLD} 55%, ${C('gold-dark')})`, boxShadow: '0 1px 3px rgba(0,0,0,.35)' }}
      title="KYC verified"
    >
      KYC<br />Verified
    </div>
  )
}

/**
 * Print: both faces at true CR80 size, side by side, nothing else. Scoped to
 * body.printing-id-card so printing any other page is unaffected.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body.printing-id-card * { visibility: hidden !important; }
  body.printing-id-card .id-print-area,
  body.printing-id-card .id-print-area * { visibility: visible !important; }
  body.printing-id-card .id-print-area {
    position: fixed; left: 0; top: 0; display: flex !important; gap: 8mm !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body.printing-id-card .id-face {
    zoom: ${(54 / 25.4 * 96 / W).toFixed(4)};
    box-shadow: none !important; border: 0.2mm solid #999;
  }
  body.printing-id-card figcaption { display: none !important; }
}
`
