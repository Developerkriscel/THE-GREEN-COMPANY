-- =====================================================================
-- Sponsor-panel rewards as the office's deck, slide 8 "Reward Income"
--
--   Each rank's reward has TWO targets: D sq yd of the member's own sales
--   (direct) and G sq yd of their team's sales (group), e.g. Team
--   Coordinator: Juicer at 50D + 100G. Both must be met.
--   "Reward Count After 50% payment": a sale counts once half its value is
--   received (as before).
--   "Reward count 4 months wise, effective 1 Sep 2026 to 31 Dec 2026": only
--   sales booked inside the reward period count. The period is a setting
--   (sponsor.rewards) the office moves on for the next cycle.
--
-- `ranks.reward_sqyd` stays the DIRECT target (award_reward() and existing
-- reward references use it); `ranks.reward_group_sqyd` is new.
-- my_reward_area() is left as it was (lifetime own area) for reports;
-- the panel now reads my_reward_progress().
-- =====================================================================

alter table public.ranks add column if not exists reward_group_sqyd numeric(12, 2) not null default 0
  check (reward_group_sqyd >= 0);

update public.ranks r
   set reward_title = v.title, reward_sqyd = v.direct, reward_group_sqyd = v.grp
  from (values
    ( 1, 'Induction',        50,    0),
    ( 2, 'Juicer',           50,  100),
    ( 3, 'Mixer Grinder',    50,  200),
    ( 4, 'Phone (₹10,000)', 100,  300),
    ( 5, 'Phone (₹10,000)', 100,  400),
    ( 6, 'Phone (₹15,000)', 100,  500),
    ( 7, 'Phone (₹20,000)', 100,  600),
    ( 8, 'Laptop',          200,  700),
    ( 9, 'Car (₹5 Lac)',    500, 1500),
    (10, 'Car (₹7 Lacs)',  1000, 2500),
    (11, 'Car (₹10 Lacs)', 1200, 3000),
    (12, 'Car (₹12 Lacs)', 1500, 5000)
  ) as v(seniority, title, direct, grp)
 where r.seniority = v.seniority;

-- The reward period (inclusive). Reading it needs no special grant: the
-- function below is the only consumer that matters, and it is definer.
insert into public.site_settings (key, value)
values ('sponsor.rewards', jsonb_build_object('start', '2026-09-01', 'end', '2026-12-31', 'min_paid_pct', 50))
on conflict (key) do nothing;

/*
 * The member's reward progress: direct = their own sales, group = sales by
 * everyone below them in the sponsor tree (all depths). A sale counts when
 * it is confirmed, not deleted, at least min_paid_pct paid, and booked inside
 * the reward period. "Pending" is confirmed area in the period still short of
 * the payment threshold, so the panel can say what is waiting on money.
 */
create or replace function public.my_reward_progress(p_member uuid default auth.uid())
returns table (
  direct_sqyd   numeric,
  group_sqyd    numeric,
  direct_pending numeric,
  group_pending  numeric,
  period_start  date,
  period_end    date,
  min_paid_pct  numeric
)
language plpgsql stable security definer set search_path = public, app as $$
declare
  cfg     jsonb := (select value from public.site_settings where key = 'sponsor.rewards');
  v_start date  := nullif(cfg->>'start', '')::date;
  v_end   date  := nullif(cfg->>'end', '')::date;
  v_pct   numeric := coalesce(nullif(cfg->>'min_paid_pct', '')::numeric, 50);
begin
  if p_member is null or not (p_member = auth.uid() or app.is_admin()) then
    raise exception 'You can only see your own reward progress' using errcode = '42501';
  end if;

  return query
  with recursive team as (
    select p.id from public.profiles p where p.referrer_id = p_member and p.deleted_at is null
    union
    select p.id from public.profiles p join team t on p.referrer_id = t.id where p.deleted_at is null
  ),
  sales as (
    select b.rep_id,
           coalesce(pl.size, 0) as area,
           coalesce((select sum(pay.amount) from public.payments pay where pay.booking_id = b.id), 0)
             >= coalesce(b.sale_value, 0) * v_pct / 100 and coalesce(b.sale_value, 0) > 0 as paid_enough
      from public.bookings b
      join public.plots pl on pl.id = b.plot_id
     where b.status = 'confirmed'
       and b.deleted_at is null
       and (v_start is null or coalesce(b.booking_date, b.created_at::date) >= v_start)
       and (v_end   is null or coalesce(b.booking_date, b.created_at::date) <= v_end)
       and (b.rep_id = p_member or b.rep_id in (select id from team))
  )
  select
    coalesce(sum(area) filter (where rep_id = p_member  and paid_enough), 0),
    coalesce(sum(area) filter (where rep_id <> p_member and paid_enough), 0),
    coalesce(sum(area) filter (where rep_id = p_member  and not paid_enough), 0),
    coalesce(sum(area) filter (where rep_id <> p_member and not paid_enough), 0),
    v_start, v_end, v_pct
  from sales;
end $$;

revoke all on function public.my_reward_progress(uuid) from public;
grant execute on function public.my_reward_progress(uuid) to authenticated;
