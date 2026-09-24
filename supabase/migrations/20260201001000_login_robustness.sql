-- =====================================================================
-- Sign-in robustness.
--
-- Three real problems surfaced while diagnosing a failed member login:
--
--  1. An identifier that simply does not exist raised errcode 28000, which the
--     gateway maps to HTTP 401. A typo therefore looked like an authorisation
--     failure — a red 401 in the console — and sent people hunting for a
--     broken API key instead of a missing character. Not-found is a NULL, not
--     an exception.
--
--  2. Invisible characters were not stripped. An address pasted out of
--     WhatsApp, Excel or an email client routinely carries a zero-width space
--     or a non-breaking space; the member sees the right text and the lookup
--     silently misses. These are now removed before matching.
--
--  3. Internal whitespace inside a pasted identifier was not removed either.
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

  -- No exception: an unknown identifier is an ordinary negative answer, and the
  -- caller shows the same message it shows for a wrong password. Raising here
  -- produced a misleading 401 and a console error for a simple typo.
  return v_email;
end $$;

grant execute on function public.resolve_login_identifier(text) to anon, authenticated;
