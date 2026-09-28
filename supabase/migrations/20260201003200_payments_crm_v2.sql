-- =====================================================================
-- Payments CRM, second pass: the sale form, the schedule, the receipts.
--
-- What the reference CRM does and this one did not:
--   * "New plot sale" captures the customer, area x rate = total, a booking
--     amount, monthly EMIs (typed or split evenly) and custom milestones
--     ("Registry", "Possession"), and the schedule is generated at once.
--   * The member uploads a receipt for any unpaid item; the office verifies
--     it; collected = verified money.
--
-- Two defects fixed on the way:
--   * record_payment() inserted the payment AND flipped instalments to paid,
--     and trg_emis_on_paid inserted a second payment for each one -- every
--     recorded receipt was counted twice.
--   * The booking amount (token) was left out of the schedule and never
--     recorded anywhere, so a schedule never added up to the sale value.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.bookings
  add column if not exists booking_date     date,
  add column if not exists area             numeric(12,2),
  add column if not exists rate_per_unit    numeric(14,2),
  add column if not exists customer_email   text,
  add column if not exists customer_address text,
  add column if not exists notes            text,
  add column if not exists milestones       jsonb not null default '[]'::jsonb;

alter table public.emis
  add column if not exists kind             text not null default 'emi',
  add column if not exists label            text,
  add column if not exists slip_mode        text,
  add column if not exists slip_paid_on     date,
  add column if not exists slip_uploaded_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.emis add constraint emis_kind_chk check (kind in ('booking', 'emi', 'milestone', 'balance'));
exception when duplicate_object then null; end $$;

-- Existing rows: a one-instalment plan is the balance of a cash sale.
update public.emis e
   set kind  = case when b.payment_plan = 'emi' then 'emi' else 'balance' end,
       label = coalesce(e.label, case when b.payment_plan = 'emi' then 'EMI ' || e.seq else 'Balance' end)
  from public.bookings b
 where b.id = e.booking_id and e.label is null;

-- The booking amount of every live sale becomes a schedule item, so the
-- schedule sums to the sale value and "outstanding" means the same thing
-- on every screen. Nothing was ever recorded against these, so they are
-- owed until the office says otherwise.
insert into public.emis (booking_id, seq, due_date, amount, status, kind, label)
select b.id, 0, coalesce(b.booking_date, b.created_at::date), b.token_amount, 'pending', 'booking', 'Booking amount'
  from public.bookings b
 where b.deleted_at is null
   and b.status in ('step1_done', 'step2_approved', 'confirmed')
   and coalesce(b.token_amount, 0) > 0
   and exists (select 1 from public.emis x where x.booking_id = b.id)
   and not exists (select 1 from public.emis x where x.booking_id = b.id and x.seq = 0);

