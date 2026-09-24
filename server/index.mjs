import http from 'node:http'
import { appendFileSync, existsSync, readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { config, ROOT } from './config.mjs'
import { loadSchema, withRls, ensureReachable } from './db.mjs'
import * as db from './db.mjs'
import { verifyJwt, signJwt } from './jwt.mjs'
import * as auth from './auth.mjs'
import * as storage from './storage.mjs'
import { handleSelect, handleInsert, handleUpdate, handleDelete, handleRpc } from './rest.mjs'
import { handleFunction } from './functions.mjs'

/*
 * Royal Green API gateway.
 *
 * Speaks enough PostgREST + GoTrue + Storage for the unmodified React app to
 * run against a plain Postgres (Neon). The point of doing it this way rather
 * than rewriting the frontend: the 104 RLS policies stay the authority, and the
 * app's data layer stays the one that was already built and tested.
 */

/* ------------------------------------------------ first-run key generation */

function ensureSecrets() {
  const envPath = path.join(ROOT, '.env')
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  let changed = false

  if (!config.jwtSecret) {
    config.jwtSecret = randomBytes(32).toString('hex')
    env += `\n# Signs gateway access tokens and the anon key. Generated on first run.\nAPI_JWT_SECRET=${config.jwtSecret}\n`
    changed = true
    console.log('[boot] generated API_JWT_SECRET into .env')
  }

  // The anon key is just a long-lived JWT with role=anon, exactly as Supabase
  // does it. It grants nothing by itself — the anon policies decide.
  const anonKey = signJwt({ role: 'anon' }, { expiresIn: 60 * 60 * 24 * 365 * 5 })

  if (!/^VITE_SUPABASE_URL=.+$/m.test(env)) {
    env = env.replace(/^VITE_SUPABASE_URL=.*$/m, `VITE_SUPABASE_URL=http://localhost:${config.port}`)
    if (!/^VITE_SUPABASE_URL=/m.test(env)) env += `\nVITE_SUPABASE_URL=http://localhost:${config.port}\n`
    changed = true
  }
  if (!/^VITE_SUPABASE_ANON_KEY=.+$/m.test(env)) {
    env = env.replace(/^VITE_SUPABASE_ANON_KEY=.*$/m, `VITE_SUPABASE_ANON_KEY=${anonKey}`)
    if (!/^VITE_SUPABASE_ANON_KEY=/m.test(env)) env += `VITE_SUPABASE_ANON_KEY=${anonKey}\n`
    changed = true
  }

  if (changed) writeFileSync(envPath, env)
  return anonKey
}

/* ---------------------------------------------------------------- helpers */

const CORS_BASE = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, x-upsert, range, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range, content-length, x-total-count',
}

