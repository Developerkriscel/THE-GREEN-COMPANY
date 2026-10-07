-- =====================================================================
-- Plot resale + payment reminders
--
-- RESALE (customer panel → admin desk → buyers)
--   A plot owner asks to resell a confirmed plot (asking price, negotiable,
--   reason). The office reviews it: approves with a listed price, transfer
--   fee and whether it shows on the website, or rejects it with a note. A
--   listed plot is offered to sponsors (Resale plots) and, if chosen, on the
--   public website; buyers' enquiries come to the office. When a buyer is
--   settled the office transfers the booking: the plot, its paid history and
--   its remaining instalments move to the buyer's customer account, and the
--   transfer is recorded. Seller identity never leaves the office.
--
--   submitted → listed → buyer_found → transferred
--        ↘ rejected       ↘ withdrawn (seller or office)
--
-- REMINDERS (sponsor + customer + office)
--   app.run_payment_reminders() runs from the gateway every hour and is
--   idempotent: it marks unpaid instalments past their date as overdue and
--   sends, once each, "due in 3 days", "due today" and overdue reminders
--   (day 1, then every 3 days for the first week, then weekly) to the
--   customer and to the sponsor who made the sale. Sponsors and the office
--   can also remind a customer themselves (WhatsApp, call, panel
--   notification); every reminder is logged in payment_reminders.
-- =====================================================================

-- ------------------------------------------------------------------ resale
create sequence if not exists app.resale_seq start 1;

create table if not exists public.resale_listings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique default ('RSGC-RS-' || lpad(nextval('app.resale_seq')::text, 4, '0')),
  booking_id       uuid not null references public.bookings(id),
  seller_id        uuid not null references public.profiles(id),
  asking_price     numeric(14,2) not null check (asking_price > 0),
  negotiable       boolean not null default true,
  reason           text,
  status           text not null default 'submitted'
                   check (status in ('submitted', 'listed', 'buyer_found', 'transferred', 'rejected', 'withdrawn')),
  listed_price     numeric(14,2) check (listed_price is null or listed_price > 0),
  transfer_fee     numeric(14,2) not null default 0 check (transfer_fee >= 0),
  show_on_website  boolean not null default false,
  office_note      text,
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  listed_at        timestamptz,
  buyer_id         uuid references public.profiles(id),
  sold_price       numeric(14,2),
  transferred_at   timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- One open resale per plot booking.
create unique index if not exists resale_listings_one_open
  on public.resale_listings (booking_id) where status in ('submitted', 'listed', 'buyer_found');
create index if not exists resale_listings_status_idx on public.resale_listings (status, created_at desc);

create table if not exists public.resale_inquiries (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.resale_listings(id) on delete cascade,
  name        text not null,
  phone       text not null,
  message     text,
  source      text not null default 'website' check (source in ('website', 'sponsor', 'office')),
  sponsor_id  uuid references public.profiles(id),
  status      text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at  timestamptz not null default now()
);
create index if not exists resale_inquiries_listing_idx on public.resale_inquiries (listing_id, created_at desc);

create table if not exists public.booking_transfers (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id),
  listing_id     uuid references public.resale_listings(id),
  from_customer  uuid references public.profiles(id),
  to_customer    uuid not null references public.profiles(id),
  price          numeric(14,2),
  transfer_fee   numeric(14,2) not null default 0,
  note           text,
  transferred_by uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

alter table public.resale_listings   enable row level security;
alter table public.resale_inquiries  enable row level security;
alter table public.booking_transfers enable row level security;

-- Reads: the office sees everything; a seller sees their own listings; a
-- sponsor sees the enquiries they registered. Every write goes through the
-- functions below.
drop policy if exists resale_listings_select_admin on public.resale_listings;
create policy resale_listings_select_admin on public.resale_listings for select to authenticated using (app.is_admin());
drop policy if exists resale_listings_select_seller on public.resale_listings;
create policy resale_listings_select_seller on public.resale_listings for select to authenticated using (seller_id = auth.uid());

drop policy if exists resale_inquiries_select_admin on public.resale_inquiries;
create policy resale_inquiries_select_admin on public.resale_inquiries for select to authenticated using (app.is_admin());
drop policy if exists resale_inquiries_select_sponsor on public.resale_inquiries;
create policy resale_inquiries_select_sponsor on public.resale_inquiries for select to authenticated using (sponsor_id = auth.uid());

