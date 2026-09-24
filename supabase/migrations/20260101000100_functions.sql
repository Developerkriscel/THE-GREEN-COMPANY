-- =====================================================================
-- Royal Green — 0002 : helper functions, audit, workflow triggers
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role helpers.
-- SECURITY DEFINER so a policy ON profiles can read profiles without
-- recursing into its own RLS. STABLE so Postgres caches them per statement.
-- ---------------------------------------------------------------------
create or replace function app.current_role() returns app_role
language sql stable security definer set search_path = public, app as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.status = 'active' and p.deleted_at is null
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(app.current_role() = 'admin', false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(app.current_role() in ('admin','manager','rep'), false)
$$;

create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.deleted_at is null
  )
$$;

-- The manager's entire reach. Read-only everywhere it is used.
create or replace function app.managed_rep_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(p.id), '{}')
  from public.profiles p
  where p.manager_id = auth.uid()
    and p.role = 'rep'
    and p.deleted_at is null
    and coalesce(app.current_role() = 'manager', false)
$$;

create or replace function app.manages(target uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select target = any (app.managed_rep_ids())
$$;

-- True when the caller is a party to the booking (rep, customer, reviewer, admin).
create or replace function app.owns_booking(b_id uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.bookings b
    where b.id = b_id
      and (
        b.rep_id      = auth.uid()
        or b.customer_id = auth.uid()
        or b.reviewer_id = auth.uid()
        or app.is_admin()
        or app.manages(b.rep_id)
      )
  )
$$;

create or replace function app.is_booking_customer(b_id uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.bookings b where b.id = b_id and b.customer_id = auth.uid()
  )
$$;

revoke execute on function app.current_role(), app.is_admin(), app.is_staff(),
  app.is_active(), app.managed_rep_ids(), app.manages(uuid),
  app.owns_booking(uuid), app.is_booking_customer(uuid) from public;
grant execute on function app.current_role(), app.is_admin(), app.is_staff(),
  app.is_active(), app.managed_rep_ids(), app.manages(uuid),
  app.owns_booking(uuid), app.is_booking_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
create or replace function app.write_audit(
  p_action audit_action, p_entity text, p_entity_id text,
  p_summary text, p_before jsonb, p_after jsonb
) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, before, after)
  values (auth.uid(), app.current_role(), p_action, p_entity, p_entity_id, p_summary, p_before, p_after);
end $$;

grant execute on function app.write_audit(audit_action, text, text, text, jsonb, jsonb) to authenticated;

-- Generic row-level audit trigger, attached to every business table.
create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_id     text;
  v_action audit_action;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert'; v_after := to_jsonb(new); v_id := (to_jsonb(new)->>'id');
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_before := to_jsonb(old); v_after := to_jsonb(new);
    v_id := (to_jsonb(new)->>'id');
    if v_before = v_after then return new; end if;
  else
    v_action := 'delete'; v_before := to_jsonb(old); v_id := (to_jsonb(old)->>'id');
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, before, after)
  values (auth.uid(), app.current_role(), v_action, tg_table_name, v_id,
          tg_op || ' on ' || tg_table_name, v_before, v_after);

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'ranks','profiles','projects','plots','leads','bookings','sale_confirmations',
    'commissions','emis','payments','documents','kyc','cms_pages','cms_banners','site_settings'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$s
       for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Profile bootstrap. Role is NEVER taken from client metadata.
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_is_customer boolean := coalesce(new.raw_app_meta_data->>'account_kind', '') = 'customer';
  v_seq         bigint;
  v_code        text;
begin
  v_seq := nextval('public.user_code_seq');
  if v_is_customer then
    v_code := 'RG-C-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
  else
    v_code := 'RG-S-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone, user_code, rank_id)
  values (
    new.id,
    case when v_is_customer then 'customer'::app_role else 'rep'::app_role end,
    case when v_is_customer then 'active'::account_status else 'pending'::account_status end,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'user_code', v_code),
    case when v_is_customer then null
         else (select id from public.ranks where seniority = 1 limit 1) end
  );
  return new;
end $$;

