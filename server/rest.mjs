import { assertTable, ident, resolveRelation, schema } from './db.mjs'

/*
 * A PostgREST-compatible translator, scoped to the surface this app actually
 * uses. It is intentionally a subset — but a faithful one, because the client
 * (supabase-js) is unmodified and the RLS policies are the real authority.
 *
 * Everything user-supplied becomes a bound parameter. Identifiers are validated
 * against the live catalogue (see ident() and assertTable()), so there is no
 * path from a query string into raw SQL.
 */

class Params {
  constructor() {
    this.values = []
  }
  add(value) {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

/* --------------------------------------------------------------- select  */

/**
 * Parse a PostgREST `select` into a tree.
 *
 *   *                                     -> all columns
 *   id,name                               -> named columns
 *   alias:column                          -> renamed column
 *   rank:ranks ( id, name )               -> embedded resource
 *   rep:profiles!bookings_rep_id_fkey (…) -> embed, FK disambiguated
 */
export function parseSelect(input) {
  const text = (input ?? '*').trim()
  const nodes = []
  let depth = 0
  let buffer = ''

  const flush = () => {
    const part = buffer.trim()
    buffer = ''
    if (!part) return

    const paren = part.indexOf('(')
    if (paren === -1) {
      // plain column, possibly aliased
      const [left, right] = splitAlias(part)
      nodes.push({ type: 'column', name: right, alias: left ?? right })
      return
    }

    const head = part.slice(0, paren).trim()
    const body = part.slice(paren + 1, part.lastIndexOf(')'))
    let [alias, rel] = splitAlias(head)
    let hint = null
    if (rel.includes('!')) {
      const [table, fk] = rel.split('!')
      rel = table.trim()
      hint = fk.trim()
    }
    nodes.push({
      type: 'embed',
      table: rel,
      alias: alias ?? rel,
      hint,
      children: parseSelect(body),
    })
  }

  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      flush()
      continue
    }
    buffer += ch
  }
  flush()

  return nodes.length ? nodes : [{ type: 'column', name: '*', alias: '*' }]
}

/** "alias:thing" -> [alias, thing]; "thing" -> [null, thing] */
function splitAlias(part) {
  const colon = part.indexOf(':')
  if (colon === -1) return [null, part.trim()]
  return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()]
}

/** Build the SELECT list for `table`, with embeds as correlated JSON subqueries. */
function buildSelectList(table, nodes, alias, params) {
  const pieces = []

  for (const node of nodes) {
    if (node.type === 'column') {
      if (node.name === '*') {
        pieces.push(`${ident(alias)}.*`)
      } else {
        const col = `${ident(alias)}.${ident(node.name)}`
        pieces.push(node.alias === node.name ? col : `${col} as ${ident(node.alias)}`)
      }
      continue
    }

    // Embedded resource.
    const rel = resolveRelation(table, node.table, node.hint)
    assertTable(rel.refTable)

    const child = `${node.alias}_e`
    const inner = buildSelectList(rel.refTable, node.children, child, params)

    const on = rel.localColumns
      .map((local, i) => `${ident(child)}.${ident(rel.refColumns[i])} = ${ident(alias)}.${ident(local)}`)
      .join(' and ')

    if (rel.kind === 'one') {
      // to_jsonb of a single row, or SQL NULL when the FK is null.
      pieces.push(
        `( select to_jsonb(_x) from ( select ${inner} from ${ident(rel.refTable)} ${ident(child)} ` +
          `where ${on} limit 1 ) _x ) as ${ident(node.alias)}`,
      )
    } else {
      pieces.push(
        `( select coalesce(jsonb_agg(_x), '[]'::jsonb) from ( select ${inner} ` +
          `from ${ident(rel.refTable)} ${ident(child)} where ${on} ) _x ) as ${ident(node.alias)}`,
      )
    }
  }

  return pieces.join(', ')
}

/* --------------------------------------------------------------- filters */

const OPERATORS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  ilike: 'ilike',
  match: '~',
  imatch: '~*',
}

/** PostgREST uses `*` as the wildcard in like/ilike; SQL wants `%`. */
const likeValue = (v) => String(v).replace(/\*/g, '%')

/**
 * Compile one `column=operator.value` pair into SQL.
 * Handles not., is., in., and the logical or=(…) / and=(…) forms.
 */
