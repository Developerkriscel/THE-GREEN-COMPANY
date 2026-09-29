-- =====================================================================
-- Sponsor sign-up from the website.
--
-- The "Sign Up" tab on /sponsor-login called register_customer_inquiry(),
-- which never existed, so every sign-up failed ("Failed to fetch" on the
-- live site). The form asks only for a name, a mobile and an optional
-- sponsor ID, so it files a REQUEST the office turns into an account, in
-- the same queue the members' "Refer a Member" already uses
-- (Admin -> Members -> Referral requests).
-- =====================================================================

-- A website sign-up may come without a sponsor; the office chooses one
-- when it approves.
alter table public.referral_requests alter column sponsor_id drop not null;
alter table public.referral_requests add column if not exists source text not null default 'member';
do $$ begin
  alter table public.referral_requests add constraint referral_requests_source_chk check (source in ('member', 'website'));
exception when duplicate_object then null; end $$;

create or replace function public.request_sponsor_signup(
  p_name         text,
  p_phone        text,
  p_sponsor_code text default null
) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  v_name    text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_digits  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_code    text := upper(regexp_replace(coalesce(p_sponsor_code, ''), '\s', '', 'g'));
  v_sponsor_id   uuid;
  v_sponsor_code text;
  v_id      uuid;
begin
  if length(v_digits) = 12 and v_digits like '91%' then v_digits := substr(v_digits, 3); end if;
  if length(v_digits) = 11 and v_digits like '0%' then v_digits := substr(v_digits, 2); end if;

  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Please enter your full name.' using errcode = '22023';
  end if;
  if v_digits !~ '^[6-9][0-9]{9}$' then
    raise exception 'Please enter a valid 10-digit mobile number.' using errcode = '22023';
  end if;

  if v_code <> '' then
    select id, member_code into v_sponsor_id, v_sponsor_code from public.profiles
     where upper(member_code) = v_code and role = 'rep' and status = 'active'
       and deleted_at is null and not coalesce(frozen, false);
    if v_sponsor_id is null then
      raise exception 'Sponsor ID % was not found. Check it, or leave it blank.', v_code using errcode = '22023';
    end if;
  end if;

  if exists (select 1 from public.profiles
              where deleted_at is null and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_digits) then
    raise exception 'This mobile number is already registered. Please log in instead.' using errcode = '23505';
  end if;

  -- Same person pressing twice: one request is enough.
  if exists (select 1 from public.referral_requests
              where mobile = v_digits and status in ('invited', 'registered')) then
    return 'already_received';
  end if;

  -- A form anyone can post to must not be able to flood the queue.
  if (select count(*) from public.referral_requests
       where source = 'website' and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many sign-ups right now. Please try again in a few minutes.' using errcode = '53400';
  end if;

  insert into public.referral_requests (sponsor_id, full_name, mobile, source, status)
  values (v_sponsor_id, v_name, v_digits, 'website', 'invited')
  returning id into v_id;

  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'referral', 'New sponsor sign-up',
         v_name || ' · ' || v_digits || coalesce(' · sponsor ' || v_sponsor_code, ' · no sponsor ID'),
         '/admin/members'
    from public.profiles p where p.role = 'admin' and p.status = 'active';

  if v_sponsor_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_sponsor_id, 'referral', 'Someone signed up with your Sponsor ID',
            v_name || ' asked to join your team. The office will confirm the account.', '/sponsor/refer');
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary)
  values (null, null, 'insert', 'referral_requests', v_id::text, 'Website sponsor sign-up: ' || v_name);
  return 'received';
end $$;

revoke all on function public.request_sponsor_signup(text, text, text) from public;
grant execute on function public.request_sponsor_signup(text, text, text) to anon, authenticated;
