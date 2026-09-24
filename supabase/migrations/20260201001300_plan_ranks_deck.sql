-- =====================================================================
-- Public plan table: replace the old RoyalGreen figures with the Symo deck
--
-- /plans and the home page read `plan_ranks` from the Website CMS and only
-- fall back to the hardcoded array when that table is empty. The table still
-- held the previous brand's ladder -- ranks that no longer exist (Zonal
-- Manager, Platinum, Gold Leader), joining fees up to ₹1.5 crore and sale
-- percentages of 12-25%. The member panel was showing the deck's 5-20% at
-- the same time, so the public site contradicted the member's own dashboard.
--
-- Columns are text because this is CMS copy, not arithmetic:
--   joining  -> joining fee            (slide 9)
--   direct   -> SPONSOR slab           (slide 6)   [header: "Sponsor %"]
--   pct      -> own-sale slab          (slide 5)   [header: "Own Sale %"]
--   features -> training fee, salary, tickets, reward   (slides 7, 8, 9)
-- =====================================================================

delete from public.plan_ranks;

insert into public.plan_ranks (rank, joining, direct, pct, features, elite, sort_order, is_active)
values
  ('Channel Partner',    'Free',      '—',  '5%',  '₹3,000 training fee · Induction',                                            false,  1, true),
  ('Team Coordinator',   'Free',      '2%', '7%',  '₹3,000 training fee · Juicer at 100 sq yd',                                  false,  2, true),
  ('Manager',            'Free',      '2%', '9%',  '₹3,000 training fee · Mixer grinder at 100 sq yd',                           false,  3, true),
  ('Deputy Manager',     'Free',      '2%', '11%', '₹3,000 training fee · Mobile phone at 100 sq yd',                            false,  4, true),
  ('AGM',                '₹5,100',    '2%', '13%', 'Training free · ₹1,000 monthly salary · Mobile phone at 200 sq yd',          false,  5, true),
  ('DGM',                '₹11,000',   '1%', '14%', 'Training free · ₹2,000 monthly · 1 ticket · Mobile phone at 300 sq yd',      false,  6, true),
  ('GM',                 '₹21,000',   '1%', '15%', 'Training free · ₹5,000 monthly · 2 tickets · Mobile phone at 400 sq yd',     false,  7, true),
  ('Vice President',     '₹1,00,000', '1%', '16%', 'Training free · ₹9,000 monthly · 3 tickets · Laptop at 500 sq yd',           false,  8, true),
  ('Core Manager',       '₹2,00,000', '1%', '17%', '₹12,000 monthly · 5 tickets · Car (₹7 lakh) at 1,300 sq yd',                 true,   9, true),
  ('Sales Country Head', '₹3,00,000', '1%', '18%', '₹15,000 monthly · 7 tickets · Car (₹7 lakh) at 1,300 sq yd',                 true,  10, true),
  ('Diamond',            '₹4,00,000', '1%', '19%', '₹20,000 monthly · 11 tickets · Brezza at 1,800 sq yd',                       true,  11, true),
  ('Crown',              '₹5,00,000', '1%', '20%', '₹1,00,000 monthly · 15 tickets · Ertiga at 2,500 sq yd',                     true,  12, true);

-- NOTE: `plan_levels` is deliberately left alone. The deck has no level-income
-- table -- slide 8's "LEVEL" column is the rank's own position on the ladder,
-- not a downline depth -- so the 17 levels and their per-sq-yd rates remain
-- office-maintained CMS data. See the sponsor-panel notes: the income engine
-- reads plan_levels, so changing a rate is a CMS edit, not a code change.
