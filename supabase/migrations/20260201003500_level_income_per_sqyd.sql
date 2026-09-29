-- =====================================================================
-- Level income is paid PER SQ YD (the business decision of 2026-09-29).
--
-- plan_levels.rate was applied per 100 sq yd (rate x area / 100); Business
-- Settings labels it "₹ per sq yd" and the business confirmed that is the
-- rule. Only that one expression changes; the rest of the engine is the
-- live definition as it stood. Applies to sales verified from now on --
-- level income already credited keeps the amount it was credited at.
-- =====================================================================

CREATE OR REPLACE FUNCTION app.distribute_sale_income(p_booking uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
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