create sequence if not exists public.user_code_seq start 1001;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- Profile column guard: only an admin may change role/status/rank/manager/rate.
-- ---------------------------------------------------------------------
create or replace function app.profiles_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then return new; end if;

  if new.role            is distinct from old.role
     or new.status       is distinct from old.status
     or new.rank_id      is distinct from old.rank_id
     or new.manager_id   is distinct from old.manager_id
     or new.commission_rate is distinct from old.commission_rate
     or new.user_code    is distinct from old.user_code
     or new.approved_by  is distinct from old.approved_by
     or new.deleted_at   is distinct from old.deleted_at
  then
    raise exception 'Only an administrator can change role, status, rank, manager, commission rate or user code'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function app.profiles_guard();

-- ---------------------------------------------------------------------
-- Booking 3-step approval guard + plot status side-effects.
-- ---------------------------------------------------------------------
create or replace function app.bookings_transition_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_role  app_role := app.current_role();
  v_admin boolean  := app.is_admin();
begin
  if new.status = old.status then return new; end if;

  -- Step 1: rep (owner) or admin submits, T&C required
  if old.status in ('draft','rejected') and new.status = 'step1_done' then
    if not (v_admin or old.rep_id = auth.uid()) then
      raise exception 'Only the owning sales rep may submit this booking' using errcode='42501';
    end if;
    if not new.terms_accepted_rep then
      raise exception 'Terms & Conditions must be accepted before submitting' using errcode='23514';
    end if;
    new.step1_at := now(); new.step1_by := auth.uid();
    new.reject_step := null; new.reject_remark := null;

  -- Step 2: reviewer (that rep's manager) or admin
  elsif old.status = 'step1_done' and new.status in ('step2_approved','rejected') then
    if not (v_admin or (v_role = 'manager' and app.manages(old.rep_id))) then
      raise exception 'Only the assigned reviewer or an administrator may review this booking' using errcode='42501';
    end if;
    if auth.uid() = old.rep_id then
      raise exception 'A rep cannot review their own booking' using errcode='42501';
    end if;
    if new.status = 'rejected' and coalesce(new.reject_remark,'') = '' then
      raise exception 'A remark is required when rejecting' using errcode='23514';
    end if;
    new.step2_at := now(); new.step2_by := auth.uid();
    new.reviewer_id := coalesce(new.reviewer_id, auth.uid());
    if new.status = 'rejected' then new.reject_step := 2; end if;

  -- Step 3: admin final approval only
  elsif old.status = 'step2_approved' and new.status in ('confirmed','rejected') then
    if not v_admin then
      raise exception 'Only an administrator can give final approval' using errcode='42501';
    end if;
    new.step3_at := now(); new.step3_by := auth.uid();
    if new.status = 'rejected' then new.reject_step := 3; end if;

  elsif new.status = 'cancelled' then
    if not v_admin then
      raise exception 'Only an administrator can cancel a booking' using errcode='42501';
    end if;
  else
    raise exception 'Illegal booking transition % -> %', old.status, new.status using errcode='23514';
  end if;

  return new;
end $$;

create trigger trg_bookings_transition
  before update of status on public.bookings
  for each row execute function app.bookings_transition_guard();

-- Plot status follows the booking, always server-side.
create or replace function app.bookings_plot_sync() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'step1_done' then
      update public.plots set status = 'token' where id = new.plot_id and status = 'available';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'step1_done' then
      update public.plots set status = 'token' where id = new.plot_id and status = 'available';
    elsif new.status = 'confirmed' then
      update public.plots set status = 'booked' where id = new.plot_id;
    elsif new.status in ('rejected','cancelled') then
      update public.plots set status = 'available'
      where id = new.plot_id and status in ('token','booked');
    end if;
  end if;

  if new.registry_path is not null and old.registry_path is null then
    update public.plots set status = 'registered' where id = new.plot_id;
  end if;
  return new;
end $$;

create trigger trg_bookings_plot_sync
  after insert or update on public.bookings
  for each row execute function app.bookings_plot_sync();

-- Booking reference number
create sequence if not exists public.booking_ref_seq start 1;
create or replace function app.bookings_set_reference() returns trigger
language plpgsql as $$
begin
  if coalesce(new.reference,'') = '' then
    new.reference := 'BK-' || to_char(now(),'YYYY') || '-' ||
                     lpad(nextval('public.booking_ref_seq')::text, 5, '0');
  end if;
  return new;
end $$;

create trigger trg_bookings_reference
  before insert on public.bookings
  for each row execute function app.bookings_set_reference();

-- ---------------------------------------------------------------------
-- Sale confirmation: same chain, then fan out commission + EMI + docs.
-- ---------------------------------------------------------------------
create or replace function app.sales_transition_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_role  app_role := app.current_role();
  v_admin boolean  := app.is_admin();
  v_booking_status approval_status;
begin
  if new.status = old.status then return new; end if;

  if old.status in ('draft','rejected') and new.status = 'step1_done' then
    select status into v_booking_status from public.bookings where id = old.booking_id;
    if v_booking_status <> 'confirmed' then
      raise exception 'The booking must be confirmed before a sale can be submitted' using errcode='23514';
    end if;
    if not (v_admin or old.rep_id = auth.uid()) then
      raise exception 'Only the owning sales rep may submit this sale' using errcode='42501';
    end if;
    if not new.terms_accepted_rep then
      raise exception 'Terms & Conditions must be accepted before submitting' using errcode='23514';
    end if;
    new.step1_at := now(); new.step1_by := auth.uid();
    new.reject_step := null; new.reject_remark := null;

  elsif old.status = 'step1_done' and new.status in ('step2_approved','rejected') then
    if not (v_admin or (v_role = 'manager' and app.manages(old.rep_id))) then
      raise exception 'Only the assigned reviewer or an administrator may review this sale' using errcode='42501';
    end if;
    if auth.uid() = old.rep_id then
      raise exception 'A rep cannot review their own sale' using errcode='42501';
    end if;
    if new.status = 'rejected' and coalesce(new.reject_remark,'') = '' then
      raise exception 'A remark is required when rejecting' using errcode='23514';
    end if;
    new.step2_at := now(); new.step2_by := auth.uid();
    new.reviewer_id := coalesce(new.reviewer_id, auth.uid());
    if new.status = 'rejected' then new.reject_step := 2; end if;

  elsif old.status = 'step2_approved' and new.status in ('confirmed','rejected') then
    if not v_admin then
      raise exception 'Only an administrator can confirm a sale' using errcode='42501';
    end if;
    new.step3_at := now(); new.step3_by := auth.uid();
    if new.status = 'rejected' then new.reject_step := 3; end if;
  else
    raise exception 'Illegal sale transition % -> %', old.status, new.status using errcode='23514';
  end if;

  return new;
end $$;

create trigger trg_sales_transition
  before update of status on public.sale_confirmations
  for each row execute function app.sales_transition_guard();

-- On admin confirmation: commission (single-level), EMI schedule, notifications.
create or replace function app.sales_on_confirm() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_rate      numeric(5,2);
  v_rank      text;
  v_gross     numeric(14,2);
  v_deduct_pc numeric(5,2);
  v_deduct    numeric(14,2);
  v_booking   public.bookings%rowtype;
  i           int;
begin
  if not (new.status = 'confirmed' and old.status is distinct from 'confirmed') then
    return new;
  end if;

  select * into v_booking from public.bookings where id = new.booking_id;

  -- --- commission: ONLY for the rep who made this sale. -------------
  if new.rep_id is not null then
    select coalesce(p.commission_rate, r.own_sale_rate, 0), r.name
      into v_rate, v_rank
      from public.profiles p
      left join public.ranks r on r.id = p.rank_id
     where p.id = new.rep_id;

    v_gross := round(new.sale_value * coalesce(v_rate, 0) / 100.0, 2);
    select coalesce(sum(percent), 0) into v_deduct_pc
      from public.commission_deductions where active;
    v_deduct := round(v_gross * v_deduct_pc / 100.0, 2);

    insert into public.commissions
      (booking_id, rep_id, sale_value, rate_applied, rank_at_sale,
       gross_amount, deductions, net_amount, status)
    values
      (new.booking_id, new.rep_id, new.sale_value, coalesce(v_rate,0), v_rank,
       v_gross, v_deduct, v_gross - v_deduct, 'accrued')
    on conflict (booking_id) do nothing;

    insert into public.notifications (user_id, type, title, body, link)
    values (new.rep_id, 'commission', 'Commission accrued',
            'Your sale was confirmed. Commission of ' || (v_gross - v_deduct) || ' is now accrued.',
            '/app/commission');
  end if;

  -- --- EMI schedule --------------------------------------------------
  if v_booking.payment_plan = 'emi' and v_booking.emi_count > 0 then
    for i in 1..v_booking.emi_count loop
      insert into public.emis (booking_id, seq, due_date, amount)
      values (v_booking.id, i,
              coalesce(v_booking.emi_start, current_date) + ((i - 1) * interval '1 month'),
              v_booking.emi_amount)
      on conflict (booking_id, seq) do nothing;
    end loop;
  end if;

  -- --- customer notification ----------------------------------------
  if v_booking.customer_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_booking.customer_id, 'sale', 'Your purchase is confirmed',
            'Your welcome letter and booking form are ready to download.',
            '/portal/documents');
  end if;

  return new;
