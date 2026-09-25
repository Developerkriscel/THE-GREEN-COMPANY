import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal .env reader — same approach as scripts/apply-schema.mjs, no dependency. */
function envFile() {
  const file = path.join(ROOT, '.env')
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[line.slice(0, eq).trim()] = value
  }
  return out
}

const file = envFile()
const get = (key, fallback) => process.env[key] ?? file[key] ?? fallback

export const config = {
  port: Number(get('API_PORT', 54321)),

  // Use the POOLED endpoint here: the gateway opens a connection per request,
  // which is exactly what PgBouncer is for. (DDL and the test suites use the
  // direct endpoint instead — see .env.)
  databaseUrl: get('DATABASE_URL_POOLED') || get('DATABASE_URL'),

  // Fallback for when the pooler endpoint is unreachable (it is a separate
  // host, and it can be down or blocked while the direct one is fine). The
  // gateway probes at startup and switches to this rather than serving a wall
  // of connection timeouts. Null when both names resolve to the same URL.
  directDatabaseUrl:
    get('DATABASE_URL') && get('DATABASE_URL') !== (get('DATABASE_URL_POOLED') || get('DATABASE_URL'))
      ? get('DATABASE_URL')
      : null,

  /**
   * Signs the access tokens this gateway issues, and is the secret the anon key
   * is signed with. Must be at least 32 chars. Generated into .env on first run
   * if absent — see server/index.mjs.
   */
  jwtSecret: get('API_JWT_SECRET', ''),

  jwtExpirySeconds: Number(get('API_JWT_EXPIRY', 3600)),
  refreshExpirySeconds: Number(get('API_REFRESH_EXPIRY', 60 * 60 * 24 * 7)),

  // Legacy local storage dir (kept for backward compat if R2 not configured)
  storageDir: path.join(ROOT, 'server', '.storage'),

  // Cloudflare R2 — server-side only (no VITE_ prefix)
  r2AccessKeyId: get('R2_ACCESS_KEY_ID', ''),
  r2SecretAccessKey: get('R2_SECRET_ACCESS_KEY', ''),
  r2Bucket: get('R2_BUCKET', ''),
  r2Endpoint: get('R2_ENDPOINT', ''),

  corsOrigin: get('APP_BASE_URL', 'http://localhost:5173'),

  /**
   * Set NODE_ENV=production on the live server. It turns a missing mail
   * setup from "print to the console" into a hard error, because in
   * production nobody is reading the console.
   */
  isProduction: get('NODE_ENV', '') === 'production',

  // Outgoing mail (sign-up codes, password reset). Any SMTP provider; see
  // server/mailer.mjs for Gmail and Brevo settings, both free.
  smtpHost: get('SMTP_HOST', ''),
  smtpPort: get('SMTP_PORT', '465'),
  smtpUser: get('SMTP_USER', ''),
  smtpPass: get('SMTP_PASS', ''),
  mailFrom: get('MAIL_FROM', ''),

  /** The company name mail is signed with. Keep in step with src/lib/brand.ts. */
  brandName: get('BRAND_NAME', 'Symocity'),

  // Schemas the REST layer will expose. `public` only, deliberately: exposing
  // `auth` or `storage` over HTTP would hand out the user table.
  exposedSchema: 'public',
}

if (!config.databaseUrl) {
  console.error('[config] No DATABASE_URL_POOLED or DATABASE_URL in .env — cannot start.')
  process.exit(1)
}
