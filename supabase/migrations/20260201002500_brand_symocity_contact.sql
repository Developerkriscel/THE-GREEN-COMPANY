-- =====================================================================
-- Symocity contact details, from the brand sheet (IMAGES/LOGO.jpeg):
-- symocitydevelopers@gmail.com, symocity.com. The phone is unchanged.
-- Only the old address is replaced; an email the office has set to
-- anything else is left alone.
-- =====================================================================

update public.site_settings
   set value = value || jsonb_build_object('email', 'symocitydevelopers@gmail.com')
 where key = 'public.contact'
   and value->>'email' in ('rgc@gmail.com', 'support@royalgreencompany.com');
