-- =====================================================================
-- Sponsor income and Board Member income, as the deck (confirmed by the
-- office 2026-10-05):
--
-- Slide 7 "Sponsor Income": "The difference between your team and you
--   will be counted as your sponsor income." On every confirmed sale,
--   each upline whose own-sale slab is higher than every slab below them
--   in the line (starting with the seller's) earns the difference on the
--   sale value. A 7% Team Coordinator over a 5% seller earns 2%; a 20%
--   Crown above them earns 13%; a 5% member in between earns nothing.
--   (The deck's "Sponsor slab" column is exactly that step between
--   consecutive ranks: 2, 2, 2, 2, 1, 1 ...) Paid alongside direct and
--   level income, reversed with them if the sale is cancelled.
--   This replaces the earlier decision not to pay the sponsor %.
--
-- Slide 6: Diamond and Crown are Board Members: "1% of your own team's
--   turnover plus an iPhone as a gift". ranks.board_pct holds the 1%;
--   credit_board_income(month) pays it on the sale value of the team's
--   confirmed sales booked that month, once per member per month. The
--   iPhone is a one-off gift the office hands over.
--
-- Sales already distributed are not re-paid: a booking's income is written
-- once, when it is confirmed.
-- =====================================================================

alter table public.ranks add column if not exists board_pct numeric(5, 2) not null default 0
  check (board_pct >= 0 and board_pct <= 100);
update public.ranks set board_pct = 1 where seniority in (11, 12);

create or replace function app.distribute_sale_income(p_booking uuid)
returns integer
language plpgsql
set search_path to 'public', 'app'
as $function$
declare
  v_tds numeric; v_admin numeric; v_seller uuid; v_value numeric; v_area numeric;
  v_ref text; v_rate numeric; v_gross numeric; v_up uuid; v_lvl int := 0;
  v_lrate numeric; v_count int := 0; v_tdsamt numeric; v_admamt numeric;
  v_max numeric; v_urate numeric; v_hops int := 0; v_top numeric;
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

  -- Direct income: the seller's own slab.
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

  -- Sponsor income: the slab difference, up the whole sponsor line.
  v_max := coalesce(v_rate, 0);
  select max(own_sale_rate) into v_top from public.ranks where active;
  select referrer_id into v_up from public.profiles where id = v_seller and deleted_at is null;
  while v_up is not null and v_max < coalesce(v_top, 0) and v_hops < 200 loop
    v_hops := v_hops + 1;
    select coalesce(r.own_sale_rate, 0) into v_urate
      from public.profiles p left join public.ranks r on r.id = p.rank_id
     where p.id = v_up;
    if coalesce(v_urate, 0) > v_max and coalesce(v_value, 0) > 0 then
      v_gross  := round(v_value * (v_urate - v_max) / 100.0, 2);
      v_tdsamt := round(v_gross * v_tds / 100.0, 2);
      v_admamt := round(v_gross * v_admin / 100.0, 2);
      insert into public.member_ledger
        (member_id, kind, source, reference, booking_id, from_member_id, area_sqyd, rate_applied,
         gross, tds, admin_charge, net, amount, note)
      values
        (v_up, 'credit', 'sponsor_income', v_ref, p_booking, v_seller, v_area, v_urate - v_max,
         v_gross, v_tdsamt, v_admamt, v_gross - v_tdsamt - v_admamt, v_gross - v_tdsamt - v_admamt,
         'Sponsor income (' || trim(to_char(v_urate, 'FM990.##')) || '% − ' || trim(to_char(v_max, 'FM990.##'))
           || '%) on sale ' || coalesce(v_ref, ''));
      v_count := v_count + 1;
      v_max := v_urate;
    end if;
    select referrer_id into v_up from public.profiles where id = v_up and deleted_at is null;
  end loop;

  -- Level income: ₹ per sq yd, 12 levels up.
  select referrer_id into v_up from public.profiles where id = v_seller and deleted_at is null;
  while v_up is not null and v_lvl < 12 loop
    v_lvl := v_lvl + 1;
    select rate into v_lrate from public.plan_levels
     where level = v_lvl and is_active order by sort_order limit 1;

    if coalesce(v_lrate, 0) > 0 and v_area > 0 then
      v_gross  := round(v_lrate * v_area, 2);  -- plan_levels.rate is ₹ per sq yd
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
end $function$;

/*
 * Board Member income for a completed month (default: the one just ended).
 * Each active member whose rank carries board_pct earns that share of the
 * sale value of every confirmed sale their team (the whole sponsor tree
 * below them) booked in the month. Once per member per month.
 */
create or replace function public.credit_board_income(p_month date default (date_trunc('month', now()) - interval '1 month')::date)
returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  v_tds numeric; v_admin numeric; v_count int := 0; v_ref text;
  rec record; v_turnover numeric; v_gross numeric; v_tdsamt numeric; v_admamt numeric;
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can credit board income' using errcode = '42501';
  end if;
  v_ref := 'BOARD-' || to_char(p_month, 'YYYY-MM');

  select coalesce((value->>'tds_pct')::numeric, 5), coalesce((value->>'admin_pct')::numeric, 3)
    into v_tds, v_admin from public.site_settings where key = 'sponsor.rates';
  v_tds := coalesce(v_tds, 5); v_admin := coalesce(v_admin, 3);

  for rec in
    select p.id, r.board_pct
      from public.profiles p join public.ranks r on r.id = p.rank_id
     where r.board_pct > 0 and p.status = 'active' and p.deleted_at is null
       and not exists (select 1 from public.member_ledger l
                        where l.member_id = p.id and l.source = 'board_income' and l.reference = v_ref)
  loop
    with recursive team as (
      select x.id from public.profiles x where x.referrer_id = rec.id and x.deleted_at is null
      union
      select x.id from public.profiles x join team t on x.referrer_id = t.id where x.deleted_at is null
    )
    select coalesce(sum(b.sale_value), 0) into v_turnover
      from public.bookings b
     where b.status = 'confirmed' and b.deleted_at is null
       and coalesce(b.booking_date, b.created_at::date) between v_start and v_end
       and b.rep_id in (select id from team);

    v_gross := round(v_turnover * rec.board_pct / 100.0, 2);
    continue when v_gross <= 0;
    v_tdsamt := round(v_gross * v_tds / 100.0, 2);
    v_admamt := round(v_gross * v_admin / 100.0, 2);
    insert into public.member_ledger
      (member_id, kind, source, reference, rate_applied, gross, tds, admin_charge, net, amount, note)
    values
      (rec.id, 'credit', 'board_income', v_ref, rec.board_pct, v_gross, v_tdsamt, v_admamt,
       v_gross - v_tdsamt - v_admamt, v_gross - v_tdsamt - v_admamt,
       format('Board Member income for %s: %s%% of team turnover ₹%s', to_char(p_month, 'Mon YYYY'),
              trim(to_char(rec.board_pct, 'FM990.##')), to_char(v_turnover, 'FM99,99,99,99,990')));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.credit_board_income(date) from public;
grant execute on function public.credit_board_income(date) to authenticated;
