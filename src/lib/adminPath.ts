/**
 * The admin sign-in lives at a private address that no public page links to.
 * Share it only with office staff. It is not a security control on its own
 * (the account password is) — it keeps the admin door off the public site.
 * Set VITE_ADMIN_LOGIN_PATH at build time to move it.
 */
export const ADMIN_LOGIN_PATH: string = import.meta.env.VITE_ADMIN_LOGIN_PATH || '/office-19fcd1e610'