-- ---------------------------------------------------------------------
-- 2. The schedule
--
--   booking amount   on the booking date                (seq 0)
--   EMIs             monthly from the first EMI date   (seq 1..n)
--   balance          whatever an EMI plan leaves over  (seq n+1)
--   milestones       on their own dates                (seq 100+)
--
-- An even split puts the rounding on the FIRST EMI (whole rupees), as the
-- original schedule did. Idempotent: a booking with a schedule is untouched.
-- ---------------------------------------------------------------------
create or replace function app.build_emi_schedule(p_booking uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  b        record;
  v_start  date;
  v_first  date;
  v_token  numeric;
  v_ms     numeric;
  v_rest   numeric;
  v_n      int;
  v_each   numeric;
  v_left   numeric;
  v_seq    int := 100;
  v_made   int := 0;
  m        record;
  i        int;
begin
  select * into b from public.bookings where id = p_booking and deleted_at is null;
  if not found then return 0; end if;
  if exists (select 1 from public.emis where booking_id = p_booking) then return 0; end if;

  v_start := coalesce(b.booking_date, b.created_at::date, current_date);
  v_first := coalesce(b.emi_start, (v_start + interval '1 month')::date);
  v_token := greatest(coalesce(b.token_amount, 0), 0);
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_ms
    from jsonb_array_elements(coalesce(b.milestones, '[]'::jsonb)) x;
  v_rest := coalesce(b.sale_value, 0) - v_token - v_ms;

  if v_token > 0 then
    insert into public.emis (booking_id, seq, due_date, amount, kind, label)
    values (p_booking, 0, v_start, v_token, 'booking', 'Booking amount');
    v_made := v_made + 1;
  end if;

  if v_rest > 0 then
    v_n := case when b.payment_plan = 'emi' and coalesce(b.emi_count, 0) > 0 then b.emi_count else 0 end;
    if v_n > 0 then
      if coalesce(b.emi_amount, 0) > 0 and b.emi_amount * v_n <= v_rest then
        v_each := b.emi_amount;
        v_left := v_rest - v_each * v_n;
        for i in 1..v_n loop
          insert into public.emis (booking_id, seq, due_date, amount, kind, label)
          values (p_booking, i, (v_first + make_interval(months => i - 1))::date, v_each, 'emi', 'EMI ' || i);
        end loop;
        if v_left > 0 then
          insert into public.emis (booking_id, seq, due_date, amount, kind, label)
          values (p_booking, v_n + 1, (v_first + make_interval(months => v_n))::date, v_left, 'balance', 'Balance');
          v_made := v_made + 1;
        end if;
      else
        v_each := floor(v_rest / v_n);
        for i in 1..v_n loop
          insert into public.emis (booking_id, seq, due_date, amount, kind, label)
          values (p_booking, i, (v_first + make_interval(months => i - 1))::date,
                  case when i = 1 then v_rest - v_each * (v_n - 1) else v_each end, 'emi', 'EMI ' || i);
        end loop;
      end if;
      v_made := v_made + v_n;
    else
      insert into public.emis (booking_id, seq, due_date, amount, kind, label)
      values (p_booking, 1, v_first, v_rest, 'balance', 'Balance');
      v_made := v_made + 1;
    end if;
  end if;

  for m in
    select x ->> 'label' as label, (x ->> 'due_date')::date as due, (x ->> 'amount')::numeric as amount
      from jsonb_array_elements(coalesce(b.milestones, '[]'::jsonb)) x
     order by (x ->> 'due_date')::date
  loop
    if coalesce(m.amount, 0) > 0 then
      insert into public.emis (booking_id, seq, due_date, amount, kind, label)
      values (p_booking, v_seq, coalesce(m.due, v_start), m.amount, 'milestone', coalesce(nullif(trim(m.label), ''), 'Milestone'));
      v_seq := v_seq + 1;
      v_made := v_made + 1;
    end if;
  end loop;

  return v_made;
end $$;

-- A filed sale gets its schedule straight away (the member can collect the
-- booking amount before the office has verified the sale); a rejected or
-- cancelled one drops whatever was never paid.
create or replace function app.bookings_emi_sync() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status in ('step1_done', 'confirmed')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform app.build_emi_schedule(new.id);
  elsif tg_op = 'UPDATE' and new.status in ('rejected', 'cancelled') and old.status is distinct from new.status then
    delete from public.emis e
     where e.booking_id = new.id and e.status <> 'paid'
       and not exists (select 1 from public.payments p where p.emi_id = e.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. When the office confirms a sale, attach the buyer's customer account
--    if exactly one customer has that mobile. The office's confirmation is
--    the approval; a member cannot attach a sale to someone's account.
-- ---------------------------------------------------------------------
create or replace function app.bookings_link_customer() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_digits text; v_ids uuid[];
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' and new.customer_id is null then
    v_digits := right(regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g'), 10);
    if length(v_digits) = 10 then
      select array_agg(id) into v_ids from public.profiles
       where role = 'customer' and deleted_at is null
         and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_digits;
      if coalesce(array_length(v_ids, 1), 0) = 1 then
        new.customer_id := v_ids[1];
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_link_customer on public.bookings;
create trigger trg_bookings_link_customer
  before update of status on public.bookings
  for each row execute function app.bookings_link_customer();

-- ---------------------------------------------------------------------
-- 4. Receipts
--
-- The member who sold the plot (or the buyer) uploads a receipt against an
-- item; only the office can say it is paid. Verifying writes the payment,
-- once: record_payment() has already written its own money, so it sets a
-- flag the trigger honours.
-- ---------------------------------------------------------------------
create or replace function app.is_booking_rep(b_id uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.bookings b where b.id = b_id and b.rep_id = auth.uid());
$$;

drop policy if exists emis_update_rep on public.emis;
create policy emis_update_rep on public.emis for update to authenticated
  using (app.is_booking_rep(booking_id)) with check (app.is_booking_rep(booking_id));

drop policy if exists emi_slips_write on storage.objects;
create policy emi_slips_write on storage.objects for insert to authenticated
  with check (bucket_id = 'emi-slips' and (
    app.is_admin()
    or app.is_booking_customer(app.path_head_uuid(name))
    or app.is_booking_rep(app.path_head_uuid(name))
  ));

create or replace function app.emis_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then
    if new.status = 'paid' and old.status is distinct from 'paid' then
      new.paid_at := now(); new.verified_by := auth.uid(); new.verified_at := now();
    end if;
    return new;
  end if;

  -- Not the office: the only legal move is owing -> sent for verification.
  if new.status is distinct from old.status then
    if not (old.status in ('pending', 'overdue', 'rejected') and new.status = 'awaiting_verification') then
      raise exception 'Only an administrator can change EMI status' using errcode = '42501';
    end if;
    if new.slip_path is null then
      raise exception 'Upload the receipt first' using errcode = '23514';
    end if;
    new.slip_uploaded_at := now();
    new.slip_uploaded_by := auth.uid();
    new.reject_reason := null;
  end if;

  if new.amount is distinct from old.amount
     or new.due_date is distinct from old.due_date
     or new.verified_by is distinct from old.verified_by
     or new.paid_at is distinct from old.paid_at
     or new.seq is distinct from old.seq
     or new.kind is distinct from old.kind
     or new.label is distinct from old.label
     or new.booking_id is distinct from old.booking_id then
    raise exception 'Only an administrator can change an instalment' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function app.emis_on_paid() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_booking public.bookings%rowtype; v_what text;
begin
  if not (new.status = 'paid' and old.status is distinct from 'paid') then return new; end if;
  select * into v_booking from public.bookings where id = new.booking_id;
  v_what := coalesce(new.label, 'Instalment #' || new.seq);

  -- record_payment() wrote the money itself; this only settles the item.
  if coalesce(current_setting('app.recording_payment', true), '') <> 'on'
     and not exists (select 1 from public.payments where emi_id = new.id) then
    insert into public.payments (booking_id, emi_id, amount, mode, reference, paid_on, recorded_by, receipt_no)
    values (new.booking_id, new.id, new.amount, coalesce(nullif(new.slip_mode, ''), 'bank_transfer'), new.reference,
            coalesce(new.slip_paid_on, current_date), auth.uid(),
            'RC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0'));
  end if;

  if v_booking.customer_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_booking.customer_id, 'emi', 'Payment received',
            v_what || ' of ₹' || to_char(new.amount, 'FM99,99,99,999') || ' is marked paid. Thank you!',
            '/customer/payments');
  end if;
  if v_booking.rep_id is not null and v_booking.rep_id is distinct from auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_booking.rep_id, 'emi', 'Payment verified',
            v_what || ' on ' || v_booking.reference || ' (' || coalesce(v_booking.customer_name, 'customer') || ') was verified.',
            '/sponsor/crm');
  end if;
  return new;