function corsHeaders(reqOrOrigin) {
  const origin = typeof reqOrOrigin === 'string'
    ? reqOrOrigin
    : (reqOrOrigin?.headers?.origin ?? '')
  const allowed = origin || config.corsOrigin || '*'
  return { ...CORS_BASE, 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Credentials': 'true' }
}

const CORS = corsHeaders('')

function send(res, status, body, headers = {}) {
  const cors = res._cors ?? CORS
  const payload = body === undefined || body === null ? '' : JSON.stringify(body)
  res.writeHead(status, {
    ...cors,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function sendRaw(res, status, buffer, contentType, headers = {}) {
  const cors = res._cors ?? CORS
  res.writeHead(status, {
    ...cors,
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    ...headers,
  })
  res.end(buffer)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 25 * 1024 * 1024) throw Object.assign(new Error('Payload too large'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const raw = await readBody(req)
  if (!raw.length) return null
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error('Malformed JSON in request body'), { status: 400 })
  }
}

/**
 * Map a Postgres error to the shape supabase-js expects, preserving the code so
 * client-side checks (like maybeSingle's PGRST116 handling) still work.
 */
function errorResponse(err) {
  // insufficient_privilege / RLS denial
  if (err.code === '42501') {
    return {
      status: 403,
      body: {
        code: '42501',
        message: err.message,
        details: err.detail ?? null,
        hint: err.hint ?? 'This is a row-level security policy or a guard trigger refusing the operation.',
      },
    }
  }
  // check_violation, not_null_violation, unique_violation, fk_violation
  if (['23514', '23502', '23505', '23503'].includes(err.code)) {
    return {
      status: 409,
      body: { code: err.code, message: err.message, details: err.detail ?? null, hint: err.hint ?? null },
    }
  }
  if (err.code === '28000') {
    return { status: 401, body: { code: err.code, message: err.message, details: null, hint: null } }
  }
  return {
    status: err.status ?? 500,
    body: {
      code: err.code ?? err.authCode ?? 'internal_error',
      message: err.message,
      details: err.detail ?? null,
      hint: err.hint ?? null,
    },
  }
}

/** Who is calling? Anything that isn't a valid authenticated JWT is anon. */
function identify(req) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  const claims = token ? verifyJwt(token) : null

  if (claims?.sub && claims.role === 'authenticated') {
    return { role: 'authenticated', claims, token }
  }
  return { role: 'anon', claims: null, token }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function serveStatic(req, res, pathname) {
  const distPath = path.join(ROOT, 'dist')
  if (!existsSync(distPath)) return false

  let cleanPath = pathname.split('?')[0]
  if (cleanPath === '/') cleanPath = '/index.html'

  let filePath = path.normalize(path.join(distPath, cleanPath))
  if (!filePath.startsWith(distPath)) return false

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = path.join(distPath, 'index.html')
    if (!existsSync(filePath)) return false
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const isAsset = cleanPath.startsWith('/assets/')

  const headers = {
    ...corsHeaders(req),
    'Content-Type': contentType,
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, headers)
    res.end()
    return true
  }

  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
  return true
}

/* ----------------------------------------------------------------- router */

async function route(req, res) {
  res._cors = corsHeaders(req)
  const url = new URL(req.url, `http://${req.headers.host}`)
  const segments = url.pathname.split('/').filter(Boolean)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, res._cors)
    return res.end()
  }

  if (url.pathname === '/health') {
    return send(res, 200, { ok: true, service: 'royal-green-gateway' })
  }

  // Serve frontend static assets & SPA routes
  if (['GET', 'HEAD'].includes(req.method) && !['rest', 'auth', 'storage', 'functions'].includes(segments[0])) {
    if (serveStatic(req, res, url.pathname)) return
  }

  const [api, version, ...rest] = segments

  /* ------------------------------------------------------------ auth/v1 */
  if (api === 'auth' && version === 'v1') {
    const [action] = rest
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '').trim()

    if (action === 'token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type')
      const body = (await readJson(req)) ?? {}
      if (grant === 'refresh_token') return send(res, 200, await auth.refreshSession(body))
      if (grant === 'password') return send(res, 200, await auth.signInWithPassword(body))
      throw Object.assign(new Error(`Unsupported grant_type: ${grant}`), { status: 400 })
    }
    if (action === 'signup' && req.method === 'POST') {
      const body = (await readJson(req)) ?? {}
      return send(res, 200, await auth.signup(body))
    }
    if (action === 'user' && req.method === 'GET') {
      return send(res, 200, await auth.getUser(token))
    }
    if (action === 'user' && req.method === 'PUT') {
      return send(res, 200, await auth.updateUser(token, (await readJson(req)) ?? {}))
    }
    if (action === 'logout' && req.method === 'POST') {
      await auth.logout(token)
      res.writeHead(204, res._cors ?? CORS)
      return res.end()
    }
    if (action === 'recover' && req.method === 'POST') {
      await auth.recover((await readJson(req)) ?? {})
      return send(res, 200, {})
    }
    throw Object.assign(new Error(`No auth route for ${req.method} ${url.pathname}`), { status: 404 })
  }

  /* --------------------------------------------------------- storage/v1 */
  if (api === 'storage' && version === 'v1') {
    const { role, claims } = identify(req)
    // /object/sign/<bucket>/<path...>  |  /object/public/<bucket>/<path...>
    // /object/<bucket>/<path...>
    if (rest[0] !== 'object') {
      throw Object.assign(new Error('Unsupported storage route'), { status: 404 })
    }

    if (rest[1] === 'sign') {
      const bucket = rest[2]
      const objectPath = rest.slice(3).join('/')
      if (req.method === 'POST') {
        const body = (await readJson(req)) ?? {}
        const result = await storage.createSignedUrl({
          role,
          claims,
          bucket,
          objectPath,
          expiresIn: body.expiresIn ?? 120,
        })
        return send(res, 200, result)
      }
      if (req.method === 'GET') {
        const file = await storage.readSigned({
          bucket,
          objectPath,
          token: url.searchParams.get('token'),
        })
        return sendRaw(res, 200, file.body, file.contentType)
      }
    }

    if (rest[1] === 'public') {
      const bucket = rest[2]
      const objectPath = rest.slice(3).join('/')
      const file = await storage.readPublic({ bucket, objectPath })
      return sendRaw(res, 200, file.body, file.contentType)
    }

    const bucket = rest[1]
    const objectPath = rest.slice(2).join('/')
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req)
      const result = await storage.upload({
        role,
        claims,
        bucket,
        objectPath,
        body,
        contentType: req.headers['content-type'] ?? 'application/octet-stream',
        upsert: req.headers['x-upsert'] === 'true' || req.method === 'PUT',
      })
      return send(res, 200, result)
    }

    throw Object.assign(new Error('Unsupported storage operation'), { status: 405 })
  }

  /* ------------------------------------------------------- functions/v1 */
  if (api === 'functions' && version === 'v1') {
    const { role, claims } = identify(req)
    const body = (await readJson(req)) ?? {}
    const result = await handleFunction(rest.join('/'), body, { role, claims })
    return send(res, 200, result)
  }

  /* ------------------------------------------------------------ rest/v1 */
  if (api === 'rest' && version === 'v1') {
    const { role, claims } = identify(req)
    const headers = { prefer: req.headers.prefer ?? '', accept: req.headers.accept ?? '' }
    const wantsObject = headers.accept.includes('application/vnd.pgrst.object+json')

    if (rest[0] === 'rpc') {
      const body = (await readJson(req)) ?? {}
      const result = await withRls(role, claims, (client) =>
        handleRpc(client, { fn: rest[1], body }),
      )
      return send(res, 200, result.scalar ? result.value : result.rows)
    }

    const table = rest[0]
    if (!table) throw Object.assign(new Error('No relation specified'), { status: 404 })

    const query = new URLSearchParams(url.search)
    const entries = [...query.entries()]

    const result = await withRls(role, claims, async (client) => {
      switch (req.method) {
        case 'GET':
        case 'HEAD':
          return handleSelect(client, { table, query, headers, method: req.method })
        case 'POST':
          return handleInsert(client, { table, query, headers, body: await readJson(req) })
        case 'PATCH':
          return handleUpdate(client, { table, query, headers, body: await readJson(req) })
        case 'DELETE':
          return handleDelete(client, { table, query, headers })
        default:
          throw Object.assign(new Error(`Method ${req.method} not allowed`), { status: 405 })
      }
    })

    if (req.method === 'HEAD') {
      res.writeHead(200, { ...(res._cors ?? CORS), 'Content-Range': result.contentRange ?? '*/0' })
      return res.end()
    }

    const rows = result.rows ?? []
    const extraHeaders = result.contentRange ? { 'Content-Range': result.contentRange } : {}

    if (wantsObject) {
      if (rows.length === 1) return send(res, 200, rows[0], extraHeaders)
      // PGRST116 is what supabase-js's .maybeSingle() looks for to return null
      // instead of raising, so the code matters as much as the status.
      return send(
        res,
        406,
        {
          code: 'PGRST116',
          message:
            rows.length === 0
              ? 'JSON object requested, multiple (or no) rows returned'
              : `JSON object requested, multiple (or no) rows returned`,
          details: `Results contain ${rows.length} rows`,
          hint: null,
        },
        extraHeaders,
      )
    }

    const isWrite = ['POST', 'PATCH', 'DELETE'].includes(req.method)
    const status = req.method === 'POST' ? 201 : 200
    if (isWrite && !headers.prefer.includes('return=representation')) {
      res.writeHead(204, { ...(res._cors ?? CORS), ...extraHeaders })
      return res.end()
    }
    return send(res, status, rows, extraHeaders)
  }

  throw Object.assign(new Error(`No route for ${req.method} ${url.pathname}`), { status: 404 })
}