end $$;

create trigger trg_sales_on_confirm
  after update on public.sale_confirmations
  for each row execute function app.sales_on_confirm();

-- ---------------------------------------------------------------------
-- EMI guard: a customer may only attach a slip; only an admin marks paid.
-- ---------------------------------------------------------------------
create or replace function app.emis_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then
    if new.status = 'paid' and old.status is distinct from 'paid' then
      new.paid_at := now(); new.verified_by := auth.uid(); new.verified_at := now();
    end if;
    return new;
  end if;

  -- non-admin: the only legal move is pending/overdue/rejected -> awaiting_verification
  if new.status is distinct from old.status then
    if not (old.status in ('pending','overdue','rejected') and new.status = 'awaiting_verification') then
      raise exception 'Only an administrator can change EMI status' using errcode='42501';
    end if;
    new.slip_uploaded_at := now();
  end if;

  if new.amount is distinct from old.amount
     or new.due_date is distinct from old.due_date
     or new.verified_by is distinct from old.verified_by
     or new.paid_at is distinct from old.paid_at then
    raise exception 'Only an administrator can change EMI amount, due date or verification' using errcode='42501';
  end if;

  return new;
end $$;

create trigger trg_emis_guard
  before update on public.emis
  for each row execute function app.emis_guard();

-- Receipt + payment row when an EMI is verified.
create sequence if not exists public.receipt_seq start 1;
create or replace function app.emis_on_paid() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_booking public.bookings%rowtype;
begin
  if not (new.status = 'paid' and old.status is distinct from 'paid') then return new; end if;

  select * into v_booking from public.bookings where id = new.booking_id;

  insert into public.payments (booking_id, emi_id, amount, mode, reference, paid_on, recorded_by, receipt_no)
  values (new.booking_id, new.id, new.amount, 'emi', new.reference, current_date, auth.uid(),
          'RC-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0'));

  if v_booking.customer_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_booking.customer_id, 'emi', 'Payment verified',
            'Installment #' || new.seq || ' has been verified. Your receipt is ready.',
            '/portal/emis');
  end if;
  if v_booking.rep_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_booking.rep_id, 'emi', 'EMI collected',
            'Installment #' || new.seq || ' on ' || v_booking.reference || ' was verified.',
            '/app/bookings');
  end if;
  return new;
