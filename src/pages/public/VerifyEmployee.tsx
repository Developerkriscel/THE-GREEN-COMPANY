import { useEffect, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldX } from 'lucide-react'
import { useHrFileUrl, useVerifyEmployee, type CardCheck } from '@/lib/employees'
import { BrandLockup } from '@/components/BrandLockup'
import { BRAND } from '@/lib/brand'
import { date, initials } from '@/lib/format'

/**
 * The public card check: what the QR on an employee's ID card opens.
 *
 * Anyone holding the card can be checked at a gate, a customer's door or a
 * site: is this a current employee, and does the face match? It shows only
 * what the card itself prints, and for someone who has left, not even that.
 * Not indexed by search engines.
 */
export function VerifyEmployee() {
  const { token } = useParams()
  const { data, isLoading, error } = useVerifyEmployee(token)
  const { data: photo } = useHrFileUrl(data?.state === 'valid' || data?.state === 'expired' || data?.state === 'suspended' ? data.photo_path : null)

  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex, nofollow'
    document.head.appendChild(m)
    const was = document.title
    document.title = `ID card check · ${BRAND.short}`
    return () => { m.remove(); document.title = was }
  }, [])

  return (
    <div className="min-h-screen bg-[#f6f3ea] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="bg-leaf-deep rounded-t-3xl px-6 py-5 text-white shadow-luxe">
          <BrandLockup size="sm" tone="dark" />
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.25em] text-brand-gold-light">Employee ID card check</p>
        </div>
        <div className="rounded-b-3xl bg-white p-6 shadow-luxe ring-1 ring-brand-gold/20">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking the card…</p>
          ) : error ? (
            <Verdict tone="amber" icon={<AlertTriangle className="h-6 w-6" />} title="Could not check right now"
              text="The check could not reach our records. Try again in a moment, or call the office." />
          ) : (
            <Result c={data!} photo={photo} />
          )}
          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            Doubt about this person? Call the office on <a href={`tel:${BRAND.phone}`} className="font-semibold text-brand-700">{BRAND.phone}</a>
            <br />{BRAND.legalName}
          </div>
        </div>
      </div>
    </div>
  )
}

function Result({ c, photo }: { c: CardCheck; photo?: string | null }) {
  if (c.state === 'unknown') {
    return <Verdict tone="red" icon={<ShieldX className="h-6 w-6" />} title="Not a valid card"
      text="This QR code does not belong to any current ID card of ours. The card may be fake, or an old card that was replaced." />
  }
  if (c.state === 'exited') {
    return <Verdict tone="red" icon={<ShieldX className="h-6 w-6" />} title="No longer an employee"
      text={`${c.name} (${c.code}) left the company${c.exit_date ? ` on ${date(c.exit_date)}` : ''}. This card is not valid and does not authorise them to act for us.`} />
  }
  const verdict = c.state === 'valid'
    ? <Verdict tone="green" icon={<CheckCircle2 className="h-6 w-6" />} title="Genuine employee card" text="This person is a current employee. Check that the photo matches the holder." />
    : c.state === 'expired'
      ? <Verdict tone="amber" icon={<Clock className="h-6 w-6" />} title="Card has expired" text={`The card was valid until ${date(c.valid_till)}. Ask the holder to renew it with the office.`} />
      : <Verdict tone="red" icon={<ShieldX className="h-6 w-6" />} title="Card suspended" text="This employee's card is suspended and should not be accepted right now." />

  return (
    <div>
      {verdict}
      <div className="mt-6 flex flex-col items-center text-center">
        <div className="h-36 w-28 overflow-hidden rounded-xl bg-slate-100 ring-2 ring-brand-gold/50">
          {photo ? <img src={photo} alt={c.name} className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-slate-400">{initials(c.name)}</span>}
        </div>
        <p className="mt-3 text-xl font-extrabold uppercase tracking-wide text-brand-darker">{c.name}</p>
        {c.designation && <p className="mt-1 rounded-sm bg-brand-orange px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">{c.designation}</p>}
      </div>
      <dl className="mt-5 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
        {([
          ['Employee ID', <span key="c" className="font-mono font-semibold">{c.code}</span>],
          ['Department', c.department],
          ['Location', c.location],
          ['Blood group', c.blood_group],
          ['With us since', c.joining_date && date(c.joining_date)],
          ['Card valid till', c.valid_till ? date(c.valid_till) : 'While employed'],
          ['Card issue', c.issue_no],
        ] as [string, ReactNode][]).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-2.5 text-sm"><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></div>
        ))}
      </dl>
    </div>
  )
}

function Verdict({ tone, icon, title, text }: { tone: 'green' | 'amber' | 'red'; icon: ReactNode; title: string; text: string }) {
  const cls = { green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', red: 'bg-red-50 text-red-800 ring-red-200' }[tone]
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${cls}`}>
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{text}</p>
      </div>
    </div>
  )
}
