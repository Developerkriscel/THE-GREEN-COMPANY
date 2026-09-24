import pg from 'pg'
import { config } from './config.mjs'

/*
 * ============================================================================
 * THE SECURITY-CRITICAL FILE.
 * ============================================================================
 *
 * The pool connects as the database owner (neondb_owner), which carries
 * BYPASSRLS. If a query ever ran in that role, EVERY policy in the schema would
 * be silently skipped and every rep would see every other rep's leads.
 *
 * So every request runs inside a transaction that first does:
 *
 *     set local role <anon | authenticated>;
 *     set_config('request.jwt.claims', <claims json>, true);
 *
 * which is exactly what PostgREST does. `set local` and the `true` third
 * argument to set_config scope both to the transaction, so a pooled connection
 * cannot leak one request's identity into the next.
 *
 * There is deliberately NO code path that reaches the database without going
 * through withRls(). The only exception is bootstrap introspection at startup,
 * which reads system catalogues and no application data.
 */

function makePool(connectionString) {
  const p = new pg.Pool({
    connectionString,
    ssl: /sslmode=(require|verify)/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    // Every request holds a client for the whole transaction, and a single
    // screen can fan out ten or more queries at once. At max: 8 the sponsor
    // dashboard saturated the pool, and the waiters that timed out surfaced as
    // intermittent 400s on page load.
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  })
  p.on('error', (err) => console.error('[db] idle client error:', err.message))
  return p
}

/**
 * Mutable because of the startup fallback below. Everything imports the binding
 * (`pool.connect()`), never a destructured copy, so a swap is picked up.
 */
export let pool = makePool(config.databaseUrl)

/**
 * The pooler endpoint is a different host from the direct one and can be down
 * or firewalled on its own. Probe it once at startup: if it cannot hand out a
 * connection, fall back to the direct endpoint rather than answering every
 * request with a 15-second connection timeout.
 */
export async function ensureReachable() {
  try {
    const client = await pool.connect()
    await client.query('select 1')
    client.release()
    return { ok: true, fellBack: false }
  } catch (err) {
    if (!config.directDatabaseUrl) return { ok: false, fellBack: false, error: err }
    console.warn(`[db] pooled endpoint unreachable (${err.message}); falling back to the direct endpoint`)
    await pool.end().catch(() => {})
    pool = makePool(config.directDatabaseUrl)
    try {
      const client = await pool.connect()
      await client.query('select 1')
      client.release()
      return { ok: true, fellBack: true }
    } catch (err2) {
      return { ok: false, fellBack: true, error: err2 }
    }
  }
}

/**
 * Run `fn` against the database as the given PostgREST role, with the given JWT
 * claims visible to auth.uid() and friends.
 *
 * @param {'anon'|'authenticated'} role
 * @param {object|null} claims  decoded JWT payload, or null for anonymous
 */
/**
 * Take a client from the pool, retrying once on a transient acquisition
 * failure.
 *
 * Only the ACQUIRE is retried, never a statement: at this point no SQL has run,
 * so a second attempt cannot double-apply a write. Neon idles the compute down
 * and the first connection after a cold start can exceed the timeout, which
 * would otherwise reach the browser as a 400 on an ordinary page load.
 */
async function acquire(attempts = 2) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await pool.connect()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        console.warn(`[db] connection attempt ${i + 1} failed (${err.message}); retrying`)
      }
    }
  }
  throw lastErr
}

export async function withRls(role, claims, fn) {
  if (role !== 'anon' && role !== 'authenticated') {
    throw new Error(`Refusing to run as role "${role}"`)
  }

  const client = await acquire()
  try {
    await client.query('begin')

    // Claims BEFORE the role switch: once we drop to `anon`, we may no longer
    // have the privilege to set this GUC.
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      claims ? JSON.stringify(claims) : '',
    ])
    // Role name cannot be parameterised, hence the hard whitelist above.
    await client.query(`set local role ${role}`)

    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Privileged access, used only by the auth endpoints, which must read and write
 * auth.users before any user identity exists. Never reachable from a REST route.
 */
