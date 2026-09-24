/**
 * Minimal JUnit XML writer.
 *
 * JUnit itself is a Java framework and has no place in a TypeScript/Postgres
 * project, but its XML report format is what CI servers read — Jenkins, GitLab,
 * GitHub Actions, Azure DevOps all parse it. So the Node suites emit the format
 * without pretending to be JUnit.
 *
 *   const j = junit('sponsor-rules')
 *   j.add('suite name', 'case name', { ok, message, timeMs })
 *   j.write('reports/rules-junit.xml')
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are illegal in XML 1.0 and will break a CI parser.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

export function junit(name) {
  /** @type {Map<string, {name:string, cases:Array<{name:string, ok:boolean, message?:string, timeMs:number}>}>} */
  const suites = new Map()

  return {
    add(suiteName, caseName, { ok, message, timeMs = 0 } = {}) {
      if (!suites.has(suiteName)) suites.set(suiteName, { name: suiteName, cases: [] })
      suites.get(suiteName).cases.push({ name: caseName, ok: Boolean(ok), message, timeMs })
    },

    write(file) {
      const all = [...suites.values()]
      const tests = all.reduce((n, s) => n + s.cases.length, 0)
      const failures = all.reduce((n, s) => n + s.cases.filter((c) => !c.ok).length, 0)
      const time = all.reduce((t, s) => t + s.cases.reduce((x, c) => x + c.timeMs, 0), 0) / 1000

      const body = all
        .map((s) => {
          const f = s.cases.filter((c) => !c.ok).length
          const cases = s.cases
            .map((c) => {
              const attrs = `classname="${esc(s.name)}" name="${esc(c.name)}" time="${(c.timeMs / 1000).toFixed(3)}"`
              return c.ok
                ? `      <testcase ${attrs} />`
                : `      <testcase ${attrs}>\n        <failure message="${esc(c.message ?? 'failed')}" />\n      </testcase>`
            })
            .join('\n')
          return `    <testsuite name="${esc(s.name)}" tests="${s.cases.length}" failures="${f}">\n${cases}\n    </testsuite>`
        })
        .join('\n')

      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<testsuites name="${esc(name)}" tests="${tests}" failures="${failures}" time="${time.toFixed(3)}">\n` +
        `${body}\n</testsuites>\n`

      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, xml, 'utf8')
      return { tests, failures, file }
    },
  }
}
