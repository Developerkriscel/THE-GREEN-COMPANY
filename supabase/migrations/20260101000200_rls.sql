-- =====================================================================
-- Royal Green — 0003 : Row-Level Security
-- Default deny on every table. Explicit policy per command.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'ranks','profiles','projects','plots','leads','lead_activities','bookings',
    'sale_confirmations','commissions','commission_deductions','emis','payments',
    'documents','kyc','message_threads','thread_participants','messages',
    'notifications','audit_log','cms_pages','cms_banners','site_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ============================================================== profiles
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (app.is_admin());

-- A manager sees only their own reps.
create policy profiles_select_manager on public.profiles
  for select to authenticated
  using (id = any (app.managed_rep_ids()));

-- Staff need to see the counterparty on a booking they are a party to.
create policy profiles_select_booking_party on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where (b.customer_id = profiles.id or b.rep_id = profiles.id)
        and (b.rep_id = auth.uid() or b.customer_id = auth.uid() or b.reviewer_id = auth.uid())
    )
  );

-- Self-update is allowed; the profiles_guard trigger blocks privileged columns.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (app.is_admin());
-- No INSERT policy: profiles are created only by the on_auth_user_created trigger.

-- ================================================================= ranks
create policy ranks_select_auth on public.ranks
  for select to authenticated using (true);
create policy ranks_select_anon on public.ranks
  for select to anon using (active);
create policy ranks_write_admin on public.ranks
  for insert to authenticated with check (app.is_admin());
create policy ranks_update_admin on public.ranks
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy ranks_delete_admin on public.ranks
  for delete to authenticated using (app.is_admin());

-- ============================================================== projects
create policy projects_select_public on public.projects
  for select to anon using (published and deleted_at is null);
create policy projects_select_customer on public.projects
  for select to authenticated using (published and deleted_at is null);
create policy projects_select_staff on public.projects
  for select to authenticated using (app.is_staff());
create policy projects_insert_admin on public.projects
  for insert to authenticated with check (app.is_admin());
create policy projects_update_admin on public.projects
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy projects_delete_admin on public.projects
  for delete to authenticated using (app.is_admin());

-- ================================================================= plots
create policy plots_select_public on public.plots
  for select to anon
  using (deleted_at is null and exists (
    select 1 from public.projects p where p.id = plots.project_id and p.published and p.deleted_at is null));
create policy plots_select_customer on public.plots
  for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.projects p where p.id = plots.project_id and p.published and p.deleted_at is null));
create policy plots_select_staff on public.plots
  for select to authenticated using (app.is_staff());
create policy plots_insert_admin on public.plots
  for insert to authenticated with check (app.is_admin());
create policy plots_update_admin on public.plots
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy plots_delete_admin on public.plots
  for delete to authenticated using (app.is_admin());

-- ================================================================= leads
-- THE critical isolation rule: owner + admin + that rep's manager (read-only).
create policy leads_select_owner on public.leads
  for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null and app.is_active());
create policy leads_select_manager on public.leads
  for select to authenticated
  using (owner_id = any (app.managed_rep_ids()) and deleted_at is null);
create policy leads_select_admin on public.leads
  for select to authenticated using (app.is_admin());

create policy leads_insert_rep on public.leads
  for insert to authenticated
  with check (app.is_active() and app.current_role() in ('rep','admin') and owner_id = auth.uid());
create policy leads_insert_admin on public.leads
  for insert to authenticated with check (app.is_admin());

create policy leads_update_owner on public.leads
  for update to authenticated
  using (owner_id = auth.uid() and deleted_at is null and status not in ('converted','lost'))
  with check (owner_id = auth.uid());
create policy leads_update_admin on public.leads
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy leads_delete_admin on public.leads
  for delete to authenticated using (app.is_admin());

-- ====================================================== lead_activities
create policy lead_activities_select on public.lead_activities
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));  -- leads RLS does the filtering
create policy lead_activities_insert on public.lead_activities
  for insert to authenticated
  with check (actor_id = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id));
create policy lead_activities_delete_admin on public.lead_activities
  for delete to authenticated using (app.is_admin());

-- ============================================================== bookings
create policy bookings_select_rep on public.bookings
  for select to authenticated
  using (rep_id = auth.uid() and deleted_at is null and app.is_active());
create policy bookings_select_customer on public.bookings
  for select to authenticated
  using (customer_id = auth.uid() and deleted_at is null);
create policy bookings_select_reviewer on public.bookings
  for select to authenticated
  using ((reviewer_id = auth.uid() or app.manages(rep_id)) and deleted_at is null);
create policy bookings_select_admin on public.bookings
  for select to authenticated using (app.is_admin());

create policy bookings_insert_rep on public.bookings
  for insert to authenticated
  with check (app.is_active() and app.current_role() = 'rep' and rep_id = auth.uid() and status = 'draft');
