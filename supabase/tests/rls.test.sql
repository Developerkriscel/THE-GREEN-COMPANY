-- =====================================================================
-- RLS regression suite
--
-- Run against a LOCAL database only:
--     supabase db reset
--     psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/rls.test.sql
--
-- Every case here is an attack from §6 of docs/ROLES.md. The suite asserts on
-- what the API would actually return for a given JWT, not on what the UI shows.
-- It rolls everything back at the end, so it is safe to re-run.
--
-- NOTE on the two failure shapes. RLS denies a write in one of two ways, and
-- the distinction matters when writing assertions:
--   * No matching USING clause  -> the statement AFFECTS ZERO ROWS, silently.
--   * A guard trigger or a failed WITH CHECK -> the statement RAISES.
-- `tests.rows_affected()` below covers the first; `throws_ok` covers the second.
-- Asserting the wrong shape gives you a test that passes for the wrong reason.
-- =====================================================================

begin;

create extension if not exists pgtap;
create schema if not exists tests;

select plan(25);

-- ------------------------------------------------------------- fixtures
-- Insert auth users directly; the on_auth_user_created trigger builds profiles.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local',   'x', now(), '{"full_name":"Test Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager@test.local', 'x', now(), '{"full_name":"Test Manager"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rep1@test.local',    'x', now(), '{"full_name":"Rep One"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'rep2@test.local',    'x', now(), '{"full_name":"Rep Two"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'cust@test.local',    'x', now(), '{"full_name":"Test Customer"}');

-- Still the table owner here, so RLS is not in play while building the fixture.
--
-- Triggers, however, fire for the owner too: profiles_guard() refuses any change
-- to role/status/rank from a non-admin, and during fixture setup there is no JWT
-- at all, so app.is_admin() is false and every line below would be rejected.
-- That guard is doing exactly its job — there is no bootstrap admin yet — so the
-- fixture turns it off for the seeding, then back on before a single assertion
-- runs. (This mirrors reality: the first admin is created out-of-band in SQL,
-- which is what the README tells you to do.)
alter table public.profiles disable trigger trg_profiles_guard;

update public.profiles set role = 'admin',   status = 'active' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'manager', status = 'active' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'rep', status = 'active', manager_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'rep', status = 'active' where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set role = 'customer', status = 'active', user_code = 'RG-C-TEST-1'
  where id = '00000000-0000-0000-0000-0000000000d1';

-- Guard back on. Everything from here is tested with the real defences active;
-- assertion 5 below proves the guard still bites.
alter table public.profiles enable trigger trg_profiles_guard;

insert into public.projects (id, slug, name, location, published)
values ('00000000-0000-0000-0000-00000000e001', 'test-project', 'Test Project', 'Testville', true);

insert into public.plots (id, project_id, number, price, status)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'T-1', 1000000, 'available');

insert into public.leads (id, owner_id, name, mobile, remark, budget)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-0000000000c1', 'Lead of Rep One', '9990000001', 'private note', 500000),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-0000000000c2', 'Lead of Rep Two', '9990000002', 'private note', 600000);

insert into public.bookings (id, reference, plot_id, project_id, rep_id, customer_id, status, sale_value)
values ('00000000-0000-0000-0000-000000002001', 'BK-TEST-1',
        '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
        'draft', 1000000);

-- ------------------------------------------------------------- helpers
create or replace function tests.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Runs a write and returns how many rows it actually touched. A policy with no
-- matching USING clause yields 0 without raising, which is the quiet denial.
create or replace function tests.rows_affected(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;  -- raised instead of filtering; assert with throws_ok, not this
end $$;

-- The helpers are called AFTER the first role switch, i.e. while the session is
-- running as `authenticated`. Without these grants every act_as() call after the
-- first fails with "permission denied for schema tests".
grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- =====================================================================
-- 1. Rep isolation — the critical rule
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000c1');

select is(
  (select count(*)::int from public.leads),
  1,
  'A rep sees exactly their own leads, not the whole table'
);

select is(
  (select count(*)::int from public.leads where owner_id = '00000000-0000-0000-0000-0000000000c2'),
  0,
  'Explicitly filtering for a peer''s leads returns nothing (no count leakage)'
);

select is(
  (select name from public.leads limit 1),
  'Lead of Rep One',
  'The one visible lead is the rep''s own'
);

select is(
  (select count(*)::int from public.bookings where rep_id = '00000000-0000-0000-0000-0000000000c2'),
  0,
  'A rep cannot read another rep''s bookings'
);

-- Self-promotion: reaches the row, then the profiles_guard trigger raises.
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c1' $$,
  '42501',
  null,
  'A rep cannot escalate their own role'
);

