-- =====================================================================
-- Customer panel
--
-- A plot buyer gets their own panel: the plots they bought, the EMI
-- schedule and payments, the registry / mutation papers and plot photos the
-- office uploads, their relationship manager, company contacts, offers, a
-- way to refer someone, and a way to give feedback. The office manages all
-- of it from the new Customers module.
--
-- What already existed and is reused as is: customer accounts (role
-- 'customer', RG-C-… codes from app.handle_new_user), bookings.customer_id
-- with bookings_select_customer, instalments with emis_update_customer and
-- the emi-slips bucket (the customer uploads a payment slip, the office
-- verifies it in Payments CRM), payments_select_party, documents_select_party,
-- and the registry bucket readable by anyone party to the booking.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Customer details (the fields from the office's customer sheet)
-- ---------------------------------------------------------------------
create table if not exists public.customer_details (
  customer_id        uuid primary key references public.profiles(id) on delete cascade,
  guardian_relation  text check (guardian_relation in ('S/O', 'D/O', 'W/O', 'C/O')),
  guardian_name      text,
  alt_phone          text,
  -- Relationship manager: a sponsor from the network, or a name and number
  -- typed in (an office staffer who is not a member).
  rm_id              uuid references public.profiles(id) on delete set null,
  rm_name            text,
  rm_phone           text,
  referred_by_name   text,
  referred_by_phone  text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.customer_details enable row level security;

drop policy if exists customer_details_select_own on public.customer_details;
create policy customer_details_select_own on public.customer_details
  for select to authenticated using (customer_id = auth.uid() or app.is_admin());
drop policy if exists customer_details_write_admin on public.customer_details;
create policy customer_details_write_admin on public.customer_details
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- The customer sees their RM's name and number; the RM may be a sponsor
-- whose profile the customer otherwise could not read.
create or replace function public.my_customer_contacts()
returns table (rm_name text, rm_phone text, rm_code text)
language sql stable security definer set search_path = public, app as $$
  select coalesce(nullif(d.rm_name, ''), p.full_name),
         coalesce(nullif(d.rm_phone, ''), p.phone),
         p.member_code
    from public.customer_details d
    left join public.profiles p on p.id = d.rm_id
   where d.customer_id = auth.uid()
$$;
revoke all on function public.my_customer_contacts() from public;
grant execute on function public.my_customer_contacts() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Registry and mutation, per booking
-- ---------------------------------------------------------------------
alter table public.bookings add column if not exists registry_status text not null default 'pending';
alter table public.bookings add column if not exists mutation_status text not null default 'pending';
alter table public.bookings add column if not exists mutation_at timestamptz;
alter table public.bookings add column if not exists possession_status text not null default 'pending';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_registry_status_check') then
    alter table public.bookings add constraint bookings_registry_status_check
      check (registry_status in ('pending', 'in_progress', 'done'));
    alter table public.bookings add constraint bookings_mutation_status_check
      check (mutation_status in ('pending', 'in_progress', 'done'));
    alter table public.bookings add constraint bookings_possession_status_check
      check (possession_status in ('pending', 'in_progress', 'done'));
  end if;
end $$;

-- Papers the office uploads for the buyer.
alter type public.doc_type add value if not exists 'mutation';
alter type public.doc_type add value if not exists 'plot_photo';
alter type public.doc_type add value if not exists 'allotment_letter';
alter type public.doc_type add value if not exists 'possession_letter';

-- Photos need an image type in the registry bucket (PDF, PNG, JPEG already).
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
 where id = 'registry';

-- ---------------------------------------------------------------------
-- 3. Offers the office publishes to customers
-- ---------------------------------------------------------------------
create table if not exists public.customer_offers (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  image_url    text,
  cta_label    text,
  cta_link     text,
  valid_until  date,
  active       boolean not null default true,
  customer_id  uuid references public.profiles(id) on delete cascade, -- null = every customer
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.customer_offers enable row level security;

drop policy if exists customer_offers_select on public.customer_offers;
create policy customer_offers_select on public.customer_offers
  for select to authenticated using (
    app.is_admin()
    or (active and (valid_until is null or valid_until >= current_date)
        and (customer_id is null or customer_id = auth.uid())
        and app.current_role() = 'customer')
  );
drop policy if exists customer_offers_write_admin on public.customer_offers;
create policy customer_offers_write_admin on public.customer_offers
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------
-- 4. Customer feedback
-- ---------------------------------------------------------------------
create table if not exists public.customer_feedback (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  booking_id   uuid references public.bookings(id) on delete set null,
  rating       int check (rating between 1 and 5),
  message      text not null check (length(trim(message)) between 2 and 2000),
  status       text not null default 'new' check (status in ('new', 'seen', 'replied')),
  admin_reply  text,
  replied_at   timestamptz,
  replied_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.customer_feedback enable row level security;

drop policy if exists customer_feedback_select on public.customer_feedback;
create policy customer_feedback_select on public.customer_feedback
  for select to authenticated using (customer_id = auth.uid() or app.is_admin());
drop policy if exists customer_feedback_insert_own on public.customer_feedback;
create policy customer_feedback_insert_own on public.customer_feedback
  for insert to authenticated with check (
    customer_id = auth.uid() and app.current_role() = 'customer'
    and status = 'new' and admin_reply is null
    and (booking_id is null or app.is_booking_customer(booking_id))
  );
drop policy if exists customer_feedback_update_admin on public.customer_feedback;
create policy customer_feedback_update_admin on public.customer_feedback
  for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- The office hears about new feedback; the customer hears about a reply.
create or replace function app.customer_feedback_notify() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'customer_feedback',
           'New customer feedback' || coalesce(' (' || new.rating || '★)', ''),
           left(new.message, 140), '/admin/customers?tab=feedback'
      from public.profiles p where p.role = 'admin' and p.deleted_at is null;
  elsif tg_op = 'UPDATE' and new.admin_reply is not null
        and new.admin_reply is distinct from old.admin_reply then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.customer_id, 'feedback_reply', 'The office replied to your feedback',
            left(new.admin_reply, 140), '/customer/feedback');
  end if;
  return new;
end $$;
drop trigger if exists trg_customer_feedback_notify on public.customer_feedback;
create trigger trg_customer_feedback_notify after insert or update on public.customer_feedback
  for each row execute function app.customer_feedback_notify();

-- ---------------------------------------------------------------------
-- 5. A customer refers someone ("if any ref, fill the name and number")
--
-- The referral becomes a lead for the customer's RM when the RM is an
-- active sponsor, otherwise it lands in the office pool. The customer can
-- see their own referrals and how far each has got — nothing more.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists referred_by_customer uuid references public.profiles(id) on delete set null;

create or replace function public.customer_refer(p_name text, p_mobile text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_me     uuid := auth.uid();
  v_cust   record;
  v_owner  uuid;
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_lead   uuid;
begin
  select p.id, p.full_name, p.user_code, p.phone into v_cust
    from public.profiles p
   where p.id = v_me and p.role = 'customer' and p.status = 'active' and p.deleted_at is null;
  if v_cust.id is null then
    raise exception 'Only a customer can refer from here' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Enter the name of the person you are referring' using errcode = '22023';
  end if;
  if length(v_mobile) = 12 and v_mobile like '91%' then v_mobile := substr(v_mobile, 3); end if;
  if length(v_mobile) = 11 and v_mobile like '0%' then v_mobile := substr(v_mobile, 2); end if;
  if length(v_mobile) < 10 then
    raise exception 'Enter a 10-digit mobile number' using errcode = '22023';
  end if;
  if (select count(*) from public.leads
       where referred_by_customer = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That is a lot of referrals for one day — please try again tomorrow' using errcode = '22023';
  end if;
  if exists (select 1 from public.leads where referred_by_customer = v_me
               and regexp_replace(mobile, '\D', '', 'g') like '%' || v_mobile and deleted_at is null) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select d.rm_id into v_owner
    from public.customer_details d
    join public.profiles r on r.id = d.rm_id and r.role = 'rep' and r.status = 'active' and r.deleted_at is null
   where d.customer_id = v_me;

  insert into public.leads (owner_id, name, mobile, source, remark, status, next_follow_up, referred_by_customer)
  values (v_owner, trim(p_name), v_mobile, 'customer_referral',
          'Referred by customer ' || v_cust.full_name || ' (' || coalesce(v_cust.user_code, '') ||
          coalesce(', ' || v_cust.phone, '') || ')' || coalesce(' — ' || nullif(trim(p_note), ''), ''),
          'new', current_date + 1, v_me)
  returning id into v_lead;

  insert into public.notifications (user_id, type, title, body, link)
  select coalesce(v_owner, a.id), 'customer_referral',
         'New referral from a customer: ' || trim(p_name),
         v_cust.full_name || ' referred ' || trim(p_name) || ' (' || v_mobile || ').',
         case when v_owner is null then '/admin/leads' else '/sponsor/leads' end
    from (select id from public.profiles where role = 'admin' and deleted_at is null) a
   where v_owner is null
  union all
  select v_owner, 'customer_referral', 'New referral from your customer: ' || trim(p_name),
         v_cust.full_name || ' referred ' || trim(p_name) || ' (' || v_mobile || ').', '/sponsor/leads'
   where v_owner is not null;

  return jsonb_build_object('ok', true, 'duplicate', false, 'lead_id', v_lead);
end $$;
revoke all on function public.customer_refer(text, text, text) from public;
grant execute on function public.customer_refer(text, text, text) to authenticated;

create or replace function public.my_customer_referrals()
returns table (name text, mobile text, status text, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select l.name,
         -- the customer typed it; show enough to recognise it
         '••••••' || right(regexp_replace(l.mobile, '\D', '', 'g'), 4),
         case l.status when 'converted' then 'Bought a plot' when 'lost' then 'Not interested'
                       when 'new' then 'Received' else 'In discussion' end,
         l.created_at
    from public.leads l
   where l.referred_by_customer = auth.uid() and l.deleted_at is null
   order by l.created_at desc
$$;
revoke all on function public.my_customer_referrals() from public;
grant execute on function public.my_customer_referrals() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Customer sign-in by customer ID, mobile or e-mail
--
-- Returns NULL for anything unknown (an ordinary "no", like the sponsor
-- resolver), so a typo never surfaces as an HTTP 401.
-- ---------------------------------------------------------------------
create or replace function public.resolve_customer_identifier(p_identifier text)
returns text
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_id    text := regexp_replace(coalesce(p_identifier, ''), '[\s​ ﻿­]', '', 'g');
  v_digits text := regexp_replace(v_id, '\D', '', 'g');
  v_email text;
begin
  if v_id = '' then return null; end if;
  if length(v_digits) = 12 and v_digits like '91%' then v_digits := substr(v_digits, 3); end if;
  select p.email into v_email
    from public.profiles p
   where p.role = 'customer' and p.status = 'active' and p.deleted_at is null
     and (upper(p.user_code) = upper(v_id)
          or lower(p.email) = lower(v_id)
          or (length(v_digits) >= 10 and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = right(v_digits, 10)))
   order by p.created_at
   limit 1;
  return v_email;
end $$;
revoke all on function public.resolve_customer_identifier(text) from public;
grant execute on function public.resolve_customer_identifier(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. The office creates a booking for a customer
--
-- Same rules as a member's sale (plot must be available, one live booking
-- per plot) but the office is the approver, so the booking is confirmed on
-- the spot: the confirm triggers build the EMI schedule and, when a sponsor
-- is credited, distribute the income exactly as for any verified sale.
-- ---------------------------------------------------------------------
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
declare
  v_cust    record;
  v_project uuid;
  v_status  text;
  v_booking uuid;
begin
  if not app.is_admin() then
    raise exception 'Only the office can create a booking here' using errcode = '42501';
  end if;
  select id, full_name, phone into v_cust from public.profiles
   where id = p_customer_id and role = 'customer' and deleted_at is null;
  if v_cust.id is null then
    raise exception 'That customer does not exist' using errcode = '23503';
  end if;
  select pl.project_id, pl.status into v_project, v_status
    from public.plots pl where pl.id = p_plot_id and pl.deleted_at is null;
  if v_project is null then
    raise exception 'That plot does not exist' using errcode = '23503';
  end if;
  if v_status <> 'available' then
    raise exception 'Plot is not available (it is %)', v_status using errcode = '23514';
  end if;
  if coalesce(p_sale_value, 0) <= 0 then
    raise exception 'A sale value is required' using errcode = '23514';
  end if;
  if p_rep_id is not null and not exists (
    select 1 from public.profiles where id = p_rep_id and role = 'rep' and status = 'active' and deleted_at is null
  ) then
    raise exception 'The sponsor to credit must be an active member' using errcode = '23514';
  end if;

  insert into public.bookings (
    plot_id, project_id, rep_id, customer_id, status, sale_value, token_amount,
    payment_plan, emi_count, emi_amount, emi_start, customer_name, customer_phone, terms_accepted_rep
  ) values (
    p_plot_id, v_project, p_rep_id, p_customer_id, 'draft', p_sale_value, coalesce(p_token_amount, 0),
    case when coalesce(p_emi_count, 0) > 0 then 'emi' else coalesce(nullif(p_payment_plan, ''), 'full') end,
    nullif(p_emi_count, 0), nullif(p_emi_amount, 0), p_emi_start,
    v_cust.full_name, v_cust.phone, true
  )
  returning id into v_booking;

  update public.bookings set status = 'step1_done' where id = v_booking;
  update public.bookings set status = 'confirmed' where id = v_booking;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary)
  values (auth.uid(), 'admin', 'insert', 'bookings', v_booking,
          'Office created a booking for customer ' || v_cust.full_name);
  return v_booking;
end $$;
revoke all on function public.admin_create_customer_booking(uuid, uuid, numeric, numeric, text, int, numeric, date, uuid) from public;
grant execute on function public.admin_create_customer_booking(uuid, uuid, numeric, numeric, text, int, numeric, date, uuid) to authenticated;