create policy bookings_insert_customer on public.bookings
  for insert to authenticated
  with check (app.current_role() = 'customer' and customer_id = auth.uid() and status = 'draft');
create policy bookings_insert_admin on public.bookings
  for insert to authenticated with check (app.is_admin());

-- Row-reach only. The transition trigger decides which status moves are legal.
create policy bookings_update_rep on public.bookings
  for update to authenticated
  using (rep_id = auth.uid() and deleted_at is null and status in ('draft','rejected'))
  with check (rep_id = auth.uid());
create policy bookings_update_customer on public.bookings
  for update to authenticated
  using (customer_id = auth.uid() and deleted_at is null and status in ('draft','rejected'))
  with check (customer_id = auth.uid());
create policy bookings_update_reviewer on public.bookings
  for update to authenticated
  using (app.current_role() = 'manager' and app.manages(rep_id) and status = 'step1_done')
  with check (app.manages(rep_id));
create policy bookings_update_admin on public.bookings
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy bookings_delete_admin on public.bookings
  for delete to authenticated using (app.is_admin());

-- ==================================================== sale_confirmations
create policy sales_select_party on public.sale_confirmations
  for select to authenticated
  using (app.owns_booking(booking_id) and deleted_at is null);
create policy sales_select_admin on public.sale_confirmations
  for select to authenticated using (app.is_admin());

create policy sales_insert_rep on public.sale_confirmations
  for insert to authenticated
  with check (app.is_active() and rep_id = auth.uid() and status = 'draft'
              and exists (select 1 from public.bookings b
                          where b.id = booking_id and b.rep_id = auth.uid() and b.status = 'confirmed'));
create policy sales_insert_admin on public.sale_confirmations
  for insert to authenticated with check (app.is_admin());

create policy sales_update_rep on public.sale_confirmations
  for update to authenticated
  using (rep_id = auth.uid() and status in ('draft','rejected')) with check (rep_id = auth.uid());
create policy sales_update_reviewer on public.sale_confirmations
  for update to authenticated
  using (app.current_role() = 'manager' and app.manages(rep_id) and status = 'step1_done')
  with check (app.manages(rep_id));
create policy sales_update_admin on public.sale_confirmations
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy sales_delete_admin on public.sale_confirmations
  for delete to authenticated using (app.is_admin());

-- =========================================================== commissions
-- A rep reads ONLY their own. A manager gets no row access at all here —
-- team totals come from v_team_commission_totals (aggregate, no per-sale detail).
create policy commissions_select_own on public.commissions
  for select to authenticated using (rep_id = auth.uid() and app.is_active());
create policy commissions_select_admin on public.commissions
  for select to authenticated using (app.is_admin());
create policy commissions_update_admin on public.commissions
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy commissions_delete_admin on public.commissions
  for delete to authenticated using (app.is_admin());
-- No INSERT policy at all: commissions exist only via app.sales_on_confirm().

create policy deductions_select on public.commission_deductions
  for select to authenticated using (app.is_staff());
create policy deductions_write_admin on public.commission_deductions
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ================================================================== emis
create policy emis_select_party on public.emis
  for select to authenticated using (app.owns_booking(booking_id));
create policy emis_select_admin on public.emis
  for select to authenticated using (app.is_admin());

-- A customer may touch only their own EMI row; the emis_guard trigger limits
-- them to attaching a slip and moving pending -> awaiting_verification.
create policy emis_update_customer on public.emis
  for update to authenticated
  using (app.is_booking_customer(booking_id)) with check (app.is_booking_customer(booking_id));
create policy emis_update_admin on public.emis
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy emis_insert_admin on public.emis
  for insert to authenticated with check (app.is_admin());
create policy emis_delete_admin on public.emis
  for delete to authenticated using (app.is_admin());

-- ============================================================== payments
create policy payments_select_party on public.payments
  for select to authenticated using (app.owns_booking(booking_id));
create policy payments_select_admin on public.payments
  for select to authenticated using (app.is_admin());
create policy payments_write_admin on public.payments
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ============================================================= documents
create policy documents_select_party on public.documents
  for select to authenticated
  using (owner_id = auth.uid() or (booking_id is not null and app.owns_booking(booking_id)));
create policy documents_select_admin on public.documents
  for select to authenticated using (app.is_admin());
create policy documents_write_admin on public.documents
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- =================================================================== kyc
create policy kyc_select_own on public.kyc
  for select to authenticated using (user_id = auth.uid());
create policy kyc_select_admin on public.kyc
  for select to authenticated using (app.is_admin());
create policy kyc_insert_own on public.kyc
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy kyc_update_own on public.kyc
  for update to authenticated
  using (user_id = auth.uid() and status <> 'verified') with check (user_id = auth.uid());
create policy kyc_update_admin on public.kyc
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy kyc_delete_admin on public.kyc
  for delete to authenticated using (app.is_admin());

