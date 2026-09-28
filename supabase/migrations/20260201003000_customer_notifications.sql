-- =====================================================================
-- Customer panel: keep the buyer in the loop.
--
-- * Slip uploaded   -> admins (to Payments CRM, where slips are verified)
--                      and the selling sponsor (to their Payments page).
--                      The old links pointed at retired /admin/emis and
--                      /app/bookings pages.
-- * Slip verified / sent back -> the customer.
-- * A paper uploaded for their booking -> the customer.
-- * Registry / mutation / possession moved on -> the customer.
-- =====================================================================

create or replace function app.emis_on_slip() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_booking public.bookings%rowtype; v_admin record;
begin
  select * into v_booking from public.bookings where id = new.booking_id;

  -- A slip arrived for checking.
  if new.status = 'awaiting_verification' and old.status is distinct from 'awaiting_verification' then
    for v_admin in select id from public.profiles where role = 'admin' and status = 'active' loop
      insert into public.notifications (user_id, type, title, body, link)
      values (v_admin.id, 'emi', 'EMI slip awaiting verification',
              'Instalment #' || new.seq || ' on ' || v_booking.reference || ' needs verification.',
              '/admin/crm');
    end loop;

    if v_booking.rep_id is not null and v_booking.rep_id is distinct from auth.uid() then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_booking.rep_id, 'emi', 'Customer uploaded an EMI slip',
              'Instalment #' || new.seq || ' on ' || v_booking.reference || '.', '/sponsor/payments');
    end if;
    return new;
  end if;

  -- The office decided on it: tell the buyer.
  if v_booking.customer_id is not null and new.status is distinct from old.status then
    if new.status = 'paid' then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_booking.customer_id, 'emi', 'Instalment received',
              'Instalment #' || new.seq || ' of ₹' || to_char(new.amount, 'FM99,99,99,999') || ' is marked paid. Thank you!',
              '/customer/payments');
    elsif new.status = 'rejected' then
      insert into public.notifications (user_id, type, title, body, link)
      values (v_booking.customer_id, 'emi', 'Payment slip not accepted',
              'Instalment #' || new.seq || ': ' || coalesce(nullif(new.reject_reason, ''), 'please upload a clear slip again.'),
              '/customer/payments');
    end if;
  end if;
  return new;
end $$;

-- A paper for a booking that belongs to a customer.
create or replace function app.documents_notify_customer() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_customer uuid; v_ref text;
begin
  if new.booking_id is null then return new; end if;
  select customer_id, reference into v_customer, v_ref from public.bookings where id = new.booking_id;
  if v_customer is null or v_customer = auth.uid() then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_customer, 'document', 'New paper: ' || new.title,
          'The office added a paper to booking ' || v_ref || '.',
          case when new.type = 'plot_photo' then '/customer/plots' else '/customer/documents' end);
  return new;
end $$;

drop trigger if exists trg_documents_notify_customer on public.documents;
create trigger trg_documents_notify_customer
  after insert on public.documents
  for each row execute function app.documents_notify_customer();

-- Registry, mutation and possession progress.
create or replace function app.bookings_stage_notify() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_plot text;
  v_label constant jsonb := '{"pending":"pending","in_progress":"in progress","done":"done"}';
begin
  if new.customer_id is null then return new; end if;
  select 'Plot ' || number into v_plot from public.plots where id = new.plot_id;

  if new.registry_status is distinct from old.registry_status then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.customer_id, 'booking', 'Registry ' || (v_label ->> new.registry_status),
            coalesce(v_plot, 'Your plot') || ' — registry is now ' || (v_label ->> new.registry_status) || '.', '/customer/plots');
  end if;
  if new.mutation_status is distinct from old.mutation_status then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.customer_id, 'booking', 'Mutation ' || (v_label ->> new.mutation_status),
            coalesce(v_plot, 'Your plot') || ' — mutation is now ' || (v_label ->> new.mutation_status) || '.', '/customer/plots');
  end if;
  if new.possession_status is distinct from old.possession_status then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.customer_id, 'booking', 'Possession ' || (v_label ->> new.possession_status),
            coalesce(v_plot, 'Your plot') || ' — possession is now ' || (v_label ->> new.possession_status) || '.', '/customer/plots');
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_stage_notify on public.bookings;
create trigger trg_bookings_stage_notify
  after update of registry_status, mutation_status, possession_status on public.bookings
  for each row execute function app.bookings_stage_notify();