end $$;

create trigger trg_emis_on_paid
  after update on public.emis
  for each row execute function app.emis_on_paid();

-- Slip upload notifies admins + the rep.
create or replace function app.emis_on_slip() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_booking public.bookings%rowtype; v_admin record;
begin
  if not (new.status = 'awaiting_verification' and old.status is distinct from 'awaiting_verification') then
    return new;
  end if;
  select * into v_booking from public.bookings where id = new.booking_id;

  for v_admin in select id from public.profiles where role = 'admin' and status = 'active' loop
    insert into public.notifications (user_id, type, title, body, link)
    values (v_admin.id, 'emi', 'EMI slip awaiting verification',
            'Installment #' || new.seq || ' on ' || v_booking.reference || ' needs verification.',
            '/admin/emis');
  end loop;

  if v_booking.rep_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_booking.rep_id, 'emi', 'Customer uploaded an EMI slip',
            'Installment #' || new.seq || ' on ' || v_booking.reference || '.', '/app/bookings');
  end if;
  return new;
end $$;

create trigger trg_emis_on_slip
  after update on public.emis
  for each row execute function app.emis_on_slip();

-- ---------------------------------------------------------------------
-- Commission guard: nobody writes these by hand except an admin changing state.
-- ---------------------------------------------------------------------
create or replace function app.commissions_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can modify a commission record' using errcode='42501';
  end if;
  if new.rep_id is distinct from old.rep_id or new.booking_id is distinct from old.booking_id then
    raise exception 'A commission cannot be reassigned to another rep or booking' using errcode='42501';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_by := auth.uid(); new.approved_at := now();
  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    if coalesce(new.payout_reference,'') = '' then
      raise exception 'A payout reference is required to mark a commission paid' using errcode='23514';
    end if;
    new.paid_at := now();
  end if;
  return new;
