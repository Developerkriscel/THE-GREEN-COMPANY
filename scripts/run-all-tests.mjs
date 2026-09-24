#!/usr/bin/env node
/**
 * One entry point for every test layer.
 *
 *   npm run test:all
 *
 * Runs, in order:
 *   1. Type check      — tsc --noEmit
 *   2. Unit            — Vitest over the pure money/rank arithmetic
 *   3. Integration     — server-side rules against the real database + RLS
 *   4. Connectivity    — module-by-module cross-checks, several members
 *   5. Gateway         — PostgREST/GoTrue surface the client actually speaks
 *
 * Every layer writes JUnit XML into reports/ so CI can read the lot. (JUnit
 * itself is a Java framework and has no place here — the XML *format* is what
 * Jenkins/GitLab/GitHub Actions parse, so that is what is produced.)
 *
 * End-to-end browser tests are driven separately through the browser
 * automation tooling; they are not part of this headless run.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORTS = path.join(ROOT, 'reports')
mkdirSync(REPORTS, { recursive: true })

const isWin = process.platform === 'win32'
const results = []

function run(label, cmd, args, env = {}) {
  process.stdout.write(`\n\x1b[1m▶ ${label}\x1b[0m\n`)
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...env },
  })
  const ok = r.status === 0
  results.push({ label, ok })
  return ok
}

/** Count tests/failures out of a JUnit file, for the summary line. */
function junitCounts(file) {
  const p = path.join(REPORTS, file)
  if (!existsSync(p)) return null
  const xml = readFileSync(p, 'utf8')
  const m = xml.match(/<testsuites[^>]*tests="(\d+)"[^>]*failures="(\d+)"/)
  if (!m) return null
  return { tests: Number(m[1]), failures: Number(m[2]) }
}

run('1/5  Type check', 'npx', ['tsc', '--noEmit'])
run('2/5  Unit tests (Vitest)', 'npx', ['vitest', 'run'], { CI_JUNIT: '1' })
run('3/5  Integration — server-side rules', 'node', ['scripts/test-sponsor-rules.mjs'], {
  JUNIT: path.join(REPORTS, 'rules-junit.xml'),
})
run('4/5  Connectivity — module cross-checks', 'node', ['scripts/test-module-connectivity.mjs'], {
  JUNIT: path.join(REPORTS, 'connectivity-junit.xml'),
})
run('5/5  Gateway — REST/auth surface', 'node', ['scripts/gateway-test.mjs'], {
  JUNIT: path.join(REPORTS, 'gateway-junit.xml'),
})

console.log(`\n${'='.repeat(64)}`)
console.log('Test summary')
console.log('='.repeat(64))
for (const r of results) {
  console.log(`  ${r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${r.label}`)
}
for (const [file, name] of [
  ['unit-junit.xml', 'unit'],
  ['rules-junit.xml', 'rules'],
  ['connectivity-junit.xml', 'connectivity'],
  ['gateway-junit.xml', 'gateway'],
]) {
  const c = junitCounts(file)
  if (c) console.log(`  reports/${file.padEnd(24)} ${c.tests} tests, ${c.failures} failures`)
}

const failed = results.filter((r) => !r.ok)
console.log('')
process.exitCode = failed.length ? 1 : 0
