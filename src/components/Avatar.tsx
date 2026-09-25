import { useState } from 'react'
import clsx from 'clsx'
import { useAvatarUrl } from '@/lib/avatar'
import { initials } from '@/lib/format'

/**
 * A member's photo, falling back to their initials.
 *
 * The initials show while the signed URL is being fetched and whenever the
 * image fails to load, so a slow network or an expired link never leaves an
 * empty box or a broken-image icon where a face should be.
 */
export function Avatar({
  path,
  name,
  size = 36,
  className,
  rounded = 'full',
  tone = 'neutral',
}: {
  path: string | null | undefined
  name: string | null | undefined
  /** Pixel size of the square. */
  size?: number
  className?: string
  rounded?: 'full' | 'xl'
  /** Colour of the initials fallback; the photo, when there is one, replaces it. */
  tone?: 'neutral' | 'brand'
}) {
  const { data: url } = useAvatarUrl(path)
  const [failed, setFailed] = useState(false)
  const shape = rounded === 'full' ? 'rounded-full' : 'rounded-xl'
  const showPhoto = Boolean(url) && !failed

  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold',
        tone === 'brand' ? 'bg-[#ea580c] text-white shadow' : 'bg-slate-200 text-slate-700',
        shape,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {showPhoto ? (
        <img
          src={url!}
          alt={name ?? 'Profile photo'}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  )
}
