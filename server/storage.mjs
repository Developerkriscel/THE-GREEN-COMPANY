import path from 'node:path'
import { withRls } from './db.mjs'
import { signJwt, verifyJwt } from './jwt.mjs'
import { r2Put, r2Get, r2Exists, R2_BUCKET } from './r2.mjs'

/*
 * Storage API — bytes live in Cloudflare R2, access decisions live in Postgres.
 *
 * Permission is NOT decided here. Every operation inserts into or selects from
 * storage.objects as the caller's role, so the object policies from migration
 * 0004 are what actually allow or deny — same as Supabase would do. If a rep
 * tries to read another booking's file, the SELECT returns no row → 404.
 */

const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

const storageError = (status, message) => {
  const err = new Error(message)
  err.status = status
  return err
}

function r2Key(bucket, objectPath) {
  // Normalise: strip leading slash, prevent path traversal
  const clean = objectPath.replace(/^\/+/, '').replace(/\.\.\//g, '')
  return `${bucket}/${clean}`
}

export async function upload({ role, claims, bucket, objectPath, body, contentType, upsert }) {
  if (!body?.length) throw storageError(400, 'Empty upload')

  await withRls(role, claims, async (client) => {
    const existing = await client.query(
      `select id from storage.objects where bucket_id = $1 and name = $2`,
      [bucket, objectPath],
    )

    if (existing.rowCount) {
      if (!upsert) throw storageError(409, 'The resource already exists')
      await client.query(
        `update storage.objects set updated_at = now(), metadata = $3
          where bucket_id = $1 and name = $2`,
        [bucket, objectPath, { mimetype: contentType, size: body.length }],
      )
    } else {
      await client.query(
        `insert into storage.objects (bucket_id, name, owner, metadata)
         values ($1, $2, $3, $4)`,
        [bucket, objectPath, claims?.sub ?? null, { mimetype: contentType, size: body.length }],
      )
    }
  })

  await r2Put(r2Key(bucket, objectPath), body, contentType)

  return { Key: `${bucket}/${objectPath}`, path: objectPath, id: null }
}

export async function createSignedUrl({ role, claims, bucket, objectPath, expiresIn = 120 }) {
  const allowed = await withRls(role, claims, async (client) => {
    const { rowCount } = await client.query(
      `select 1 from storage.objects where bucket_id = $1 and name = $2`,
      [bucket, objectPath],
    )
    return rowCount > 0
  })

  if (!allowed) throw storageError(404, 'Object not found')

  const token = signJwt({ bucket, objectPath, purpose: 'storage' }, { expiresIn })
  return { signedURL: `/object/sign/${bucket}/${objectPath}?token=${encodeURIComponent(token)}` }
}

export async function readSigned({ bucket, objectPath, token }) {
  const claims = verifyJwt(token)
  if (!claims || claims.purpose !== 'storage') throw storageError(401, 'Invalid or expired token')
  if (claims.bucket !== bucket || claims.objectPath !== objectPath) {
    throw storageError(401, 'Token does not match the requested object')
  }

  const key = r2Key(bucket, objectPath)
  if (!(await r2Exists(key))) throw storageError(404, 'Object not found')

  const { body, contentType } = await r2Get(key)
  return {
    body,
    contentType: MIME[path.extname(objectPath).toLowerCase()] ?? contentType,
  }
}

/** Public buckets skip the signing dance entirely. */
export async function readPublic({ bucket, objectPath }) {
  const key = r2Key(bucket, objectPath)
  if (!(await r2Exists(key))) throw storageError(404, 'Object not found')

  const { body, contentType } = await r2Get(key)
  return {
    body,
    contentType: MIME[path.extname(objectPath).toLowerCase()] ?? contentType,
  }
}
