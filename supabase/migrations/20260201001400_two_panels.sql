-- =====================================================================
-- Two panels only: /admin for the office, /sponsor for members.
--
-- The rep (/app), manager (/mgr) and customer (/portal) panels were retired
-- on 2026-09-24. The `manager` and `customer` ROLES stay in the database --
-- around a hundred RLS policies reference them, and dropping an enum value
-- other policies depend on would mean re-deriving the whole security model
-- for no gain. What changes is that neither role can reach a panel.
--
-- The one place that has to follow is the sponsor sign-in: it resolved
-- role in ('rep','customer'), so a customer could still open the member
-- login. With no customer portal to land on, that sign-in now succeeds and
-- then drops them on the public site -- a worse outcome than a clean "we do
-- not recognise that ID". Restricted to 'rep'.
-- =====================================================================

create or replace function public.resolve_login_identifier(p_id text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare
  v_email  text;
  v_id     text;
  v_digits text;
begin
  -- Strip the invisibles by codepoint: zero-width space / non-joiner / joiner,
  -- BOM, soft hyphen and non-breaking space. Written with chr() rather than
  -- \u escapes, which a standard-conforming string does not interpret.
  v_id := translate(
    coalesce(p_id, ''),
    chr(8203) || chr(8204) || chr(8205) || chr(65279) || chr(173) || chr(160),
    ''
  );
  -- Then ordinary whitespace and control characters.
  v_id := regexp_replace(v_id, '[[:space:][:cntrl:]]', '', 'g');

  if v_id = '' then
    return null;
  end if;

  v_digits := regexp_replace(v_id, '\D', '', 'g');

  select p.email into v_email
    from public.profiles p
   -- Members only. Admins have their own door at /admin-login, and the
   -- customer role no longer has a panel to sign in to.
   where p.role = 'rep'
     and p.status = 'active'
     and p.deleted_at is null
     and (
          upper(coalesce(p.member_code, '')) = upper(v_id)
       or upper(coalesce(p.user_code, ''))   = upper(v_id)
       or lower(coalesce(p.email, ''))       = lower(v_id)
       or (length(v_digits) >= 10 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits)
     )
   limit 1;

  -- No exception: an unknown identifier is an ordinary negative answer, and the
  -- caller shows the same message it shows for a wrong password. Raising here
  -- produced a misleading 401 and a console error for a simple typo.
  return v_email;
end $$;

comment on function public.resolve_login_identifier(text) is
  'Resolve a member''s sponsor ID / user code / email / mobile to their login email. Members (role=rep) only.';