/* ------------------------------------------------------------------- boot */

const anonKey = ensureSecrets()

const server = http.createServer((req, res) => {
  const started = Date.now()
  route(req, res)
    .then(() => {
      if (process.env.API_LOG !== 'off') {
        console.log(`${req.method} ${req.url.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`)
      }
    })
    .catch((err) => {
      const { status, body } = errorResponse(err)
      if (status >= 500) console.error(`[error] ${req.method} ${req.url}`, err)
      else console.log(`${req.method} ${req.url.split('?')[0]} ${status} — ${body.message}`)
      if (!res.headersSent) send(res, status, body)
      else res.end()
    })
})

async function start() {
  const reach = await ensureReachable()
  if (!reach.ok) {
    console.error(`[boot] cannot reach the database: ${reach.error?.message ?? 'unknown error'}`)
    process.exit(1)
  }
  await loadSchema()
  await auth.ensureAuthTables()

  server.listen(config.port, () => {
    console.log(`
  Royal Green API gateway
  ───────────────────────────────────────────────
  listening   http://localhost:${config.port}
  database    ${config.databaseUrl.replace(/:\/\/[^@]*@/, '://***@')}
  cors origin ${config.corsOrigin}

  REST        /rest/v1/<table>
  auth        /auth/v1/token | signup | user | logout | recover
  storage     /storage/v1/object/...
  functions   /functions/v1/<name>

  anon key    ${anonKey.slice(0, 24)}…  (written to .env)

  Every request runs as the 'anon' or 'authenticated' Postgres role inside a
  transaction, so all ${''}RLS policies apply exactly as they would on Supabase.
`)
  })
}

start().catch((err) => {
  console.error('[boot] failed:', err)
  process.exit(1)
})

const shutdown = async () => {
  console.log('\n[shutdown] closing…')
  server.close()
  await db.pool.end().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