drop policy if exists booking_transfers_select_admin on public.booking_transfers;
create policy booking_transfers_select_admin on public.booking_transfers for select to authenticated using (app.is_admin());
drop policy if exists booking_transfers_select_party on public.booking_transfers;
create policy booking_transfers_select_party on public.booking_transfers for select to authenticated
  using (from_customer = auth.uid() or to_customer = auth.uid());

-- A plot's short name for messages: "Symo City · Plot 101".
create or replace function app.plot_label(p_booking uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce(pr.name, 'Plot') || coalesce(' · Plot ' || pl.number, '')
    from public.bookings b
    left join public.projects pr on pr.id = b.project_id
    left join public.plots pl on pl.id = b.plot_id
   where b.id = p_booking
$$;

create or replace function app.notify_admins(p_type text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public, app as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, p_type, p_title, p_body, p_link
    from public.profiles p where p.role = 'admin' and p.status = 'active' and p.deleted_at is null
$$;

/** The plot owner asks to resell one of their confirmed plots. */
create or replace function public.customer_request_resale(
  p_booking_id uuid, p_asking_price numeric, p_negotiable boolean default true, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_b record; v_id uuid; v_ref text;
begin
  select b.* into v_b from public.bookings b
   where b.id = p_booking_id and b.deleted_at is null and b.customer_id = auth.uid();
  if not found then
    raise exception 'That plot is not in your account' using errcode = '42501';
  end if;
  if v_b.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be put up for resale' using errcode = '22023';
  end if;
  if coalesce(p_asking_price, 0) <= 0 then
    raise exception 'Enter the price you are asking for' using errcode = '22023';
  end if;
  if exists (select 1 from public.resale_listings r
              where r.booking_id = p_booking_id and r.status in ('submitted', 'listed', 'buyer_found')) then
    raise exception 'This plot already has an open resale request' using errcode = '23505';
  end if;

  insert into public.resale_listings (booking_id, seller_id, asking_price, negotiable, reason)
  values (p_booking_id, auth.uid(), round(p_asking_price, 2), coalesce(p_negotiable, true), nullif(trim(coalesce(p_reason, '')), ''))
  returning id, reference into v_id, v_ref;

  perform app.notify_admins('resale', 'New resale request ' || v_ref,
    app.plot_label(p_booking_id) || ' — asking ₹' || to_char(p_asking_price, 'FM99,99,99,99,999'), '/admin/resale');
  return v_id;
end $$;

/** The seller takes their plot off the resale list. */
create or replace function public.customer_withdraw_resale(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_r record;
begin
  select * into v_r from public.resale_listings where id = p_id and seller_id = auth.uid();
  if not found then raise exception 'Resale request not found' using errcode = '42501'; end if;
  if v_r.status not in ('submitted', 'listed', 'buyer_found') then
    raise exception 'This resale is already closed' using errcode = '22023';
  end if;
  update public.resale_listings set status = 'withdrawn', closed_at = now(), updated_at = now() where id = p_id;
  perform app.notify_admins('resale', 'Resale withdrawn ' || v_r.reference,
    app.plot_label(v_r.booking_id) || ' — the owner withdrew it.', '/admin/resale');
end $$;

/**
 * The office reviews or moves a resale: approve (list) or reject a request,
 * mark a buyer found or put it back on the list, change the listed price,
 * fee and website visibility, or withdraw it.
 */
create or replace function public.admin_set_resale(
  p_id uuid, p_status text, p_listed_price numeric default null, p_transfer_fee numeric default null,
  p_show_on_website boolean default null, p_note text default null
) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_r record; v_ok boolean; v_title text;
begin
  if not app.is_admin() then raise exception 'Only the office can review a resale' using errcode = '42501'; end if;
  select * into v_r from public.resale_listings where id = p_id for update;
  if not found then raise exception 'Resale not found' using errcode = '22023'; end if;

  v_ok := p_status = v_r.status
       or (v_r.status = 'submitted'   and p_status in ('listed', 'rejected'))
       or (v_r.status = 'listed'      and p_status in ('buyer_found', 'rejected', 'withdrawn'))
       or (v_r.status = 'buyer_found' and p_status in ('listed', 'withdrawn'));
  if not v_ok or v_r.status in ('transferred', 'rejected', 'withdrawn') then
    raise exception 'A % resale cannot be moved to %', v_r.status, p_status using errcode = '22023';
  end if;
  if p_status = 'listed' and coalesce(p_listed_price, v_r.listed_price, v_r.asking_price) <= 0 then
    raise exception 'Set the listed price' using errcode = '22023';
  end if;

  update public.resale_listings set
    status          = p_status,
    listed_price    = case when p_status in ('listed', 'buyer_found')
                           then coalesce(p_listed_price, listed_price, asking_price) else listed_price end,
    transfer_fee    = coalesce(p_transfer_fee, transfer_fee),
    show_on_website = coalesce(p_show_on_website, show_on_website),
    office_note     = coalesce(nullif(trim(coalesce(p_note, '')), ''), office_note),
    reviewed_by     = case when v_r.status = 'submitted' then auth.uid() else reviewed_by end,
    reviewed_at     = case when v_r.status = 'submitted' then now() else reviewed_at end,
    listed_at       = case when p_status = 'listed' and listed_at is null then now() else listed_at end,
    closed_at       = case when p_status in ('rejected', 'withdrawn') then now() else closed_at end,
    updated_at      = now()
  where id = p_id;

  if p_status <> v_r.status then
    v_title := case p_status
      when 'listed'      then 'Your plot is listed for resale'
      when 'rejected'    then 'Resale request not approved'
      when 'buyer_found' then 'A buyer has been found for your plot'
      when 'withdrawn'   then 'Your resale was closed by the office'
      else 'Resale update' end;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_r.seller_id, 'resale', v_title,
            app.plot_label(v_r.booking_id) || ' (' || v_r.reference || ')' ||
            coalesce(' — ' || nullif(trim(coalesce(p_note, '')), ''), ''), '/customer/resale');
  end if;
end $$;

/**
 * Hand the plot to its buyer: the booking (paid history and remaining
 * instalments) moves to the buyer's customer account and the transfer is
 * recorded. The buyer must already be a customer (Admin → Customers).
 */
create or replace function public.admin_complete_resale(
  p_id uuid, p_buyer_id uuid, p_sold_price numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_r record; v_buyer record; v_label text;
begin
  if not app.is_admin() then raise exception 'Only the office can transfer a plot' using errcode = '42501'; end if;
  select * into v_r from public.resale_listings where id = p_id for update;
  if not found or v_r.status not in ('listed', 'buyer_found') then
    raise exception 'Only a listed resale can be transferred' using errcode = '22023';
  end if;
  select id, full_name, phone, email into v_buyer from public.profiles
   where id = p_buyer_id and role = 'customer' and deleted_at is null;
  if not found then raise exception 'Choose the buyer''s customer account' using errcode = '22023'; end if;
  if p_buyer_id = v_r.seller_id then raise exception 'The buyer cannot be the seller' using errcode = '22023'; end if;
  if coalesce(p_sold_price, 0) <= 0 then raise exception 'Enter the price the plot was sold for' using errcode = '22023'; end if;

  v_label := app.plot_label(v_r.booking_id);
  update public.bookings
     set customer_id = v_buyer.id, customer_name = v_buyer.full_name, customer_phone = v_buyer.phone,
         customer_email = v_buyer.email, updated_at = now()
   where id = v_r.booking_id;

  insert into public.booking_transfers (booking_id, listing_id, from_customer, to_customer, price, transfer_fee, note, transferred_by)
  values (v_r.booking_id, p_id, v_r.seller_id, v_buyer.id, round(p_sold_price, 2), v_r.transfer_fee,
          nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  update public.resale_listings
     set status = 'transferred', buyer_id = v_buyer.id, sold_price = round(p_sold_price, 2),
         transferred_at = now(), closed_at = now(), updated_at = now()
   where id = p_id;

  insert into public.notifications (user_id, type, title, body, link) values
    (v_r.seller_id, 'resale', 'Your plot has been transferred',
     v_label || ' (' || v_r.reference || ') now belongs to its new owner. Thank you.', '/customer/resale'),
    (v_buyer.id, 'resale', 'A plot has been transferred to you',
     v_label || ' is now in your account, with its payments and papers.', '/customer/plots');
end $$;

/** The plots on resale, without the owner's identity. Public: website ones. */
create or replace function public.public_resale_listings()
returns table (
  id uuid, reference text, project_name text, project_slug text, location text, city text,
  plot_number text, size numeric, size_unit text, facing text, dimensions text,
  price numeric, negotiable boolean, listed_at timestamptz, hero_image text
)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.reference, pr.name, pr.slug, pr.location, pr.city,
         pl.number, pl.size, pl.size_unit, pl.facing, pl.dimensions,
         coalesce(r.listed_price, r.asking_price), r.negotiable, r.listed_at, pr.hero_image
    from public.resale_listings r
    join public.bookings b on b.id = r.booking_id
    left join public.projects pr on pr.id = b.project_id
    left join public.plots pl on pl.id = b.plot_id
   where r.status = 'listed' and r.show_on_website
   order by r.listed_at desc nulls last
$$;

/** Resale plots for sponsors to offer their prospects: every listed plot. */
create or replace function public.resale_market()
returns table (
  id uuid, reference text, project_name text, project_slug text, location text, city text,
  plot_number text, size numeric, size_unit text, facing text, dimensions text,
  price numeric, negotiable boolean, listed_at timestamptz, on_website boolean, my_inquiries int
)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.reference, pr.name, pr.slug, pr.location, pr.city,
         pl.number, pl.size, pl.size_unit, pl.facing, pl.dimensions,
         coalesce(r.listed_price, r.asking_price), r.negotiable, r.listed_at, r.show_on_website,
         (select count(*)::int from public.resale_inquiries i where i.listing_id = r.id and i.sponsor_id = auth.uid())
    from public.resale_listings r
    join public.bookings b on b.id = r.booking_id
    left join public.projects pr on pr.id = b.project_id
    left join public.plots pl on pl.id = b.plot_id
   where r.status = 'listed'
     and exists (select 1 from public.profiles me where me.id = auth.uid()
                  and me.role in ('rep', 'admin') and me.status = 'active')
   order by r.listed_at desc nulls last
$$;

/** The seller's own resale requests, with how many buyers have enquired. */
create or replace function public.customer_my_resales()
returns table (
  id uuid, reference text, booking_id uuid, status text, asking_price numeric, negotiable boolean,
  reason text, listed_price numeric, transfer_fee numeric, show_on_website boolean, office_note text,
  sold_price numeric, created_at timestamptz, reviewed_at timestamptz, listed_at timestamptz,
  transferred_at timestamptz, closed_at timestamptz, inquiries int
)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.reference, r.booking_id, r.status, r.asking_price, r.negotiable, r.reason,
         r.listed_price, r.transfer_fee, r.show_on_website, r.office_note, r.sold_price,
         r.created_at, r.reviewed_at, r.listed_at, r.transferred_at, r.closed_at,
         (select count(*)::int from public.resale_inquiries i where i.listing_id = r.id)
    from public.resale_listings r
   where r.seller_id = auth.uid()
   order by r.created_at desc
$$;

/**
 * A buyer's enquiry: from the website (anyone, website listings only) or a
 * sponsor registering their prospect (any listed plot). The same phone on
 * the same plot within a day is taken once.
 */
create or replace function public.resale_inquire(p_listing_id uuid, p_name text, p_phone text, p_message text default null)
returns text
language plpgsql security definer set search_path = public, app as $$
declare v_r record; v_digits text; v_rep boolean; v_name text;
begin
  v_name := left(trim(coalesce(p_name, '')), 80);
  v_digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if v_name = '' or length(v_digits) < 10 then
    raise exception 'Enter a name and a 10-digit mobile number' using errcode = '22023';
  end if;
  v_rep := exists (select 1 from public.profiles me where me.id = auth.uid() and me.role in ('rep', 'admin') and me.status = 'active');
  select r.* into v_r from public.resale_listings r where r.id = p_listing_id and r.status = 'listed';
  if not found or (not v_r.show_on_website and not v_rep) then
    raise exception 'This plot is no longer on resale' using errcode = '22023';
  end if;
  if exists (select 1 from public.resale_inquiries i where i.listing_id = p_listing_id
              and right(regexp_replace(i.phone, '\D', '', 'g'), 10) = v_digits
              and i.created_at > now() - interval '1 day') then
    return 'already';
  end if;
  if (select count(*) from public.resale_inquiries i where i.listing_id = p_listing_id and i.created_at > now() - interval '1 day') >= 50 then
    raise exception 'Too many enquiries today — please call the office' using errcode = '54000';
  end if;

  insert into public.resale_inquiries (listing_id, name, phone, message, source, sponsor_id)
  values (p_listing_id, v_name, v_digits, left(nullif(trim(coalesce(p_message, '')), ''), 500),
          case when v_rep then 'sponsor' else 'website' end,
          case when v_rep then auth.uid() end);

  perform app.notify_admins('resale', 'Buyer enquiry for ' || v_r.reference,
    v_name || ' · ' || v_digits || ' — ' || app.plot_label(v_r.booking_id), '/admin/resale');
  if v_r.status = 'listed' then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_r.seller_id, 'resale', 'A buyer is interested in your plot',
            app.plot_label(v_r.booking_id) || ' (' || v_r.reference || ') — the office will be in touch.', '/customer/resale');
  end if;
  return 'received';
end $$;

create or replace function public.admin_set_inquiry_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then raise exception 'Only the office can update enquiries' using errcode = '42501'; end if;
  if p_status not in ('new', 'contacted', 'closed') then raise exception 'Unknown status' using errcode = '22023'; end if;
  update public.resale_inquiries set status = p_status where id = p_id;
end $$;

revoke all on function public.customer_request_resale(uuid, numeric, boolean, text) from public;
revoke all on function public.customer_withdraw_resale(uuid) from public;
revoke all on function public.admin_set_resale(uuid, text, numeric, numeric, boolean, text) from public;
revoke all on function public.admin_complete_resale(uuid, uuid, numeric, text) from public;
revoke all on function public.public_resale_listings() from public;
revoke all on function public.resale_market() from public;
revoke all on function public.customer_my_resales() from public;
revoke all on function public.resale_inquire(uuid, text, text, text) from public;
revoke all on function public.admin_set_inquiry_status(uuid, text) from public;
grant execute on function public.customer_request_resale(uuid, numeric, boolean, text) to authenticated;
grant execute on function public.customer_withdraw_resale(uuid) to authenticated;
grant execute on function public.admin_set_resale(uuid, text, numeric, numeric, boolean, text) to authenticated;
grant execute on function public.admin_complete_resale(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.public_resale_listings() to anon, authenticated;
grant execute on function public.resale_market() to authenticated;
grant execute on function public.customer_my_resales() to authenticated;
grant execute on function public.resale_inquire(uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_set_inquiry_status(uuid, text) to authenticated;
revoke all on function app.notify_admins(text, text, text, text) from public;
revoke all on function app.plot_label(uuid) from public;

-- --------------------------------------------------------------- reminders

-- The instalment guard lets only the office change a status. The reminder
-- job is the one other sanctioned writer, and only for pending -> overdue;
-- it says so with a transaction-local flag (the record_payment pattern).
create or replace function app.emis_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if coalesce(current_setting('app.system_job', true), '') = 'on'
     and old.status = 'pending' and new.status = 'overdue'
     and new.amount is not distinct from old.amount and new.due_date is not distinct from old.due_date
     and new.booking_id is not distinct from old.booking_id then
    return new;
  end if;

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

create table if not exists public.payment_reminders (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id),
  emi_id      uuid references public.emis(id) on delete set null,
  kind        text not null check (kind in ('auto_due_soon', 'auto_due_today', 'auto_overdue', 'manual')),
  channel     text not null default 'panel' check (channel in ('panel', 'whatsapp', 'call', 'sms', 'visit', 'other')),
  sent_by     uuid references public.profiles(id),
  note        text,
  day         date not null default current_date,
  created_at  timestamptz not null default now()
);
create unique index if not exists payment_reminders_auto_once
  on public.payment_reminders (emi_id, kind, day) where kind <> 'manual';
create index if not exists payment_reminders_booking_idx on public.payment_reminders (booking_id, created_at desc);

alter table public.payment_reminders enable row level security;
drop policy if exists payment_reminders_select_admin on public.payment_reminders;
create policy payment_reminders_select_admin on public.payment_reminders for select to authenticated using (app.is_admin());
drop policy if exists payment_reminders_select_rep on public.payment_reminders;
create policy payment_reminders_select_rep on public.payment_reminders for select to authenticated using (app.is_booking_rep(booking_id));

/**
 * The hourly reminder run (gateway). Safe to call any number of times a day:
 * each reminder is written once (unique per instalment, kind and day) and
 * only newly written ones send notifications.
 */
create or replace function app.run_payment_reminders(p_today date default current_date) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_b record; v_n int := 0; v_label text; v_amt numeric; v_cnt int; v_days int; v_first date;
begin
  perform set_config('app.system_job', 'on', true);
  update public.emis set status = 'overdue', updated_at = now()
   where status = 'pending' and due_date < p_today
     and booking_id in (select id from public.bookings where deleted_at is null and status not in ('rejected', 'cancelled'));
  perform set_config('app.system_job', 'off', true);

  create temp table if not exists _due (emi_id uuid, booking_id uuid, kind text, amount numeric, due_date date) on commit drop;
  truncate _due;

  insert into _due
  select e.id, e.booking_id, k.kind, e.amount, e.due_date
    from public.emis e
    join public.bookings b on b.id = e.booking_id and b.deleted_at is null and b.status not in ('rejected', 'cancelled')
    cross join lateral (
      select case
        when e.due_date - p_today between 1 and 3
             and not exists (select 1 from public.payment_reminders r where r.emi_id = e.id and r.kind = 'auto_due_soon') then 'auto_due_soon'
        when e.due_date = p_today
             and not exists (select 1 from public.payment_reminders r where r.emi_id = e.id and r.kind = 'auto_due_today') then 'auto_due_today'
        when e.due_date < p_today
             and coalesce(p_today - (select max(r.day) from public.payment_reminders r where r.emi_id = e.id and r.kind = 'auto_overdue'), 9999)
                 >= case when p_today - e.due_date <= 7 then 3 else 7 end then 'auto_overdue'
      end as kind
    ) k
   where e.status in ('pending', 'overdue', 'rejected') and k.kind is not null;

  -- Write the log; keep only rows that were really new.
  with ins as (
    insert into public.payment_reminders (booking_id, emi_id, kind, channel, day)
    select booking_id, emi_id, kind, 'panel', p_today from _due
    on conflict (emi_id, kind, day) where kind <> 'manual' do nothing
    returning emi_id
  )
  delete from _due d where not exists (select 1 from ins where ins.emi_id = d.emi_id);

  -- One message per booking and kind.
  for v_b in
    select d.booking_id, d.kind, b.customer_id, b.rep_id, b.customer_name,
           sum(d.amount) amount, count(*)::int cnt, min(d.due_date) first_due
      from _due d join public.bookings b on b.id = d.booking_id
     group by 1, 2, 3, 4, 5
  loop
    v_label := app.plot_label(v_b.booking_id);
    v_amt := v_b.amount; v_cnt := v_b.cnt; v_first := v_b.first_due;
    v_days := p_today - v_first;
    if v_b.customer_id is not null then
      insert into public.notifications (user_id, type, title, body, link) values (
        v_b.customer_id, 'payment',
        case v_b.kind when 'auto_due_soon' then 'Instalment due soon'
                      when 'auto_due_today' then 'Instalment due today'
                      else 'Payment overdue' end,
        case v_b.kind
          when 'auto_due_soon' then '₹' || to_char(v_amt, 'FM99,99,99,999') || ' for ' || v_label || ' is due on ' || to_char(v_first, 'DD Mon YYYY') || '.'
          when 'auto_due_today' then '₹' || to_char(v_amt, 'FM99,99,99,999') || ' for ' || v_label || ' is due today.'
          else '₹' || to_char(v_amt, 'FM99,99,99,999') || ' for ' || v_label || ' is overdue by ' || v_days || ' day' || case when v_days = 1 then '' else 's' end
               || case when v_cnt > 1 then ' (' || v_cnt || ' instalments)' else '' end || '. Please pay and upload the receipt.'
        end,
        '/customer/payments');
    end if;
    if v_b.rep_id is not null and v_b.kind <> 'auto_due_today' then
      insert into public.notifications (user_id, type, title, body, link) values (
        v_b.rep_id, 'payment',
        case when v_b.kind = 'auto_due_soon' then 'Customer instalment due soon' else 'Customer payment overdue' end,
        coalesce(v_b.customer_name, 'Your customer') || ' · ' || v_label || ' — ₹' || to_char(v_amt, 'FM99,99,99,999')
          || case when v_b.kind = 'auto_due_soon' then ' due on ' || to_char(v_first, 'DD Mon')
                  else ' overdue by ' || v_days || ' day' || case when v_days = 1 then '' else 's' end end || '. Remind them.',
        '/sponsor/customers');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function app.run_payment_reminders(date) from public;

-- The old overdue sweep (gateway function flag-overdue-emis) runs without a
-- signed-in user, so emis_guard refused it whenever anything was late. It
-- now says it is the system job, like the reminder run.
create or replace function public.flag_overdue_emis() returns int
language plpgsql security definer set search_path = public, app as $$
declare v_count int;
begin
  perform set_config('app.system_job', 'on', true);
  update public.emis set status = 'overdue', updated_at = now()
   where status = 'pending' and due_date < current_date;
  get diagnostics v_count = row_count;
  perform set_config('app.system_job', 'off', true);
  return v_count;
end $$;
revoke execute on function public.flag_overdue_emis() from public, anon;

/** The office can run the reminders at once (Payments CRM). */
create or replace function public.run_payment_reminders_now() returns int
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then raise exception 'Only the office can run reminders' using errcode = '42501'; end if;
  return app.run_payment_reminders((now() at time zone 'Asia/Kolkata')::date);
end $$;
revoke all on function public.run_payment_reminders_now() from public;
grant execute on function public.run_payment_reminders_now() to authenticated;

/**
 * A sponsor (for their own sale) or the office reminds a customer and logs
 * it. 'panel' also notifies the customer in their panel — at most once a day
 * per plot, so a customer is not flooded.
 */
create or replace function public.send_payment_reminder(p_booking_id uuid, p_channel text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_b record; v_id uuid; v_due numeric; v_who text;
begin
  select * into v_b from public.bookings where id = p_booking_id and deleted_at is null;
  if not found or not (app.is_admin() or v_b.rep_id = auth.uid()) then
    raise exception 'You can remind only your own customers' using errcode = '42501';
  end if;
  if p_channel not in ('panel', 'whatsapp', 'call', 'sms', 'visit', 'other') then
    raise exception 'Unknown channel' using errcode = '22023';
  end if;
  if p_channel = 'panel' then
    if v_b.customer_id is null then
      raise exception 'This customer has no panel account yet — remind them by WhatsApp or call' using errcode = '22023';
    end if;
    if exists (select 1 from public.payment_reminders r where r.booking_id = p_booking_id and r.kind = 'manual'
                and r.channel = 'panel' and r.day = current_date) then
      raise exception 'A panel reminder was already sent for this plot today' using errcode = '23505';
    end if;
  end if;

  insert into public.payment_reminders (booking_id, kind, channel, sent_by, note)
  values (p_booking_id, 'manual', p_channel, auth.uid(), left(nullif(trim(coalesce(p_note, '')), ''), 500))
  returning id into v_id;

  if p_channel = 'panel' then
    select coalesce(sum(e.amount), 0) into v_due from public.emis e
     where e.booking_id = p_booking_id and e.status in ('pending', 'overdue', 'rejected') and e.due_date <= current_date + 7;
    select case when role = 'admin' then 'The office' else coalesce(full_name, 'Your advisor') end into v_who from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, type, title, body, link)
    values (v_b.customer_id, 'payment', 'Payment reminder',
            v_who || ': ' || coalesce(nullif(trim(coalesce(p_note, '')), ''),
              case when v_due > 0 then '₹' || to_char(v_due, 'FM99,99,99,999') || ' is due for ' || app.plot_label(p_booking_id) || '. Please pay and upload the receipt.'
                   else 'Please check your instalments for ' || app.plot_label(p_booking_id) || '.' end),
            '/customer/payments');
  end if;
  return v_id;
end $$;
revoke all on function public.send_payment_reminder(uuid, text, text) from public;
grant execute on function public.send_payment_reminder(uuid, text, text) to authenticated;
