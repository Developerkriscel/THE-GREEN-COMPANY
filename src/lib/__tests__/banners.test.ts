import { describe, expect, it } from 'vitest'
import { bannerIsLive, type Banner } from '@/lib/queries'

/**
 * The display window on a sponsor-panel announcement. The office schedules a
 * sale strip to start and stop on its own, so getting this wrong either hides
 * a live promotion or leaves an expired one on every member's dashboard.
 */

const banner = (p: Partial<Banner>): Banner => ({
  id: 'b1', title: 'Festive offer', subtitle: null, image_url: null,
  cta_label: null, cta_link: null, sort_order: 0, active: true,
  audience: 'sponsor', tone: 'offer', dismissible: true,
  starts_at: null, ends_at: null,
  ...p,
})

const at = (y: number, m: number, d: number) => new Date(y, m, d)

describe('bannerIsLive', () => {
  const now = at(2026, 8, 24)

  it('runs a banner with no window at all', () => {
    expect(bannerIsLive(banner({}), now)).toBe(true)
  })

  it('hides one that has not started', () => {
    expect(bannerIsLive(banner({ starts_at: at(2026, 9, 1).toISOString() }), now)).toBe(false)
  })

  it('hides one that has ended', () => {
    expect(bannerIsLive(banner({ ends_at: at(2026, 8, 1).toISOString() }), now)).toBe(false)
  })

  it('runs one inside its window', () => {
    expect(bannerIsLive(banner({
      starts_at: at(2026, 8, 20).toISOString(),
      ends_at: at(2026, 8, 30).toISOString(),
    }), now)).toBe(true)
  })

  it('an open-ended start still runs once reached', () => {
    expect(bannerIsLive(banner({ starts_at: at(2026, 8, 1).toISOString() }), now)).toBe(true)
  })

  it('an open-ended finish runs until switched off', () => {
    expect(bannerIsLive(banner({ ends_at: at(2026, 9, 30).toISOString() }), now)).toBe(true)
  })

  it('shows a banner whose dates are nonsense rather than silently eating it', () => {
    // A typo in the CMS should be visible to the office, not make the
    // announcement disappear with no explanation.
    expect(bannerIsLive(banner({ starts_at: 'tomorrow', ends_at: 'never' }), now)).toBe(true)
  })
})
