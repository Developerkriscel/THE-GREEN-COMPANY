import clsx from 'clsx'
import { BRAND } from '@/lib/brand'

/**
 * The company's name as it appears everywhere the brand does: the mark, the
 * name, and the motto underneath ("You Together Make Millionaire"). All three
 * come from Business Settings (BRAND), so a change there changes every
 * header, sidebar, login page and card at once.
 *
 * `BRAND.short` carries the name ("ROYAL SYMO GREEN CITY"); whatever the full
 * name adds after it ("PRIVATE LIMITED") sits on the line below.
 */
export function BrandLockup({
  size = 'md',
  tone = 'dark',
  mark = true,
  align = 'left',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  /** dark = on a dark / green background; light = on cream or white */
  tone?: 'dark' | 'light'
  mark?: boolean
  align?: 'left' | 'center'
  className?: string
}) {
  const short = BRAND.short || BRAND.name
  const rest = BRAND.name.toUpperCase().startsWith(short.toUpperCase())
    ? BRAND.name.slice(short.length).trim()
    : ''
  const s = {
    sm: { img: 'h-12', name: 'text-[11px] tracking-[0.03em]', rest: 'text-[8px]', motto: 'text-[10px]' },
    md: { img: 'h-14', name: 'text-[13px] tracking-[0.1em]', rest: 'text-[8.5px]', motto: 'text-[10.5px]' },
    lg: { img: 'h-24', name: 'text-lg tracking-[0.1em] sm:text-xl', rest: 'text-[10px]', motto: 'text-sm' },
  }[size]

  return (
    <div className={clsx('flex items-center', size === 'sm' ? 'gap-2' : 'gap-3', align === 'center' && 'flex-col text-center', className)}>
      {mark && (
        <img
          src={BRAND.logo}
          alt=""
          className={clsx(s.img, 'w-auto shrink-0 object-contain drop-shadow')}
          onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
        />
      )}
      <div className="min-w-0 leading-tight">
        <p className={clsx(s.name, 'whitespace-nowrap font-extrabold uppercase', tone === 'dark' ? 'text-gold-metal' : 'text-brand-darker')}>{short}</p>
        {rest && (
          <p className={clsx(s.rest, 'whitespace-nowrap font-bold uppercase tracking-[0.28em]', tone === 'dark' ? 'text-white/60' : 'text-brand-gold-deep')}>{rest}</p>
        )}
        {BRAND.tagline && (
          <p className={clsx(s.motto, 'mt-0.5 whitespace-nowrap font-semibold italic', tone === 'dark' ? 'text-brand-gold-light/90' : 'text-brand-gold-deep')}>{BRAND.tagline}</p>
        )}
      </div>
    </div>
  )
}