-- ============================================================= messaging
create policy threads_select_participant on public.message_threads
  for select to authenticated
  using (exists (select 1 from public.thread_participants tp
                 where tp.thread_id = message_threads.id and tp.user_id = auth.uid())
         or customer_id = auth.uid() or created_by = auth.uid() or assigned_to = auth.uid());
create policy threads_select_admin on public.message_threads
  for select to authenticated using (app.is_admin());
create policy threads_insert_auth on public.message_threads
  for insert to authenticated with check (created_by = auth.uid());
create policy threads_update_assigned on public.message_threads
  for update to authenticated
  using (assigned_to = auth.uid() or app.is_admin()) with check (assigned_to = auth.uid() or app.is_admin());
create policy threads_delete_admin on public.message_threads
  for delete to authenticated using (app.is_admin());

create policy tp_select on public.thread_participants
  for select to authenticated using (user_id = auth.uid() or app.is_admin());
create policy tp_insert on public.thread_participants
  for insert to authenticated
  with check (app.is_admin() or exists (select 1 from public.message_threads t
                                        where t.id = thread_id and t.created_by = auth.uid()));
create policy tp_update_own on public.thread_participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tp_delete_admin on public.thread_participants
  for delete to authenticated using (app.is_admin());

create policy messages_select_participant on public.messages
  for select to authenticated
  using (
    exists (select 1 from public.message_threads t where t.id = thread_id)   -- thread RLS filters
    and (not internal or app.is_staff())
  );
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid()
              and exists (select 1 from public.message_threads t where t.id = thread_id)
              and (not internal or app.is_staff()));
create policy messages_delete_admin on public.messages
  for delete to authenticated using (app.is_admin());

-- ========================================================= notifications
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());
-- No INSERT policy: notifications are written by SECURITY DEFINER triggers only.

-- ============================================================= audit_log
-- SELECT for admins. No INSERT/UPDATE/DELETE policy exists for anyone —
-- rows arrive only through app.audit_trigger() / app.write_audit().
create policy audit_select_admin on public.audit_log
  for select to authenticated using (app.is_admin());

-- =================================================================== CMS
create policy cms_pages_select_public on public.cms_pages
  for select to anon using (published);
create policy cms_pages_select_auth on public.cms_pages
  for select to authenticated using (published or app.is_admin());
create policy cms_pages_write_admin on public.cms_pages
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy cms_banners_select_public on public.cms_banners
  for select to anon using (active);
create policy cms_banners_select_auth on public.cms_banners
  for select to authenticated using (active or app.is_admin());
create policy cms_banners_write_admin on public.cms_banners
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy settings_select_public on public.site_settings
  for select to anon using (key like 'public.%');
create policy settings_select_auth on public.site_settings
  for select to authenticated using (key like 'public.%' or app.is_staff());
create policy settings_write_admin on public.site_settings
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- =====================================================================
-- Views. security_invoker = on keeps the caller's RLS applied, so these
-- can never become a side door around the policies above.
-- =====================================================================

-- Public plot availability, without the internal `notes` column.
create or replace view public.v_public_plots
with (security_invoker = on) as
  select pl.id, pl.project_id, pl.number, pl.size, pl.size_unit, pl.dimensions,
         pl.facing, pl.price,
         case when pl.status in ('available') then 'available' else 'unavailable' end as availability
  from public.plots pl
  where pl.deleted_at is null;

grant select on public.v_public_plots to anon, authenticated;

-- Manager team view: pipeline only, no money.
create or replace view public.v_team_pipeline
with (security_invoker = on) as
  select b.id, b.reference, b.status, b.sale_value, b.created_at,
         b.rep_id, pr.full_name as rep_name,
         b.project_id, pj.name as project_name, pl.number as plot_number
  from public.bookings b
  join public.profiles pr on pr.id = b.rep_id
  join public.projects pj on pj.id = b.project_id
  join public.plots    pl on pl.id = b.plot_id
  where b.deleted_at is null;

grant select on public.v_team_pipeline to authenticated;

-- Manager team totals: aggregate only. Never a payable row for the manager.
create or replace function public.team_commission_totals()
returns table (rep_id uuid, rep_name text, accrued numeric, approved numeric, paid numeric, deals int)
language sql stable security definer set search_path = public, app as $$
  select c.rep_id,
         p.full_name,
         coalesce(sum(c.net_amount) filter (where c.status = 'accrued'), 0),
         coalesce(sum(c.net_amount) filter (where c.status = 'approved'), 0),
         coalesce(sum(c.net_amount) filter (where c.status = 'paid'), 0),
         count(*)::int
  from public.commissions c
  join public.profiles p on p.id = c.rep_id
  where c.rep_id = any (app.managed_rep_ids()) or app.is_admin()
  group by c.rep_id, p.full_name
$$;

grant execute on function public.team_commission_totals() to authenticated;

comment on function public.team_commission_totals() is
  'Read-only aggregate for coordination. A manager earns nothing from these sales.';
