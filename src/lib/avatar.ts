import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Profile photos.
 *
 * Stored in the private `avatars` bucket on Cloudflare R2 as
 * `<member id>/<timestamp>.jpg`, and read back through short-lived signed
 * URLs. The storage policies only let a member write inside their own folder;
 * profiles_guard stops avatar_path pointing anywhere else.
 */

const BUCKET = 'avatars'
/** Longest edge after resizing. Big enough for a printed ID card, small enough to load instantly. */
const MAX_EDGE = 512
/** How long a signed URL lives. Refetched before it runs out. */
const URL_TTL = 60 * 60

/**
 * A signed URL for a stored photo, or null when there is none.
 * Keyed on the path, so every screen showing the same member shares one fetch.
 */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar-url', path],
    enabled: Boolean(path),
    staleTime: (URL_TTL - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, URL_TTL)
      if (error) throw new Error(error.message)
      // The gateway returns a path relative to its own origin.
      const url = data?.signedUrl ?? null
      if (!url) return null
      if (/^https?:\/\//.test(url)) return url
      const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
      return `${base}/storage/v1${url.startsWith('/') ? '' : '/'}${url}`
    },
  })
}

/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A phone photo is 3-8 MB; the bucket takes 2 MB. Re-encoding to a 512px
 * JPEG brings it to ~50 KB, strips the EXIF (which can carry the GPS position
 * the picture was taken at), and makes every later view of it fast.
 */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Please choose a JPG, PNG or WebP photo.')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images.')
  // White under any transparency, since JPEG has no alpha.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Could not process that photo.')
  return blob
}

export function useUploadAvatar(memberId: string | undefined, currentPath: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      if (!memberId) throw new Error('Not signed in')
      const blob = await shrink(file)
      // A new name every time: a fresh path means no cached copy of the old
      // photo can survive under the same URL.
      const path = `${memberId}/${Date.now()}.jpg`

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw new Error(upErr.message)

      const { error: dbErr } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', memberId)
      if (dbErr) throw new Error(dbErr.message)

      // The previous photo is no longer referenced by anything.
      if (currentPath && currentPath !== path) {
        await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {})
      }
      return path
    },
    onSuccess: () => invalidateProfile(qc, memberId),
  })
}

export function useRemoveAvatar(memberId: string | undefined, currentPath: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!memberId) throw new Error('Not signed in')
      const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', memberId)
      if (error) throw new Error(error.message)
      if (currentPath) await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {})
    },
    onSuccess: () => invalidateProfile(qc, memberId),
  })
}

function invalidateProfile(qc: ReturnType<typeof useQueryClient>, memberId: string | undefined) {
  void qc.invalidateQueries({ queryKey: ['sponsor-profile', memberId] })
  void qc.invalidateQueries({ queryKey: ['member'] })
  void qc.invalidateQueries({ queryKey: ['members'] })
  void qc.invalidateQueries({ queryKey: ['profile'] })
}
