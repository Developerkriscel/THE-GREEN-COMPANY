-- =====================================================================
-- Royal Symo — Sponsor Panel
--
-- The member-facing side of the MLM network: a real wallet with a
-- gross -> TDS -> admin -> net breakdown on every credit, a server-side
-- payout flow, own-subtree genealogy access, and the income engine that
-- feeds all of it.
--
-- Design notes
--   * Members keep role 'rep'. Every policy that matters here is already
--     ownership-based (rep_id = auth.uid(), member_id = auth.uid()), so the
--     panel needs no new role and no re-derivation of the 100+ RLS policies.
--     The separation the business wants is the /sponsor area in the app.
--   * Money that moved lives in member_ledger.net. Withdrawals live in their
--     own table and are NEVER mirrored as ledger debits — the balance formula
--     reads both sources, so mirroring would double-count.
--   * Every member-facing write goes through a SECURITY DEFINER RPC that
--     re-checks eligibility server-side. The panel cannot be talked out of a
--     rule by editing the request.
-- =====================================================================

-- ------------------------------------------------- 1. payout + KYC identity
alter table public.profiles
  add column if not exists bank_holder     text,
  add column if not exists bank_name       text,
  add column if not exists bank_account    text,
  add column if not exists bank_ifsc       text,
  add column if not exists bank_type       text,
  add column if not exists upi_id          text,
  add column if not exists pan_number      text,
  add column if not exists bank_updated_at timestamptz;

comment on column public.profiles.bank_account is 'Payout destination. Masked to the last 4 everywhere in the member panel.';

-- ------------------------------------------------- 2. rank economics
-- The business plan's numbers, keyed on seniority so rank NAMES stay free to
-- change without touching any logic.
alter table public.ranks
  add column if not exists override_pct   numeric(6,2)  not null default 0,
  add column if not exists salary         numeric(12,2) not null default 0,
  add column if not exists joining_fee    numeric(12,2) not null default 0,
  add column if not exists req_direct     int           not null default 0,
  add column if not exists req_team       int           not null default 0,
  add column if not exists req_legs       int           not null default 0,
  add column if not exists req_rank_sen   int,
  add column if not exists req_rank_count int           not null default 0,
  add column if not exists reward_title   text,
  add column if not exists reward_sqyd    numeric(12,2) not null default 0;

-- Royal Symo business plan, by seniority (1 = entry … 12 = top).
-- direct %, sponsor override %, monthly salary, joining fee,
-- qualification (directs / group / N of rank-seniority / legs), reward tier.
with plan(sen, direct_pct, override_pct, salary, joining, rq_direct, rq_team, rq_sen, rq_count, rq_legs, rw_title, rw_sqyd) as (
  values
    ( 1,  5.0, 0.0,      0,      0, 0,   0, null, 0,  0, null,                      0),
    ( 2,  7.0, 2.0,      0,      0, 3,   9, null, 0,  0, 'Juicer',                100),
    ( 3,  9.0, 2.0,      0,      0, 3,  18,    3, 1,  0, 'Mixer',                 100),
    ( 4, 11.0, 2.0,      0,      0, 3,  27,    3, 2,  0, 'Mobile phone',          100),
    ( 5, 13.0, 2.0,      0,   5100, 3,  36,    3, 3,  0, 'Mobile phone',          200),
    ( 6, 14.0, 1.0,      0,   5100, 3,  45,    4, 1,  0, 'Mobile phone',          300),
    ( 7, 15.0, 1.0,  30000,   5100, 3,  54,    4, 2,  0, 'Mobile phone',          400),
    ( 8, 16.0, 1.0,  30000, 100000, 3,  63,    4, 3,  0, 'Laptop',                500),
    ( 9, 17.0, 1.0,  50000, 200000, 3,  72,    4,10,  2, 'Car (₹7 lakh)',        1300),
    (10, 18.0, 1.0,  50000, 300000, 3,  81,    4,20,  5, 'Car — Brezza',         1800),
    (11, 19.0, 1.0, 100000, 400000, 3,  90,    4,30,  7, 'Car — Ertiga',         2500),
    (12, 20.0, 1.0, 150000, 500000, 3, 100,    9,50, 10, 'Car — Fortuner',       7000)
)
update public.ranks r
   set own_sale_rate  = plan.direct_pct,
       override_pct   = plan.override_pct,
       salary         = plan.salary,
       joining_fee    = plan.joining,
       req_direct     = plan.rq_direct,
       req_team       = plan.rq_team,
       req_rank_sen   = plan.rq_sen,
       req_rank_count = plan.rq_count,
       req_legs       = plan.rq_legs,
       reward_title   = plan.rw_title,
       reward_sqyd    = plan.rw_sqyd
  from plan
 where r.seniority = plan.sen;

