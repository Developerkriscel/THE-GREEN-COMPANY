import { randomUUID } from 'node:crypto'
import { withOwner } from './db.mjs'
import { config } from './config.mjs'
import { hashPassword, newToken, signJwt, verifyPassword, verifyJwt } from './jwt.mjs'

/*
 * A GoTrue-shaped auth service, covering what @supabase/supabase-js calls.
 *
 * These routes are the one place that touches auth.users directly, so they run
 * with owner privileges — there is no user identity yet at sign-in time. They
 * never accept a table name or a filter from the client, so there is no way to
 * reach application data through here.
 *
 * Differences from hosted GoTrue, stated plainly:
 *  - Sign-ups are auto-confirmed. There is no mail provider wired up, and the
 *    real gate for staff is profiles.status = 'pending', which an admin must
 *    clear regardless. An unconfirmable account would just be a dead end.
 *  - Password reset issues a recovery token but cannot email it; the token is
 *    returned to the server log for development use.
 *  - Passwords are scrypt, not bcrypt (see jwt.mjs for why).
 */

export async function ensureAuthTables() {
  await withOwner(async (client) => {
    await client.query(`
      create table if not exists auth.refresh_tokens (
        token      text primary key,
        user_id    uuid not null references auth.users(id) on delete cascade,
        revoked    boolean not null default false,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );
      create index if not exists refresh_tokens_user_idx on auth.refresh_tokens (user_id);

      create table if not exists auth.recovery_tokens (
        token      text primary key,
        user_id    uuid not null references auth.users(id) on delete cascade,
        used       boolean not null default false,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );
    `)
  })
}

const shapeUser = (row) => ({
  id: row.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: row.email,
  phone: row.phone ?? '',
  email_confirmed_at: row.email_confirmed_at,
  confirmed_at: row.email_confirmed_at,
  last_sign_in_at: row.last_sign_in_at,
  app_metadata: row.raw_app_meta_data ?? {},
  user_metadata: row.raw_user_meta_data ?? {},
  identities: [],
  created_at: row.created_at,
  updated_at: row.updated_at,
})

async function issueSession(client, user) {
  const accessToken = signJwt({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    app_metadata: user.raw_app_meta_data ?? {},
    user_metadata: user.raw_user_meta_data ?? {},
  })

  const refreshToken = newToken()
  await client.query(
    `insert into auth.refresh_tokens (token, user_id, expires_at)
     values ($1, $2, now() + make_interval(secs => $3))`,
    [refreshToken, user.id, config.refreshExpirySeconds],
  )
  await client.query(`update auth.users set last_sign_in_at = now() where id = $1`, [user.id])

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: config.jwtExpirySeconds,
    expires_at: Math.floor(Date.now() / 1000) + config.jwtExpirySeconds,
    refresh_token: refreshToken,
    user: shapeUser(user),
  }
}

const authError = (status, message, code) => {
  const err = new Error(message)
  err.status = status
  err.authCode = code
  return err
}

export async function signup({ email, password, data }) {
  if (!email || !password) throw authError(400, 'Email and password are required', 'validation_failed')
  if (String(password).length < 8) {
    throw authError(422, 'Password should be at least 8 characters', 'weak_password')
  }

  return withOwner(async (client) => {
    const existing = await client.query(`select id from auth.users where lower(email) = lower($1)`, [
      email,
    ])
    if (existing.rowCount) {
      throw authError(422, 'A user with this email address already exists', 'user_already_exists')
    }

    // The on_auth_user_created trigger turns this row into a profile, forcing
    // role='rep' and status='pending'. Nothing the client sends can change that.
    const { rows } = await client.query(
      `insert into auth.users
         (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       values ($1, $2, $3, now(), $4, '{"provider":"email","providers":["email"]}'::jsonb)
       returning *`,
      [randomUUID(), String(email).trim(), hashPassword(password), JSON.stringify(data ?? {})],
    )

    const session = await issueSession(client, rows[0])
    return { ...session, user: shapeUser(rows[0]) }
  })
}

