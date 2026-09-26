import nodemailer from 'nodemailer'
import { config } from './config.mjs'

/*
 * Outgoing mail over plain SMTP, so any free provider works:
 *
 *   Gmail   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  (500 mails/day)
 *           SMTP_USER = the Gmail address
 *           SMTP_PASS = a 16-character App Password — NOT the account
 *                       password. Google -> Account -> Security ->
 *                       2-Step Verification -> App passwords.
 *   Brevo   SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 (300 mails/day)
 *
 * With no SMTP configured the message is written to the gateway console
 * instead, so sign-up and password reset can still be exercised locally.
 * That is a development convenience only: in production nobody reads the
 * console, so a missing SMTP setup there is an error, not a fallback.
 */

import { brandName } from './brand.mjs'

let transport = null

function smtpConfigured() {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass)
}

function getTransport() {
  if (!transport) {
    const port = Number(config.smtpPort || 465)
    transport = nodemailer.createTransport({
      host: config.smtpHost,
      port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: port === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    })
  }
  return transport
}

/** True when real mail can go out. The UI uses this to phrase its prompts. */
export function mailEnabled() {
  return smtpConfigured()
}

export async function sendMail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    if (config.isProduction) {
      throw Object.assign(
        new Error('Mail is not configured on the server. Please contact the office.'),
        { status: 503 },
      )
    }
    console.log(
      `\n[mail] SMTP is not configured, so this message was not sent.\n` +
        `       To: ${to}\n       Subject: ${subject}\n\n${text}\n`,
    )
    return { delivered: false }
  }

  await getTransport().sendMail({
    from: config.mailFrom || `${await brandName()} <${config.smtpUser}>`,
    to,
    subject,
    text,
    html,
  })
  return { delivered: true }
}

/* ------------------------------------------------------------ templates */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function frame(brand, title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#15803d;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:bold">${esc(brand)}</td></tr>
        <tr><td style="padding:24px;color:#0f172a;font-size:14px;line-height:1.55">
          <h1 style="margin:0 0 12px;font-size:18px">${esc(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px">
          If you did not ask for this, you can ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`
}

/** `brand` is the company name from Business Settings (see brand.mjs). */
export function signupCodeMail({ code, minutes, brand }) {
  return {
    subject: `${code} is your ${brand} verification code`,
    text:
      `Your verification code is ${code}\n\n` +
      `Enter it on the sign-up screen to confirm your email address. ` +
      `It expires in ${minutes} minutes.\n`,
    html: frame(
      brand,
      'Confirm your email address',
      `<p style="margin:0 0 16px">Enter this code on the sign-up screen:</p>
       <p style="margin:0 0 16px;font-size:30px;letter-spacing:8px;font-weight:bold;color:#15803d">${esc(code)}</p>
       <p style="margin:0;color:#475569">It expires in ${minutes} minutes.</p>`,
    ),
  }
}

export function recoveryMail({ link, brand }) {
  return {
    subject: `Reset your ${brand} password`,
    text: `Open this link to choose a new password. It expires in 1 hour.\n\n${link}\n`,
    html: frame(
      brand,
      'Reset your password',
      `<p style="margin:0 0 16px">Use the button below to choose a new password. The link expires in 1 hour.</p>
       <p style="margin:0 0 16px"><a href="${esc(link)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Choose a new password</a></p>
       <p style="margin:0;color:#64748b;font-size:12px;word-break:break-all">${esc(link)}</p>`,
    ),
  }
}
