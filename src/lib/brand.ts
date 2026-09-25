/**
 * One place for who the company is.
 *
 * The name, the mark and the contact details were spread across two dozen
 * files, several of them pointing at the previous brand's domain for the
 * logo — so a rename meant hunting strings and a broken image meant hunting
 * URLs. Everything reads from here now.
 *
 * The mark (the gold coin) is cut from the brand sheet in IMAGES/LOGO.jpeg,
 * which is also published at `/brand-guidelines.jpg`. The name, tagline and
 * contact details are set here directly.
 *
 * A few of these are also stored in the database, where the office can edit
 * them and they override the code's defaults (see the migration
 * 20260201002200_brand_and_reward_tiers.sql). Change both together.
 */

export const BRAND = {
  /** Registered name, for letters, footers and anything legal-facing. */
  legalName: 'Royal Symo Green City Pvt Ltd',
  /** How the company refers to itself in running text. */
  name: 'Symocity',
  /** The short form, for a sidebar or a badge where space is tight. */
  short: 'Symocity',
  tagline: 'You Together Make Millionaire',

  /** Served from public/ — no external host, so it cannot rot or expire. */
  mark: '/brand-mark.jpg',
  markSquare: '/brand-mark-512.png',
  guidelines: '/brand-guidelines.jpg',

  website: 'symocity.com',
  websiteUrl: 'https://symocity.com',
  email: 'symocitydevelopers@gmail.com',
  phone: '9211809636',
  phoneHref: 'tel:+919211809636',

  /** The three lines the brand sheet closes on. */
  values: ['Building Communities', 'Creating Wealth', 'Sustainable Living'],
  compliance: 'RERA Compliant · Premium Real Estate Developer',
} as const

/** `© 2026 Royal Symo Green City Pvt Ltd. All rights reserved.` -- the registered name, from the brand sheet. */
export function copyright(year = new Date().getFullYear()) {
  return `© ${year} ${BRAND.legalName}. All rights reserved.`
}
