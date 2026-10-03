-- =====================================================================
-- Website content update (2026-10-04, from the office's list)
--
-- * Achievers ("Real leaders. Real rewards." on Home) gain a direct-team
--   and a total-sales figure, and are replaced by the five leaders the
--   office named, reusing the photos already uploaded under Team.
-- * Board of Members on Home reads the Team page's directors / managing
--   directors; Jai Pal Singh shows as "Crown Member".
-- * "Mission 90 Days" is now "90 Days Training".
-- * Projects show Symo City, Manglam City and Anjani Kunj first.
-- * News and Events are taken off the site (unpublished, not deleted: the
--   office can switch any of them back on in Website CMS).
-- =====================================================================

alter table public.achievers add column if not exists direct_team text;
alter table public.achievers add column if not exists total_sales text;

-- The old line-up stays in the CMS, switched off.
update public.achievers set is_active = false where is_active;

insert into public.achievers (name, rank, direct_team, total_sales, photo_url, sort_order, is_active)
select v.name, v.rank, v.direct_team, v.total_sales,
       (select t.photo_url from public.team_members t
         where lower(regexp_replace(t.name, '[^a-zA-Z]', '', 'g')) = lower(regexp_replace(v.photo_of, '[^a-zA-Z]', '', 'g'))
         order by t.is_active desc limit 1),
       v.sort_order, true
  from (values
    ('Kedar Singh',     'Deputy Manager',  '20+', '₹1 Cr',    'Kedar Singh',     1),
    ('Prabhatam Homes', 'Crown',           '51+', '₹36 Lacs', 'Prabhatam Homes', 2),
    ('Neeta Singh',     'Core Manager',    '30+', '₹42 Lacs', 'NEETA SINGH',     3),
    ('Dr. Anand Kumar', 'General Manager', '10+', '₹15 Lacs', 'Dr Anand Kumar',  4),
    ('Saket Kumar',     'Core Manager',    '5+',  '₹10 Lacs', 'Saket Kumar',     5)
  ) as v(name, rank, direct_team, total_sales, photo_of, sort_order);

-- Team page: the spelling of the rank, and the board titles as given.
update public.team_members set designation = 'Deputy Manager' where designation = 'Depty Manager';
update public.team_members set designation = 'Crown Member'
 where category = 'managing_director' and name ilike 'jai%pal%singh%';

-- "Mission 90 Days" -> "90 Days Training"
update public.cms_announcements
   set message = replace(message, 'Mission 90 Days training', '90 Days Training')
 where message like '%Mission 90 Days training%';
update public.site_settings
   set value = jsonb_set(value, '{badge}', to_jsonb(replace(value->>'badge', 'Mission 90 Days', '90 Days Training')))
 where key = 'home.hero' and value->>'badge' like '%Mission 90 Days%';

-- Project order: Symo City, Manglam City, Anjani Kunj, then the rest.
update public.projects p
   set sort_order = v.ord
  from (values ('symo-city-sohna', 1), ('manglam-city-block-b', 2), ('anjani-kunj', 3),
               ('manglam-city-block-a', 4), ('anjani-homes', 5), ('royal-green-farm', 6)) as v(slug, ord)
 where p.slug = v.slug;

-- News and Events off the site.
update public.news_posts set is_active = false where is_active;
update public.events set is_active = false where is_active;

-- The home page promo banner said "Mission 90 Days Training" too.
update public.cms_banners
   set title = replace(title, 'Mission 90 Days Training', '90 Days Training'),
       subtitle = replace(subtitle, 'Mission 90 Days', '90 Days Training')
 where title like '%Mission 90 Days%' or subtitle like '%Mission 90 Days%';
