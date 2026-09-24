#!/usr/bin/env node
/**
 * Apply ONE migration file to the database in a single transaction.
 *
 *   node scripts/apply-migration.mjs supabase/migrations/20260201000500_sponsor_panel.sql
 *
 * apply-schema.mjs replays the whole chain; this is for adding a single new
 * migration to a database that already has the schema. Same connection rules:
 * DATABASE_URL from the environment, else from .env.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function envFileValue(key) {
  const envPath = path.join(ROOT, '.env')
  if (!existsSync(envPath)) return undefined
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    if (line.slice(0, eq).trim() !== key) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value || undefined
  }
  return undefined
}

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/apply-migration.mjs <path-to.sql>')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL ?? envFileValue('DATABASE_URL')
if (!connectionString) {
  console.error('No DATABASE_URL in the environment or .env')
  process.exit(1)
}

const sql = readFileSync(path.resolve(ROOT, file), 'utf8')
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log(`applied ${path.basename(file)}`)
} catch (err) {
  await client.query('rollback')
  console.error(`FAILED ${path.basename(file)}: ${err.message}`)
  if (err.position) {
    const at = Number(err.position)
    console.error('near ->', sql.slice(Math.max(0, at - 250), at + 250))
  }
  process.exitCode = 1
} finally {
  await client.end()
}
