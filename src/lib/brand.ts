/**
 * One place for who the company is.
 *
 * The office edits these in Admin → Business Settings → Company; they are
 * stored in site_settings under `public.brand`. `loadBrand()` fetches them
 * before the app renders (src/main.tsx) and writes them into BRAND, so every
 * screen -- including text built when a page module first loads -- shows
 * what was saved. The values below are only the fallback for a missing row
 * or an unreachable server.
 *
 * The default mark (the gold coin) is cut from the brand sheet in
 * IMAGES/LOGO.jpeg, also published at `/brand-guidelines.jpg`.
 */

import { assetUrl } from '@/lib/supabase'

export interface BrandSettings {
  /** How the company refers to itself in running text. */
  name: string
  /** The short form, for a sidebar or a badge where space is tight. */
  short: string
  /** Registered name, for letters, footers and anything legal-facing. */
  legalName: string
  tagline: string
  website: string
  websiteUrl: string
  email: string
  phone: string
  /** An uploaded logo, stored as a `/storage/v1/...` path; null uses the built-in mark. */
  logoUrl: string | null
  /** The three lines the brand sheet closes on. */
  values: string[]
  compliance: string
}

export const BRAND_DEFAULTS: BrandSettings = {
  name: 'Symocity',
  short: 'Symocity',
  legalName: 'Royal Symo Green City Pvt Ltd',
  tagline: 'You Together Make Millionaire',
  website: 'symocity.com',
  websiteUrl: 'https://symocity.com',
  email: 'symocitydevelopers@gmail.com',
  phone: '9211809636',
  logoUrl: null,
  values: ['Building Communities', 'Creating Wealth', 'Sustainable Living'],
  compliance: 'RERA Compliant · Premium Real Estate Developer',
}

export const BRAND = {
  ...BRAND_DEFAULTS,
  /** Served from public/ unless the office uploaded a logo. */
  mark: '/brand-mark.jpg',
  markSquare: '/brand-mark-512.png',
  guidelines: '/brand-guidelines.jpg',
  phoneHref: 'tel:+919211809636',
}

/** Merge saved settings over the defaults, ignoring blanks. */
export function resolveBrand(stored: Partial<BrandSettings> | null | undefined): BrandSettings {
  const out = { ...BRAND_DEFAULTS }
  for (const [k, v] of Object.entries(stored ?? {})) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim()) continue
    if (Array.isArray(v) && !v.length) continue
    ;(out as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v
  }
  return out
}

/** Apply settings to BRAND and to the page chrome (title, favicon). */
export function applyBrand(stored: Partial<BrandSettings> | null | undefined) {
  const b = resolveBrand(stored)
  Object.assign(BRAND, b)
  const logo = assetUrl(b.logoUrl)
  BRAND.mark = logo || '/brand-mark.jpg'
  BRAND.markSquare = logo || '/brand-mark-512.png'
  const digits = b.phone.replace(/\D/g, '')
  BRAND.phoneHref = `tel:+${digits.length === 10 ? `91${digits}` : digits}`

  if (typeof document !== 'undefined') {
    document.title = `${b.name} — Plots, Projects & Ownership`
    if (logo) {
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')
        .forEach((l) => { l.href = logo })
    }
  }
}

/** `© 2026 Royal Symo Green City Pvt Ltd. All rights reserved.` */
export function copyright(year = new Date().getFullYear()) {
  return `© ${year} ${BRAND.legalName}. All rights reserved.`
}
