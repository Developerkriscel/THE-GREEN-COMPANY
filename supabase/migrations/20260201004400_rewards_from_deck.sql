-- =====================================================================
-- Website rewards exactly as the office's deck, slide 8 "Reward Income"
-- (symocity_website_brand_colors.pptx, 2026-10-04):
--
--   Sales target (D = direct sq yd, G = group sq yd) | Rank | Reward slab | Reward
--   Rewards count after 50% payment, 4 months wise, 1 Sep 2026 - 31 Dec 2026.
--
-- A `slab` column holds the deck's reward percentage (2% / 1%); Website CMS
-- -> Rewards shows and edits it.
-- =====================================================================

alter table public.rewards add column if not exists slab text;

delete from public.rewards;

insert into public.rewards (level, title, joining, sales, slab, trending, sort_order, is_active)
values
  ( 1, 'Induction',          'Channel Partner',    '50 sq yd',                                null, false,  1, true),
  ( 2, 'Juicer',             'Team Coordinator',   '50 sq yd direct + 100 sq yd group',       '2%', false,  2, true),
  ( 3, 'Mixer Grinder',      'Manager',            '50 sq yd direct + 200 sq yd group',       '2%', false,  3, true),
  ( 4, 'Phone (₹10,000)',    'Deputy Manager',     '100 sq yd direct + 300 sq yd group',      '2%', false,  4, true),
  ( 5, 'Phone (₹10,000)',    'AGM',                '100 sq yd direct + 400 sq yd group',      '2%', false,  5, true),
  ( 6, 'Phone (₹15,000)',    'DGM',                '100 sq yd direct + 500 sq yd group',      '1%', false,  6, true),
  ( 7, 'Phone (₹20,000)',    'GM',                 '100 sq yd direct + 600 sq yd group',      '1%', false,  7, true),
  ( 8, 'Laptop',             'Vice President',     '200 sq yd direct + 700 sq yd group',      '1%', false,  8, true),
  ( 9, 'Car (₹5 Lac)',       'Core Manager',       '500 sq yd direct + 1,500 sq yd group',    '1%', false,  9, true),
  (10, 'Car (₹7 Lacs)',      'Sales Country Head', '1,000 sq yd direct + 2,500 sq yd group',  '1%', false, 10, true),
  (11, 'Car (₹10 Lacs)',     'Diamond',            '1,200 sq yd direct + 3,000 sq yd group',  '1%', false, 11, true),
  (12, 'Car (₹12 Lacs)',     'Crown',              '1,500 sq yd direct + 5,000 sq yd group',  '1%', false, 12, true);
