import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, PartyPopper, TriangleAlert, X, Tag } from 'lucide-react'
import { bannerIsLive, useSponsorBanners, type Banner, type BannerTone } from '@/lib/queries'

/**
 * The announcement strip across the top of the sponsor panel — the ribbon a
 * shopping app runs for a sale. The office writes these in Website CMS; a
 * member only ever reads them.
 *
 * A dismissal is remembered per banner id, per browser, in localStorage. That
 * is deliberately not stored server-side: it is a convenience, not a record,
 * and it must never be the reason a member misses a later announcement. A
 * banner the office edits keeps its id, so re-issuing a dismissed message
 * means a new row rather than an edit.
 */

const DISMISSED_KEY = 'rgc.banners.dismissed'

const SKIN: Record<BannerTone, { wrap: string; icon: typeof Megaphone; cta: string }> = {
  info: {
    wrap: 'bg-blue-50 text-blue-900 ring-blue-200',
    icon: Megaphone,
    cta: 'bg-blue-600 text-white hover:bg-blue-700',
  },
  success: {
    wrap: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    icon: PartyPopper,
    cta: 'bg-emerald-600 text-white hover:bg-emerald-700',
  },
  warn: {
    wrap: 'bg-amber-50 text-amber-900 ring-amber-200',
    icon: TriangleAlert,
    cta: 'bg-amber-600 text-white hover:bg-amber-700',
  },
  offer: {
    wrap: 'bg-gradient-to-r from-orange-500 to-rose-500 text-white ring-orange-300',
    icon: Tag,
    cta: 'bg-white text-orange-700 hover:bg-orange-50',
  },
}

/** Read the dismissed list. Storage can throw in a private window. */
function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    // Storage blocked or full. The banner stays hidden for this page view,
    // which is the behaviour the member just asked for; it simply comes back
    // on the next load. Better than failing the click.
  }
}

export function AnnouncementBar() {
  const { data: banners = [] } = useSponsorBanners()
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  // Drop remembered ids whose banner no longer exists, so the list cannot grow
  // without bound as the office retires old announcements.
  useEffect(() => {
    if (banners.length === 0) return
    const live = new Set(banners.map((b) => b.id))
    setDismissed((prev) => {
      const kept = prev.filter((id) => live.has(id))
      if (kept.length !== prev.length) writeDismissed(kept)
      return kept.length === prev.length ? prev : kept
    })
  }, [banners])

  const showing = banners.filter((b) => bannerIsLive(b) && !dismissed.includes(b.id))
  if (showing.length === 0) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    writeDismissed(next)
  }

  return (
    <div className="space-y-2">
      {showing.map((b) => (
        <BannerRow key={b.id} banner={b} onDismiss={() => dismiss(b.id)} />
      ))}
    </div>
  )
}

function BannerRow({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  const skin = SKIN[banner.tone] ?? SKIN.info
  const Icon = skin.icon
  const isOffer = banner.tone === 'offer'
  // An external link must not go through the router, or it resolves as a path.
  const external = /^https?:\/\//i.test(banner.cta_link ?? '')

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ring-1 ${skin.wrap}`}>
      {banner.image_url ? (
        <img
          src={banner.image_url}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`shrink-0 rounded-lg p-1.5 ${isOffer ? 'bg-white/20' : 'bg-white/60'}`}>
          <Icon className="h-4 w-4" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{banner.title}</p>
        {banner.subtitle && (
          <p className={`text-xs leading-snug ${isOffer ? 'text-white/85' : 'opacity-80'}`}>
            {banner.subtitle}
          </p>
        )}
      </div>

      {banner.cta_label && banner.cta_link && (
        external ? (
          <a
            href={banner.cta_link}
            target="_blank"
            rel="noopener noreferrer"
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${skin.cta}`}
          >
            {banner.cta_label}
          </a>
        ) : (
          <Link
            to={banner.cta_link}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${skin.cta}`}
          >
            {banner.cta_label}
          </Link>
        )
      )}

      {banner.dismissible && (
        <button
          onClick={onDismiss}
          aria-label={`Dismiss: ${banner.title}`}
          className={`shrink-0 rounded-lg p-1.5 transition ${isOffer ? 'hover:bg-white/20' : 'hover:bg-black/5'}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
