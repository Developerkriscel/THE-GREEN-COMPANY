-- =====================================================================
-- Workflow regression suite
--
-- The RLS suite proves nobody can reach data they shouldn't. This one proves
-- the business machinery actually fires: the two 3-step approval chains, the
-- plot-status side effects, the single-level commission trigger (including the
-- rate snapshot and the deductions), the EMI schedule, notifications, and the
-- audit trail.
--
--   node scripts/apply-schema.mjs --workflow-test
--
-- Runs in a transaction and rolls back, so it is safe against a live database.
-- =====================================================================

begin;

create extension if not exists pgtap;
select plan(24);

-- ---------------------------------------------------------------- actors
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a9', 'wf-admin@test.local', 'x', now(), '{"full_name":"WF Admin"}'),
  ('00000000-0000-0000-0000-0000000000b9', 'wf-mgr@test.local',   'x', now(), '{"full_name":"WF Manager"}'),
  ('00000000-0000-0000-0000-0000000000c9', 'wf-rep@test.local',   'x', now(), '{"full_name":"WF Rep"}'),
  ('00000000-0000-0000-0000-0000000000d9', 'wf-cust@test.local',  'x', now(), '{"full_name":"WF Customer"}');

-- No bootstrap admin exists yet, so profiles_guard would (correctly) refuse
-- this seeding. Same reasoning as in rls.test.sql.
alter table public.profiles disable trigger trg_profiles_guard;

update public.profiles set role = 'admin', status = 'active'
  where id = '00000000-0000-0000-0000-0000000000a9';
update public.profiles set role = 'manager', status = 'active'
  where id = '00000000-0000-0000-0000-0000000000b9';
-- Associate = seniority 1 = 7% on the rep's own sales.
update public.profiles
   set role = 'rep', status = 'active',
       manager_id = '00000000-0000-0000-0000-0000000000b9',
       rank_id = (select id from public.ranks where seniority = 1)
 where id = '00000000-0000-0000-0000-0000000000c9';
update public.profiles set role = 'customer', status = 'active', user_code = 'RG-C-WF-1'
  where id = '00000000-0000-0000-0000-0000000000d9';

alter table public.profiles enable trigger trg_profiles_guard;

insert into public.projects (id, slug, name, location, published)
values ('00000000-0000-0000-0000-00000000e009', 'wf-project', 'WF Project', 'Testville', true);

insert into public.plots (id, project_id, number, price, status)
values ('00000000-0000-0000-0000-00000000f009', '00000000-0000-0000-0000-00000000e009',
        'WF-1', 1000000, 'available');

create schema if not exists tests;
create or replace function tests.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function tests.as_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);   -- back to the session user
end $$;