end $$;

create or replace function app.emis_on_slip() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_booking public.bookings%rowtype; v_admin record; v_what text;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  v_what := coalesce(new.label, 'Instalment #' || new.seq);

  if new.status = 'awaiting_verification' and old.status is distinct from 'awaiting_verification' then
    for v_admin in select id from public.profiles where role = 'admin' and status = 'active' loop
      insert into public.notifications (user_id, type, title, body, link)
      values (v_admin.id, 'emi', 'Receipt to verify',
              v_what || ' of ₹' || to_char(new.amount, 'FM99,99,99,999') || ' on ' || v_booking.reference || '.',
              '/admin/crm?tab=pending');
    end loop;
    if v_booking.rep_id is not null and v_booking.rep_id is distinct from auth.uid() then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_booking.rep_id, 'emi', 'Customer uploaded a receipt',
              v_what || ' on ' || v_booking.reference || '.', '/sponsor/crm');
    end if;
    return new;
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    if v_booking.customer_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_booking.customer_id, 'emi', 'Payment slip not accepted',
              v_what || ': ' || coalesce(nullif(new.reject_reason, ''), 'please upload a clear slip again.'),
              '/customer/payments');
    end if;
    if v_booking.rep_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_booking.rep_id, 'emi', 'Receipt sent back',
              v_what || ' on ' || v_booking.reference || ': ' || coalesce(nullif(new.reject_reason, ''), 'please upload it again.'),
              '/sponsor/crm');
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. record_payment(): same behaviour, counted once.
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
          p_reference, coalesce(p_paid_on, current_date), auth.uid(),
          coalesce(nullif(p_receipt, ''),
                   'RC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0')))
  returning id into v_payment;

  -- Settle items oldest-first with everything received so far. The flag
  -- stops trg_emis_on_paid from writing a second payment for each one.
  perform set_config('app.recording_payment', 'on', true);
  v_left := (select coalesce(sum(amount), 0) from public.payments where booking_id = p_booking);
  for e in
    select id, amount from public.emis where booking_id = p_booking order by due_date, seq
  loop
    if v_left >= e.amount then
      v_left := v_left - e.amount;
      update public.emis set status = 'paid', updated_at = now() where id = e.id and status <> 'paid';
    else
      update public.emis
         set status = case when status = 'paid' then 'pending' else status end,
             paid_at = case when status = 'paid' then null else paid_at end,
             updated_at = now()
       where id = e.id and status = 'paid';
      v_left := 0;
    end if;
  end loop;
  perform set_config('app.recording_payment', 'off', true);

  select coalesce(sum(amount), 0) into v_paid from public.payments where booking_id = p_booking;
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, after)
  values (auth.uid(), 'admin', 'insert', 'payments', v_payment::text,
          format('Recorded %s against booking', p_amount),
          jsonb_build_object('booking_id', p_booking, 'amount', p_amount, 'total_collected', v_paid, 'mode', p_mode));
  return v_payment;