function compileFilter(table, alias, key, raw, params) {
  if (key === 'or' || key === 'and') {
    const joiner = key === 'or' ? ' or ' : ' and '
    const parts = splitTopLevel(stripOuterParens(raw)).map((clause) => {
      const dot = clause.indexOf('.')
      return compileFilter(table, alias, clause.slice(0, dot), clause.slice(dot + 1), params)
    })
    return parts.length ? `(${parts.join(joiner)})` : 'true'
  }

  const col = `${ident(alias)}.${ident(key)}`
  let rest = raw

  let negate = false
  if (rest.startsWith('not.')) {
    negate = true
    rest = rest.slice(4)
  }

  const dot = rest.indexOf('.')
  const op = dot === -1 ? rest : rest.slice(0, dot)
  const value = dot === -1 ? '' : rest.slice(dot + 1)

  let sql
  if (op === 'is') {
    const v = value.toLowerCase()
    if (v === 'null') sql = `${col} is null`
    else if (v === 'true') sql = `${col} is true`
    else if (v === 'false') sql = `${col} is false`
    else sql = `${col} is not distinct from ${params.add(value)}`
  } else if (op === 'in') {
    const items = parseInList(value)
    sql = items.length ? `${col} in (${items.map((v) => params.add(v)).join(', ')})` : 'false'
  } else if (op === 'like' || op === 'ilike') {
    sql = `${col} ${OPERATORS[op]} ${params.add(likeValue(value))}`
  } else if (OPERATORS[op]) {
    sql = `${col} ${OPERATORS[op]} ${params.add(decodeScalar(value))}`
  } else {
    const err = new Error(`Unsupported operator "${op}" on column "${key}".`)
    err.status = 400
    throw err
  }

  return negate ? `not (${sql})` : sql
}

const stripOuterParens = (s) =>
  s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s

/** Split on commas that are not inside parentheses or quotes. */
function splitTopLevel(text) {
  const out = []
  let depth = 0
  let quoted = false
  let buf = ''
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === '(') depth++
    if (!quoted && ch === ')') depth--
    if (!quoted && ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf)
  return out.map((s) => s.trim()).filter(Boolean)
}

function parseInList(value) {
  return splitTopLevel(stripOuterParens(value)).map((v) => {
    const t = v.trim()
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : decodeScalar(t)
  })
}

