-- =====================================================================
-- RSGC everywhere: every login ID starts with the company prefix.
--
--   Sponsors / admin   RSGC100001 …        (member_code; user_code = the same)
--   Customers          RSGC-CUST-0001 …    (user_code)
--   Employees          RSGC-E-0001 …       (already, 20260201003800)
--
-- Existing RGC… / RG-S-… / RG-C-… / RGC-CUST-… codes are renamed (every
-- account on the database at this point is demo data), the demo login
-- e-mails move from rgc.local to rsgc.local, and the generators issue only
-- RSGC codes from now on. The admin sign-in also accepts the Admin ID.
-- =====================================================================

create sequence if not exists app.customer_code_seq start 1;

-- profiles_guard refuses code changes, by design; this is the one sanctioned rename.
alter table public.profiles disable trigger trg_profiles_guard;

update public.profiles
   set member_code = regexp_replace(member_code, '^RGC(\d+)$', 'RSGC\1')
 where member_code ~ '^RGC\d+$';

-- Members and staff sign in with one ID: user_code mirrors the member code.
update public.profiles
   set user_code = member_code
 where role <> 'customer' and member_code is not null
   and user_code is distinct from member_code;

update public.profiles
   set user_code = regexp_replace(user_code, '^RGC-CUST-', 'RSGC-CUST-')
 where role = 'customer' and user_code like 'RGC-CUST-%';

select setval('app.customer_code_seq',
  greatest(1, coalesce((select max(substring(user_code from '^RSGC-CUST-(\d+)$')::int)
                          from public.profiles where role = 'customer'), 0)),
  true);

update public.profiles
   set user_code = 'RSGC-CUST-' || lpad(nextval('app.customer_code_seq')::text, 4, '0')
 where role = 'customer' and coalesce(user_code, '') !~ '^RSGC-CUST-';

-- Demo login e-mails: …rgc100014@members.rgc.local -> …rsgc100014@members.rsgc.local
update auth.users
   set email = regexp_replace(regexp_replace(email, 'rgc(1\d{5})@', 'rsgc\1@'), 'rgc\.local$', 'rsgc.local')
 where email ~ 'rgc\.local$';
update public.profiles
   set email = regexp_replace(regexp_replace(email, 'rgc(1\d{5})@', 'rsgc\1@'), 'rgc\.local$', 'rsgc.local')
 where email ~ 'rgc\.local$';
update public.bookings
   set customer_email = regexp_replace(customer_email, 'rgc\.local$', 'rsgc.local')
 where customer_email ~ 'rgc\.local$';

alter table public.profiles enable trigger trg_profiles_guard;

-- ---------------------------------------------------------------- new users
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_is_customer boolean := coalesce(new.raw_app_meta_data->>'account_kind', '') = 'customer';
  v_code   text;
  v_member text;
  v_ref    text := nullif(trim(coalesce(new.raw_user_meta_data->>'ref', '')), '');
  v_sponsor uuid;
begin
  if v_is_customer then
    v_code := 'RSGC-CUST-' || lpad(nextval('app.customer_code_seq')::text, 4, '0');
  else
    -- One ID for a member: the Sponsor ID is also their login ID.
    v_member := app.next_member_code();
    v_code := v_member;
  end if;

  if v_ref is not null then
    select id into v_sponsor from public.profiles
     where upper(member_code) = upper(v_ref) and deleted_at is null and status = 'active';
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone, user_code, rank_id,
                               member_code, referrer_id, placement_parent_id)
  values (
    new.id,
    case when v_is_customer then 'customer'::app_role else 'rep'::app_role end,
    case when v_is_customer then 'active'::account_status else 'pending'::account_status end,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'user_code', v_code),
    case when v_is_customer then null
         else (select id from public.ranks where seniority = 1 limit 1) end,
    v_member,
    case when v_is_customer then null else v_sponsor end,
    case when v_is_customer then null else v_sponsor end
  );
  return new;
end $$;

-- ------------------------------------------------- admin sign-in by Admin ID
-- The private admin page accepts the Admin ID (RSGC100001) as well as the
-- e-mail. Administrators only, and only active ones; members keep their own
-- door (resolve_login_identifier refuses staff).
create or replace function public.resolve_staff_login(p_id text)
returns text
language sql stable security definer set search_path = public, app as $$
  select p.email
    from public.profiles p
   where p.role = 'admin' and p.status = 'active' and p.deleted_at is null
     and (upper(coalesce(p.member_code, '')) = upper(regexp_replace(coalesce(p_id, ''), '\s', '', 'g'))
       or upper(coalesce(p.user_code, ''))   = upper(regexp_replace(coalesce(p_id, ''), '\s', '', 'g')))
   limit 1
$$;
revoke all on function public.resolve_staff_login(text) from public;
grant execute on function public.resolve_staff_login(text) to anon, authenticated;
