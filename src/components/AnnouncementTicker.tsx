import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, X } from 'lucide-react'
import {
  announcementIsLive, useAnnouncements,
  type Announcement, type AnnouncementPlace, type AnnouncementTheme,
} from '@/lib/announcements'

/**
 * The shopping-site style strip across the very top: a pulsing badge, the
 * offer, a live countdown to its end, a tap-to-copy coupon and a call to
 * action. Several live items rotate every few seconds (paused while the
 * pointer is on it). Closing it hides it for the rest of the browser
 * session; it comes back on the next visit, as a sale bar should.
 */

const SKIN: Record<AnnouncementTheme, { bar: string; badge: string; cta: string; chip: string; digit: string }> = {
  gold: {
    bar: 'from-[#5a3f0c] via-[#c9a14a] to-[#5a3f0c] text-[#1b2410]',
    badge: 'bg-[#1b2410] text-[#f3dc95]',
    cta: 'bg-[#1b2410] text-[#f3dc95] hover:bg-black',
    chip: 'border-[#1b2410]/50 bg-white/30 text-[#1b2410]',
    digit: 'bg-[#1b2410] text-[#f3dc95]',
  },
  sale: {
    bar: 'from-rose-700 via-red-500 to-orange-500 text-white',
    badge: 'bg-yellow-300 text-red-800',
    cta: 'bg-white text-red-700 hover:bg-yellow-100',
    chip: 'border-white/70 bg-white/15 text-white',
    digit: 'bg-black/30 text-white',
  },
  festive: {
    bar: 'from-fuchsia-700 via-rose-500 to-amber-400 text-white',
    badge: 'bg-white text-fuchsia-700',
    cta: 'bg-white text-fuchsia-700 hover:bg-amber-100',
    chip: 'border-white/70 bg-white/15 text-white',
    digit: 'bg-black/25 text-white',
  },
  leaf: {
    bar: 'from-[#12230f] via-[#3f6b1f] to-[#12230f] text-white',
    badge: 'bg-gold-metal text-[#1b2410]',
    cta: 'bg-gold-metal text-[#1b2410] hover:brightness-110',
    chip: 'border-[#e8c874]/70 bg-white/10 text-[#f3dc95]',
    digit: 'bg-black/30 text-[#f3dc95]',
  },
  midnight: {
    bar: 'from-slate-950 via-indigo-900 to-slate-950 text-white',
    badge: 'bg-gold-metal text-slate-900',
    cta: 'bg-gold-metal text-slate-900 hover:brightness-110',
    chip: 'border-[#e8c874]/70 bg-white/10 text-[#f3dc95]',
    digit: 'bg-white/10 text-[#f3dc95]',
  },
  royal: {
    bar: 'from-violet-900 via-purple-600 to-violet-900 text-white',
    badge: 'bg-amber-300 text-violet-900',
    cta: 'bg-white text-violet-800 hover:bg-amber-100',
    chip: 'border-white/70 bg-white/10 text-white',
    digit: 'bg-black/25 text-white',
  },
}

const SESSION_KEY = 'rsgc.bar.closed'

function closedIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]') as string[] } catch { return [] }
}

/** Live bar for one place (website / sponsor / customer). */
export function AnnouncementTicker({ place, onHeight }: { place: AnnouncementPlace; onHeight?: (px: number) => void }) {
  const { data = [] } = useAnnouncements(place)
  const [closed, setClosed] = useState<string[]>(closedIds)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const items = useMemo(() => data.filter((a) => announcementIsLive(a, now)), [data, now])
  const shown = items.length && !items.every((a) => closed.includes(a.id)) ? items : []

  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!onHeight) return
    const el = ref.current
    if (!el) { onHeight(0); return }
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    onHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [onHeight, shown.length])

  if (!shown.length) return null
  return (
    <div ref={ref}>
      <TickerView items={shown} onClose={() => {
        const next = [...new Set([...closed, ...items.map((a) => a.id)])]
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)) } catch { /* private window */ }
        setClosed(next)
      }} />
    </div>
  )
}