/** PostgREST spells SQL NULL as the bare word `null`. */
function decodeScalar(v) {
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function buildWhere(table, alias, query, params) {
  const clauses = []
  for (const [key, raw] of query) {
    if (RESERVED.has(key)) continue
    const values = Array.isArray(raw) ? raw : [raw]
    for (const v of values) clauses.push(compileFilter(table, alias, key, v, params))
  }
  return clauses.length ? clauses.join(' and ') : ''
}

function buildOrder(alias, orderParam) {
  if (!orderParam) return ''
  const parts = orderParam.split(',').map((spec) => {
    const [col, ...mods] = spec.trim().split('.')
    const dir = mods.includes('desc') ? 'desc' : 'asc'
    const nulls = mods.includes('nullsfirst')
      ? ' nulls first'
      : mods.includes('nullslast')
        ? ' nulls last'
        : ''
    return `${ident(alias)}.${ident(col)} ${dir}${nulls}`
  })
  return parts.length ? ` order by ${parts.join(', ')}` : ''
}

/* ----------------------------------------------------------------- verbs */

export async function handleSelect(client, { table, query, headers, method }) {
  assertTable(table)
  const alias = table
  const params = new Params()

  const selectList = buildSelectList(table, parseSelect(query.get('select')), alias, params)
  const where = buildWhere(table, alias, query, params)
  const order = buildOrder(alias, query.get('order'))

  const limit = query.get('limit')
  const offset = query.get('offset')

  const from = `${ident(table)} ${ident(alias)}`
  const whereSql = where ? ` where ${where}` : ''

  // A count is requested via `Prefer: count=exact` (supabase-js sends HEAD for
  // head:true). It must run under the same RLS transaction to be meaningful.
  const wantsCount = /count=(exact|planned|estimated)/.test(headers.prefer ?? '')
  let total = null
  if (wantsCount) {
    const countSql = `select count(*)::bigint as n from ${from}${whereSql}`
    const { rows } = await client.query(countSql, params.values)
    total = Number(rows[0].n)
  }

  if (method === 'HEAD') {
    return { rows: [], total, contentRange: `*/${total ?? '*'}` }
  }

  let sql = `select ${selectList} from ${from}${whereSql}${order}`
  if (limit) sql += ` limit ${params.add(Number(limit))}`
  if (offset) sql += ` offset ${params.add(Number(offset))}`

  const { rows } = await client.query(sql, params.values)

  const start = Number(offset ?? 0)
  const end = start + Math.max(rows.length - 1, 0)
  return {
    rows,
    total,
    contentRange: `${start}-${end}/${total ?? '*'}`,
  }
}

export async function handleInsert(client, { table, query, headers, body }) {
  assertTable(table)
  const records = Array.isArray(body) ? body : [body]
  if (!records.length) return { rows: [] }

  const cols = [...new Set(records.flatMap((r) => Object.keys(r ?? {})))]
  if (!cols.length) {
    const err = new Error('Cannot insert a row with no columns.')
    err.status = 400
    throw err
  }

  const params = new Params()
  const tuples = records.map(
    (record) => `(${cols.map((c) => params.add(record?.[c] ?? null)).join(', ')})`,
  )

  let sql =
    `insert into ${ident(table)} (${cols.map(ident).join(', ')}) values ${tuples.join(', ')}`

  // Upsert. supabase-js signals it with Prefer: resolution=merge-duplicates and
  // puts the conflict target in ?on_conflict=
  const prefer = headers.prefer ?? ''
  if (prefer.includes('resolution=merge-duplicates')) {
    const target = (query.get('on_conflict') ?? '').split(',').filter(Boolean)
    const updates = cols.filter((c) => !target.includes(c))
    sql += target.length
      ? ` on conflict (${target.map(ident).join(', ')}) do ${
          updates.length
            ? `update set ${updates.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}`
            : 'nothing'
        }`
      : ' on conflict do nothing'
  } else if (prefer.includes('resolution=ignore-duplicates')) {
    sql += ' on conflict do nothing'
  }

  const wantsRows = prefer.includes('return=representation')
  if (wantsRows) {
    const selectParams = new Params()
    selectParams.values = params.values
    sql += ` returning ${buildSelectList(table, parseSelect(query.get('select')), table, selectParams)}`
  }

  const { rows } = await client.query(sql, params.values)
  return { rows: wantsRows ? rows : [] }
}

export async function handleUpdate(client, { table, query, headers, body }) {
  assertTable(table)
  const cols = Object.keys(body ?? {})
  if (!cols.length) {
    const err = new Error('Cannot update with an empty body.')
    err.status = 400
    throw err
  }

  const params = new Params()
  const assignments = cols.map((c) => `${ident(c)} = ${params.add(body[c])}`).join(', ')
  const where = buildWhere(table, table, query, params)

  // An unfiltered UPDATE would rewrite the whole table. PostgREST allows it;
  // this gateway does not, because nothing in this app needs it and the blast
  // radius of a bug here is the entire table.
  if (!where) {
    const err = new Error('Refusing to run an UPDATE with no filter.')
    err.status = 400
    throw err
  }

  let sql = `update ${ident(table)} as ${ident(table)} set ${assignments} where ${where}`
  const wantsRows = (headers.prefer ?? '').includes('return=representation')
  if (wantsRows) {
    sql += ` returning ${buildSelectList(table, parseSelect(query.get('select')), table, params)}`
  }

  const { rows, rowCount } = await client.query(sql, params.values)
  return { rows: wantsRows ? rows : [], rowCount }
}

export async function handleDelete(client, { table, query, headers }) {
  assertTable(table)
  const params = new Params()
  const where = buildWhere(table, table, query, params)
  if (!where) {
    const err = new Error('Refusing to run a DELETE with no filter.')
    err.status = 400
    throw err
  }

  let sql = `delete from ${ident(table)} as ${ident(table)} where ${where}`
  const wantsRows = (headers.prefer ?? '').includes('return=representation')
  if (wantsRows) {
    sql += ` returning ${buildSelectList(table, parseSelect(query.get('select')), table, params)}`
  }

  const { rows, rowCount } = await client.query(sql, params.values)
  return { rows: wantsRows ? rows : [], rowCount }
}

export async function handleRpc(client, { fn, body }) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fn)) {
    const err = new Error(`Invalid function name: ${fn}`)
    err.status = 400
    throw err
  }

  const args = body && typeof body === 'object' ? body : {}
  const names = Object.keys(args)
  const params = new Params()

  // Named arguments, so argument order in the SQL definition does not matter.
  const argSql = names.map((n) => `${ident(n)} => ${params.add(args[n])}`).join(', ')
  const sql = `select * from ${ident(fn)}(${argSql})`

  const { rows, fields } = await client.query(sql, params.values)

  // A function returning a scalar (or void) comes back as one row with one
  // column; PostgREST unwraps that to the bare value. A set-returning function
  // with a composite type stays an array of objects.
  const VOID_OID = 2278
  if (fields.length === 1 && rows.length <= 1) {
    if (fields[0].dataTypeID === VOID_OID) return { scalar: true, value: null }
    const value = rows.length ? Object.values(rows[0])[0] : null
    return { scalar: true, value }
  }
  return { scalar: false, rows }
}
