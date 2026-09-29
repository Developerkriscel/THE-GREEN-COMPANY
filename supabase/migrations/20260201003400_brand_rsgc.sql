-- =====================================================================
-- Rebrand to ROYAL SYMO GREEN CITY PRIVATE LIMITED, motto "You Together
-- Make Millionaire", and new sponsor IDs start with RSGC.
--
-- Existing IDs (RGC1000xx) are left as they are: they are printed on ID
-- cards and welcome letters and members sign in with them. The number
-- sequence carries on, so an RSGC ID never repeats an RGC number.
-- =====================================================================

create or replace function app.next_member_code()
returns text language sql as $$
  select 'RSGC' || nextval('public.member_code_seq')::text
$$;

-- The brand the whole app reads (Business Settings -> Company).
insert into public.site_settings (key, value, updated_at)
values ('public.brand', jsonb_build_object(
  'name', 'ROYAL SYMO GREEN CITY PRIVATE LIMITED',
  'short', 'ROYAL SYMO GREEN CITY',
  'legalName', 'ROYAL SYMO GREEN CITY PRIVATE LIMITED',
  'tagline', 'You Together Make Millionaire'), now())
on conflict (key) do update
  set value = coalesce(public.site_settings.value, '{}'::jsonb) || jsonb_build_object(
        'name', 'ROYAL SYMO GREEN CITY PRIVATE LIMITED',
        'short', 'ROYAL SYMO GREEN CITY',
        'legalName', 'ROYAL SYMO GREEN CITY PRIVATE LIMITED',
        'tagline', 'You Together Make Millionaire'),
      updated_at = now();

-- Website copy that named the old brand.
update public.site_settings
   set value = jsonb_set(value, '{hero_title}', to_jsonb(replace(value ->> 'hero_title', 'Symocity', 'Royal Symo Green City'))),
       updated_at = now()
 where key = 'public.contact' and value ->> 'hero_title' ilike '%symocity%';

update public.cms_pages
   set title = replace(title, 'Symocity', 'Royal Symo Green City'),
       body  = replace(body, 'Symocity', 'Royal Symo Green City')
 where title ilike '%symocity%' or body ilike '%symocity%';
