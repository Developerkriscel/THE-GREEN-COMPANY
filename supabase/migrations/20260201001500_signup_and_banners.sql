-- =====================================================================
-- 1. A pending sign-up must be able to sign IN
--
-- app.handle_new_user() creates a member as `pending`, and the office
-- approves them before they get the sponsor panel. But the login resolver
-- required status = 'active', so a member who had just signed up was told
-- "Invalid Sponsor ID" -- indistinguishable from a typo or a wrong password.
--
-- They should authenticate normally and meet the "awaiting approval" screen,
-- which RequireAuth already renders for a pending profile. Suspended and
-- deleted accounts stay out: those are refusals, not waiting rooms.
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
   -- Members only; admins have their own door at /admin-login.
   where p.role = 'rep'
     -- `pending` is allowed through so a new sign-up reaches the approval
     -- screen instead of a misleading "we don't know that ID".
     and p.status in ('active', 'pending')
     and p.deleted_at is null
     and (
          upper(coalesce(p.member_code, '')) = upper(v_id)
       or upper(coalesce(p.user_code, ''))   = upper(v_id)
       or lower(coalesce(p.email, ''))       = lower(v_id)
       or (length(v_digits) >= 10 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits)
     )
   limit 1;

  -- No exception: an unknown identifier is an ordinary negative answer, and the
  -- caller shows the same message it shows for a wrong password.
  return v_email;
end $$;

-- =====================================================================
-- 2. Announcement banners for the sponsor panel
--
-- The strip across the top of the member panel -- the "20% off this week"
-- ribbon a shopping app runs. The office writes it in Website CMS; members
-- only read it.
--
-- `cms_banners` already existed for the public site, with admin-write and
-- authenticated-read policies. Reusing it means one editor, one table and no
-- new policy: the columns below only decide WHO sees a row and WHEN.
-- =====================================================================

alter table public.cms_banners
  add column if not exists audience    text not null default 'public',
  add column if not exists tone        text not null default 'info',
  add column if not exists dismissible boolean not null default true,
  add column if not exists starts_at   timestamptz,
  add column if not exists ends_at     timestamptz;

-- Guard the two free-text columns so a typo cannot make a banner invisible
-- in a way that is hard to spot in the CMS.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cms_banners_audience_check') then
    alter table public.cms_banners
      add constraint cms_banners_audience_check
      check (audience in ('public', 'sponsor', 'both'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cms_banners_tone_check') then
    alter table public.cms_banners
      add constraint cms_banners_tone_check
      check (tone in ('info', 'success', 'warn', 'offer'));
  end if;
end $$;

comment on column public.cms_banners.audience is
  'Who sees this banner: public (website), sponsor (member panel) or both.';
comment on column public.cms_banners.tone is
  'Visual treatment in the sponsor panel: info, success, warn or offer.';
comment on column public.cms_banners.starts_at is
  'Optional start of the display window. Null means "from now".';
comment on column public.cms_banners.ends_at is
  'Optional end of the display window. Null means "until switched off".';

-- Existing rows belong to the public site, which is the column default, so
-- nothing needs backfilling.

create index if not exists cms_banners_audience_idx
  on public.cms_banners (audience, active, sort_order);
