-- =====================================================================
-- Plot Sales: the member submits, the office verifies
--
-- The live panel lets a sponsor record a sale they closed ("Add Sale"),
-- which sits as PENDING VERIFICATION until the office confirms it; on
-- confirmation the direct income is credited and the row moves to the
-- member's Verified Sales. Our panel could only ever READ bookings, so a
-- member had no way to tell the office they had sold anything.
--
-- Everything needed was already here:
--   * bookings_insert_rep  -- a rep may insert their own booking as 'draft'
--   * bookings_transition_guard -- draft -> step1_done by the owning rep
--   * trg_bookings_income_sync  -- confirmed -> income distributed
-- What was missing is somewhere to put the buyer's name, a one-step verify
-- for the office, and an entry point that cannot leave a half-made booking.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The buyer
--
-- `customer_id` points at a profile, but a plot buyer is usually a walk-in
-- with no login and never gets one. The name and phone the member collected
-- are the only identification the office has, so they belong on the booking.
-- ---------------------------------------------------------------------
alter table public.bookings
  add column if not exists customer_name  text,
  add column if not exists customer_phone text;

comment on column public.bookings.customer_name is
  'Buyer as named by the submitting member. Used when customer_id is null, which is the normal case.';

-- ---------------------------------------------------------------------
-- 2. One-step verification for the office
--
-- The three-step chain (rep submits -> reviewer approves -> admin confirms)
-- assumed a manager tier that the business does not run: there are two
-- panels, admin and sponsor. Rather than make the office click twice
-- through a review step with nobody else in it, an administrator may take a
-- submitted sale straight to confirmed. Both stamps are recorded so the
-- audit trail still shows who did what and when.
--
-- The manager path is left intact: if a reviewer tier is ever reintroduced,
-- step1_done -> step2_approved -> confirmed still works exactly as before.
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

  -- Verification: an administrator confirms a submitted sale in one action.
  elsif old.status = 'step1_done' and new.status = 'confirmed' then
    if not v_admin then
      raise exception 'Only an administrator can verify a sale' using errcode='42501';
    end if;
    if auth.uid() = old.rep_id then
      raise exception 'You cannot verify your own sale' using errcode='42501';
    end if;
    new.step2_at := now(); new.step2_by := auth.uid();
    new.step3_at := now(); new.step3_by := auth.uid();
    new.reviewer_id := coalesce(new.reviewer_id, auth.uid());

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

-- ---------------------------------------------------------------------
-- 3. Submitting a sale, atomically
--
-- Insert-then-update from the browser can leave a draft behind if the
-- second call never lands, and a stray draft holds the plot (see the
-- bookings_one_live_per_plot constraint) while showing up nowhere useful.
-- One function, one transaction.
--
-- Security definer, but every check is made explicitly below -- the caller
-- must be an active member and may only file a sale against themselves.
-- ---------------------------------------------------------------------
create or replace function public.submit_plot_sale(
  p_plot_id        uuid,
  p_customer_name  text,
  p_customer_phone text default null,
  p_sale_value     numeric default null,
  p_token_amount   numeric default 0,
  p_payment_plan   text default 'full'
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_me       uuid := auth.uid();
  v_project  uuid;
  v_price    numeric;
  v_status   text;
  v_booking  uuid;
  v_ref      text;
  v_value    numeric;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Members only, and only while their account is in good standing. A frozen
  -- member can still read everything; they cannot file new business.
  if not exists (
    select 1 from public.profiles p
     where p.id = v_me and p.role = 'rep' and p.status = 'active'
       and p.deleted_at is null and coalesce(p.frozen, false) = false
  ) then
    raise exception 'Your account cannot submit sales. Please contact the office.'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'A customer name is required' using errcode = '23514';
  end if;

  select pl.project_id, pl.price, pl.status
    into v_project, v_price, v_status
    from public.plots pl
   where pl.id = p_plot_id and pl.deleted_at is null;

  if v_project is null then
    raise exception 'That plot does not exist' using errcode = '23503';
  end if;

  -- "Only company project for valid for sales" (plan deck, terms). A plot
  -- already sold or held cannot be sold again.
  if v_status <> 'available' then
    raise exception 'Plot is not available (it is %)', v_status using errcode = '23514';
  end if;

  v_value := coalesce(nullif(p_sale_value, 0), v_price, 0);
  if v_value <= 0 then
    raise exception 'A sale value is required' using errcode = '23514';
  end if;

  insert into public.bookings (
    plot_id, project_id, rep_id, status, sale_value, token_amount,
    payment_plan, customer_name, customer_phone, terms_accepted_rep
  ) values (
    p_plot_id, v_project, v_me, 'draft', v_value, coalesce(p_token_amount, 0),
    coalesce(nullif(p_payment_plan, ''), 'full'),
    trim(p_customer_name), nullif(trim(coalesce(p_customer_phone, '')), ''), true
  )
  returning id, reference into v_booking, v_ref;

  -- Straight into the office's queue; a member has no use for a draft.
  update public.bookings set status = 'step1_done' where id = v_booking;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, after)
  values (
    v_me, 'rep', 'insert', 'bookings', v_booking::text,
    format('Filed plot sale %s for %s', v_ref, trim(p_customer_name)),
    jsonb_build_object('sale_value', v_value, 'plot_id', p_plot_id, 'via', 'submit_plot_sale')
  );

  return v_booking;
end $$;

revoke all on function public.submit_plot_sale(uuid, text, text, numeric, numeric, text) from public;
grant execute on function public.submit_plot_sale(uuid, text, text, numeric, numeric, text) to authenticated;

comment on function public.submit_plot_sale is
  'A member files a sale they closed. Creates the booking and puts it in the office queue in one transaction.';

-- ---------------------------------------------------------------------
-- 4. Plots a member may sell
--
-- plots RLS lets an authenticated user read the catalogue, but the Add Sale
-- form needs the available ones with their project, size and price in a
-- single call, and needs them ordered the way a person reads a site plan.
-- ---------------------------------------------------------------------
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
   order by pr.name, pl.number;
$$;

revoke all on function public.available_plots() from public;
grant execute on function public.available_plots() to authenticated;
