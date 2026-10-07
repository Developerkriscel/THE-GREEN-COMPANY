import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Compass, MapPin, Ruler } from 'lucide-react'
import { usePublicResale, useResaleInquire, type ResalePlot } from '@/lib/resale'
import { assetUrl } from '@/lib/supabase'
import { money, num } from '@/lib/format'

/**
 * Resale plots on the website: plots their owners want to sell, which the
 * office has checked and chosen to show here. Visitors send an enquiry; the
 * office calls them. The owner's identity is never shown.
 */
export function ResalePage() {
  const { data: plots = [], isLoading } = usePublicResale()
  return (
    <>
      <section className="relative overflow-hidden py-20 text-center text-white"
        style={{ background: 'radial-gradient(circle at 85% 15%, rgb(var(--c-gold) / .2), transparent 45%), linear-gradient(135deg, rgb(var(--c-dark)) 0%, rgb(var(--c-darker)) 55%, rgb(var(--c-leaf-dark)) 100%)' }}>
        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-[.2em] text-brand-primary-glow">Verified by the office</span>
          <h1 className="mb-4 text-4xl font-extrabold sm:text-5xl">Resale Plots</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">Ready plots in our projects, offered by their owners. Every one is checked by our office, and the transfer is handled by us.</p>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          {isLoading ? <p className="py-10 text-center text-gray-500">Loading…</p> : plots.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-gray-500">No resale plots are listed right now.</p>
              <Link to="/projects" className="mt-3 inline-block text-sm font-semibold text-brand-primary hover:underline">See our projects →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {plots.map((p) => <ResaleCard key={p.id} p={p} />)}
            </div>
          )}
          <p className="mt-10 text-center text-sm text-gray-500">
            Own a plot with us and want to sell it? Sign in to your <Link to="/customer-login" className="font-semibold text-brand-primary hover:underline">customer panel</Link> → Resell my plot.
          </p>
        </div>
      </section>
    </>
  )
}

function ResaleCard({ p }: { p: ResalePlot }) {
  const [asking, setAsking] = useState(false)
  const img = assetUrl(p.hero_image ?? null)
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:shadow-elegant">
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-dark">
        {img && <img src={img} alt={p.project_name ?? ''} loading="lazy" className="h-full w-full object-cover opacity-90" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-gold-metal px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-darker shadow">Resale</span>
        <div className="absolute inset-x-3 bottom-3 text-white">
          <p className="text-lg font-extrabold leading-tight">{p.project_name}{p.plot_number ? ` · Plot ${p.plot_number}` : ''}</p>
          <p className="text-xs text-white/70">{p.reference}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-2xl font-extrabold text-brand-darker">{money(p.price)}{p.negotiable && <span className="ml-2 align-middle text-xs font-semibold text-brand-primary">Negotiable</span>}</p>
        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
          {(p.location || p.city) && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-primary" />{[p.location, p.city].filter(Boolean).join(', ')}</p>}
          {p.size && <p className="flex items-center gap-2"><Ruler className="h-4 w-4 text-brand-primary" />{num(p.size)} {p.size_unit === 'sqyd' ? 'sq yd' : p.size_unit}{p.dimensions ? ` (${p.dimensions})` : ''}{p.size ? ` · ${money(Math.round(p.price / Number(p.size)))} / sq yd` : ''}</p>}
          {p.facing && <p className="flex items-center gap-2"><Compass className="h-4 w-4 text-brand-primary" />Facing {p.facing}</p>}
        </div>
        <div className="mt-auto pt-5">
          {asking ? <EnquiryForm p={p} onDone={() => setAsking(false)} /> : (
            <button onClick={() => setAsking(true)} className="btn-gold w-full rounded-xl px-5 py-2.5 text-sm">I'm interested</button>
          )}
        </div>
      </div>
    </div>
  )
}

function EnquiryForm({ p, onDone }: { p: ResalePlot; onDone: () => void }) {
  const inquire = useResaleInquire()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = name.trim() && phone.replace(/\D/g, '').length >= 10
  const field = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-brand-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20'

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    inquire.mutate({ listingId: p.id, name: name.trim(), phone, message: message.trim() }, {
      onSuccess: () => setSent(true),
      onError: (err) => setError((err as Error).message),
    })
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-brand-primary/10 p-4 text-center text-sm text-brand-darker">
        <CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-brand-primary" />
        Thank you — our office will call you about {p.reference}.
        <button onClick={onDone} className="mt-2 block w-full text-xs font-semibold text-brand-primary">Close</button>
      </div>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <input className={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className={field} placeholder="Mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      <textarea className={field} rows={2} placeholder="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
        <button type="submit" disabled={!ok || inquire.isPending} className="btn-gold flex-1 rounded-xl px-4 py-2 text-sm disabled:opacity-60">{inquire.isPending ? 'Sending…' : 'Send enquiry'}</button>
      </div>
    </form>
  )
}
