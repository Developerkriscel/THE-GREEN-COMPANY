import { config } from './config.mjs'
import { withOwner } from './db.mjs'

/*
 * The company name the office saved in Admin → Business Settings
 * (site_settings `public.brand`), for emails and generated PDFs. Cached for
 * a minute so a burst of sign-ups does not each read it; BRAND_NAME in the
 * environment is only the fallback for a missing row or a database hiccup.
 */

const TTL_MS = 60_000
let cached = null
let cachedAt = 0

export async function brandSettings() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached
  let stored = null
  try {
    stored = await withOwner(async (client) =>
      (await client.query(`select value from public.site_settings where key = 'public.brand'`)).rows[0]?.value ?? null,
    )
  } catch {
    /* fall back below */
  }
  const pick = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
  cached = {
    name: pick(stored?.name, config.brandName),
    legalName: pick(stored?.legalName, pick(stored?.name, config.brandName)),
  }
  cachedAt = Date.now()
  return cached
}

export async function brandName() {
  return (await brandSettings()).name
}
