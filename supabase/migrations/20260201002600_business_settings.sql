-- =====================================================================
-- Business settings: everything the office should change without a developer
--
-- The company's name, logo, contact details, the rank plan and the payout
-- deductions were split between code (src/lib/brand.ts, typed-in tables on
-- the public pages) and database rows that no screen could edit, so every
-- change needed a code edit and a deploy. This moves the rest into the
-- database and backs the new admin "Business Settings" module.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Company details. `public.` so the public site (anon) can read them.
--    The app loads these before it renders; src/lib/brand.ts holds only
--    the fallback used if this row is missing.
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value)
values ('public.brand', jsonb_build_object(
  'name',       'Symocity',
  'short',      'Symocity',
  'legalName',  'Royal Symo Green City Pvt Ltd',
  'tagline',    'You Together Make Millionaire',
  'website',    'symocity.com',
  'websiteUrl', 'https://symocity.com',
  'email',      'symocitydevelopers@gmail.com',
  'phone',      '9211809636',
  'logoUrl',    null,
  'values',     jsonb_build_array('Building Communities', 'Creating Wealth', 'Sustainable Living'),
  'compliance', 'RERA Compliant · Premium Real Estate Developer'
))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Payout deductions are read by the sponsor panel too, which runs as a
--    member (not staff) and so could not see them: a changed TDS rate would
--    have shown the old figure on every member's screen. They are the plan's
--    published terms, not a secret.
-- ---------------------------------------------------------------------
drop policy if exists settings_select_auth on public.site_settings;
create policy settings_select_auth on public.site_settings
  for select to authenticated
  using (key like 'public.%' or key = 'sponsor.rates' or app.is_staff());

-- ---------------------------------------------------------------------
-- 3. Ranks: a free-text training line (plan deck slide 9 — "one training
--    free", "free · 3 tickets + 20%"), and the deck's joining fees for the
--    three ranks that were seeded as free.
-- ---------------------------------------------------------------------
alter table public.ranks add column if not exists training_note text;

update public.ranks r
   set training_note = d.note
  from (values
    (5,  'One training free'),
    (6,  'Free · 1 ticket + 20%'),
    (7,  'Free · 2 tickets + 20%'),
    (8,  'Free · 3 tickets + 20%'),
    (9,  'Free · 5 tickets + 20%'),
    (10, 'Free · 7 tickets + 20%'),
    (11, 'Free · 11 tickets + 20%'),
    (12, 'Free · 15 tickets + 20%')
  ) as d(sen, note)
 where r.seniority = d.sen and r.training_note is null;

update public.ranks r
   set joining_fee = d.fee
  from (values (2, 1100), (3, 2100), (4, 3100)) as d(sen, fee)
 where r.seniority = d.sen and coalesce(r.joining_fee, 0) = 0;

-- A rank still held by a member cannot be deleted: the foreign keys are
-- ON DELETE SET NULL, so the delete would silently strip those members of
-- their rank (and their commission rate with it). Deactivate it instead.
create or replace function app.ranks_guard_delete() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  select count(*) into v_n from public.profiles
   where (rank_id = old.id or plan_rank_id = old.id) and deleted_at is null;
  if v_n > 0 then
    raise exception '% member(s) hold the rank "%". Move them to another rank, or switch this rank off instead of deleting it.',
      v_n, old.name using errcode = '23503';
  end if;
  return old;
end $$;

drop trigger if exists ranks_guard_delete on public.ranks;
create trigger ranks_guard_delete before delete on public.ranks
  for each row execute function app.ranks_guard_delete();

-- Two ranks at the same level would make "next rank" ambiguous for the
-- promotion engine.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ranks_seniority_unique') then
    alter table public.ranks add constraint ranks_seniority_unique unique (seniority);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Terms & Conditions from the plan deck (slide 11), replacing the
--    placeholder paragraph only if nobody has written their own yet.
-- ---------------------------------------------------------------------
update public.cms_pages
   set body = E'1. All payments are made as per government rules.\n'
           || E'2. A payment is valid only with a company slip.\n'
           || E'3. No payment is valid without the original company slip.\n'
           || E'4. Only company projects are valid for sales.\n'
           || E'5. All projects are listed on the website, www.symocity.com.\n'
           || E'6. TDS of 5% is deducted from every payment transaction.\n'
           || E'7. An admin charge of 3% is deducted from every income transaction.\n'
           || E'8. Income is credited to your account.\n'
           || E'9. If a plot is sold below the rate, the rank holder above AGM is responsible for the difference.\n'
           || E'10. The company''s decision is final.',
       updated_at = now()
 where slug = 'terms'
   and body like 'These terms govern the booking and purchase of plots from%';