end $$;

-- ---------------------------------------------------------------------
-- 6. "New plot sale"
--
-- A member files a sale against themselves; it waits for the office to
-- verify it, and its schedule exists from the moment it is filed. The office
-- can file one for a member (or with no member) and confirm it on the spot,
-- attach a customer account, and mark the booking amount as received.
-- ---------------------------------------------------------------------
create or replace function public.create_plot_sale(
  p_plot_id          uuid,
  p_customer_name    text,
  p_customer_phone   text default null,
  p_customer_email   text default null,
  p_customer_address text default null,
  p_area             numeric default null,
  p_rate             numeric default null,
  p_total            numeric default null,
  p_booking_amount   numeric default 0,
  p_emi_count        int default 0,
  p_emi_amount       numeric default null,
  p_start_date       date default null,
  p_notes            text default null,
  p_milestones       jsonb default '[]'::jsonb,
  p_first_emi        date default null,
  p_rep_id           uuid default null,
  p_customer_id      uuid default null,
  p_confirm          boolean default false,
  p_booking_paid     boolean default false
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_me      uuid := auth.uid();
  v_admin   boolean := app.is_admin();
  v_rep     uuid;
  v_plot    record;
  v_area    numeric;
  v_rate    numeric;
  v_total   numeric;
  v_token   numeric := greatest(coalesce(p_booking_amount, 0), 0);
  v_n       int := greatest(coalesce(p_emi_count, 0), 0);
  v_ms      jsonb := '[]'::jsonb;
  v_ms_sum  numeric := 0;
  v_rest    numeric;
  v_start   date := coalesce(p_start_date, current_date);
  v_booking uuid;
  v_ref     text;
  m         jsonb;
begin
  if v_me is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  if v_admin then
    v_rep := p_rep_id;
    if v_rep is not null and not exists (
      select 1 from public.profiles where id = v_rep and role = 'rep' and status = 'active' and deleted_at is null
    ) then
      raise exception 'The sponsor to credit must be an active member' using errcode = '23514';
    end if;
    if p_customer_id is not null and not exists (
      select 1 from public.profiles where id = p_customer_id and role = 'customer' and deleted_at is null
    ) then
      raise exception 'That customer does not exist' using errcode = '23503';
    end if;
  else
    if not exists (
      select 1 from public.profiles p
       where p.id = v_me and p.role = 'rep' and p.status = 'active'
         and p.deleted_at is null and coalesce(p.frozen, false) = false
    ) then
      raise exception 'Your account cannot submit sales. Please contact the office.' using errcode = '42501';
    end if;
    if p_rep_id is not null and p_rep_id <> v_me or p_customer_id is not null or p_confirm or p_booking_paid then
      raise exception 'Only the office can do that' using errcode = '42501';
    end if;
    v_rep := v_me;
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'A customer name is required' using errcode = '23514';
  end if;

  select pl.id, pl.project_id, pl.price, pl.size, pl.status into v_plot
    from public.plots pl where pl.id = p_plot_id and pl.deleted_at is null;
  if v_plot.id is null then raise exception 'That plot does not exist' using errcode = '23503'; end if;
  if v_plot.status <> 'available' or exists (
    select 1 from public.bookings b where b.plot_id = p_plot_id and b.deleted_at is null
       and b.status in ('step1_done', 'step2_approved', 'confirmed')
  ) then
    raise exception 'That plot is no longer available' using errcode = '23514';
  end if;

  v_area  := coalesce(nullif(p_area, 0), v_plot.size);
  v_total := coalesce(nullif(p_total, 0), case when coalesce(v_area, 0) > 0 and coalesce(p_rate, 0) > 0 then round(v_area * p_rate) end, v_plot.price);
  if coalesce(v_total, 0) <= 0 then
    raise exception 'A total amount is required (area x rate, or type it)' using errcode = '23514';
  end if;
  v_rate := coalesce(nullif(p_rate, 0), case when coalesce(v_area, 0) > 0 then round(v_total / v_area, 2) end);

  -- Milestones: label, date and a positive amount each.
  for m in select * from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb)) loop
    if coalesce(trim(m ->> 'label'), '') = '' or (m ->> 'due_date') is null or coalesce((m ->> 'amount')::numeric, 0) <= 0 then
      raise exception 'Each milestone needs a label, a date and an amount' using errcode = '23514';
    end if;
    v_ms := v_ms || jsonb_build_array(jsonb_build_object(
      'label', trim(m ->> 'label'), 'due_date', (m ->> 'due_date')::date, 'amount', (m ->> 'amount')::numeric));
    v_ms_sum := v_ms_sum + (m ->> 'amount')::numeric;
  end loop;

  v_rest := v_total - v_token - v_ms_sum;
  if v_rest < 0 then
    raise exception 'The booking amount and milestones come to more than the total' using errcode = '23514';
  end if;
  if v_n > 360 then raise exception 'Too many EMIs' using errcode = '23514'; end if;
  if coalesce(p_emi_amount, 0) > 0 then
    if v_n = 0 then raise exception 'Enter the number of EMIs for that EMI amount' using errcode = '23514'; end if;
    if p_emi_amount * v_n > v_rest then
      raise exception 'EMIs of % x % come to more than the balance of %', v_n, p_emi_amount, v_rest using errcode = '23514';
    end if;
  end if;

  insert into public.bookings (
    plot_id, project_id, rep_id, customer_id, status, sale_value, token_amount,
    payment_plan, emi_count, emi_amount, emi_start, booking_date, area, rate_per_unit,
    customer_name, customer_phone, customer_email, customer_address, notes, milestones, terms_accepted_rep
  ) values (
    p_plot_id, v_plot.project_id, v_rep, case when v_admin then p_customer_id end, 'draft', v_total, v_token,
    case when v_n > 0 then 'emi' else 'full' end, v_n, coalesce(nullif(p_emi_amount, 0), 0),
    case when v_n > 0 then coalesce(p_first_emi, (v_start + interval '1 month')::date) else p_first_emi end,
    v_start, v_area, v_rate,
    trim(p_customer_name), nullif(trim(coalesce(p_customer_phone, '')), ''), nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_customer_address, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), v_ms, true
  )
  returning id, reference into v_booking, v_ref;

  -- Filing builds the schedule (trg_bookings_emi_sync).
  update public.bookings set status = 'step1_done' where id = v_booking;

  if v_admin and p_confirm then
    update public.bookings set status = 'confirmed' where id = v_booking;
  end if;
  if v_admin and p_booking_paid and v_token > 0 then
    update public.emis set status = 'paid', reference = 'Received at booking'
     where booking_id = v_booking and seq = 0;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, after)
  values (v_me, (case when v_admin then 'admin' else 'rep' end)::app_role, 'insert', 'bookings', v_booking::text,
          format('New plot sale %s for %s', v_ref, trim(p_customer_name)),
          jsonb_build_object('total', v_total, 'booking_amount', v_token, 'emis', v_n,
                             'milestones', jsonb_array_length(v_ms), 'via', 'create_plot_sale'));
  return v_booking;
