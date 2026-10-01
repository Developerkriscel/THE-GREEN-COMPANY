-- The public Plans page (/plans) was taken off the website on 2026-10-01.
-- Saved content that still sends visitors there now points at Projects.
update public.cms_banners
   set cta_link = '/projects',
       cta_label = case when cta_label ilike '%plan%' then 'Explore Projects' else cta_label end
 where cta_link like '/plans%';

update public.cms_announcements
   set cta_link = '/projects'
 where cta_link like '/plans%';

update public.site_settings
   set value = value || jsonb_build_object('secondary_cta_link', '/projects', 'secondary_cta_label', 'Explore Projects')
 where value->>'secondary_cta_link' like '/plans%';
