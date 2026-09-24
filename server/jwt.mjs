import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto'
import { config } from './config.mjs'

/*
 * HS256 JWTs and password hashing, using only node:crypto.
 *
 * No jsonwebtoken/bcrypt dependency on purpose: bcrypt ships a native addon,
 * and this machine's Application Control policy blocks native .node modules
 * (the same policy that broke Rollup and the Supabase CLI). scrypt is in the
 * standard library, is memory-hard, and is a perfectly respectable choice here.
 */

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const b64urlDecode = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

function sign(data, secret) {
  return b64url(createHmac('sha256', secret).update(data).digest())
}

export function signJwt(payload, { expiresIn = config.jwtExpirySeconds } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const body = {
    iss: 'royal-green-gateway',
    aud: 'authenticated',
    iat: now,
    exp: now + expiresIn,
    ...payload,
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify(body))
  const signature = sign(`${header}.${claims}`, config.jwtSecret)
  return `${header}.${claims}.${signature}`
}

/** Returns the claims, or null if the token is malformed, mis-signed or expired. */
export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, claims, signature] = parts
  const expected = sign(`${header}.${claims}`, config.jwtSecret)

  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload
  try {
    payload = JSON.parse(b64urlDecode(claims))
  } catch {
    return null
  }

  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

/* ------------------------------------------------------------- passwords */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, SCRYPT.keylen, SCRYPT).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false

  const candidate = scryptSync(plain, salt, SCRYPT.keylen, SCRYPT)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

export const newToken = () => randomBytes(32).toString('hex')
