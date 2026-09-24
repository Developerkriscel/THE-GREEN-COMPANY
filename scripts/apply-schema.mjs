#!/usr/bin/env node
/**
 * Apply the Royal Green schema to any Postgres database.
 *
 *   node scripts/apply-schema.mjs "postgresql://user:pass@host:5432/db" [flags]
 *   DATABASE_URL=... node scripts/apply-schema.mjs [flags]
 *
 * Flags:
 *   --shim     install the plain-Postgres compatibility layer first (auth/storage
 *              schemas, anon/authenticated roles). Use on a stock Postgres; omit
 *              on a real Supabase database, which already has all of it.
 *   --test     run the pgTAP RLS suite afterwards (skipped with a warning if the
 *              pgtap extension is not installable on the target).
 *   --check    connect and report what is already there, change nothing.
 *   --drop     DESTRUCTIVE. Drop the app's objects before applying. Requires
 *              typing the database name at the prompt.
 *   --ssl      force TLS (most managed Postgres providers need this).
 *
 * Why Node rather than psql: this machine has no psql on PATH, its Docker engine
 * is currently read-only, and the Supabase CLI is blocked by Application
 * Control. node-postgres needs none of them. It also sends each .sql file as a
 * single simple query, so Postgres itself parses the dollar-quoted function
 * bodies — no fragile client-side statement splitting — and each file lands in
 * one implicit transaction, making it all-or-nothing.
 */

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))

/**
 * Read DATABASE_URL out of .env so a live credential never has to be typed on a
 * command line (where it lands in shell history) or pasted into a chat. .env is
 * gitignored. Deliberately minimal — no dependency, and it only looks for the
 * one key this script needs.
 */
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
    // Tolerate quoting; Neon's console copies the URI bare, but people add quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value || undefined
  }
  return undefined
}

const connectionString =
  argv.find((a) => !a.startsWith('--')) ?? process.env.DATABASE_URL ?? envFileValue('DATABASE_URL')

// Neon (and most managed Postgres) require TLS. Their URI carries sslmode=require,
// which node-postgres does not act on by itself, so infer it rather than making
// the user remember --ssl.
const needsSsl =
  flags.has('--ssl') ||
  /[?&]sslmode=(require|verify-ca|verify-full)/.test(connectionString ?? '') ||
  /\.neon\.tech|\.supabase\.co|\.render\.com|\.railway\.app|\.aws\.neon\.build/.test(
    connectionString ?? '',
  )

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

if (!connectionString) {
  console.error(`
${c.bold('No connection string.')} Looked in: argv, $DATABASE_URL, and .env

${c.bold('Recommended')} — put it in .env (gitignored, keeps it out of shell history):

  DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require

then just run:

  node scripts/apply-schema.mjs --shim --check

Or pass it directly:

  node scripts/apply-schema.mjs "postgresql://..." --shim

Flags: --shim --test --check --drop --ssl
`)
  process.exit(64)
}

/** Never print credentials back to the terminal or into a log. */
function redact(url) {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return url.replace(/:\/\/[^@]*@/, '://***@')
  }
}

const client = new pg.Client({
  connectionString,
  ssl: flags.has('--ssl') ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 120_000,
})

async function sqlFiles() {
  const dir = path.join(ROOT, 'supabase/migrations')
  const names = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  return names.map((n) => path.join(dir, n))
}

async function runFile(file) {
  const label = path.basename(file)
  const sql = await readFile(file, 'utf8')
  process.stdout.write(`  ${c.cyan('==>')} ${label} `)
  const started = Date.now()
  try {
    await client.query(sql)
    console.log(c.green(`ok`) + c.dim(` (${Date.now() - started}ms)`))
  } catch (err) {
    console.log(c.red('FAILED'))
    console.error(`
${c.red('  ' + (err.severity ?? 'ERROR') + ':')} ${err.message}`)
    if (err.detail) console.error(`  detail: ${err.detail}`)
    if (err.hint) console.error(`  hint:   ${err.hint}`)
    if (err.where) console.error(`  where:  ${String(err.where).split('\n')[0]}`)
    if (err.position) {
      // Turn the byte offset into something a human can actually find.
      const upto = sql.slice(0, Number(err.position))
      const line = upto.split('\n').length
      const snippet = sql.split('\n')[line - 1]?.trim()
      console.error(`  at:     ${label}:${line}`)
      if (snippet) console.error(`          ${c.dim(snippet.slice(0, 120))}`)
    }
    console.error(`
${c.yellow('Nothing further was applied.')} This file ran in a single implicit
transaction, so it rolled back cleanly — the database is as it was before it.
`)
    err.__reported = true // already printed in detail above; don't repeat it
    throw err
  }
}

