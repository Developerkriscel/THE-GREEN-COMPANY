-- =====================================================================
-- The rest of the office's deck (symocity_website_brand_colors.pptx)
--
-- Slide 9 "BONUS/INCENTIVE": the monthly bonus is paid only when that
--   month's sales reach the rank's target, written "Group Sales / Direct
--   Sales" (AGM ₹1,000 at 50 sq yd group / 50 sq yd direct ... Crown
--   ₹1,00,000 at 2,000 / 300). It used to go to every rank holder.
--   "Incentive / Bonus will be given every month."
-- Slide 10 "DIRECT JOINING": training perks from VP up are tickets plus a
--   rupee amount (VP: Free 3 Ticket + Rs.20,000 ... Crown: Free 15 Ticket +
--   Rs.1,00,000); they read "+ 20%".
-- Slide 5 "PROJECT": Manglam City Block-B is a sold-out project.
-- =====================================================================

alter table public.ranks add column if not exists bonus_direct_sqyd numeric(12, 2) not null default 0 check (bonus_direct_sqyd >= 0);
alter table public.ranks add column if not exists bonus_group_sqyd  numeric(12, 2) not null default 0 check (bonus_group_sqyd >= 0);

update public.ranks r
   set bonus_group_sqyd = v.grp, bonus_direct_sqyd = v.direct
  from (values (5, 50, 50), (6, 200, 50), (7, 700, 50), (8, 900, 50),
               (9, 1200, 100), (10, 1300, 100), (11, 1500, 150), (12, 2000, 300))
       as v(seniority, grp, direct)
 where r.seniority = v.seniority;

update public.ranks r
   set training_note = v.note
  from (values (8, 'Free · 3 tickets + ₹20,000'), (9, 'Free · 5 tickets + ₹40,000'),
               (10, 'Free · 7 tickets + ₹60,000'), (11, 'Free · 11 tickets + ₹80,000'),
               (12, 'Free · 15 tickets + ₹1,00,000'))
       as v(seniority, note)
 where r.seniority = v.seniority;

alter table public.projects add column if not exists sold_out boolean not null default false;
update public.projects set sold_out = true where slug = 'manglam-city-block-b';

/*
 * A member's sales in one calendar month: direct = their own, group = the
 * whole sponsor tree below them. Confirmed bookings booked that month (the
 * deck sets no payment share for the bonus, unlike rewards).
 */
create or replace function public.member_month_sales(p_member uuid default auth.uid(), p_month date default current_date)
returns table (direct_sqyd numeric, group_sqyd numeric, month_start date, month_end date)
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if p_member is null or not (p_member = auth.uid() or app.is_admin()) then
    raise exception 'You can only see your own sales' using errcode = '42501';
  end if;
  return query
  with recursive team as (
    select p.id from public.profiles p where p.referrer_id = p_member and p.deleted_at is null
    union
    select p.id from public.profiles p join team t on p.referrer_id = t.id where p.deleted_at is null
  )
  select
    coalesce(sum(pl.size) filter (where b.rep_id = p_member), 0),
    coalesce(sum(pl.size) filter (where b.rep_id <> p_member), 0),
    v_start, v_end
    from public.bookings b
    join public.plots pl on pl.id = b.plot_id
   where b.status = 'confirmed' and b.deleted_at is null
     and coalesce(b.booking_date, b.created_at::date) between v_start and v_end
     and (b.rep_id = p_member or b.rep_id in (select id from team));
end $$;
revoke all on function public.member_month_sales(uuid, date) from public;
grant execute on function public.member_month_sales(uuid, date) to authenticated;

/*
 * The monthly bonus run. Pays a completed month (by default the one just
 * ended): each active member gets their rank's bonus if THAT month's own
 * and team sales met the rank's targets. Safe to run again -- a member is
 * paid once per month (reference SALARY-YYYY-MM, as before, so a month
 * already paid is never paid twice).
 */
create or replace function public.credit_monthly_salary(p_month date default (date_trunc('month', now()) - interval '1 month')::date)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_tds numeric; v_admin numeric; v_count int := 0; v_ref text;
  rec record; v_gross numeric; v_d numeric; v_g numeric;
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run salary' using errcode = '42501';
  end if;
  v_ref := 'SALARY-' || to_char(p_month, 'YYYY-MM');

  select coalesce((value->>'tds_pct')::numeric, 5), coalesce((value->>'admin_pct')::numeric, 3)
    into v_tds, v_admin from public.site_settings where key = 'sponsor.rates';
  v_tds := coalesce(v_tds, 5); v_admin := coalesce(v_admin, 3);

  for rec in
    select p.id, r.salary, r.bonus_direct_sqyd, r.bonus_group_sqyd
      from public.profiles p
      join public.ranks r on r.id = p.rank_id
     where r.salary > 0 and p.status = 'active' and p.deleted_at is null
       and not exists (
         select 1 from public.member_ledger l
          where l.member_id = p.id and l.source = 'salary' and l.reference = v_ref)
  loop
    -- The month's own and team sales, the same sum member_month_sales() shows.
    with recursive team as (
      select x.id from public.profiles x where x.referrer_id = rec.id and x.deleted_at is null
      union
      select x.id from public.profiles x join team t on x.referrer_id = t.id where x.deleted_at is null
    )
    select coalesce(sum(pl.size) filter (where b.rep_id = rec.id), 0),
           coalesce(sum(pl.size) filter (where b.rep_id <> rec.id), 0)
      into v_d, v_g
      from public.bookings b join public.plots pl on pl.id = b.plot_id
     where b.status = 'confirmed' and b.deleted_at is null
       and coalesce(b.booking_date, b.created_at::date) between v_start and v_end
       and (b.rep_id = rec.id or b.rep_id in (select id from team));

    continue when v_d < rec.bonus_direct_sqyd or v_g < rec.bonus_group_sqyd;

    v_gross := rec.salary;
    insert into public.member_ledger
      (member_id, kind, source, reference, gross, tds, admin_charge, net, amount, note)
    values
      (rec.id, 'credit', 'salary', v_ref, v_gross,
       round(v_gross * v_tds / 100.0, 2), round(v_gross * v_admin / 100.0, 2),
       v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
       v_gross - round(v_gross * v_tds / 100.0, 2) - round(v_gross * v_admin / 100.0, 2),
       'Monthly bonus for ' || to_char(p_month, 'Mon YYYY')
         || case when rec.bonus_direct_sqyd > 0 or rec.bonus_group_sqyd > 0
                 then format(' (sold %s sq yd own, %s sq yd team)', v_d, v_g) else '' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
