/**
 * Built-in rank and level tables, used when the Website CMS has none saved:
 * the home page's rank table and the level figures in site content.
 * (They lived in the Plans page, which was taken off the site on 2026-10-01.)
 */
export const RANKS = [
  // Fallback only, for when the ranks cannot be loaded. The live table is
  // built from the ranks the income engine pays on (planRows), which the
  // office edits in Admin → Business Settings → Rank plan.
  // `direct` is the SPONSOR slab (deck slide 6), `pct` the own-sale slab
  // (slide 5).
  { rank: 'Channel Partner',    joining: 'Free',      direct: '—',  pct: '5%',  features: '₹3,000 training fee · Induction', elite: false },
  { rank: 'Team Coordinator',   joining: '₹1,100',      direct: '2%', pct: '7%',  features: '₹3,000 training fee · Juicer at 100 sq yd', elite: false },
  { rank: 'Manager',            joining: '₹2,100',      direct: '2%', pct: '9%',  features: '₹3,000 training fee · Mixer grinder at 100 sq yd', elite: false },
  { rank: 'Deputy Manager',     joining: '₹3,100',      direct: '2%', pct: '11%', features: '₹3,000 training fee · Mobile phone at 100 sq yd', elite: false },
  { rank: 'AGM',                joining: '₹5,100',    direct: '2%', pct: '13%', features: 'Training free · ₹1,000 monthly salary · Mobile phone at 200 sq yd', elite: false },
  { rank: 'DGM',                joining: '₹11,000',   direct: '1%', pct: '14%', features: 'Training free · ₹2,000 monthly · 1 ticket · Mobile phone at 300 sq yd', elite: false },
  { rank: 'GM',                 joining: '₹21,000',   direct: '1%', pct: '15%', features: 'Training free · ₹5,000 monthly · 2 tickets · Mobile phone at 400 sq yd', elite: false },
  { rank: 'Vice President',     joining: '₹1,00,000', direct: '1%', pct: '16%', features: 'Training free · ₹9,000 monthly · 3 tickets · Laptop at 500 sq yd', elite: false },
  { rank: 'Core Manager',       joining: '₹2,00,000', direct: '1%', pct: '17%', features: '₹12,000 monthly · 5 tickets · Car (₹7 lakh) at 1,300 sq yd', elite: true },
  { rank: 'Sales Country Head', joining: '₹3,00,000', direct: '1%', pct: '18%', features: '₹15,000 monthly · 7 tickets · Car (₹7 lakh) at 1,300 sq yd', elite: true },
  { rank: 'Diamond',            joining: '₹4,00,000', direct: '1%', pct: '19%', features: '₹20,000 monthly · 11 tickets · Brezza at 1,800 sq yd', elite: true },
  { rank: 'Crown',              joining: '₹5,00,000', direct: '1%', pct: '20%', features: '₹1,00,000 monthly · 15 tickets · Ertiga at 2,500 sq yd', elite: true },
]

export const LEVELS = [
  { level: 1, rate: 300, tag: 'MOST REWARDING' },
  { level: 2, rate: 25, tag: '' },
  { level: 3, rate: 25, tag: '' },
  { level: 4, rate: 25, tag: '' },
  { level: 5, rate: 25, tag: '' },
  { level: 6, rate: 25, tag: '' },
  { level: 7, rate: 25, tag: '' },
  { level: 8, rate: 25, tag: '' },
  { level: 9, rate: 25, tag: '' },
  { level: 10, rate: 25, tag: '' },
  { level: 11, rate: 50, tag: '' },
  { level: 12, rate: 50, tag: '' },
  { level: 13, rate: 50, tag: '' },
  { level: 14, rate: 50, tag: '' },
  { level: 15, rate: 50, tag: '' },
  { level: 16, rate: 100, tag: '' },
  { level: 17, rate: 100, tag: '' },
]
