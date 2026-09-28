-- =====================================================================
-- admin_create_customer_booking: bookings.emi_amount is NOT NULL, so a
-- booking made without typing an EMI amount failed. Work the amount out from
-- the balance and let the last instalment absorb the rounding.
-- =====================================================================

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
  v_count   int := coalesce(p_emi_count, 0);
  v_balance numeric;
  v_emi     numeric;
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
  if coalesce(p_token_amount, 0) > p_sale_value then
    raise exception 'The booking amount is more than the plot value' using errcode = '23514';
  end if;
  -- bookings.emi_amount is NOT NULL: work it out when the office did not type
  -- one; the last instalment absorbs the rounding (below).
  v_balance := p_sale_value - coalesce(p_token_amount, 0);
  v_emi := case when v_count > 0 then coalesce(nullif(p_emi_amount, 0), round(v_balance / v_count, 0)) else 0 end;

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
    nullif(v_count, 0), v_emi, case when v_count > 0 then coalesce(p_emi_start, current_date + 30) end,
    v_cust.full_name, v_cust.phone, true
  )
  returning id into v_booking;

  update public.bookings set status = 'step1_done' where id = v_booking;
  update public.bookings set status = 'confirmed' where id = v_booking;

  -- Make the schedule add up to the balance exactly.
  if v_count > 0 and p_emi_amount is null then
    update public.emis set amount = v_balance - v_emi * (v_count - 1)
     where booking_id = v_booking and seq = v_count;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary)
  values (auth.uid(), 'admin', 'insert', 'bookings', v_booking,
          'Office created a booking for customer ' || v_cust.full_name);
  return v_booking;
end $$;
revoke all on function public.admin_create_customer_booking(uuid, uuid, numeric, numeric, text, int, numeric, date, uuid) from public;
grant execute on function public.admin_create_customer_booking(uuid, uuid, numeric, numeric, text, int, numeric, date, uuid) to authenticated;

-- A plot whose status says 'available' but which already carries a live
-- booking cannot be booked (bookings_one_live_per_plot). Do not offer it.
create or replace function public.available_plots()
returns table (
  id uuid, number text, size numeric, size_unit text, price numeric,
  project_id uuid, project_name text
)
language sql stable security definer set search_path = public, app as $$
  select pl.id, pl.number, pl.size, pl.size_unit, pl.price,
         pr.id, pr.name
    from public.plots pl
    join public.projects pr on pr.id = pl.project_id
   where pl.status = 'available'
     and pl.deleted_at is null
     and pr.deleted_at is null
     and not exists (
       select 1 from public.bookings b
        where b.plot_id = pl.id and b.deleted_at is null
          and b.status in ('step1_done', 'step2_approved', 'confirmed')
     )
   order by pr.name, pl.number;
$$;

revoke all on function public.available_plots() from public;
grant execute on function public.available_plots() to authenticated;