export async function withOwner(fn) {
  // Same retry as withRls. This path serves token refresh, so a transient
  // pooler blip here signs the user out rather than merely failing a query.
  const client = await acquire()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/* ------------------------------------------------------------ introspection */

/**
 * Schema facts the REST layer needs: which tables exist (so an unknown table is
 * a 404 rather than a SQL error), and the foreign keys, so `select=*,rep:profiles(...)`
 * can be resolved to a join without the client telling us how.
 */
export const schema = {
  tables: new Set(),
  columns: new Map(), // table -> Set(column)
  /** fks: Map<`${table}`, Array<{ name, columns, refTable, refColumns }>> */
  fks: new Map(),
  loaded: false,
}

export async function loadSchema() {
  const client = await pool.connect()
  try {
    const { rows: cols } = await client.query(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = $1
        order by table_name, ordinal_position`,
      [config.exposedSchema],
    )
    for (const { table_name, column_name } of cols) {
      schema.tables.add(table_name)
      if (!schema.columns.has(table_name)) schema.columns.set(table_name, new Set())
      schema.columns.get(table_name).add(column_name)
    }

    // Views are queryable too, but have no FKs — include them as tables.
    const { rows: views } = await client.query(
      `select table_name from information_schema.views where table_schema = $1`,
      [config.exposedSchema],
    )
    for (const { table_name } of views) schema.tables.add(table_name)

    const { rows: fks } = await client.query(
      `select
         con.conname                                as name,
         src.relname                                as table_name,
         tgt.relname                                as ref_table,
         (select array_agg(a.attname::text order by k.ord)
            from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum)
                                                    as columns,
         (select array_agg(a.attname::text order by k.ord)
            from unnest(con.confkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
                                                    as ref_columns
       from pg_constraint con
       join pg_class src on src.oid = con.conrelid
       join pg_class tgt on tgt.oid = con.confrelid
       join pg_namespace n on n.oid = src.relnamespace
      where con.contype = 'f' and n.nspname = $1`,
      [config.exposedSchema],
    )

    for (const fk of fks) {
      if (!schema.fks.has(fk.table_name)) schema.fks.set(fk.table_name, [])
      schema.fks.get(fk.table_name).push({
        name: fk.name,
        columns: fk.columns,
        refTable: fk.ref_table,
        refColumns: fk.ref_columns,
      })
    }

    schema.loaded = true
    console.log(
      `[db] schema loaded: ${schema.tables.size} relations, ` +
        `${[...schema.fks.values()].reduce((n, a) => n + a.length, 0)} foreign keys`,
    )
  } finally {
    client.release()
  }
}

/**
 * Resolve an embedded resource.
 *
 * `hint` is the part after `!` in e.g. `rep:profiles!bookings_rep_id_fkey(...)`,
 * which supabase-js sends precisely when a table has two FKs to the same target
 * (bookings has both rep_id and customer_id pointing at profiles) and the
 * relationship would otherwise be ambiguous.
 *
 * Returns { kind: 'one'|'many', localColumns, refTable, refColumns }.
 */
export function resolveRelation(fromTable, target, hint) {
  const outgoing = (schema.fks.get(fromTable) ?? []).filter(
    (fk) => fk.refTable === target && (!hint || fk.name === hint),
  )
  if (outgoing.length === 1) {
    return {
      kind: 'one',
      localColumns: outgoing[0].columns,
      refTable: target,
      refColumns: outgoing[0].refColumns,
    }
  }
  if (outgoing.length > 1) {
    const names = outgoing.map((f) => f.name).join(', ')
    const err = new Error(
      `Could not embed "${target}" in "${fromTable}": more than one foreign key matches (${names}). ` +
        `Disambiguate with table!constraint_name.`,
    )
    err.status = 300
    throw err
  }

  // No outgoing FK — try the reverse direction (one-to-many).
  const incoming = (schema.fks.get(target) ?? []).filter(
    (fk) => fk.refTable === fromTable && (!hint || fk.name === hint),
  )
  if (incoming.length === 1) {
    return {
      kind: 'many',
      localColumns: incoming[0].refColumns,
      refTable: target,
      refColumns: incoming[0].columns,
    }
  }

  const err = new Error(
    `Could not find a relationship between "${fromTable}" and "${target}"${hint ? ` using "${hint}"` : ''}.`,
  )
  err.status = 400
  throw err
}

export function assertTable(name) {
  if (!schema.tables.has(name)) {
    const err = new Error(`Relation "${name}" does not exist in the exposed schema.`)
    err.status = 404
    throw err
  }
}

/** Identifier quoting. Every identifier reaching SQL goes through this. */
export function ident(name) {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    const err = new Error(`Invalid identifier: ${JSON.stringify(name)}`)
    err.status = 400
    throw err
  }
  return `"${name}"`
}