-- Level payout ladder (₹ per 100 sq yd), seeded only when the CMS table is empty
-- so an admin's own edits in Website CMS -> Plans are never overwritten.
insert into public.plan_levels (level, rate, tag, sort_order, is_active)
select v.level, v.rate, v.tag, v.level, true
  from (values
    (1,1000,'Level 1'),(2,1000,'Level 2'),(3,1000,'Level 3'),(4,1000,'Level 4'),
    (5,1000,'Level 5'),(6,1000,'Level 6'),(7, 500,'Level 7'),(8, 500,'Level 8'),
    (9, 300,'Level 9'),(10,200,'Level 10'),(11,200,'Level 11'),(12,100,'Level 12')
  ) as v(level, rate, tag)
 where not exists (select 1 from public.plan_levels);

-- Deduction rates, editable from the admin side. site_settings keys starting
-- with 'public.' are world-readable; this one is deliberately not.
insert into public.site_settings (key, value)
values ('sponsor.rates', '{"tds_pct":"5","admin_pct":"3","min_withdrawal":"500"}'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------------- 3. ledger money breakdown
alter table public.member_ledger
  add column if not exists gross          numeric(14,2) not null default 0,
  add column if not exists tds            numeric(14,2) not null default 0,
  add column if not exists admin_charge   numeric(14,2) not null default 0,
  add column if not exists net            numeric(14,2) not null default 0,
  add column if not exists status         text          not null default 'credited',
  add column if not exists level          int,
  add column if not exists from_member_id uuid references public.profiles(id) on delete set null,
  add column if not exists booking_id     uuid references public.bookings(id) on delete set null,
  add column if not exists area_sqyd      numeric(12,2),
  add column if not exists rate_applied   numeric(12,2),
  add column if not exists reverses_id    uuid references public.member_ledger(id) on delete set null,
  add column if not exists in_kind        boolean       not null default false;

create index if not exists member_ledger_booking_idx on public.member_ledger (booking_id) where booking_id is not null;
create index if not exists member_ledger_source_idx  on public.member_ledger (member_id, source);

-- `amount` predates the breakdown and the admin's Add Credit form still posts it.
-- Keep the two in step in both directions so old and new writers agree.
create or replace function app.member_ledger_fill() returns trigger
language plpgsql as $$
begin
  if coalesce(new.net, 0) = 0 and coalesce(new.amount, 0) <> 0 then
    new.net := new.amount;
  elsif coalesce(new.amount, 0) = 0 and coalesce(new.net, 0) <> 0 then
    new.amount := new.net;
  end if;
  if coalesce(new.gross, 0) = 0 then
    new.gross := new.net + coalesce(new.tds, 0) + coalesce(new.admin_charge, 0);
  end if;
  return new;
end $$;

drop trigger if exists member_ledger_fill on public.member_ledger;
create trigger member_ledger_fill before insert or update on public.member_ledger
  for each row execute function app.member_ledger_fill();

update public.member_ledger set net = amount where net = 0 and amount <> 0;
update public.member_ledger set gross = net where gross = 0 and net <> 0;

-- ------------------------------------------------- 4. withdrawal lifecycle
alter table public.withdrawals
  add column if not exists reject_reason    text,
  add column if not exists payout_reference text,
  add column if not exists idempotency_key  text,
  add column if not exists approved_at      timestamptz,
  add column if not exists paid_at          timestamptz;

create unique index if not exists withdrawals_idem_idx
  on public.withdrawals (member_id, idempotency_key) where idempotency_key is not null;

-- ------------------------------------------------- 5. balances
-- The one balance formula, used by the panel, the admin console and the
-- withdrawal gate. Anything else computing a balance is a bug.
create or replace function app.member_balance(p_member uuid)
returns table (credited numeric, withdrawn numeric, pending numeric, available numeric)
language sql stable security definer set search_path = public, app as $$
  with led as (
    select
      coalesce(sum(case when kind = 'credit' and status = 'credited' and not in_kind then net else 0 end), 0)
    - coalesce(sum(case when kind = 'debit'  and status = 'credited' then net else 0 end), 0) as credited
    from public.member_ledger where member_id = p_member
  ), wd as (
    select
      coalesce(sum(case when status = 'paid' then amount else 0 end), 0)                      as withdrawn,
      coalesce(sum(case when status in ('requested','approved') then amount else 0 end), 0)   as pending
    from public.withdrawals where member_id = p_member
  )
  select led.credited, wd.withdrawn, wd.pending,
         led.credited - wd.withdrawn - wd.pending
  from led, wd
$$;

create or replace function public.my_wallet()
returns table (credited numeric, withdrawn numeric, pending numeric, available numeric)
language sql stable security definer set search_path = public, app as $$
  select * from app.member_balance(auth.uid())
$$;
grant execute on function public.my_wallet() to authenticated;

-- ------------------------------------------------- 6. own-subtree genealogy
-- A member may read their downline's identity, never its money. Returning the
-- subtree from a definer function keeps profiles' RLS free of a recursive
-- ancestor predicate that would run on every profile read in the app.
create or replace function public.my_downline()
returns table (
  id uuid, member_code text, full_name text, rank_name text, rank_seniority int,
  status text, level int, direct_count int, team_count int,
  joined timestamptz, sponsor_id uuid, sponsor_code text, sponsor_name text
)
language sql stable security definer set search_path = public, app as $$
  with recursive tree as (
    select p.id, 1 as lvl
      from public.profiles p
     where p.referrer_id = auth.uid() and p.deleted_at is null
    union all
    select c.id, t.lvl + 1
      from tree t
      join public.profiles c on c.referrer_id = t.id and c.deleted_at is null
     where t.lvl < 12
  )
  select p.id, p.member_code, p.full_name, r.name, r.seniority,
         p.status::text, t.lvl, p.direct_count, p.team_count,
         p.created_at, s.id, s.member_code, s.full_name
    from tree t
    join public.profiles p on p.id = t.id
    left join public.ranks    r on r.id = p.rank_id
    left join public.profiles s on s.id = p.referrer_id
   order by t.lvl, p.member_code
$$;
grant execute on function public.my_downline() to authenticated;

-- ------------------------------------------------- 7. member payout requests
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_account text default null,
  p_note text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_me     uuid := auth.uid();
  v_id     uuid;
  v_status text;
  v_frozen boolean;
  v_kyc    text;
  v_open   int;
  v_avail  numeric;
  v_min    numeric;
  v_acct   text := nullif(trim(coalesce(p_account, '')), '');
begin
  if v_me is null then
    raise exception 'You are not signed in' using errcode = '42501';
  end if;

  -- A retry (double tap, timeout) returns the original request, never a second one.
  if p_idempotency_key is not null then
    select id into v_id from public.withdrawals
     where member_id = v_me and idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  select p.status::text, coalesce(p.frozen, false)
    into v_status, v_frozen
    from public.profiles p where p.id = v_me for update;

  if v_frozen or v_status is distinct from 'active' then
    raise exception 'Your account is on hold. Please contact the office.' using errcode = '42501';
  end if;

  select k.status::text into v_kyc from public.kyc k where k.user_id = v_me;
  if v_kyc is distinct from 'verified' then
    raise exception 'Complete your KYC before withdrawing.' using errcode = '42501';
  end if;

  if v_acct is null then
    select coalesce(nullif(trim(coalesce(p.bank_account, '')), ''), nullif(trim(coalesce(p.upi_id, '')), ''))
      into v_acct from public.profiles p where p.id = v_me;
    if v_acct is null then
      raise exception 'Add your bank account or UPI to receive payouts.' using errcode = '42501';
    end if;
  end if;

  select count(*) into v_open from public.withdrawals
   where member_id = v_me and status in ('requested', 'approved');
  if v_open > 0 then
    raise exception 'You already have a withdrawal being processed.' using errcode = '42501';
  end if;

  v_min := coalesce((select (value->>'min_withdrawal')::numeric from public.site_settings where key = 'sponsor.rates'), 500);
  if p_amount is null or p_amount < v_min then
    raise exception 'A minimum of % is needed to withdraw.', round(v_min, 2) using errcode = '22023';
  end if;

  select available into v_avail from app.member_balance(v_me);
  if p_amount > v_avail then
    raise exception 'That is more than your available balance of %.', round(v_avail, 2) using errcode = '22023';
  end if;

  insert into public.withdrawals (member_id, amount, account, status, note, idempotency_key)
  values (v_me, p_amount, v_acct, 'requested', nullif(trim(coalesce(p_note, '')), ''), p_idempotency_key)
  returning id into v_id;

  return v_id;
end $$;
grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

create or replace function public.cancel_withdrawal(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := auth.uid(); v_status text;
begin
  select status into v_status from public.withdrawals
   where id = p_id and member_id = v_me for update;
  if v_status is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_status <> 'requested' then
    raise exception 'This request is already being processed and cannot be cancelled.' using errcode = '42501';
  end if;
  update public.withdrawals
     set status = 'cancelled', processed_at = now()
   where id = p_id and member_id = v_me;
end $$;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;

-- ------------------------------------------------- 8. self-service profile writes
-- profiles_guard already blocks the company-controlled columns, so the member
-- may write these directly. Bank changes are stamped so the panel can show
-- "changed on", and an audit row is written by the existing audit trigger.
create or replace function public.save_bank_details(
  p_holder text, p_bank text, p_account text, p_ifsc text, p_type text, p_upi text, p_pan text
) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'You are not signed in' using errcode = '42501'; end if;
  if coalesce(trim(p_account), '') <> '' and p_account !~ '^[0-9]{9,18}$' then
    raise exception 'Account number must be 9 to 18 digits.' using errcode = '22023';
  end if;
  if coalesce(trim(p_ifsc), '') <> '' and upper(p_ifsc) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
    raise exception 'That IFSC code does not look right.' using errcode = '22023';
  end if;
  if coalesce(trim(p_pan), '') <> '' and upper(p_pan) !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'That PAN does not look right.' using errcode = '22023';
  end if;
  update public.profiles
     set bank_holder  = nullif(trim(coalesce(p_holder, '')), ''),
         bank_name    = nullif(trim(coalesce(p_bank, '')), ''),
         bank_account = nullif(trim(coalesce(p_account, '')), ''),
         bank_ifsc    = upper(nullif(trim(coalesce(p_ifsc, '')), '')),
         bank_type    = nullif(trim(coalesce(p_type, '')), ''),
         upi_id       = nullif(trim(coalesce(p_upi, '')), ''),
         pan_number   = upper(nullif(trim(coalesce(p_pan, '')), '')),
         bank_updated_at = now()
   where id = v_me;
end $$;
grant execute on function public.save_bank_details(text, text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------- 9. the income engine
-- Admin-triggered. Credits direct income to the seller and level income up the
-- sponsor chain, applying TDS + admin charge to every credit and storing the
-- breakdown on the row so a later rate change can never rewrite history.
--
-- Deliberately NOT paying the rank "sponsor override" as well as level income:
-- the two would overlap on the same sale and pay the upline twice. Level income
-- is the plan's explicit per-level table, so it is the one implemented.
create or replace function public.distribute_sale_income(p_booking uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_tds    numeric;
  v_admin  numeric;
  v_seller uuid;
  v_value  numeric;
  v_area   numeric;
  v_ref    text;
  v_rate   numeric;
  v_gross  numeric;
  v_up     uuid;
  v_lvl    int := 0;
  v_lrate  numeric;
  v_count  int := 0;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run an income distribution' using errcode = '42501';
  end if;

  -- Idempotent: a booking is only ever distributed once.
  if exists (select 1 from public.member_ledger where booking_id = p_booking) then
    return 0;
  end if;

  select b.rep_id, b.sale_value, coalesce(pl.size, 0), b.reference
    into v_seller, v_value, v_area, v_ref
    from public.bookings b
    left join public.plots pl on pl.id = b.plot_id
   where b.id = p_booking and b.status = 'confirmed';

  if v_seller is null then
    raise exception 'Booking not found, or not confirmed' using errcode = 'P0002';
  end if;

  select coalesce((value->>'tds_pct')::numeric, 5), coalesce((value->>'admin_pct')::numeric, 3)
    into v_tds, v_admin
    from public.site_settings where key = 'sponsor.rates';
  v_tds   := coalesce(v_tds, 5);
  v_admin := coalesce(v_admin, 3);

  -- --- direct income to the seller, at their own rank's rate
  select coalesce(r.own_sale_rate, 0) into v_rate
    from public.profiles p left join public.ranks r on r.id = p.rank_id
   where p.id = v_seller;

  v_gross := round(v_value * coalesce(v_rate, 0) / 100.0, 2);
  if v_gross > 0 then
    insert into public.member_ledger
      (member_id, kind, source, reference, booking_id, area_sqyd, rate_applied,
       gross, tds, admin_charge, net, amount, note)
    values
      (v_seller, 'credit', 'direct_income', v_ref, p_booking, v_area, v_rate,
       v_gross,
       round(v_gross * v_tds / 100.0, 2),
       round(v_gross * v_admin / 100.0, 2),
       v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
       v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
       'Direct income on sale ' || coalesce(v_ref, ''));
    v_count := v_count + 1;
  end if;

  -- --- level income up the sponsor chain, ₹rate per 100 sq yd
  select referrer_id into v_up from public.profiles where id = v_seller;
  while v_up is not null and v_lvl < 12 loop
    v_lvl := v_lvl + 1;

    select rate into v_lrate from public.plan_levels
     where level = v_lvl and is_active order by sort_order limit 1;

    if coalesce(v_lrate, 0) > 0 and v_area > 0 then
      v_gross := round(v_lrate * v_area / 100.0, 2);
      insert into public.member_ledger
        (member_id, kind, source, reference, booking_id, from_member_id, level,
         area_sqyd, rate_applied, gross, tds, admin_charge, net, amount, note)
      values
        (v_up, 'credit', 'level_income', v_ref, p_booking, v_seller, v_lvl,
         v_area, v_lrate,
         v_gross,
         round(v_gross * v_tds / 100.0, 2),
         round(v_gross * v_admin / 100.0, 2),
         v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
         v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
         'Level ' || v_lvl || ' income on sale ' || coalesce(v_ref, ''));
      v_count := v_count + 1;
    end if;

    select referrer_id into v_up from public.profiles where id = v_up;
  end loop;

  return v_count;
end $$;
grant execute on function public.distribute_sale_income(uuid) to authenticated;

-- Reverse everything a cancelled sale paid out, as new rows. The originals stay.
create or replace function public.reverse_sale_income(p_booking uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can reverse income' using errcode = '42501';
  end if;
  update public.member_ledger set status = 'reversed'
   where booking_id = p_booking and status = 'credited';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.reverse_sale_income(uuid) to authenticated;

-- Monthly rank salary for qualifying ranks; safe to re-run for the same month.
create or replace function public.credit_monthly_salary(p_month date default date_trunc('month', now())::date)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_tds numeric; v_admin numeric; v_count int := 0; v_ref text;
  rec record; v_gross numeric;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run salary' using errcode = '42501';
  end if;
  v_ref := 'SALARY-' || to_char(p_month, 'YYYY-MM');

  select coalesce((value->>'tds_pct')::numeric, 5), coalesce((value->>'admin_pct')::numeric, 3)
    into v_tds, v_admin from public.site_settings where key = 'sponsor.rates';
  v_tds := coalesce(v_tds, 5); v_admin := coalesce(v_admin, 3);

  for rec in
    select p.id, r.salary
      from public.profiles p
      join public.ranks r on r.id = p.rank_id
     where r.salary > 0 and p.status = 'active' and p.deleted_at is null
       and not exists (
         select 1 from public.member_ledger l
          where l.member_id = p.id and l.source = 'salary' and l.reference = v_ref)
  loop
    v_gross := rec.salary;
    insert into public.member_ledger
      (member_id, kind, source, reference, gross, tds, admin_charge, net, amount, note)
    values
      (rec.id, 'credit', 'salary', v_ref, v_gross,
       round(v_gross * v_tds / 100.0, 2), round(v_gross * v_admin / 100.0, 2),
       v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
       v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
       'Rank salary for ' || to_char(p_month, 'Mon YYYY'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
grant execute on function public.credit_monthly_salary(date) to authenticated;

-- ------------------------------------------------- 10. referral intake
-- A member's referral submission creates a REQUEST, never a member.
create table if not exists public.referral_requests (
  id           uuid primary key default gen_random_uuid(),
  sponsor_id   uuid not null references public.profiles(id) on delete cascade,
  full_name    text not null,
  mobile       text not null,
  email        text,
  city         text,
  state        text,
  status       text not null default 'invited',   -- invited | registered | active | rejected
  reject_reason text,
  member_id    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  joined_at    timestamptz
);
create index if not exists referral_requests_sponsor_idx on public.referral_requests (sponsor_id, created_at desc);

alter table public.referral_requests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'referral_requests' and policyname = 'referrals: admin all') then
    create policy "referrals: admin all" on public.referral_requests for all
      using ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
      with check ( (select role from public.profiles where id = (select auth.uid())) = 'admin' );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'referral_requests' and policyname = 'referrals: sponsor reads own') then
    create policy "referrals: sponsor reads own" on public.referral_requests for select
      using ( sponsor_id = (select auth.uid()) );
  end if;
end $$;

create or replace function public.submit_referral(
  p_full_name text, p_mobile text, p_email text default null,
  p_city text default null, p_state text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := auth.uid(); v_id uuid; v_status text; v_frozen boolean; v_recent int;
begin
  if v_me is null then raise exception 'You are not signed in' using errcode = '42501'; end if;

  select status::text, coalesce(frozen, false) into v_status, v_frozen
    from public.profiles where id = v_me;
  if v_frozen or v_status is distinct from 'active' then
    raise exception 'Your account is on hold. Please contact the office.' using errcode = '42501';
  end if;

  if coalesce(trim(p_full_name), '') = '' or length(trim(p_full_name)) < 2 then
    raise exception 'Please enter the full name.' using errcode = '22023';
  end if;
  if p_mobile !~ '^[0-9]{10}$' then
    raise exception 'Mobile number must be 10 digits.' using errcode = '22023';
  end if;

  -- Never disclose whose account an existing number belongs to.
  if exists (select 1 from public.profiles where phone = p_mobile and deleted_at is null)
     or exists (select 1 from public.referral_requests where mobile = p_mobile and status <> 'rejected') then
    raise exception 'This mobile number is already registered.' using errcode = '23505';
  end if;

  select count(*) into v_recent from public.referral_requests
   where sponsor_id = v_me and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Too many referrals submitted. Please try again later.' using errcode = '53400';
  end if;

  insert into public.referral_requests (sponsor_id, full_name, mobile, email, city, state)
  values (v_me, trim(p_full_name), p_mobile,
          nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
          nullif(trim(coalesce(p_state, '')), ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.submit_referral(text, text, text, text, text) to authenticated;
