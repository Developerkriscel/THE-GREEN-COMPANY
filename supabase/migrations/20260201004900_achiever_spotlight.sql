-- "Meet Our Top Achiever" spotlight on the home page: one paragraph per
-- leader, in Website CMS -> Achievers ("Spotlight paragraph", the existing
-- `achievement` column). The office can rewrite any of them.
update public.achievers a
   set achievement = v.para
  from (values
    ('Kedar Singh',     'The pinnacle of 90 Days Training — Kedar Singh leads our leaderboard with ₹1 Cr in total sales and a direct team of 20+ partners, built on dedication, discipline and record sponsorships.'),
    ('Prabhatam Homes', 'Crown rank and the biggest direct team on our board — Prabhatam Homes has sponsored 51+ partners and closed ₹36 Lacs in sales, proof that a strong team is the surest road to the top.'),
    ('Neeta Singh',     'Core Manager Neeta Singh turned 90 Days Training into a lasting achievement — a 30+ strong direct team and ₹42 Lacs in sales, built with consistency, care for her team and true leadership.'),
    ('Dr. Anand Kumar', 'Dr. Anand Kumar rose to General Manager with a focused direct team of 10+ partners and ₹15 Lacs in sales — steady, honest work that compounds into real rewards.'),
    ('Saket Kumar',     'Saket Kumar reached Core Manager with ₹10 Lacs in sales and a growing team of 5+ partners — proof that every partner who follows the plan can chase the crown.')
  ) as v(name, para)
 where a.name = v.name and a.is_active and coalesce(a.achievement, '') = '';