async function describe() {
  const { rows } = await client.query(`
    select
      current_database()                                                        as database,
      current_user                                                              as connected_as,
      (select setting from pg_settings where name = 'server_version')           as version,
      (select count(*) from pg_tables      where schemaname = 'public')         as public_tables,
      (select count(*) from pg_policies    where schemaname = 'public')         as policies,
      (select count(*) from pg_tables
        where schemaname = 'public' and rowsecurity)                            as rls_tables,
      to_regclass('public.profiles')     is not null                            as has_profiles,
      to_regclass('public.ranks')        is not null                            as has_ranks,
      to_regclass('auth.users')          is not null                            as has_auth_users,
      to_regclass('storage.objects')     is not null                            as has_storage,
      exists (select 1 from pg_roles where rolname = 'authenticated')           as has_authenticated_role,
      exists (select 1 from pg_roles where rolname = 'anon')                    as has_anon_role
  `)
  return rows[0]
}

async function main() {
  console.log(`\n${c.bold('Royal Green — schema apply')}`)
  console.log(`${c.dim('target:')} ${redact(connectionString)}\n`)

  await client.connect()
  const before = await describe()

  console.log(`  ${c.dim('database')}      ${before.database}`)
  console.log(`  ${c.dim('server')}        PostgreSQL ${before.version}`)
  console.log(`  ${c.dim('connected as')}  ${before.connected_as}`)
  console.log(`  ${c.dim('public tables')} ${before.public_tables}`)
  console.log(
    `  ${c.dim('supabase-ish')}  auth.users=${before.has_auth_users} storage=${before.has_storage} ` +
      `roles(anon/authenticated)=${before.has_anon_role}/${before.has_authenticated_role}`,
  )

  if (flags.has('--check')) {
    const already = before.has_profiles || before.has_ranks
    console.log(
      `\n  ${already ? c.yellow('Royal Green schema is already present.') : c.green('No Royal Green schema here yet.')}`,
    )
    if (!before.has_auth_users || !before.has_anon_role) {
      console.log(
        `  ${c.yellow('Not a Supabase database')} — run with ${c.bold('--shim')} to install the ` +
          `auth/storage stand-ins first.`,
      )
    }
    await client.end()
    return
  }

  // Refuse to half-apply over an existing install; the migrations use plain
  // CREATE TABLE and would fail partway, which is the worst outcome.
  if ((before.has_profiles || before.has_ranks) && !flags.has('--drop') && !flags.has('--test-only')) {
    console.error(`
${c.red('The Royal Green schema already exists in this database.')}

The migrations use plain CREATE TABLE, so re-applying them would fail partway
and leave you worse off. Point this at a scratch database, or re-run with
${c.bold('--drop')} to remove the existing objects first (destructive, prompts for confirmation).
`)
    await client.end()
    process.exit(1)
  }

  if (flags.has('--drop')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    console.log(`\n${c.red(c.bold('DESTRUCTIVE.'))} This drops the public, auth and storage schemas in`)
    console.log(`${c.bold(before.database)} and everything in them.`)
    const answer = await rl.question(`Type the database name to confirm: `)
    rl.close()
    if (answer.trim() !== before.database) {
      console.error(c.yellow('\nDid not match. Nothing was dropped.'))
      await client.end()
      process.exit(1)
    }
    process.stdout.write(`  ${c.cyan('==>')} dropping `)
    await client.query(`
      drop schema if exists public  cascade;
      drop schema if exists app     cascade;
      drop schema if exists tests   cascade;
      drop schema if exists storage cascade;
      drop schema if exists auth    cascade;
      create schema public;
    `)
    console.log(c.green('ok'))
  }

  const testOnly = flags.has('--test-only')

  if (flags.has('--shim') && !testOnly) {
    console.log(`\n${c.bold('Compatibility shim')}`)
    await runFile(path.join(ROOT, 'supabase/compat/00_plain_postgres_shim.sql'))
  }

  if (!testOnly) {
    console.log(`\n${c.bold('Migrations')}`)
    for (const file of await sqlFiles()) await runFile(file)
  }

  const after = await describe()
  console.log(`\n${c.bold('Result')}`)
  console.log(`  tables          ${after.public_tables}`)
  console.log(`  RLS enabled on  ${after.rls_tables}/${after.public_tables}`)
  console.log(`  policies        ${after.policies}`)

  const { rows: ranks } = await client.query(
    `select count(*)::int as n, min(own_sale_rate) as lo, max(own_sale_rate) as hi from public.ranks`,
  )
  console.log(`  ranks seeded    ${ranks[0].n} (${ranks[0].lo}% – ${ranks[0].hi}%)`)

  if (Number(after.rls_tables) < Number(after.public_tables)) {
    const { rows: gaps } = await client.query(`
      select tablename from pg_tables
      where schemaname = 'public' and not rowsecurity
      order by tablename
    `)
    console.log(
      `  ${c.red('WARNING')} tables without RLS: ${gaps.map((g) => g.tablename).join(', ')}`,
    )
  }

  if (flags.has('--test') || testOnly) {
    try {
      await client.query('create extension if not exists pgtap')
    } catch {
      console.log(
        `\n  ${c.yellow('Tests skipped')} — the pgtap extension is not available on this server.\n` +
          `  ${c.dim('Some managed providers omit it; the suites need pgtap to run.')}`,
      )
      await client.end()
      return
    }

    let totalFailed = 0
    for (const suite of [
      { file: 'supabase/tests/rls.test.sql', title: 'RLS regression suite' },
      { file: 'supabase/tests/workflow.test.sql', title: 'Workflow regression suite' },
    ]) {
      console.log(`\n${c.bold(suite.title)}`)
      const sql = await readFile(path.join(ROOT, suite.file), 'utf8')
      let result
      try {
        result = await client.query(sql)
      } catch (err) {
        console.log(`  ${c.red('SUITE ERRORED')}: ${err.message}`)
        const where = String(err.where ?? '').split('\n')[0]
        if (where) console.log(`  ${c.dim('where: ' + where)}`)
        // The suite wraps itself in a transaction; a mid-suite error aborts it,
        // so roll back explicitly before the next suite runs.
        await client.query('rollback').catch(() => {})
        totalFailed += 1
        continue
      }

      const output = (Array.isArray(result) ? result : [result])
        .flatMap((r) => (r && r.rows) || [])
        .map((row) => Object.values(row)[0])
        .filter((v) => typeof v === 'string' && v.trim() !== '')

      const failures = output.filter((line) => line.startsWith('not ok'))
      const planMismatch = output.filter((line) => line.startsWith('# Looks like'))
      output.forEach((line) => {
        if (line.startsWith('not ok')) console.log(`  ${c.red(line)}`)
        else if (line.startsWith('ok')) console.log(`  ${c.green(line)}`)
        else console.log(`  ${c.dim(line)}`)
      })
      totalFailed += failures.length + planMismatch.length
      console.log(
        failures.length || planMismatch.length
          ? `  ${c.red(`${failures.length} failed${planMismatch.length ? ', plan mismatch' : ''}`)}`
          : `  ${c.green(`${output.filter((l) => l.startsWith('ok')).length} passed`)}`,
      )
    }

    if (totalFailed) {
      console.log(`\n${c.red(`${totalFailed} problem(s) across the suites.`)}`)
      process.exitCode = 1
    } else {
      console.log(`\n${c.green('All suites green.')}`)
    }
  }

  await client.end()
  console.log(`\n${c.green('Done.')}\n`)
}

main().catch(async (err) => {
  try {
    await client.end()
  } catch {}

  // Always surface the message. An earlier version only printed for a handful of
  // known codes and exited silently otherwise, which turned a real failure into
  // a blank screen — the worst possible diagnostic.
  if (!err.__reported) {
    console.error(`\n${c.red(err.severity ?? 'ERROR')}: ${err.message}`)
    if (err.code) console.error(`  code:   ${err.code}`)
    if (err.detail) console.error(`  detail: ${err.detail}`)
    if (err.hint) console.error(`  hint:   ${err.hint}`)
    const where = String(err.where ?? '').split('\n')[0]
    if (where) console.error(`  where:  ${where}`)
  }

  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    console.error(`\n${c.red('Could not reach the database.')} ${err.code}`)
    console.error(`Check the host and port, that the server is running, and that your IP is`)
    console.error(`allowed by its firewall. Managed providers usually also require ${c.bold('--ssl')}.\n`)
  } else if (err.code === '28P01' || err.code === '28000') {
    console.error(`\n${c.red('Authentication failed.')} Check the user and password.\n`)
  } else if (err.code === '3D000') {
    console.error(`\n${c.red('That database does not exist')} on the server.\n`)
  }
  process.exit(1)
})
