import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useProjects, useSiteSetting } from '@/lib/queries'
import { Button, Card, CardBody, ErrorState, Field, Input, Select, Textarea } from '@/components/ui'
import { CheckCircle2 } from 'lucide-react'
import { BRAND } from '@/lib/brand'

const BRANCHES = [
  'ILD / Gurgaon',
  'Sector 47 / Gurgaon',
  'Delhi',
  'Dwarka / Delhi',
  'Kapashera / Delhi',
]

const CONTACT_DEFAULTS = {
  hero_title: `Talk to ${BRAND.name}`,
  hero_subtitle: 'Talk to a sales partner. No obligation — we never share your details.',
  phone: '+91 9211809636',
  email: BRAND.email,
  address: 'ILD Trade Centre Mall, Sector-47, Gurugram, Haryana, India',
  whatsapp: '9211809636',
  branches: '',
}

export function ContactPage() {
  const { data: cfg } = useSiteSetting('public.contact')
  const c = { ...CONTACT_DEFAULTS, ...(cfg ?? {}) }
  const waDigits = (c.whatsapp || c.phone).replace(/\D/g, '')
  const infoItems = [
    { icon: '📞', label: 'Phone / WhatsApp', value: c.phone, href: `tel:${c.phone.replace(/\s/g, '')}` },
    { icon: '✉️', label: 'Email', value: c.email, href: `mailto:${c.email}` },
    { icon: '📍', label: 'Head Office', value: c.address, href: '#' },
  ]
  const branches = c.branches ? c.branches.split('\n').map((s) => s.trim()).filter(Boolean) : BRANCHES
  return (
    <>
      {/* Hero */}
      <section
        className="py-20 text-white text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 45%, oklch(62% .19 43) 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Get in Touch</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">{c.hero_title}</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            {c.hero_subtitle}
          </p>
          <p className="mt-3 mx-auto max-w-lg text-sm text-white/40">
            Our team responds within 24 hours. For urgent help, call our mentor line.
          </p>
        </div>
      </section>

      {/* Contact info + form */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14">
            {/* Left: info */}
            <div>
              <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)]">Reach Us</span>
              <h2 className="mt-3 text-3xl font-extrabold text-[oklch(14%_.05_260)]">{BRAND.name}</h2>
              <p className="mt-4 text-gray-500 leading-relaxed">
                We operate from multiple locations across Delhi-NCR. Reach us by phone, WhatsApp, or visit our head office.
              </p>

              <div className="mt-8 space-y-5">
                {infoItems.map(item => (
                  <a key={item.label} href={item.href}
                    className="flex items-start gap-4 group rounded-xl border border-gray-100 bg-gray-50 p-4 hover:border-[oklch(62%_.19_43)]/30 hover:shadow-elegant transition-all">
                    <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-[oklch(62%_.19_43)]/10 flex items-center justify-center text-xl">
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[oklch(62%_.19_43)]">{item.label}</p>
                      <p className="mt-0.5 text-sm font-medium text-[oklch(14%_.05_260)]">{item.value}</p>
                    </div>
                  </a>
                ))}
              </div>

              {/* Branches */}
              <div className="mt-10">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(14%_.05_260)] mb-4">Our Branches</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {branches.map(b => (
                    <div key={b} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <span className="text-[oklch(62%_.19_43)]">📌</span>
                      <span className="text-sm font-medium text-gray-700">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp CTA */}
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer"
                className="mt-8 flex items-center gap-3 rounded-xl px-6 py-4 text-white font-bold shadow-lg hover:-translate-y-0.5 transition-all"
                style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}>
                <svg className="h-6 w-6 fill-white flex-shrink-0" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Chat on WhatsApp: {c.phone}
              </a>
            </div>

            {/* Right: form */}
            <div>
              <span className="text-xs font-bold uppercase tracking-[.2em] text-[oklch(62%_.19_43)]">Send Enquiry</span>
              <h2 className="mt-3 text-3xl font-extrabold text-[oklch(14%_.05_260)] mb-8">We'll Call You Back</h2>
              <Card>
                <CardBody>
                  <EnquiryForm />
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function EnquiryForm({ projectId, compact = false }: { projectId?: string; compact?: boolean }) {
  const { data: projects = [] } = useProjects({ publishedOnly: true })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSending(true)
    const form = new FormData(e.currentTarget)

    const { error: rpcError } = await supabase.rpc('submit_enquiry', {
      p_name: String(form.get('name') ?? ''),
      p_mobile: String(form.get('mobile') ?? ''),
      p_email: String(form.get('email') ?? '') || null,
      p_project_id: (form.get('project_id') as string) || projectId || null,
      p_budget: form.get('budget') ? Number(form.get('budget')) : null,
      p_visit_date: (form.get('visit_date') as string) || null,
      p_message: String(form.get('message') ?? '') || null,
    })

    setSending(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-[oklch(62%_.19_43)]" />
        <p className="text-sm font-semibold text-[oklch(14%_.05_260)]">Thank you — we have your enquiry.</p>
        <p className="max-w-sm text-sm text-gray-500">A sales partner will call you shortly.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setSent(false)}>Send another</Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!compact && <h2 className="text-base font-semibold text-[oklch(14%_.05_260)]">Send an enquiry</h2>}
      {error && <ErrorState error={error} />}
      <Field label="Full name" required>
        <Input name="name" required placeholder="Your name" autoComplete="name" />
      </Field>
      <Field label="Mobile number" required>
        <Input name="mobile" required placeholder="10-digit mobile" inputMode="tel" autoComplete="tel" />
      </Field>
      {!compact && (
        <Field label="Email">
          <Input name="email" type="email" placeholder="you@example.com" autoComplete="email" />
        </Field>
      )}
      {!projectId && (
        <Field label="Project of interest">
          <Select name="project_id" defaultValue="">
            <option value="">Any / not sure yet</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Budget (₹)">
          <Input name="budget" type="number" min={0} step={50000} placeholder="e.g. 2500000" />
        </Field>
        <Field label="Preferred visit date">
          <Input name="visit_date" type="date" />
        </Field>
      </div>
      <Field label="Message">
        <Textarea name="message" rows={compact ? 2 : 3} placeholder="Anything specific you are looking for?" />
      </Field>
      <Button type="submit" loading={sending} className="w-full">Submit enquiry</Button>
      <p className="text-center text-[11px] text-gray-400">By submitting you agree to be contacted about this enquiry.</p>
    </form>
  )
}