-- A data-modifying CTE has to be top level, so it cannot be inlined inside
-- is(...). This wraps the write and reports how many rows it actually touched —
-- which is how RLS denies when no USING clause matches (silently, not by raising).
create or replace function tests.rows_affected(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end $$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- =====================================================================
-- Booking: draft -> step1 -> step2 -> confirmed
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000c9');   -- the rep

insert into public.bookings
  (id, reference, plot_id, project_id, rep_id, customer_id, status,
   sale_value, token_amount, payment_plan, emi_count, emi_amount, emi_start)
values
  ('00000000-0000-0000-0000-000000002009', 'BK-WF-1',
   '00000000-0000-0000-0000-00000000f009', '00000000-0000-0000-0000-00000000e009',
   '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000d9',
   'draft', 1000000, 50000, 'emi', 6, 158333.33, current_date);

select is(
  (select status::text from public.plots where id = '00000000-0000-0000-0000-00000000f009'),
  'available',
  'A draft booking does NOT reserve the plot'
);

update public.bookings
   set terms_accepted_rep = true, status = 'step1_done'
 where id = '00000000-0000-0000-0000-000000002009';

select is(
  (select status::text from public.plots where id = '00000000-0000-0000-0000-00000000f009'),
  'token',
  'Submitting at step 1 moves the plot to `token`'
);

select isnt(
  (select step1_at from public.bookings where id = '00000000-0000-0000-0000-000000002009'),
  null,
  'step1_at is stamped by the trigger, not the client'
);

-- Step 2 by the rep's manager
select tests.act_as('00000000-0000-0000-0000-0000000000b9');

update public.bookings set status = 'step2_approved'
 where id = '00000000-0000-0000-0000-000000002009';

select is(
  (select step2_by from public.bookings where id = '00000000-0000-0000-0000-000000002009'),
  '00000000-0000-0000-0000-0000000000b9'::uuid,
  'step2_by records the reviewer automatically'
);

select is(
  (select status::text from public.plots where id = '00000000-0000-0000-0000-00000000f009'),
  'token',
  'The plot stays on `token` until final approval'
);

-- Step 3 by the admin
select tests.act_as('00000000-0000-0000-0000-0000000000a9');

update public.bookings set status = 'confirmed'
 where id = '00000000-0000-0000-0000-000000002009';

select is(
  (select status::text from public.bookings where id = '00000000-0000-0000-0000-000000002009'),
  'confirmed',
  'Admin final approval confirms the booking'
);

select is(
  (select status::text from public.plots where id = '00000000-0000-0000-0000-00000000f009'),
  'booked',
  'Final approval moves the plot to `booked`'
);

-- =====================================================================
-- Sale confirmation -> commission + EMI schedule
-- =====================================================================
select tests.act_as('00000000-0000-0000-0000-0000000000c9');   -- the rep

insert into public.sale_confirmations (id, booking_id, rep_id, status, sale_value)
values ('00000000-0000-0000-0000-000000003009', '00000000-0000-0000-0000-000000002009',
        '00000000-0000-0000-0000-0000000000c9', 'draft', 1000000);

update public.sale_confirmations
   set terms_accepted_rep = true, status = 'step1_done'
 where id = '00000000-0000-0000-0000-000000003009';

select is(
  (select count(*)::int from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  0,
  'No commission exists before the sale is confirmed'
);

select tests.act_as('00000000-0000-0000-0000-0000000000b9');
update public.sale_confirmations set status = 'step2_approved'
 where id = '00000000-0000-0000-0000-000000003009';

select tests.act_as('00000000-0000-0000-0000-0000000000a9');
update public.sale_confirmations set status = 'confirmed'
 where id = '00000000-0000-0000-0000-000000003009';

-- --- the commission itself ------------------------------------------
select is(
  (select count(*)::int from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  1,
  'Confirming the sale creates exactly one commission record'
);

select is(
  (select rep_id from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  '00000000-0000-0000-0000-0000000000c9'::uuid,
  'The commission belongs to the rep who made the sale'
);

select is(
  (select rate_applied from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  7.00::numeric,
  'The rate comes from the rep''s rank (Associate = 7%)'
);

select is(
  (select rank_at_sale from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  'Associate',
  'The rank name is snapshotted onto the commission'
);

select is(
  (select gross_amount from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  70000.00::numeric,
  'Gross = sale value x rank rate (1,000,000 x 7%)'
);

-- Seeded deductions: TDS 5% + admin charge 2% = 7% of gross.
select is(
  (select deductions from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  4900.00::numeric,
  'Deductions apply the configured TDS + admin charge'
);

select is(
  (select net_amount from public.commissions
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  65100.00::numeric,
  'Net = gross - deductions'
);

-- --- THE guardrail --------------------------------------------------
select is(
  (select count(*)::int from public.commissions),
  1,
  'Exactly ONE commission exists in total — the manager earned nothing'
);

select is(
  (select count(*)::int from public.commissions
    where rep_id = '00000000-0000-0000-0000-0000000000b9'),
  0,
  'The rep''s manager has no commission from the rep''s sale (single-level)'
);

-- --- EMI schedule ---------------------------------------------------
select is(
  (select count(*)::int from public.emis
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  6,
  'The EMI schedule is materialised from the payment plan'
);

select is(
  (select count(distinct due_date)::int from public.emis
    where booking_id = '00000000-0000-0000-0000-000000002009'),
  6,
  'Each installment gets its own monthly due date'
);

select is(
  (select count(*)::int from public.emis
    where booking_id = '00000000-0000-0000-0000-000000002009' and status = 'pending'),
  6,
  'Every installment starts as pending'
);

-- --- customer cannot self-verify a payment --------------------------
select tests.act_as('00000000-0000-0000-0000-0000000000d9');

select is(
  tests.rows_affected(
    $$ update public.emis set status = 'paid'
        where booking_id = '00000000-0000-0000-0000-000000002009' and seq = 1 $$),
  -1,
  'A customer cannot mark their own installment paid (emis_guard raises)'
);

select lives_ok(
  $$ update public.emis set slip_path = 'x/y.pdf', status = 'awaiting_verification'
      where booking_id = '00000000-0000-0000-0000-000000002009' and seq = 1 $$,
  'A customer CAN upload a slip and move it to awaiting_verification'
);

-- --- notifications + audit trail ------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000000c9');

select is(
  (select count(*)::int from public.notifications where type = 'commission'),
  1,
  'The rep is notified that commission accrued'
);

select tests.as_owner();

select ok(
  (select count(*) from public.audit_log where entity = 'bookings') >= 2,
  'The booking''s transitions are written to the audit log'
);

select * from finish();
rollback;
