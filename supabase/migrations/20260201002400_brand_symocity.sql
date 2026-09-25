-- =====================================================================
-- Rename: Royal Green Company -> Symocity
--
-- The name in code lives in src/lib/brand.ts. These are the copies the
-- office can edit, stored in the database, which override the code on the
-- Contact, About and Terms pages. Only text still carrying the old name is
-- touched, so anything the office has already rewritten is left as it is.
--
-- Not renamed: the project "The Royal Green Farm" (a property's own name)
-- and member codes like RGC100004 (identifiers people already use).
-- =====================================================================

update public.site_settings
   set value = value
             || case when value->>'company' in ('Royal Green Company', 'Royal Green')
                     then jsonb_build_object('company', 'Symocity') else '{}'::jsonb end
             || case when value->>'hero_title' ~* 'royal green'
                     then jsonb_build_object('hero_title',
                            regexp_replace(value->>'hero_title', 'Royal Green( Company)?', 'Symocity', 'gi'))
                     else '{}'::jsonb end
 where key = 'public.contact';

update public.cms_pages
   set title = regexp_replace(title, 'Royal Green( Company| Developers)?', 'Symocity', 'g'),
       body  = regexp_replace(body,  'Royal Green( Company| Developers)?', 'Symocity', 'g')
 where title ~ 'Royal Green' or body ~ 'Royal Green';
