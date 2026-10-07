import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { BRAND } from '@/lib/brand'
import { date, initials } from '@/lib/format'
import { cardState, verifyUrl, type Employee } from '@/lib/employees'
import { C, CardFace, Code39, DEEP, GOLD, GOLD_LIGHT, Guilloche, INK, LEAF, ORANGE, Row } from '@/components/idcard'

/**
 * An employee's identity card: the same CR80 card as the members' one, laid
 * out for staff. The front carries the photo, designation, department,
 * blood group and validity; the back a QR that opens the public card check
 * (/verify/employee/<token>), the emergency contact and the head office.
 *
 * No salary, address or ID numbers: a card is shown to strangers.
 * A card that no longer counts (exited, suspended, expired) is stamped
 * across the front so a stale print-out cannot pass for a live one.
 */
export function EmployeeCardFaces({ employee: e, photoUrl }: { employee: Employee; photoUrl?: string | null }) {
  const qrRef = useRef<HTMLCanvasElement>(null)
  const link = verifyUrl(e.card_token)
  const state = cardState(e)
  const stamp = state === 'void' ? (e.status === 'exited' ? 'Not valid · Exited' : 'Not valid · Suspended') : state === 'expired' ? 'Expired' : null

  useEffect(() => {
    if (!qrRef.current) return
    void QRCode.toCanvas(qrRef.current, link, {
      width: 96,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: INK, light: '#ffffff' },
    })
  }, [link])

  const legalTail = BRAND.legalName.toUpperCase().startsWith(BRAND.short.toUpperCase()) && BRAND.legalName.length > BRAND.short.length
    ? BRAND.legalName.slice(BRAND.short.length).trim().toUpperCase()
    : BRAND.legalName.toUpperCase()

  return (
    <>
      {/* ------------------------------------------------------------ FRONT */}
      <CardFace label="Front">
        <Guilloche />
        <div className="absolute left-1/2 top-[7px] z-20 h-[7px] w-[46px] -translate-x-1/2 rounded-full bg-white/90 ring-1 ring-black/20" />

        <div className="relative z-10 px-3 pb-2.5 pt-5 text-center text-white" style={{ background: `linear-gradient(160deg, ${DEEP} 0%, ${LEAF} 100%)` }}>
          <div className="flex items-center justify-center gap-2">
            <img src={BRAND.symbol} alt="" className="h-10 w-10 object-contain" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' }} />
            <div className="text-left leading-none">
              <p className="text-[12px] font-extrabold tracking-[0.05em]">{BRAND.short.toUpperCase()}</p>
              <p className="mt-[3px] text-[6.5px] font-semibold tracking-[0.2em] opacity-90">{legalTail}</p>
              <p className="mt-[3px] text-[7px] font-semibold italic" style={{ color: GOLD_LIGHT }}>{BRAND.tagline}</p>
            </div>
          </div>
          <div className="mx-auto mt-2 h-[2px] w-24" style={{ background: GOLD }} />
          <p className="mt-1.5 text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD_LIGHT }}>Employee Identity Card</p>
        </div>

        <div className="relative z-10 flex justify-center pt-3">
          <div className="relative h-[112px] w-[90px] overflow-hidden rounded-[5px] p-[2px]" style={{ border: `2px solid ${GOLD}`, background: '#fff' }}>
            {photoUrl ? (
              <div role="img" aria-label={e.full_name} className="h-full w-full rounded-[3px] bg-cover bg-center" style={{ backgroundImage: `url("${photoUrl}")` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[3px] bg-slate-100 text-3xl font-bold text-slate-400">{initials(e.full_name)}</div>
            )}
          </div>
          {e.blood_group && (
            <div className="absolute bottom-[-6px] left-1/2 ml-[30px] flex h-[30px] w-[30px] flex-col items-center justify-center rounded-full bg-white text-center leading-none shadow ring-2 ring-red-600"
              title="Blood group">
              <span className="text-[10px] font-extrabold text-red-600">{e.blood_group}</span>
              <span className="mt-[1px] text-[4.5px] font-bold uppercase tracking-wide text-red-600">Blood</span>
            </div>
          )}
        </div>

        <div className="relative z-10 mt-3 px-4 text-center">
          <p className="text-[15px] font-extrabold uppercase leading-tight tracking-wide text-slate-900">{e.full_name}</p>
          <p className="mt-1 inline-block rounded-sm px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.14em] text-white" style={{ background: ORANGE }}>
            {e.designation || 'Staff'}
          </p>
        </div>

        <dl className="relative z-10 mx-4 mt-2.5 space-y-[3px] text-[9.5px]">
          <Row k="Emp. ID"><span className="font-mono font-bold tracking-wider" style={{ color: LEAF }}>{e.employee_code}</span></Row>
          {e.department && <Row k="Dept.">{e.department}</Row>}
          <Row k="Joined">{date(e.joining_date)}</Row>
          <Row k="Valid till">
            <span className="font-semibold" style={{ color: state === 'valid' || state === 'expiring' ? LEAF : C('primary-dark') }}>
              {e.card_valid_till ? date(e.card_valid_till) : 'While employed'}
            </span>
          </Row>
        </dl>

        <div className="absolute inset-x-4 bottom-[26px] z-10 flex items-end justify-between gap-2">
          <div className="text-center">
            <Code39 value={e.employee_code} height={22} />
            <p className="mt-[1px] font-mono text-[7px] tracking-[0.2em] text-slate-700">{e.employee_code}</p>
          </div>
          <div className="text-center">
            <div className="mb-[2px] h-[16px] w-[86px] border-b border-slate-500" />
            <p className="text-[7px] font-semibold uppercase tracking-wider text-slate-600">Authorised Signatory</p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 py-[5px] text-center text-[8px] font-semibold tracking-[0.15em] text-white" style={{ background: DEEP }}>
          WWW.{BRAND.website.toUpperCase()}
        </div>

        {stamp && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <span className="-rotate-[28deg] whitespace-nowrap rounded-md border-[3px] border-red-600 bg-white/70 px-3 py-1 text-[18px] font-black uppercase tracking-wider text-red-600">
              {stamp}
            </span>
          </div>
        )}
      </CardFace>

      {/* ------------------------------------------------------------- BACK */}
      <CardFace label="Back">
        <Guilloche />
        <div className="relative z-10 h-[8px]" style={{ background: DEEP }} />
        <div className="relative z-10 h-[2px]" style={{ background: GOLD }} />

        <div className="relative z-10 px-4 pt-3 text-center">
          <p className="text-[8.5px] leading-snug text-slate-700">
            This card is the property of <span className="font-bold">{BRAND.legalName}</span> and identifies the holder
            named overleaf as an employee of the company.
          </p>
        </div>

        <div className="relative z-10 mt-2.5 flex flex-col items-center">
          <div className="rounded-[4px] bg-white p-[3px] ring-1 ring-slate-300">
            <canvas ref={qrRef} className="block h-[96px] w-[96px]" />
          </div>
          <p className="mt-1 text-[7.5px] font-semibold uppercase tracking-wider text-slate-600">Scan to verify this card</p>
        </div>

        {(e.emergency_phone || e.emergency_name) && (
          <div className="relative z-10 mx-4 mt-2.5 rounded-[5px] border border-red-200 bg-red-50/80 px-2.5 py-1.5 text-center">
            <p className="text-[6.5px] font-bold uppercase tracking-[0.18em] text-red-700">In case of emergency</p>
            <p className="mt-[2px] text-[8.5px] font-semibold text-slate-900">
              {e.emergency_name}{e.emergency_relation && <span className="font-normal text-slate-600"> ({e.emergency_relation})</span>}
            </p>
            {e.emergency_phone && <p className="text-[9px] font-bold tracking-wide text-slate-900">{e.emergency_phone}</p>}
          </div>
        )}

        <ol className="relative z-10 mx-4 mt-2.5 list-decimal space-y-[2px] pl-3 text-[7.3px] leading-snug text-slate-700">
          <li>Wear this card visibly on duty; it is non-transferable.</li>
          <li>Return it to the office when you leave the company.</li>
          <li>If found, please return it to the address below.</li>
        </ol>

        <p className="relative z-10 mt-1.5 text-center font-mono text-[6.5px] tracking-wider text-slate-500">
          ISSUE {e.card_issue_no} · ISSUED {date(e.card_issued_on).toUpperCase()}
        </p>

        <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-2 pt-2 text-center text-white" style={{ background: `linear-gradient(160deg, ${DEEP} 0%, ${LEAF} 100%)` }}>
          <p className="text-[7px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD_LIGHT }}>Head Office</p>
          <p className="mt-[2px] text-[7.5px] leading-snug">{BRAND.address}</p>
          <p className="mt-[3px] text-[7.5px] leading-snug">Phone {BRAND.phone} · {BRAND.email}</p>
        </div>
      </CardFace>
    </>
  )
}