end $$;

create trigger trg_commissions_guard
  before update on public.commissions
  for each row execute function app.commissions_guard();

-- ---------------------------------------------------------------------
-- KYC guard: only an admin sets verified/rejected.
-- ---------------------------------------------------------------------
create or replace function app.kyc_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
      insert into public.notifications (user_id, type, title, body, link)
      values (new.user_id, 'kyc', 'KYC ' || new.status,
              coalesce(new.reject_reason, 'Your KYC status has been updated.'), '/app/profile');
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an administrator can change KYC status' using errcode='42501';
  end if;
  if old.status = 'verified' then
    raise exception 'Verified KYC cannot be edited' using errcode='42501';
  end if;
  return new;
end $$;

create trigger trg_kyc_guard
  before update on public.kyc
  for each row execute function app.kyc_guard();

-- ---------------------------------------------------------------------
-- Messaging housekeeping
-- ---------------------------------------------------------------------
create or replace function app.messages_touch_thread() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare p record;
begin
  update public.message_threads set last_message_at = now() where id = new.thread_id;
  for p in select user_id from public.thread_participants
            where thread_id = new.thread_id and user_id <> coalesce(new.sender_id, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (p.user_id, 'message', 'New message', left(new.body, 140), '/messages/' || new.thread_id);
  end loop;
  return new;
end $$;

create trigger trg_messages_touch
  after insert on public.messages
  for each row execute function app.messages_touch_thread();

-- ---------------------------------------------------------------------
-- Public enquiry -> lead + thread. SECURITY DEFINER so anon can call it
-- without any table-level INSERT grant. Returns nothing readable.
-- ---------------------------------------------------------------------
create or replace function public.submit_enquiry(
  p_name text, p_mobile text, p_email text default null,
  p_project_id uuid default null, p_budget numeric default null,
  p_visit_date date default null, p_message text default null
) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_lead uuid; v_thread uuid;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_mobile),'') = '' then
    raise exception 'Name and mobile number are required' using errcode='23514';
  end if;

  insert into public.leads (name, mobile, email, project_id, budget, visit_date, remark, source, status)
  values (trim(p_name), trim(p_mobile), nullif(trim(coalesce(p_email,'')),''),
          p_project_id, p_budget, p_visit_date, p_message, 'website', 'new')
  returning id into v_lead;

  insert into public.message_threads (subject, kind, status, lead_id, guest_name, guest_email, guest_phone)
  values ('Website enquiry — ' || trim(p_name), 'enquiry', 'open', v_lead,
          trim(p_name), nullif(trim(coalesce(p_email,'')),''), trim(p_mobile))
  returning id into v_thread;

  if coalesce(trim(p_message),'') <> '' then
    insert into public.messages (thread_id, sender_id, body) values (v_thread, null, p_message);
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary)
  values (null, null, 'insert', 'leads', v_lead::text, 'Public website enquiry');
end $$;

grant execute on function public.submit_enquiry(text, text, text, uuid, numeric, date, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Customer User-ID login resolver.
-- Returns only the synthetic auth email, and only for customer accounts.
-- ---------------------------------------------------------------------
create or replace function public.resolve_customer_login(p_user_code text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare v_email text;
begin
  select p.email into v_email
  from public.profiles p
  where upper(p.user_code) = upper(trim(p_user_code))
    and p.role = 'customer'
    and p.status = 'active'
    and p.deleted_at is null;

  if v_email is null then
    raise exception 'Invalid User ID' using errcode='28000';
  end if;
  return v_email;
end $$;

grant execute on function public.resolve_customer_login(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Overdue EMI sweep (call from a scheduled job / cron edge function)
-- ---------------------------------------------------------------------
create or replace function public.flag_overdue_emis() returns int
language plpgsql security definer set search_path = public, app as $$
declare v_count int;
begin
  update public.emis
     set status = 'overdue'
   where status = 'pending' and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.flag_overdue_emis() from public, anon;
grant execute on function public.flag_overdue_emis() to service_role;