select throws_ok(
  $$ update public.profiles set commission_rate = 99 where id = '00000000-0000-0000-0000-0000000000c1' $$,
  '42501',
  null,
  'A rep cannot set their own commission rate'
);

select is(
  tests.rows_affected(
    $$ update public.bookings set terms_accepted_rep = true, status = 'step1_done'
       where id = '00000000-0000-0000-0000-000000002001' $$),
  1,
  'A rep CAN submit their own booking at step 1'
);

-- Now at step1_done, the rep's UPDATE policy no longer reaches the row at all.
select is(
  tests.rows_affected(
    $$ update public.bookings set status = 'confirmed'
       where id = '00000000-0000-0000-0000-000000002001' $$),
  0,
  'A rep cannot jump their own booking to confirmed (policy no longer reaches the row)'
);

-- No INSERT policy on commissions for anyone — this one genuinely raises.
select throws_ok(
  $$ insert into public.commissions (booking_id, rep_id, sale_value, rate_applied, gross_amount, net_amount)
     values ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-0000000000c1',
             1000000, 50, 500000, 500000) $$,
  '42501',
  null,
  'A rep cannot insert a commission record (no INSERT policy exists)'
);

-- =====================================================================
-- 2. A peer rep sees nothing of rep one
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000c2');

select is(
  (select count(*)::int from public.leads where owner_id = '00000000-0000-0000-0000-0000000000c1'),
  0,
  'Rep Two cannot see Rep One''s leads'
);

select is(
  (select count(*)::int from public.bookings),
  0,
  'Rep Two sees none of Rep One''s bookings'
);

select is(
  tests.rows_affected(
    $$ update public.bookings set status = 'step2_approved'
       where id = '00000000-0000-0000-0000-000000002001' $$),
  0,
  'An unrelated rep cannot review someone else''s booking'
);

-- =====================================================================
-- 3. Manager: read-only over own reps, blind to everyone else
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from public.leads),
  1,
  'A manager sees their own reps'' leads, and only theirs'
);

select is(
  (select count(*)::int from public.leads where owner_id = '00000000-0000-0000-0000-0000000000c2'),
  0,
  'A manager cannot see a rep who does not report to them'
);

select is(
  tests.rows_affected(
    $$ update public.leads set status = 'lost'
       where id = '00000000-0000-0000-0000-000000001001' $$),
  0,
  'A manager cannot edit a rep''s lead — read-only means read-only'
);

select is(
  tests.rows_affected(
    $$ update public.bookings set status = 'step2_approved'
       where id = '00000000-0000-0000-0000-000000002001' $$),
  1,
  'A manager CAN tick the step-2 review on their own rep''s booking'
);

select is(
  tests.rows_affected(
    $$ update public.bookings set status = 'confirmed'
       where id = '00000000-0000-0000-0000-000000002001' $$),
  0,
  'A manager cannot give final approval'
);

select is(
  (select count(*)::int from public.commissions),
  0,
  'A manager has no row access to commissions at all'
);

-- =====================================================================
-- 4. Customer isolation
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000d1');

select is(
  (select count(*)::int from public.bookings),
  1,
  'A customer sees only their own booking'
);

select is(
  (select count(*)::int from public.leads),
  0,
  'A customer sees no leads at all'
);

select is(
  (select count(*)::int from public.commissions),
  0,
  'A customer sees no commission records'
);

select is(
  (select count(*)::int from public.audit_log),
  0,
  'A customer cannot read the audit log'
);

-- =====================================================================
-- 5. Admin reach, and the append-only audit log
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from public.leads),
  2,
  'An admin sees every lead'
);

select is(
  (select count(*)::int from public.audit_log) > 0,
  true,
  'An admin can read the audit log, and the fixture writes produced entries'
);

select is(
  tests.rows_affected($$ delete from public.audit_log $$),
  0,
  'Not even an admin can delete an audit entry — no DELETE policy exists'
);

select * from finish();
rollback;
