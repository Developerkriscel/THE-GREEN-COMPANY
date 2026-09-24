-- =====================================================================
-- Royal Green — 0005 : reference data
-- The 14-rank ladder from spec §5.18. own_sale_rate applies ONLY to the
-- rep's own admin-confirmed sales. There is no second rate column and
-- there must never be one.
-- =====================================================================

insert into public.ranks (name, seniority, own_sale_rate, description) values
  ('Associate',                  1,  7.00, 'Entry rank for a newly activated sales rep.'),
  ('Manager',                    2,  9.00, 'Rank title only — does not grant the manager access role.'),
  ('Senior Manager',             3, 11.00, null),
  ('AGM',                        4, 13.00, 'Assistant General Manager.'),
  ('Team Coordinator',           5, 14.00, null),
  ('Area Team Coordinator',      6, 15.00, null),
  ('District Team Coordinator',  7, 17.00, null),
  ('Zonal Team Coordinator',     8, 18.00, null),
  ('State Team Coordinator',     9, 19.00, null),
  ('Regional Team Coordinator', 10, 20.00, null),
  ('National Team Coordinator', 11, 21.00, null),
  ('Country Head',              12, 22.00, null),
  ('WTC',                       13, 25.00, null),
  ('Diamond / Crown Diamond',   14, 30.00, 'Top of the ladder. Still single-level: own sales only.')
on conflict (name) do nothing;

-- Statutory / company deductions applied at payout time.
insert into public.commission_deductions (name, percent, active) values
  ('TDS',           5.00, true),
  ('Admin charge',  2.00, true)
on conflict (name) do nothing;

-- Site settings consumed by the public website.
insert into public.site_settings (key, value) values
  ('public.contact', jsonb_build_object(
      'company',  'Royal Green Developers',
      'phone',    '+91 00000 00000',
      'email',    'hello@royalgreen.example',
      'address',  'Head Office, City, State',
      'whatsapp', '+91 00000 00000')),
  ('public.hero', jsonb_build_object(
      'title',    'Own a piece of tomorrow',
      'subtitle', 'Premium residential and commercial plots, clear titles, transparent paperwork.')),
  ('internal.approval', jsonb_build_object(
      'manager_reviews_step2',   true,
      'manager_can_activate_rep', false))
on conflict (key) do nothing;

insert into public.cms_pages (slug, title, body) values
  ('about', 'About Royal Green',
   'Royal Green develops and sells residential and commercial plots with clear titles, transparent pricing and complete paperwork.'),
  ('terms', 'Terms & Conditions',
   'These terms govern the booking and purchase of plots from Royal Green. Bookings are confirmed only after final approval by the company.'),
  ('privacy', 'Privacy Policy',
   'We collect only the information required to process a property transaction. KYC documents are stored in encrypted, access-controlled storage and every access is logged.')
on conflict (slug) do nothing;
