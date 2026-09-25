import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { withOwner } from './db.mjs'
import { config } from './config.mjs'
import { hashPassword, newToken, signJwt, verifyPassword, verifyJwt } from './jwt.mjs'
import { recoveryMail, sendMail, signupCodeMail } from './mailer.mjs'

/*
 * A GoTrue-shaped auth service, covering what @supabase/supabase-js calls.
 *
 * These routes are the one place that touches auth.users directly, so they run
 * with owner privileges — there is no user identity yet at sign-in time. They
 * never accept a table name or a filter from the client, so there is no way to
 * reach application data through here.
 *
 * Differences from hosted GoTrue, stated plainly:
 *  - Email confirmation is a 6-digit code rather than a magic link. A code
 *    works when the mail is opened on a different device from the sign-up,
 *    which for members joining from a phone is the common case.
 *  - Mail goes out over plain SMTP (server/mailer.mjs). With none configured
 *    in development, codes and reset links are printed to the console.
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

      -- Sign-up confirmation codes. Only a peppered hash is stored: a
      -- six-digit code is a small space, so a leaked table of plain hashes
      -- could be reversed by trying all million.
      create table if not exists auth.email_otps (
        id         bigserial primary key,
        user_id    uuid not null references auth.users(id) on delete cascade,
        code_hash  text not null,
        attempts   int  not null default 0,
        used       boolean not null default false,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );
      create index if not exists email_otps_user_idx on auth.email_otps (user_id, created_at desc);
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

/* ------------------------------------------------ email confirmation codes */

const OTP_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_SECONDS = 60
const OTP_MAX_PER_HOUR = 5

/** Peppered with the JWT secret, so the stored hash cannot be brute-forced offline. */
const hashCode = (userId, code) =>
  createHash('sha256').update(`${userId}:${code}:${config.jwtSecret}`).digest('hex')

const sameHash = (a, b) => {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Issue a fresh code and mail it. Any earlier unused code is retired first,
 * so only the most recent email ever works -- the one the member is looking at.
 */
async function issueSignupCode(client, user) {
  const { rows: recent } = await client.query(
    `select created_at from auth.email_otps
      where user_id = $1 and created_at > now() - interval '1 hour'
      order by created_at desc`,
    [user.id],
  )
  if (recent.length >= OTP_MAX_PER_HOUR) {
    throw authError(429, 'Too many codes requested. Please try again in an hour.', 'over_email_send_rate_limit')
  }
  if (recent.length && Date.now() - new Date(recent[0].created_at).getTime() < OTP_RESEND_SECONDS * 1000) {
    throw authError(429, 'Please wait a minute before asking for another code.', 'over_email_send_rate_limit')
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await client.query(`update auth.email_otps set used = true where user_id = $1 and not used`, [user.id])
  await client.query(
    `insert into auth.email_otps (user_id, code_hash, expires_at)
     values ($1, $2, now() + make_interval(mins => $3))`,
    [user.id, hashCode(user.id, code), OTP_MINUTES],
  )

  // Sent inside the transaction on purpose: if the mail cannot go out, the
  // sign-up rolls back and the address is free to try again, rather than
  // leaving an account nobody can ever confirm.
  await sendMail({ to: user.email, ...signupCodeMail({ code, minutes: OTP_MINUTES }) })
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
    // email_confirmed_at stays NULL until the member enters the code we mail
    // them. It used to be set to now() here, which meant any address at all
    // -- including somebody else's -- could be registered and signed in.
    const { rows } = await client.query(
      `insert into auth.users
         (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       values ($1, $2, $3, null, $4, '{"provider":"email","providers":["email"]}'::jsonb)
       returning *`,
      [randomUUID(), String(email).trim(), hashPassword(password), JSON.stringify(data ?? {})],
    )

    await issueSignupCode(client, rows[0])

    // GoTrue's shape when confirmation is required: the user, and no session.
    // supabase-js reads this as { user, session: null }.
    return { ...shapeUser(rows[0]), confirmation_sent_at: new Date().toISOString() }
  })
}

