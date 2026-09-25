-- =====================================================================
-- Brand values held in the database, and reward tiers a photo can bind to
--
-- The name, tagline, mark and contact details live in src/lib/brand.ts and
-- every screen reads them from there. A few values are stored in the
-- database instead -- admin-editable settings that override the code's
-- defaults -- so they have to agree with brand.ts or the page that reads
-- them (Contact) shows a different company from the rest of the site.
--
-- The values below match brand.ts as it stands. If the brand changes, change
-- brand.ts and these together.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Public contact details
--
-- `public.contact` overrides the Contact page defaults. Only the company
-- name, email, phone and heading are set; any other field the office has
-- entered (address, branches, WhatsApp, map) is kept as it is.
-- ---------------------------------------------------------------------
update public.site_settings
   set value = value
             || jsonb_build_object(
                  'company', 'Royal Green Company',
                  'email', 'rgc@gmail.com',
                  'phone', '9211809636',
                  'hero_title', 'Talk to Royal Green Company'
                )
 where key = 'public.contact';

-- ---------------------------------------------------------------------
-- 2. Reward tiers the office can attach a photograph to
--
-- `rewards` held an older incentive list -- "Darjeeling / GOA", "Thailand /
-- iPhone", "Car Full Paid" -- none of which are the tiers the plan actually
-- pays. The sponsor panel matches a photo to a tier by title, so nothing
-- matched and every card fell back to the same placeholder.
--
-- These rows carry the plan's own tier names (deck slide 7), so a photo
-- uploaded against a tier binds to it automatically.
--
-- Every tier starts with NO image. The older pictures were tried and
-- dropped: they return 200 to curl but do not render in the app, so the
-- member saw a broken box, and they are promotional artwork rather than
-- photographs of the actual prize. A placeholder that says "Juicer" is
-- honest; a promo banner standing in for one is not. The office uploads the
-- real article through Website CMS -> Gallery and pastes the URL against
-- the tier.
-- ---------------------------------------------------------------------
delete from public.rewards;

insert into public.rewards (title, sales, image_url, sort_order, is_active) values
  ('Juicer',          '100 sq yd',   null,  1, true),
  ('Mixer Grinder',   '100 sq yd',   null,  2, true),
  ('Mobile phone',    '100 sq yd',   null,  3, true),
  ('Mobile phone',    '200 sq yd',   null,  4, true),
  ('Mobile phone',    '300 sq yd',   null,  5, true),
  ('Mobile phone',    '400 sq yd',   null,  6, true),
  ('Laptop',          '500 sq yd',   null,  7, true),
  ('Car (₹7 lakh)',   '1,300 sq yd', null,  8, true),
  ('Car — Brezza',    '1,800 sq yd', null,  9, true),
  ('Car — Ertiga',    '2,500 sq yd', null, 10, true);
