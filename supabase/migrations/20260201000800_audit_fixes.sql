-- =====================================================================
-- Closing the audit findings — database layer.
--
--   1.1  a cancelled sale now reverses its income (trigger)
--   1.2  a confirmed sale now distributes income (trigger)
--   1.3  soft-deleted members no longer inflate team counts
--   1.4  one balance formula, callable by the admin console too
--   2.1  the referral link now places the joiner under their sponsor
--   2.2  rank promotion, with a rank history to back it up
--   3.2  member actions are audited
--   4.3  bank-change cooling-off + rate limits on the money paths
--   4.4  team depth capped at 12 everywhere, consistently
-- =====================================================================

-- ---------------------------------------------------------------- 1.3 + 4.4
-- Deleted members counted toward direct_count/team_count here but were
-- filtered out of my_downline(), so the console and the member's own panel
-- disagreed the moment anyone was removed. Both now exclude them, and the
-- team walk stops at 12 levels — the same depth income reaches.
create or replace function public.recalculate_network() returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can recalculate the network' using errcode = '42501';
  end if;

  update public.profiles p
     set direct_count = coalesce(d.n, 0)
    from (select referrer_id, count(*) n from public.profiles
           where referrer_id is not null and deleted_at is null
           group by referrer_id) d
   where d.referrer_id = p.id;

  update public.profiles p
     set direct_count = 0
   where not exists (
     select 1 from public.profiles c where c.referrer_id = p.id and c.deleted_at is null);

  with recursive tree as (
    select id as root, id as node, 0 as lvl from public.profiles where deleted_at is null
    union all
    select t.root, c.id, t.lvl + 1
      from tree t
      join public.profiles c on c.referrer_id = t.node and c.deleted_at is null
     where t.lvl < 12
  )
  update public.profiles p
     set team_count = coalesce(t.n, 0)
    from (select root, count(*) - 1 n from tree group by root) t
   where t.root = p.id;
end $$;

