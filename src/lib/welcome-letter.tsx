import type { Profile } from '@/lib/types'
import { date } from '@/lib/format'
import { BRAND } from '@/lib/brand'

export interface WelcomeLetter {
  brand_title: string
  subtitle: string
  ref_prefix: string
  heading: string
  salutation: string
  paragraphs: string[]
  closing: string
  signatory: string
  company_line: string
  footer_slogan: string
}

export const WELCOME_DEFAULTS: WelcomeLetter = {
  brand_title: BRAND.name,
  subtitle: BRAND.tagline.toUpperCase(),
  ref_prefix: 'WL//',
  heading: `Welcome to the ${BRAND.name}`,
  salutation: 'Dear {{name}},',
  paragraphs: [
    `On behalf of the entire team at ${BRAND.name}, we extend a warm welcome to you as our valued {{rank}}. Your decision to join our growing family is a step toward financial freedom, recognition, and a rewarding journey in the real-estate industry.`,
    'Your membership has been successfully activated. Please find your registration details below — preserve this letter for your records. {{joined}}',
    `As a ${BRAND.name} partner, you are now entitled to direct sponsor income, level-based commissions, rank rewards, and exclusive access to our premium plot inventory.`,
    'We encourage you to complete your KYC at the earliest, share your referral link, and engage with your upline to fast-track your first rank achievement. Our support team is available to assist you at every step of your journey.',
    'Once again, welcome aboard. We look forward to celebrating your milestones with you.',
    `Visit Website: ${BRAND.websiteUrl}/`,
  ],
  closing: 'Warm regards,',
  signatory: 'Managing Director',
  company_line: '',
  footer_slogan: BRAND.tagline,
}

/** Merge a partial stored letter over the defaults. */
export function resolveWelcomeLetter(stored: Partial<WelcomeLetter> | null | undefined): WelcomeLetter {
  const s = stored ?? {}
  return {
    ...WELCOME_DEFAULTS,
    ...s,
    paragraphs: Array.isArray(s.paragraphs) && s.paragraphs.length ? s.paragraphs : WELCOME_DEFAULTS.paragraphs,
  }
}

/** Fill {{placeholders}} from a member profile. */
export function fillPlaceholders(text: string, member: Profile | null | undefined): string {
  if (!member) return text
  const map: Record<string, string> = {
    name: member.full_name || '',
    id: member.member_code || member.user_code || '',
    rank: member.rank?.name || 'Partner',
    joined: member.created_at ? `Joined on ${date(member.created_at)}.` : '',
    email: member.email || '',
    phone: member.phone || '',
    sponsorName: member.referrer?.full_name || '',
    sponsorId: member.referrer?.member_code || '',
    date: date(new Date().toISOString()),
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => map[k] ?? `{{${k}}}`)
}

/** Rendered welcome letter, placeholders resolved against `member`. */
export function WelcomeLetterView({ letter, member }: { letter: WelcomeLetter; member: Profile | null | undefined }) {
  const fill = (t: string) => fillPlaceholders(t, member)
  return (
    <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
      <header className="border-b border-slate-100 pb-6 text-center">
        <h1 className="text-2xl font-extrabold text-[oklch(20%_.06_260)]">{fill(letter.brand_title)}</h1>
        <p className="mt-1 text-sm italic text-[oklch(54%_.19_40)]">{fill(letter.subtitle)}</p>
      </header>

      <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
        <span>Ref: {letter.ref_prefix}{member?.member_code ?? ''}</span>
        <span>{fill('{{date}}')}</span>
      </div>

      <h2 className="mt-6 text-lg font-bold text-[oklch(20%_.06_260)]">{fill(letter.heading)}</h2>
      <p className="mt-4 font-medium text-slate-800">{fill(letter.salutation)}</p>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
        {letter.paragraphs.map((p, i) => (
          <p key={i}>{fill(p)}</p>
        ))}
      </div>

      <div className="mt-8">
        <p className="text-sm text-slate-700">{fill(letter.closing)}</p>
        <p className="mt-1 text-sm font-bold text-slate-900">{fill(letter.signatory)}</p>
        {letter.company_line && <p className="text-xs text-slate-500">{fill(letter.company_line)}</p>}
      </div>

      <footer className="mt-8 border-t border-slate-100 pt-4 text-center text-xs italic text-[oklch(54%_.19_40)]">
        {fill(letter.footer_slogan)}
      </footer>
    </article>
  )
}
