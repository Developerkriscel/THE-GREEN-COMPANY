-- The office landline, shown on the website footer, the Contact page, the
-- phone menu and the customer panel. Editable in Business Settings -> Company.
update public.site_settings
   set value = coalesce(value, '{}'::jsonb) || jsonb_build_object('landline', '0124-3168769')
 where key = 'public.brand';