create or replace function public.recalculate_member(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can recalculate a member' using errcode = '42501';
  end if;

  update public.profiles p
     set direct_count = (select count(*) from public.profiles c
                          where c.referrer_id = p_id and c.deleted_at is null)
   where p.id = p_id;

  with recursive tree as (
    select p_id as node, 0 as lvl
    union all
    select c.id, t.lvl + 1
      from tree t join public.profiles c on c.referrer_id = t.node and c.deleted_at is null
     where t.lvl < 12
  )
  update public.profiles p
     set team_count = (select count(*) - 1 from tree)
   where p.id = p_id;
end $$;

-- ---------------------------------------------------------------------- 1.4
-- The admin console computed its own balance in TypeScript. One formula only.
create or replace function public.member_wallet(p_member uuid)
returns table (credited numeric, withdrawn numeric, pending numeric, available numeric)
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() and p_member is distinct from auth.uid() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return query select * from app.member_balance(p_member);
end $$;
grant execute on function public.member_wallet(uuid) to authenticated;

-- ---------------------------------------------------------------- 1.1 + 1.2
-- Income followed a sale only when somebody remembered to press a button, and
-- a cancellation never took it back. Both now happen in the same transaction
-- as the status change.
--
-- The internal forms carry no admin check: the bookings transition guard has
-- already decided who was allowed to make this move.
create or replace function app.distribute_sale_income(p_booking uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_tds numeric; v_admin numeric; v_seller uuid; v_value numeric; v_area numeric;
  v_ref text; v_rate numeric; v_gross numeric; v_up uuid; v_lvl int := 0;
  v_lrate numeric; v_count int := 0; v_tdsamt numeric; v_admamt numeric;
begin
  if exists (select 1 from public.member_ledger where booking_id = p_booking) then
    return 0;
  end if;

  select b.rep_id, b.sale_value, coalesce(pl.size, 0), b.reference
    into v_seller, v_value, v_area, v_ref
    from public.bookings b
    left join public.plots pl on pl.id = b.plot_id
   where b.id = p_booking and b.status = 'confirmed' and b.deleted_at is null;

  if v_seller is null then return 0; end if;

  select coalesce((value->>'tds_pct')::numeric, 5), coalesce((value->>'admin_pct')::numeric, 3)
    into v_tds, v_admin from public.site_settings where key = 'sponsor.rates';
  v_tds := coalesce(v_tds, 5); v_admin := coalesce(v_admin, 3);

  select coalesce(r.own_sale_rate, 0) into v_rate
    from public.profiles p left join public.ranks r on r.id = p.rank_id
   where p.id = v_seller;

  v_gross := round(v_value * coalesce(v_rate, 0) / 100.0, 2);
  if v_gross > 0 then
    v_tdsamt := round(v_gross * v_tds / 100.0, 2);
    v_admamt := round(v_gross * v_admin / 100.0, 2);
    insert into public.member_ledger
      (member_id, kind, source, reference, booking_id, area_sqyd, rate_applied,
       gross, tds, admin_charge, net, amount, note)
    values
      (v_seller, 'credit', 'direct_income', v_ref, p_booking, v_area, v_rate,
       v_gross, v_tdsamt, v_admamt, v_gross - v_tdsamt - v_admamt, v_gross - v_tdsamt - v_admamt,
       'Direct income on sale ' || coalesce(v_ref, ''));
    v_count := v_count + 1;
  end if;

  select referrer_id into v_up from public.profiles where id = v_seller and deleted_at is null;
  while v_up is not null and v_lvl < 12 loop
    v_lvl := v_lvl + 1;
    select rate into v_lrate from public.plan_levels
     where level = v_lvl and is_active order by sort_order limit 1;

    if coalesce(v_lrate, 0) > 0 and v_area > 0 then
      v_gross  := round(v_lrate * v_area / 100.0, 2);
      v_tdsamt := round(v_gross * v_tds / 100.0, 2);
      v_admamt := round(v_gross * v_admin / 100.0, 2);
      insert into public.member_ledger
        (member_id, kind, source, reference, booking_id, from_member_id, level,
         area_sqyd, rate_applied, gross, tds, admin_charge, net, amount, note)
      values
        (v_up, 'credit', 'level_income', v_ref, p_booking, v_seller, v_lvl,
         v_area, v_lrate, v_gross, v_tdsamt, v_admamt,
         v_gross - v_tdsamt - v_admamt, v_gross - v_tdsamt - v_admamt,
         'Level ' || v_lvl || ' income on sale ' || coalesce(v_ref, ''));
      v_count := v_count + 1;
    end if;

    select referrer_id into v_up from public.profiles where id = v_up and deleted_at is null;
  end loop;

  return v_count;
end $$;

create or replace function app.reverse_sale_income(p_booking uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare v_count int := 0;
begin
  update public.member_ledger set status = 'reversed'
   where booking_id = p_booking and status = 'credited';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Public, admin-gated wrappers keep the manual "Run income" / "Reverse" actions.
create or replace function public.distribute_sale_income(p_booking uuid) returns int
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run an income distribution' using errcode = '42501';
  end if;
  return app.distribute_sale_income(p_booking);
end $$;

create or replace function public.reverse_sale_income(p_booking uuid) returns int
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can reverse income' using errcode = '42501';
  end if;
  return app.reverse_sale_income(p_booking);
end $$;

create or replace function app.bookings_income_sync() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_was text := case when tg_op = 'INSERT' then null else old.status::text end;
begin
  -- Covers INSERT too: a booking written straight in as confirmed (imports,
  -- back-office corrections, the demo seeder) must earn income like any other.
  if new.status = 'confirmed' and v_was is distinct from 'confirmed' then
    perform app.distribute_sale_income(new.id);
  elsif new.status in ('cancelled', 'rejected') and v_was = 'confirmed' then
    perform app.reverse_sale_income(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_income_sync on public.bookings;
create trigger trg_bookings_income_sync
  after insert or update of status on public.bookings
  for each row execute function app.bookings_income_sync();

-- ---------------------------------------------------------------------- 2.2
-- Rank promotion. Nothing advanced a member before this, so a fully qualified
-- member sat at 100% forever on a rate below what they had earned.
create table if not exists public.rank_history (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles(id) on delete cascade,
  from_rank  uuid references public.ranks(id) on delete set null,
  to_rank    uuid references public.ranks(id) on delete set null,
  reason     text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rank_history_member_idx on public.rank_history (member_id, created_at desc);
alter table public.rank_history enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'rank_history' and policyname = 'rank_history: admin all') then
    create policy "rank_history: admin all" on public.rank_history for all
      using ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
      with check ( (select role from public.profiles where id = (select auth.uid())) = 'admin' );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rank_history' and policyname = 'rank_history: member reads own') then
    create policy "rank_history: member reads own" on public.rank_history for select
      using ( member_id = (select auth.uid()) );
  end if;
end $$;

/**
 * The highest rank a member currently qualifies for, by the same conditions the
 * panel shows them: directs, group size, N members at a rank anywhere in the
 * team, and qualified legs. Never demotes — a rank, once earned, is kept.
 */
create or replace function app.qualified_rank(p_member uuid) returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare
  r record; v_best uuid; v_direct int; v_team int;
  v_qual int; v_legs int; v_current int;
begin
  select count(*) into v_direct from public.profiles
   where referrer_id = p_member and deleted_at is null;

  with recursive t as (
    select id, 1 lvl, id as leg from public.profiles
     where referrer_id = p_member and deleted_at is null
    union all
    select c.id, t.lvl + 1, t.leg
      from t join public.profiles c on c.referrer_id = t.id and c.deleted_at is null
     where t.lvl < 12
  )
  select count(*) into v_team from t;

  select coalesce(r2.seniority, 0) into v_current
    from public.profiles p left join public.ranks r2 on r2.id = p.rank_id
   where p.id = p_member;

  v_best := null;
  for r in select * from public.ranks where active order by seniority loop
    -- entry rank always qualifies
    if coalesce(r.req_direct, 0) = 0 and coalesce(r.req_team, 0) = 0 then
      v_best := r.id;
      continue;
    end if;

    if v_direct < coalesce(r.req_direct, 0) then exit; end if;
    if v_team   < coalesce(r.req_team, 0)   then exit; end if;

    if coalesce(r.req_rank_count, 0) > 0 and r.req_rank_sen is not null then
      with recursive t as (
        select id, 1 lvl from public.profiles
         where referrer_id = p_member and deleted_at is null
        union all
        select c.id, t.lvl + 1 from t
          join public.profiles c on c.referrer_id = t.id and c.deleted_at is null
         where t.lvl < 12
      )
      select count(*) into v_qual
        from t join public.profiles p2 on p2.id = t.id
        join public.ranks r3 on r3.id = p2.rank_id
       where r3.seniority >= r.req_rank_sen;
      if v_qual < r.req_rank_count then exit; end if;
    end if;

    if coalesce(r.req_legs, 0) > 0 and r.req_rank_sen is not null then
      with recursive t as (
        select id, 1 lvl, id as leg from public.profiles
         where referrer_id = p_member and deleted_at is null
        union all
        select c.id, t.lvl + 1, t.leg from t
          join public.profiles c on c.referrer_id = t.id and c.deleted_at is null
         where t.lvl < 12
      )
      select count(distinct t.leg) into v_legs
        from t join public.profiles p2 on p2.id = t.id
        join public.ranks r3 on r3.id = p2.rank_id
       where r3.seniority >= r.req_rank_sen;
      if coalesce(v_legs, 0) < r.req_legs then exit; end if;
    end if;

    v_best := r.id;
  end loop;

  return v_best;
end $$;

create or replace function public.recalculate_rank(p_member uuid) returns text
language plpgsql security definer set search_path = public, app as $$
declare v_new uuid; v_old uuid; v_old_sen int; v_new_sen int; v_name text;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run a rank review' using errcode = '42501';
  end if;

  select rank_id into v_old from public.profiles where id = p_member;
  v_new := app.qualified_rank(p_member);
  if v_new is null then return null; end if;

  select seniority into v_old_sen from public.ranks where id = v_old;
  select seniority, name into v_new_sen, v_name from public.ranks where id = v_new;

  -- Promotion only. Losing a rank is a business decision, not an automatic one.
  if coalesce(v_new_sen, 0) <= coalesce(v_old_sen, 0) then return null; end if;

  update public.profiles set rank_id = v_new where id = p_member;
  insert into public.rank_history (member_id, from_rank, to_rank, reason, changed_by)
  values (p_member, v_old, v_new, 'Qualified in rank review', auth.uid());

  return v_name;
end $$;
grant execute on function public.recalculate_rank(uuid) to authenticated;

create or replace function public.recalculate_all_ranks() returns int
language plpgsql security definer set search_path = public, app as $$
declare rec record; v_count int := 0;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run a rank review' using errcode = '42501';
  end if;
  for rec in
    select id from public.profiles
     where member_code is not null and deleted_at is null and status = 'active'
     order by team_count desc
  loop
    if public.recalculate_rank(rec.id) is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;
grant execute on function public.recalculate_all_ranks() to authenticated;

-- ---------------------------------------------------------------------- 2.1
-- The referral link carried ?ref=RGC1000xx and the signup ignored it, so every
-- joiner landed with no sponsor at all. handle_new_user now reads it.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_is_customer boolean := coalesce(new.raw_app_meta_data->>'account_kind', '') = 'customer';
  v_seq   bigint;
  v_code  text;
  v_ref   text := nullif(trim(coalesce(new.raw_user_meta_data->>'ref', '')), '');
  v_sponsor uuid;
begin
  v_seq := nextval('public.user_code_seq');
  if v_is_customer then
    v_code := 'RG-C-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
  else
    v_code := 'RG-S-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
  end if;

  if v_ref is not null then
    select id into v_sponsor from public.profiles
     where upper(member_code) = upper(v_ref) and deleted_at is null and status = 'active';
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone, user_code, rank_id,
                               member_code, referrer_id, placement_parent_id)
  values (
    new.id,
    case when v_is_customer then 'customer'::app_role else 'rep'::app_role end,
    case when v_is_customer then 'active'::account_status else 'pending'::account_status end,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'user_code', v_code),
    case when v_is_customer then null
         else (select id from public.ranks where seniority = 1 limit 1) end,
    case when v_is_customer then null else app.next_member_code() end,
    case when v_is_customer then null else v_sponsor end,
    case when v_is_customer then null else v_sponsor end
  );
  return new;
end $$;

/** Public lookup so the join form can show who referred you before you sign up. */
create or replace function public.sponsor_by_code(p_code text)
returns table (member_code text, full_name text)
language sql stable security definer set search_path = public, app as $$
  select p.member_code, p.full_name
    from public.profiles p
   where upper(p.member_code) = upper(trim(coalesce(p_code, '')))
     and p.deleted_at is null and p.status = 'active'
   limit 1
$$;
grant execute on function public.sponsor_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------- 3.2 + 4.3
-- Member actions were not audited at all. These RPCs are the choke points, so
-- the trail is written where the action actually happens. Bank changes also
-- start a cooling-off window, since that is the move an attacker with a stolen
-- password would make.
alter table public.profiles
  add column if not exists bank_locked_until timestamptz;

create or replace function public.save_bank_details(
  p_holder text, p_bank text, p_account text, p_ifsc text, p_type text, p_upi text, p_pan text
) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := auth.uid(); v_before jsonb; v_changed boolean;
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

  select jsonb_build_object('bank_name', bank_name, 'account_last4', right(coalesce(bank_account, ''), 4),
                            'ifsc', bank_ifsc, 'upi', upi_id)
    into v_before from public.profiles where id = v_me;

  v_changed := (v_before->>'account_last4') is distinct from right(coalesce(trim(p_account), ''), 4)
            or (v_before->>'upi')          is distinct from nullif(trim(coalesce(p_upi, '')), '');

  update public.profiles
     set bank_holder  = nullif(trim(coalesce(p_holder, '')), ''),
         bank_name    = nullif(trim(coalesce(p_bank, '')), ''),
         bank_account = nullif(trim(coalesce(p_account, '')), ''),
         bank_ifsc    = upper(nullif(trim(coalesce(p_ifsc, '')), '')),
         bank_type    = nullif(trim(coalesce(p_type, '')), ''),
         upi_id       = nullif(trim(coalesce(p_upi, '')), ''),
         pan_number   = upper(nullif(trim(coalesce(p_pan, '')), '')),
         bank_updated_at   = now(),
         -- 24-hour hold on payouts after the destination changes.
         bank_locked_until = case when v_changed then now() + interval '24 hours'
                                  else bank_locked_until end
   where id = v_me;

  perform app.write_audit('update', 'profiles.bank', v_me::text,
    case when v_changed then 'Payout destination changed' else 'Payout details updated' end,
    v_before,
    jsonb_build_object('bank_name', nullif(trim(coalesce(p_bank, '')), ''),
                       'account_last4', right(coalesce(trim(p_account), ''), 4),
                       'ifsc', upper(nullif(trim(coalesce(p_ifsc, '')), '')),
                       'upi', nullif(trim(coalesce(p_upi, '')), '')));
end $$;

create or replace function public.request_withdrawal(
  p_amount numeric, p_account text default null, p_note text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_me uuid := auth.uid(); v_id uuid; v_status text; v_frozen boolean; v_kyc text;
  v_open int; v_avail numeric; v_min numeric; v_recent int; v_lock timestamptz;
  v_acct text := nullif(trim(coalesce(p_account, '')), '');
begin
  if v_me is null then raise exception 'You are not signed in' using errcode = '42501'; end if;

  if p_idempotency_key is not null then
    select id into v_id from public.withdrawals
     where member_id = v_me and idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  select p.status::text, coalesce(p.frozen, false), p.bank_locked_until
    into v_status, v_frozen, v_lock
    from public.profiles p where p.id = v_me for update;

  if v_frozen or v_status is distinct from 'active' then
    raise exception 'Your account is on hold. Please contact the office.' using errcode = '42501';
  end if;

  select k.status::text into v_kyc from public.kyc k where k.user_id = v_me;
  if v_kyc is distinct from 'verified' then
    raise exception 'Complete your KYC before withdrawing.' using errcode = '42501';
  end if;

  if v_lock is not null and v_lock > now() then
    raise exception 'Your bank details changed recently. Withdrawals reopen on %.',
      to_char(v_lock, 'DD Mon at HH12:MI AM') using errcode = '42501';
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

  -- Rate limit: the money path should not be scriptable.
  select count(*) into v_recent from public.withdrawals
   where member_id = v_me and requested_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Too many withdrawal attempts. Please try again later.' using errcode = '53400';
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

  perform app.write_audit('insert', 'withdrawals', v_id::text,
    'Withdrawal requested: ' || round(p_amount, 2)::text, null,
    jsonb_build_object('amount', p_amount, 'account_last4', right(v_acct, 4)));

  return v_id;
end $$;

create or replace function public.cancel_withdrawal(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := auth.uid(); v_status text; v_amount numeric;
begin
  select status, amount into v_status, v_amount from public.withdrawals
   where id = p_id and member_id = v_me for update;
  if v_status is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_status <> 'requested' then
    raise exception 'This request is already being processed and cannot be cancelled.' using errcode = '42501';
  end if;
  update public.withdrawals set status = 'cancelled', processed_at = now()
   where id = p_id and member_id = v_me;
  perform app.write_audit('update', 'withdrawals', p_id::text,
    'Withdrawal cancelled by member', jsonb_build_object('amount', v_amount), null);
end $$;

-- Audit the referral submission too.
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

  perform app.write_audit('insert', 'referral_requests', v_id::text,
    'Referral submitted: ' || trim(p_full_name), null, null);
  return v_id;
end $$;

-- ---------------------------------------------------------------------- 3.1
/** Every payout request across the network, for the admin payouts queue. */
create or replace function public.withdrawal_queue(p_status text default null)
returns table (
  id uuid, member_id uuid, member_code text, member_name text,
  amount numeric, account text, status text, utr text, payout_reference text,
  reject_reason text, requested_at timestamptz, processed_at timestamptz,
  kyc_status text, available numeric
)
language sql stable security definer set search_path = public, app as $$
  select w.id, w.member_id, p.member_code, p.full_name,
         w.amount, w.account, w.status, w.utr, w.payout_reference,
         w.reject_reason, w.requested_at, w.processed_at,
         coalesce(k.status::text, 'not submitted'),
         (select available from app.member_balance(w.member_id))
    from public.withdrawals w
    join public.profiles p on p.id = w.member_id
    left join public.kyc k on k.user_id = w.member_id
   where app.is_admin()
     and (p_status is null or w.status = p_status)
   order by case w.status when 'requested' then 0 when 'approved' then 1 else 2 end,
            w.requested_at desc
$$;
grant execute on function public.withdrawal_queue(text) to authenticated;

-- ---------------------------------------------------------------------- 3.3
/** Network money at a glance, for the admin dashboard. */
create or replace function public.network_totals()
returns table (
  members int, active_members int,
  credited numeric, paid_out numeric, pending_payout numeric, liability numeric,
  open_requests int, undistributed_sales int
)
language sql stable security definer set search_path = public, app as $$
  select
    (select count(*)::int from public.profiles where member_code is not null and deleted_at is null),
    (select count(*)::int from public.profiles where member_code is not null and deleted_at is null and status = 'active'),
    (select coalesce(sum(case when kind = 'credit' and status = 'credited' and not in_kind then net
                              when kind = 'debit'  and status = 'credited' then -net else 0 end), 0)
       from public.member_ledger),
    (select coalesce(sum(amount), 0) from public.withdrawals where status = 'paid'),
    (select coalesce(sum(amount), 0) from public.withdrawals where status in ('requested','approved')),
    (select coalesce(sum(case when kind = 'credit' and status = 'credited' and not in_kind then net
                              when kind = 'debit'  and status = 'credited' then -net else 0 end), 0)
       from public.member_ledger)
    - (select coalesce(sum(amount), 0) from public.withdrawals where status = 'paid'),
    (select count(*)::int from public.withdrawals where status in ('requested','approved')),
    (select count(*)::int from public.bookings b
      where b.status = 'confirmed' and b.deleted_at is null
        and not exists (select 1 from public.member_ledger l where l.booking_id = b.id))
  where app.is_admin()
$$;
grant execute on function public.network_totals() to authenticated;