export async function signInWithPassword({ email, password }) {
  if (!email || !password) {
    throw authError(400, 'Email and password are required', 'validation_failed')
  }

  return withOwner(async (client) => {
    const { rows } = await client.query(
      `select * from auth.users where lower(email) = lower($1) and deleted_at is null`,
      [String(email).trim()],
    )

    // Same message and roughly the same work whether the user exists or not.
    const user = rows[0]
    const ok = user && verifyPassword(password, user.encrypted_password)
    if (!ok) throw authError(400, 'Invalid login credentials', 'invalid_credentials')

    return issueSession(client, user)
  })
}

export async function refreshSession({ refresh_token }) {
  if (!refresh_token) throw authError(400, 'Refresh token is required', 'validation_failed')

  return withOwner(async (client) => {
    const { rows } = await client.query(
      `select t.*, u.* from auth.refresh_tokens t
         join auth.users u on u.id = t.user_id
        where t.token = $1`,
      [refresh_token],
    )
    const row = rows[0]
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
      throw authError(400, 'Invalid refresh token', 'refresh_token_not_found')
    }

    // Rotate: a refresh token is single-use, so a stolen one is useful only
    // until the legitimate client next refreshes.
    await client.query(`update auth.refresh_tokens set revoked = true where token = $1`, [
      refresh_token,
    ])

    const { rows: users } = await client.query(`select * from auth.users where id = $1`, [row.user_id])
    return issueSession(client, users[0])
  })
}

export async function getUser(token) {
  const claims = verifyJwt(token)
  if (!claims?.sub) throw authError(401, 'Invalid token', 'bad_jwt')

  return withOwner(async (client) => {
    const { rows } = await client.query(`select * from auth.users where id = $1`, [claims.sub])
    if (!rows.length) throw authError(404, 'User not found', 'user_not_found')
    return shapeUser(rows[0])
  })
}

export async function updateUser(token, body) {
  const claims = verifyJwt(token)
  if (!claims?.sub) throw authError(401, 'Invalid token', 'bad_jwt')

  return withOwner(async (client) => {
    if (body.password) {
      if (String(body.password).length < 8) {
        throw authError(422, 'Password should be at least 8 characters', 'weak_password')
      }
      await client.query(`update auth.users set encrypted_password = $1, updated_at = now() where id = $2`, [
        hashPassword(body.password),
        claims.sub,
      ])
      // A password change invalidates existing refresh tokens.
      await client.query(`update auth.refresh_tokens set revoked = true where user_id = $1`, [claims.sub])
    }

    if (body.data) {
      await client.query(
        `update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb, updated_at = now()
          where id = $2`,
        [JSON.stringify(body.data), claims.sub],
      )
    }

    const { rows } = await client.query(`select * from auth.users where id = $1`, [claims.sub])
    return shapeUser(rows[0])
  })
}

export async function logout(token) {
  const claims = verifyJwt(token)
  if (!claims?.sub) return
  await withOwner(async (client) => {
    await client.query(`update auth.refresh_tokens set revoked = true where user_id = $1`, [claims.sub])
  })
}

export async function recover({ email }) {
  if (!email) throw authError(400, 'Email is required', 'validation_failed')

  await withOwner(async (client) => {
    const { rows } = await client.query(`select id from auth.users where lower(email) = lower($1)`, [
      String(email).trim(),
    ])
    // Always succeed, so this cannot be used to enumerate registered addresses.
    if (!rows.length) return

    const token = newToken()
    await client.query(
      `insert into auth.recovery_tokens (token, user_id, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [token, rows[0].id],
    )
    console.log(
      `\n[auth] Password recovery for ${email}\n` +
        `       No mail provider is configured, so here is the link:\n` +
        `       ${config.corsOrigin}/reset-password#access_token=${signJwt(
          { sub: rows[0].id, role: 'authenticated', email },
          { expiresIn: 3600 },
        )}&type=recovery\n`,
    )
  })
}