/** The bar itself, also used as the live preview in the CMS editor. */
export function TickerView({ items, onClose, preview = false }: { items: Announcement[]; onClose?: () => void; preview?: boolean }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = items.length
  const idx = n ? i % n : 0
  useEffect(() => {
    if (n < 2 || paused) return
    const t = setInterval(() => setI((x) => x + 1), 5500)
    return () => clearInterval(t)
  }, [n, paused])
  if (!n) return null
  const a = items[idx]
  const skin = SKIN[a.theme] ?? SKIN.gold

  return (
    <div
      role="region" aria-label="Offers and announcements"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      className={clsx('ann-bar relative overflow-hidden bg-gradient-to-r bg-[length:200%_100%]', skin.bar)}
    >
      <span className="ann-shine pointer-events-none absolute inset-y-0 w-1/3" aria-hidden />
      <div className="relative mx-auto flex max-w-screen-xl items-center gap-2 px-2 py-1.5 sm:px-4">
        {n > 1 && (
          <button type="button" aria-label="Previous offer" onClick={() => setI((x) => x - 1 + n)}
            className="hidden shrink-0 rounded-full p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100 sm:block">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div key={`${a.id}-${idx}`} className="ann-in flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          {(a.badge || a.emoji) && (
            <span className={clsx('ann-pulse inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider shadow-sm', skin.badge)}>
              {a.emoji && <span aria-hidden>{a.emoji}</span>}{a.badge}
            </span>
          )}
          <span className="min-w-0 text-[13px] font-semibold leading-snug sm:text-sm">{a.message}</span>
          {a.show_countdown && a.ends_at && <Countdown to={a.ends_at} digit={skin.digit} />}
          {a.coupon_code && <Coupon code={a.coupon_code} chip={skin.chip} />}
          {a.cta_label && a.cta_link && (
            <Cta link={a.cta_link} preview={preview}
              className={clsx('group inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow transition', skin.cta)}>
              {a.cta_label} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Cta>
          )}
        </div>

        {n > 1 && (
          <>
            <div className="hidden shrink-0 items-center gap-1 md:flex" aria-hidden>
              {items.map((it, j) => <span key={it.id} className={clsx('h-1.5 rounded-full bg-current transition-all', j === idx ? 'w-4 opacity-90' : 'w-1.5 opacity-40')} />)}
            </div>
            <button type="button" aria-label="Next offer" onClick={() => setI((x) => x + 1)}
              className="hidden shrink-0 rounded-full p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100 sm:block">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose}
            className="shrink-0 rounded-full p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function Cta({ link, preview, className, children }: { link: string; preview: boolean; className: string; children: React.ReactNode }) {
  if (preview) return <span className={className}>{children}</span>
  return /^https?:\/\//i.test(link)
    ? <a href={link} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <Link to={link} className={className}>{children}</Link>
}

function Countdown({ to, digit }: { to: string; digit: string }) {
  const end = Date.parse(to)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  if (Number.isNaN(end) || end <= now) return null
  let s = Math.floor((end - now) / 1000)
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  const parts: [number, string][] = d > 0 ? [[d, 'd'], [h, 'h'], [m, 'm'], [s, 's']] : [[h, 'h'], [m, 'm'], [s, 's']]
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold" aria-label="Offer ends in">
      <span className="hidden opacity-80 sm:inline">Ends in</span>
      {parts.map(([v, u]) => (
        <span key={u} className={clsx('min-w-[2.1rem] rounded-md px-1 py-0.5 text-center font-mono tabular-nums', digit)}>
          {String(v).padStart(2, '0')}<span className="text-[9px] opacity-75">{u}</span>
        </span>
      ))}
    </span>
  )
}

function Coupon({ code, chip }: { code: string; chip: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button"
      onClick={() => { void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }}
      className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dashed px-2 py-0.5 text-xs font-bold tracking-wider transition hover:scale-[1.03]', chip)}
      title="Copy code">
      <span className="font-normal opacity-80">Code</span> {code}
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

/** A compact sample of a colour theme, for the CMS theme picker. */
export function ThemeSwatch({ theme, label }: { theme: AnnouncementTheme; label: string }) {
  const s = SKIN[theme] ?? SKIN.gold
  return (
    <div className={clsx('ann-bar flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r bg-[length:200%_100%] px-2 text-xs font-bold', s.bar)}>
      <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider', s.badge)}>Sale</span>
      <span className="truncate">{label}</span>
    </div>
  )
}
