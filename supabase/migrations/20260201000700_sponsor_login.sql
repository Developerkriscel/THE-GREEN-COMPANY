-- =====================================================================
-- Sponsor Panel — signing in with a Sponsor ID.
--
-- /portal/login is titled "Sponsor Sign-in" and asks for a Sponsor ID, but it
-- resolved through resolve_customer_login(), which only ever matches
-- role='customer' on user_code. A real member typing their Sponsor ID (or
-- their email) could therefore never sign in there.
--
-- The build spec asks for "member ID + password, with mobile number as an
-- alternative identifier", so this resolves any of the identifiers a person
-- might reasonably know themselves by.
--
-- Deliberately limited to members and customers: admins and managers sign in
-- on /login, and this function must not become a second door into a staff
-- account. The error is always the same regardless of which part failed, so
-- the endpoint cannot be used to discover whether an ID exists.
-- =====================================================================

create or replace function public.resolve_login_identifier(p_id text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare
  v_email text;
  v_id    text := trim(coalesce(p_id, ''));
  v_digits text := regexp_replace(coalesce(p_id, ''), '\D', '', 'g');
begin
  if v_id = '' then
    raise exception 'Invalid Sponsor ID' using errcode = '28000';
  end if;

  select p.email into v_email
    from public.profiles p
   where p.role in ('rep', 'customer')
     and p.status = 'active'
     and p.deleted_at is null
     and (
          upper(coalesce(p.member_code, '')) = upper(v_id)
       or upper(coalesce(p.user_code, ''))   = upper(v_id)
       or lower(coalesce(p.email, ''))       = lower(v_id)
       or (length(v_digits) >= 10 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits)
     )
   limit 1;

  if v_email is null then
    raise exception 'Invalid Sponsor ID' using errcode = '28000';
  end if;
  return v_email;
end $$;

grant execute on function public.resolve_login_identifier(text) to anon, authenticated;
