/**
 * The demo logins the HTTP tests sign in with. Passwords are not in the
 * repository: they come from the git-ignored .claude/rsgc-credentials.json
 * (written when the RSGC logins were issued), or from TEST_* env variables.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const file = path.join(root, '.claude', 'rsgc-credentials.json')
const byEmail = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}

/** The password issued for this login e-mail (throws if unknown, so a test fails loudly). */
export function passwordFor(email) {
  const pw = byEmail[String(email).toLowerCase()]
  if (!pw) throw new Error(`No password on file for ${email} — see .claude/rsgc-credentials.json`)
  return pw
}

const account = (envEmail, envPw, email) => {
  const e = process.env[envEmail] ?? email
  return { email: e, get password() { return process.env[envPw] ?? passwordFor(e) } }
}
export const ADMIN = account('TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD', 'admin@rsgc.local')
export const REP = account('TEST_REP_EMAIL', 'TEST_REP_PASSWORD', 'rep@rsgc.local')
