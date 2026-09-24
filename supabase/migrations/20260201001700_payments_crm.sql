-- =====================================================================
-- Payments CRM: give it something to manage
--
-- The module was complete on both sides and permanently empty: 15 confirmed
-- bookings, 0 emis, 0 payments. Nothing ever created a payment schedule and
-- nothing ever recorded a receipt, so a whole chain was dead:
--
--   no emis      -> Payments CRM shows "No plan" on every booking
--   no payments  -> collected is always 0, outstanding always the full value
--   collected 0  -> my_reward_area() can never reach the 50% threshold,
--                   so NO member could ever earn a reward tier
--
-- Marking an EMI 'paid' in the admin panel did not help either: it moved the
-- instalment but wrote no `payments` row, so the money still did not count.
--
-- Two things are added: a schedule created when a sale is verified, and one
-- RPC that records a receipt and settles the instalment together.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The schedule
--
-- Built when a booking reaches `confirmed`, from the plan already on the
-- booking. A 'full' booking still gets one instalment for the balance --
-- without it there is nothing to chase, nothing to age, and no way to see
-- that a cash sale has not actually been collected.
--
-- Idempotent: a booking that already has instalments is left alone, so
-- re-confirming or re-running this can never double a customer's schedule.
-- ---------------------------------------------------------------------
create or replace function app.build_emi_schedule(p_booking uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  b           record;
  v_balance   numeric;
  v_each      numeric;
  v_start     date;
  v_n         int;
  i           int;
  v_made      int := 0;
begin
  select * into b from public.bookings where id = p_booking and deleted_at is null;
  if not found then return 0; end if;

  -- Never touch a booking that already has a schedule.
  if exists (select 1 from public.emis where booking_id = p_booking) then
    return 0;
  end if;

  -- The token is money already taken, so it is not part of what remains.
  v_balance := coalesce(b.sale_value, 0) - coalesce(b.token_amount, 0);
  if v_balance <= 0 then return 0; end if;

  v_n := case when b.payment_plan = 'emi' and coalesce(b.emi_count, 0) > 0
              then b.emi_count else 1 end;
  v_start := coalesce(b.emi_start, (current_date + interval '30 days')::date);

  -- Split evenly, then put the rounding remainder on the FIRST instalment so
  -- the schedule always sums to the balance exactly. Leaving it on the last
  -- one means a customer who pays everything but the final rupee looks
  -- settled for months and then owes a stray amount.
  v_each := round(v_balance / v_n, 2);

  for i in 1..v_n loop
    insert into public.emis (booking_id, seq, due_date, amount, status)
    values (
      p_booking, i,
      (v_start + make_interval(months => i - 1))::date,
      case when i = 1 then v_balance - (v_each * (v_n - 1)) else v_each end,
      'pending'
    );
    v_made := v_made + 1;
  end loop;

  return v_made;
end $$;

-- Fires alongside the income sync; both hang off the same status change so
-- a verified sale always has both its money and its schedule.
create or replace function app.bookings_emi_sync() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    perform app.build_emi_schedule(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_emi_sync on public.bookings;
create trigger trg_bookings_emi_sync
  after insert or update of status on public.bookings
  for each row execute function app.bookings_emi_sync();

-- ---------------------------------------------------------------------
-- 2. Recording a receipt
--
-- The office records the money; the member only ever chases it. Doing the
-- payment row and the instalment status in one function means the two
-- cannot drift -- which is exactly what happened when the admin panel could
-- mark an EMI 'paid' without writing a payment.
--
-- A payment is applied oldest-instalment-first unless one is named, and an
-- instalment is only marked paid once it is FULLY covered; a part payment
-- leaves it open so it still shows as owing.
-- ---------------------------------------------------------------------
create or replace function public.record_payment(
  p_booking   uuid,
  p_amount    numeric,
  p_mode      text default 'bank_transfer',
  p_reference text default null,
  p_paid_on   date default current_date,
  p_emi_id    uuid default null,
  p_receipt   text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_payment uuid;
  v_left    numeric;
  e         record;
  v_paid    numeric;
begin
  if not app.is_admin() then
    raise exception 'Only the office can record a payment' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'A payment amount is required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.bookings where id = p_booking and deleted_at is null) then
    raise exception 'That booking does not exist' using errcode = '23503';
  end if;

  insert into public.payments (booking_id, emi_id, amount, mode, reference, paid_on, recorded_by, receipt_no)
  values (p_booking, p_emi_id, p_amount, coalesce(nullif(p_mode, ''), 'bank_transfer'),
          p_reference, coalesce(p_paid_on, current_date), auth.uid(), nullif(p_receipt, ''))
  returning id into v_payment;

  -- Settle instalments with what has now been received in total, so a
  -- correction or a back-dated receipt lands on the right rows.
  v_left := (select coalesce(sum(amount), 0) from public.payments where booking_id = p_booking);

  for e in
    select id, amount from public.emis
     where booking_id = p_booking
     order by due_date, seq
  loop
    if v_left >= e.amount then
      v_left := v_left - e.amount;
      update public.emis
         set status = 'paid',
             paid_at = coalesce(paid_at, now()),
             updated_at = now()
       where id = e.id and status <> 'paid';
    else
      -- Part-paid or untouched: it stays owing.
      update public.emis
         set status = case when status = 'paid' then 'pending' else status end,
             paid_at = case when status = 'paid' then null else paid_at end,
             updated_at = now()
       where id = e.id;
      v_left := 0;
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_paid from public.payments where booking_id = p_booking;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, after)
  values (auth.uid(), 'admin', 'insert', 'payments', v_payment::text,
          format('Recorded %s against booking', p_amount),
          jsonb_build_object('booking_id', p_booking, 'amount', p_amount,
                             'total_collected', v_paid, 'mode', p_mode));

  return v_payment;
end $$;

revoke all on function public.record_payment(uuid, numeric, text, text, date, uuid, text) from public;
grant execute on function public.record_payment(uuid, numeric, text, text, date, uuid, text) to authenticated;

comment on function public.record_payment is
  'Office records a receipt against a booking and settles instalments oldest-first, in one transaction.';

-- ---------------------------------------------------------------------
-- 3. Ageing
--
-- `overdue` is a stored status, so something has to move instalments into
-- it. Run from the admin panel; safe to call repeatedly.
-- ---------------------------------------------------------------------
create or replace function public.age_overdue_emis()
returns int
language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  if not app.is_admin() then
    raise exception 'Only the office can age instalments' using errcode = '42501';
  end if;

  update public.emis
     set status = 'overdue', updated_at = now()
   where status = 'pending' and due_date < current_date;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.age_overdue_emis() from public;
grant execute on function public.age_overdue_emis() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Collection position, for the office
--
-- One row per booking with what is owed and what has come in. Written as a
-- function so the admin screen and any report share a single definition of
-- "collected".
-- ---------------------------------------------------------------------
create or replace function public.collection_queue()
returns table (
  booking_id uuid, reference text, sale_value numeric, token_amount numeric,
  collected numeric, outstanding numeric,
  emi_total int, emi_paid int, emi_overdue int, next_due date,
  customer_name text, customer_phone text,
  rep_name text, rep_code text, project_name text, plot_number text
)
language sql stable security definer set search_path = public, app as $$
  select
    b.id, b.reference, b.sale_value, b.token_amount,
    coalesce(pay.total, 0),
    greatest(0, coalesce(b.sale_value, 0) - coalesce(pay.total, 0)),
    coalesce(e.total, 0), coalesce(e.paid, 0), coalesce(e.overdue, 0), e.next_due,
    b.customer_name, b.customer_phone,
    rp.full_name, rp.member_code, pr.name, pl.number
  from public.bookings b
  left join public.profiles rp on rp.id = b.rep_id
  left join public.projects pr on pr.id = b.project_id
  left join public.plots    pl on pl.id = b.plot_id
  left join lateral (
    select sum(p.amount) total from public.payments p where p.booking_id = b.id
  ) pay on true
  left join lateral (
    select count(*)::int total,
           count(*) filter (where x.status = 'paid')::int paid,
           count(*) filter (where x.status <> 'paid' and x.due_date < current_date)::int overdue,
           min(x.due_date) filter (where x.status <> 'paid') next_due
      from public.emis x where x.booking_id = b.id
  ) e on true
  where b.status = 'confirmed' and b.deleted_at is null and app.is_admin()
  order by e.overdue desc nulls last, e.next_due nulls last;
$$;

revoke all on function public.collection_queue() from public;
grant execute on function public.collection_queue() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Backfill
--
-- Every already-confirmed sale predates the trigger, so none of them has a
-- schedule. Build one for each so the module is useful on day one.
-- ---------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in select id from public.bookings where status = 'confirmed' and deleted_at is null loop
    n := n + app.build_emi_schedule(r.id);
  end loop;
  raise notice 'built % instalment(s) for existing confirmed bookings', n;
end $$;
