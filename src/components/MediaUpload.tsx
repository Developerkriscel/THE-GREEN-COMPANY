import { useRef, useState } from 'react'
import clsx from 'clsx'
import { FileText, ImageUp, Loader2, Trash2, Upload, X } from 'lucide-react'
import { assetUrl, supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui'

/**
 * Upload buttons for anything the office publishes: photos, banners, project
 * images, brochures. Files go to the public-assets bucket (the company's R2
 * object storage, through the gateway) and the field keeps a RELATIVE path
 * (/storage/v1/object/public/public-assets/...) because local and live share
 * one database; the live gateway serves it on the same origin and the dev
 * server proxies /storage to the gateway.
 *
 * Works controlled (value + onChange) or inside an uncontrolled <form> (pass
 * `name` and `defaultValue`; a hidden input carries the path).
 */

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif']
const MAX_BYTES = 10 * 1024 * 1024
const PUBLIC_PREFIX = '/storage/v1/object/public/public-assets/'

const extOf = (f: File) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'application/pdf': 'pdf' } as Record<string, string>)[f.type] ?? 'bin'

async function uploadPublic(file: File, folder: string, kinds: string[]): Promise<string> {
  if (!kinds.includes(file.type)) {
    throw new Error(kinds.includes('application/pdf') && kinds.length === 1 ? 'Please choose a PDF.' : 'Please choose a PNG, JPG, WebP or AVIF image.')
  }
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is over 10 MB.`)
  const key = `${folder.replace(/[^\w/-]/g, '_')}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extOf(file)}`
  const { error } = await supabase.storage.from('public-assets').upload(key, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return PUBLIC_PREFIX + key
}

/** One image: a preview with Upload / Replace / Remove buttons. */
export function ImageUpload({
  value, defaultValue, onChange, name, folder = 'uploads', aspect = 'wide', hint,
}: {
  value?: string | null
  defaultValue?: string | null
  onChange?: (path: string | null) => void
  /** For uncontrolled forms: the FormData key the path is submitted under. */
  name?: string
  folder?: string
  aspect?: 'wide' | 'square'
  hint?: string
}) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? null)
  const current = value !== undefined ? value : inner
  const set = (v: string | null) => { if (value === undefined) setInner(v); onChange?.(v) }
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { push } = useToast()

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      set(await uploadPublic(file, folder, IMAGE_TYPES))
    } catch (e) {
      push('error', (e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const src = assetUrl(current)
  return (
    <div className="flex flex-wrap items-center gap-4">
      {name && <input type="hidden" name={name} value={current ?? ''} />}
      <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" onClick={() => input.current?.click()}
        className={clsx('group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-brand-gold/40 bg-brand-gold/[0.04] hover:bg-brand-gold/10',
          aspect === 'square' ? 'h-24 w-24' : 'h-24 w-40')}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-brand-gold-dark" />
          : src ? <img src={src} alt="" className="h-full w-full object-cover" />
          : <ImageUp className="h-6 w-6 text-brand-gold-dark" />}
      </button>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="btn-gold inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-60">
            <Upload className="h-4 w-4" /> {current ? 'Replace image' : 'Upload image'}
          </button>
          {current && (
            <button type="button" onClick={() => set(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{hint ?? 'PNG, JPG, WebP or AVIF, up to 10 MB.'}</p>
      </div>
    </div>
  )
}

/** Several images (a gallery): thumbnails with remove, plus "Add images". */
export function MultiImageUpload({
  value, defaultValue, onChange, name, folder = 'uploads', separator = '\n',
}: {
  value?: string[]
  defaultValue?: string[]
  onChange?: (paths: string[]) => void
  name?: string
  folder?: string
  /** How the hidden input joins the paths for an uncontrolled form. */
  separator?: string
}) {
  const [inner, setInner] = useState<string[]>(defaultValue ?? [])
  const list = value ?? inner
  const set = (v: string[]) => { if (value === undefined) setInner(v); onChange?.(v) }
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const { push } = useToast()

  async function pick(files: FileList | null) {
    const chosen = Array.from(files ?? [])
    if (!chosen.length) return
    setBusy(chosen.length)
    const added: string[] = []
    for (const f of chosen) {
      try { added.push(await uploadPublic(f, folder, IMAGE_TYPES)) } catch (e) { push('error', (e as Error).message) }
      setBusy((n) => n - 1)
    }
    set([...list, ...added])
    if (input.current) input.current.value = ''
  }

  return (
    <div>
      {name && <input type="hidden" name={name} value={list.join(separator)} />}
      <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(',')} className="hidden" onChange={(e) => void pick(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        {list.map((p, i) => (
          <div key={`${p}-${i}`} className="group relative h-20 w-28 overflow-hidden rounded-lg ring-1 ring-slate-200">
            <img src={assetUrl(p) ?? ''} alt="" className="h-full w-full object-cover" />
            <button type="button" aria-label="Remove" onClick={() => set(list.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button type="button" disabled={busy > 0} onClick={() => input.current?.click()}
          className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand-gold/40 text-xs font-medium text-brand-darker hover:bg-brand-gold/10 disabled:opacity-60">
          {busy > 0 ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><ImageUp className="h-5 w-5 text-brand-gold-dark" /> Add images</>}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Choose one or several at once. PNG, JPG, WebP or AVIF, up to 10 MB each.</p>
    </div>
  )
}

/** A document (brochure): Upload / Replace / Remove, with the file name. */
export function DocUpload({
  value, defaultValue, onChange, name, folder = 'documents',
}: {
  value?: string | null
  defaultValue?: string | null
  onChange?: (path: string | null) => void
  name?: string
  folder?: string
}) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? null)
  const current = value !== undefined ? value : inner
  const set = (v: string | null) => { if (value === undefined) setInner(v); onChange?.(v) }
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { push } = useToast()

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try { set(await uploadPublic(file, folder, ['application/pdf'])) } catch (e) { push('error', (e as Error).message) } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {name && <input type="hidden" name={name} value={current ?? ''} />}
      <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {current && (
        <a href={assetUrl(current) ?? '#'} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold/10 px-3 py-1.5 text-sm font-medium text-brand-darker hover:underline">
          <FileText className="h-4 w-4 text-brand-gold-dark" /> View current PDF
        </a>
      )}
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        className="btn-gold inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {current ? 'Replace PDF' : 'Upload PDF'}
      </button>
      {current && (
        <button type="button" onClick={() => set(null)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" /> Remove
        </button>
      )}
    </div>
  )
}
