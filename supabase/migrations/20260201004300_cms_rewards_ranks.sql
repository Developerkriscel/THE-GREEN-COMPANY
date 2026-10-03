-- =====================================================================
-- Website rewards are edited in Website CMS -> Rewards again.
--
-- The deck's rewards were already there (Juicer ... Ertiga) but without the
-- rank each one belongs to, so the site had been reading the rank plan
-- instead and the office's edits in the CMS never showed. Each row now
-- carries its rank (in the `joining` column, labelled "Rank" in the CMS),
-- and Sales Country Head gets its own row, as in the deck.
-- =====================================================================

update public.rewards r
   set joining = v.rank
  from (values
    ('Juicer',        '100 sq yd',   'Team Coordinator'),
    ('Mixer Grinder', '100 sq yd',   'Manager'),
    ('Mobile phone',  '100 sq yd',   'Deputy Manager'),
    ('Mobile phone',  '200 sq yd',   'AGM'),
    ('Mobile phone',  '300 sq yd',   'DGM'),
    ('Mobile phone',  '400 sq yd',   'GM'),
    ('Laptop',        '500 sq yd',   'Vice President'),
    ('Car (₹7 lakh)', '1,300 sq yd', 'Core Manager'),
    ('Car — Brezza',  '1,800 sq yd', 'Diamond'),
    ('Car — Ertiga',  '2,500 sq yd', 'Crown')
  ) as v(title, sales, rank)
 where r.title = v.title and r.sales = v.sales and coalesce(r.joining, '') = '';

insert into public.rewards (level, title, joining, sales, trending, sort_order, is_active)
select 1, 'Car (₹7 lakh)', 'Sales Country Head', '1,300 sq yd', false, 9, true
 where not exists (select 1 from public.rewards where joining = 'Sales Country Head');

-- Brezza and Ertiga move down one place to make room.
update public.rewards set sort_order = 10 where title = 'Car — Brezza' and joining = 'Diamond' and sort_order = 9;
update public.rewards set sort_order = 11 where title = 'Car — Ertiga' and joining = 'Crown' and sort_order = 10;