/**
 * POST /auth/v1/verify  { type: 'signup', email, token }
 * The member types the six digits; on a match the address is confirmed and a
 * session issued, so they land signed in without typing the password again.
 */
export async function verifyOtp({ type, email, token }) {
  if (type && type !== 'signup' && type !== 'email') {
    throw authError(400, `Unsupported verification type: ${type}`, 'validation_failed')
  }
  if (!email || !token) throw authError(400, 'Email and code are required', 'validation_failed')

  const code = String(token).replace(/\D/g, '')
  // One message for every failure, so this cannot be used to learn which
  // addresses are registered.
  const invalid = () => authError(403, 'That code is wrong or has expired.', 'otp_expired')

  // A wrong guess must be RECORDED and then refused. withOwner runs one
  // transaction and rolls it back on any throw, so throwing straight after
  // counting the miss undid the count: every guess was free and the five-try
  // limit never fired. The miss is returned instead, the transaction commits
  // with the attempt stored, and the refusal is raised once outside it.
  const outcome = await withOwner(async (client) => {
    const { rows: users } = await client.query(
      `select * from auth.users where lower(email) = lower($1) and deleted_at is null`,
      [String(email).trim()],
    )
    const user = users[0]
    if (!user) throw invalid()
    if (user.email_confirmed_at) {
      throw authError(400, 'This email is already confirmed. Please sign in.', 'email_address_already_confirmed')
    }

    // Only the most recent code ever counts. Filtering on "not used" here
    // would fall back to an older live code once the newest was burned, and
    // two resends racing each other can leave two live codes -- which would
    // turn "five guesses per code" into five guesses per code *each*.
    const { rows } = await client.query(
      `select id, code_hash, attempts, used, expires_at > now() as live
         from auth.email_otps
        where user_id = $1
        order by created_at desc limit 1
        for update`,
      [user.id],
    )
    const otp = rows[0]
    if (!otp || otp.used || !otp.live) throw invalid()

    if (code.length !== 6 || !sameHash(otp.code_hash, hashCode(user.id, code))) {
      // Count the miss; five wrong guesses burns the code so it cannot be
      // brute-forced within its ten minutes.
      await client.query(
        `update auth.email_otps
            set attempts = attempts + 1,
                used = (attempts + 1 >= $2)
          where id = $1`,
        [otp.id, OTP_MAX_ATTEMPTS],
      )
      return { ok: false }
    }

    await client.query(`update auth.email_otps set used = true where id = $1`, [otp.id])
    const { rows: confirmed } = await client.query(
      `update auth.users set email_confirmed_at = now(), updated_at = now()
        where id = $1 returning *`,
      [user.id],
    )
    return { ok: true, session: await issueSession(client, confirmed[0]) }
  })

  if (!outcome.ok) throw invalid()
  return outcome.session
}

/**
 * POST /auth/v1/resend  { type: 'signup', email }
 * Always answers success for an unknown address, so it cannot be used to
 * probe who has an account.
 */
export async function resend({ type, email }) {
  if (type && type !== 'signup') {
    throw authError(400, `Unsupported resend type: ${type}`, 'validation_failed')
  }
  if (!email) throw authError(400, 'Email is required', 'validation_failed')

  await withOwner(async (client) => {
    const { rows } = await client.query(
      `select * from auth.users where lower(email) = lower($1) and deleted_at is null`,
      [String(email).trim()],
    )
    const user = rows[0]
    if (!user || user.email_confirmed_at) return
    await issueSignupCode(client, user)
  })
  return { user: null, session: null }
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

    // Only after the password is known to be right, so this reveals nothing
    // to someone who does not already hold the credentials.
    if (!user.email_confirmed_at) {
      throw authError(400, 'Email not confirmed', 'email_not_confirmed')
    }

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
    // This used to only print the link to the server console, so a member
    // who forgot their password could never actually reset it.
    const link =
      `${config.corsOrigin}/reset-password#access_token=${signJwt(
        { sub: rows[0].id, role: 'authenticated', email },
        { expiresIn: 3600 },
      )}&type=recovery`
    await sendMail({ to: String(email).trim(), ...recoveryMail({ link }) })
  })
}
