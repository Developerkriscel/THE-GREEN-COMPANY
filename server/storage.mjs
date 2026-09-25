import path from 'node:path'
import { withOwner, withRls } from './db.mjs'
import { signJwt, verifyJwt } from './jwt.mjs'
import { r2Put, r2Get, r2Exists, r2Delete, R2_BUCKET } from './r2.mjs'

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

/**
 * Content that runs when a browser opens it. Files are served from this
 * gateway's own origin, so an uploaded HTML or script file would execute with
 * the site's cookies -- never accepted, whatever a bucket allows.
 */
const ACTIVE_CONTENT = /^(text\/html|application\/(x-)?javascript|text\/javascript|application\/xhtml)/i
const ACTIVE_EXT = /\.(html?|xhtml|js|mjs|svg)$/i

export async function upload({ role, claims, bucket, objectPath, body, contentType, upsert }) {
  if (!body?.length) throw storageError(400, 'Empty upload')

  let type = String(contentType ?? '').split(';')[0].trim().toLowerCase()
  // A File the browser could not type arrives as octet-stream; judge it by
  // its name instead, so a .jpg is checked as the JPEG it is.
  if (!type || type === 'application/octet-stream') {
    type = MIME[path.extname(objectPath).toLowerCase()] ?? 'application/octet-stream'
  }
  contentType = type
  if (ACTIVE_CONTENT.test(type) || ACTIVE_EXT.test(objectPath)) {
    throw storageError(415, 'That kind of file cannot be uploaded')
  }

  // The bucket's own limits. These were declared in storage.buckets from the
  // start but never checked, so the content type -- which the client
  // supplies -- and the size were taken on trust.
  //
  // Read with owner rights, not the caller's: storage.buckets has row security
  // on and no policies, so as `authenticated` it reads as empty and every
  // upload to every bucket would be refused as "not found". Bucket limits are
  // configuration, not anyone's data.
  const b = await withOwner(async (client) =>
    (await client.query(
      `select file_size_limit, allowed_mime_types from storage.buckets where id = $1`,
      [bucket],
    )).rows,
  )
  if (!b.length) throw storageError(404, 'Bucket not found')
  const limit = b[0].file_size_limit == null ? null : Number(b[0].file_size_limit)
  if (limit && body.length > limit) {
    throw storageError(413, `File is too large (limit ${Math.round(limit / 1048576)} MB)`)
  }
  const allowed = b[0].allowed_mime_types
  if (Array.isArray(allowed) && allowed.length && !allowed.includes(type)) {
    throw storageError(415, `This bucket does not accept ${type || 'that file type'}`)
  }

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

/**
 * Delete objects. The row is deleted as the caller, so the bucket's delete
 * policy decides; only what the policy let go is removed from R2.
 */
export async function remove({ role, claims, bucket, paths }) {
  if (!Array.isArray(paths) || !paths.length) return []
  const names = paths.map(String)
  const deleted = await withRls(role, claims, async (client) =>
    (await client.query(
      `delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name`,
      [bucket, names],
    )).rows.map((r) => r.name),
  )
  for (const name of deleted) {
    await r2Delete(r2Key(bucket, name)).catch(() => {})
  }
  return deleted.map((name) => ({ bucket_id: bucket, name }))
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