end $$;

revoke all on function public.create_plot_sale(uuid, text, text, text, text, numeric, numeric, numeric, numeric, int, numeric, date, text, jsonb, date, uuid, uuid, boolean, boolean) from public;
grant execute on function public.create_plot_sale(uuid, text, text, text, text, numeric, numeric, numeric, numeric, int, numeric, date, text, jsonb, date, uuid, uuid, boolean, boolean) to authenticated;

-- The customer module's "Book a plot" is the same thing with the customer's
-- details filled in; the booking amount it records was received at the office.
create or replace function public.admin_create_customer_booking(
  p_customer_id  uuid,
  p_plot_id      uuid,
  p_sale_value   numeric,
  p_token_amount numeric default 0,
  p_payment_plan text default 'full',
  p_emi_count    int default null,
  p_emi_amount   numeric default null,
  p_emi_start    date default null,
  p_rep_id       uuid default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_cust record;
begin
  if not app.is_admin() then
    raise exception 'Only the office can create a booking here' using errcode = '42501';
  end if;
  select p.id, p.full_name, p.phone, p.email, concat_ws(', ', p.address, p.city, p.state, p.pincode) as address
    into v_cust from public.profiles p
   where p.id = p_customer_id and p.role = 'customer' and p.deleted_at is null;
  if v_cust.id is null then
    raise exception 'That customer does not exist' using errcode = '23503';
  end if;
  return public.create_plot_sale(
    p_plot_id          => p_plot_id,
    p_customer_name    => v_cust.full_name,
    p_customer_phone   => v_cust.phone,
    p_customer_email   => case when v_cust.email like '%@customers.symocity.app' then null else v_cust.email end,
    p_customer_address => nullif(v_cust.address, ''),
    p_total            => p_sale_value,
    p_booking_amount   => coalesce(p_token_amount, 0),
    p_emi_count        => coalesce(p_emi_count, 0),
    p_emi_amount       => p_emi_amount,
    p_first_emi        => p_emi_start,
    p_rep_id           => p_rep_id,
    p_customer_id      => p_customer_id,
    p_confirm          => true,
    p_booking_paid     => true
  );
end $$;

-- ---------------------------------------------------------------------
-- 7. Office collection position: add the overdue amount (unpaid items past
--    due, not the whole outstanding of a late booking) and slips waiting.
-- ---------------------------------------------------------------------
drop function if exists public.collection_queue();
create function public.collection_queue()
returns table (
  booking_id uuid, reference text, sale_value numeric, token_amount numeric,
  collected numeric, outstanding numeric,
  emi_total int, emi_paid int, emi_overdue int, next_due date,
  customer_name text, customer_phone text,
  rep_name text, rep_code text, project_name text, plot_number text,
  overdue_amount numeric, awaiting int, customer_id uuid
)
language sql stable security definer set search_path = public, app as $$
  select
    b.id, b.reference, b.sale_value, b.token_amount,
    coalesce(pay.total, 0),
    greatest(0, coalesce(b.sale_value, 0) - coalesce(pay.total, 0)),
    coalesce(e.total, 0), coalesce(e.paid, 0), coalesce(e.overdue, 0), e.next_due,
    b.customer_name, b.customer_phone,
    rp.full_name, rp.member_code, pr.name, pl.number,
    coalesce(e.overdue_amount, 0), coalesce(e.awaiting, 0), b.customer_id
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
           sum(x.amount) filter (where x.status <> 'paid' and x.due_date < current_date) overdue_amount,
           count(*) filter (where x.status = 'awaiting_verification')::int awaiting,
           min(x.due_date) filter (where x.status <> 'paid') next_due
      from public.emis x where x.booking_id = b.id
  ) e on true
  where b.status = 'confirmed' and b.deleted_at is null and app.is_admin()
  order by e.overdue desc nulls last, e.next_due nulls last;
$$;
revoke all on function public.collection_queue() from public;
grant execute on function public.collection_queue() to authenticated;
