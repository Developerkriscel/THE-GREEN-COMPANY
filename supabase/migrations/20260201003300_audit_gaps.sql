-- =====================================================================
-- Gaps found auditing every module against royalgreencompany.com
--
-- * KYC: personal details, bank proof and a nominee section; a status
--   history the member can read; resubmission after a rejection (the guard
--   refused rejected -> pending from the member, so a rejected KYC could
--   never be submitted again); a re-review flag for resubmissions.
-- * Profile: father / mother and wife / husband names; the member's name is
--   locked like their sponsor ID -- only the office changes it.
-- * Team / genealogy: the downline by placement as well as by sponsor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Profile
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists father_name text,
  add column if not exists spouse_name text;

create or replace function app.profiles_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then return new; end if;
  if new.role            is distinct from old.role
     or new.status       is distinct from old.status
     or new.rank_id      is distinct from old.rank_id
     or new.manager_id   is distinct from old.manager_id
     or new.commission_rate is distinct from old.commission_rate
     or new.user_code    is distinct from old.user_code
     or new.member_code  is distinct from old.member_code
     or new.referrer_id  is distinct from old.referrer_id
     or new.placement_parent_id is distinct from old.placement_parent_id
     or new.frozen         is distinct from old.frozen
     or new.welcome_letter is distinct from old.welcome_letter
     or new.approved_by  is distinct from old.approved_by
     or new.deleted_at   is distinct from old.deleted_at
  then
    raise exception 'Only an administrator can change protected member fields'
      using errcode = '42501';
  end if;
  -- A member's name is on their ID card, welcome letter and payouts; once
  -- the account exists only the office changes it. (Customers too.)
  if new.full_name is distinct from old.full_name and old.role in ('rep', 'customer') then
    raise exception 'Your name can only be changed by the office' using errcode = '42501';
  end if;
  if new.avatar_path is distinct from old.avatar_path
     and new.avatar_path is not null
     and app.path_head_uuid(new.avatar_path) is distinct from new.id
  then
    raise exception 'A profile photo must be one of your own uploads'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. KYC
-- ---------------------------------------------------------------------
alter table public.kyc
  add column if not exists legal_name            text,
  add column if not exists dob                   date,
  add column if not exists kyc_address           text,
  add column if not exists bank_doc_path         text,
  add column if not exists nominee_name          text,
  add column if not exists nominee_relation      text,
  add column if not exists nominee_dob           date,
  add column if not exists nominee_phone         text,
  add column if not exists nominee_aadhaar_last4 text,
  add column if not exists nominee_pan           text,
  add column if not exists nominee_address       text,
  add column if not exists nominee_share         numeric(5,2) default 100,
  add column if not exists nominee_doc_path      text,
  add column if not exists submissions           int not null default 1;

do $$ begin
  alter table public.kyc add constraint kyc_nominee_share_chk check (nominee_share is null or (nominee_share > 0 and nominee_share <= 100));
exception when duplicate_object then null; end $$;

create table if not exists public.kyc_events (
  id          uuid primary key default gen_random_uuid(),
  kyc_id      uuid not null references public.kyc(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event       text not null,       -- submitted | resubmitted | updated | verified | rejected
  from_status text,
  to_status   text,
  note        text,
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists kyc_events_user_idx on public.kyc_events (user_id, created_at desc);

alter table public.kyc_events enable row level security;
drop policy if exists kyc_events_select on public.kyc_events;
create policy kyc_events_select on public.kyc_events for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
-- Written only by the trigger below (security definer); nobody inserts directly.

create or replace function app.kyc_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
      insert into public.notifications (user_id, type, title, body, link)
      values (
        new.user_id, 'kyc',
        case new.status when 'verified' then 'KYC verified' when 'rejected' then 'KYC could not be verified' else 'KYC ' || new.status end,
        case new.status
          when 'verified' then 'Your documents are approved. Withdrawals are now open.'
          when 'rejected' then coalesce(nullif(trim(new.reject_reason), ''), 'Please check your documents and submit again.')
          else coalesce(new.reject_reason, 'Your KYC status has been updated.')
        end,
        '/sponsor/kyc');
    end if;
    return new;
  end if;

  if old.status = 'verified' then
    raise exception 'Verified KYC cannot be edited' using errcode = '42501';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
     or new.submissions is distinct from old.submissions then
    raise exception 'Only an administrator can change KYC review details' using errcode = '42501';
  end if;
  -- The member may send a rejected KYC back for review, nothing else.
  if new.status is distinct from old.status then
    if not (old.status = 'rejected' and new.status = 'pending') then
      raise exception 'Only an administrator can change KYC status' using errcode = '42501';
    end if;
    new.submissions := old.submissions + 1;
    new.reviewed_by := null; new.reviewed_at := null;
  end if;
  return new;
end $$;

create or replace function app.kyc_log() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'submitted';
  elsif new.status is distinct from old.status then
    v_event := case
      when new.status = 'pending' then 'resubmitted'
      else new.status::text end;
  elsif not app.is_admin() then
    v_event := 'updated';
  else
    return new;
  end if;

  insert into public.kyc_events (kyc_id, user_id, event, from_status, to_status, note, actor_id)
  values (new.id, new.user_id, v_event,
          case when tg_op = 'UPDATE' then old.status::text end, new.status::text,
          case when new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.reject_reason end,
          auth.uid());

  if v_event in ('submitted', 'resubmitted') then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'kyc',
           case v_event when 'resubmitted' then 'KYC resubmitted — re-review' else 'New KYC to verify' end,
           coalesce((select full_name || ' (' || coalesce(member_code, user_code, '') || ')' from public.profiles where id = new.user_id), 'A member'),
           '/admin/kyc'
      from public.profiles p where p.role = 'admin' and p.status = 'active';
  end if;
  return new;
end $$;

drop trigger if exists trg_kyc_log on public.kyc;
create trigger trg_kyc_log
  after insert or update on public.kyc
  for each row execute function app.kyc_log();

-- History for what already exists, so no card starts empty.
insert into public.kyc_events (kyc_id, user_id, event, from_status, to_status, actor_id, created_at)
select k.id, k.user_id, 'submitted', null, 'pending', k.user_id, k.created_at
  from public.kyc k
 where not exists (select 1 from public.kyc_events e where e.kyc_id = k.id);
insert into public.kyc_events (kyc_id, user_id, event, from_status, to_status, note, actor_id, created_at)
select k.id, k.user_id, k.status::text, 'pending', k.status::text, k.reject_reason, k.reviewed_by, coalesce(k.reviewed_at, k.updated_at)
  from public.kyc k
 where k.status <> 'pending'
   and not exists (select 1 from public.kyc_events e where e.kyc_id = k.id and e.event = k.status::text);

-- ---------------------------------------------------------------------
-- 3. Downline by sponsor (who referred whom) or by placement (where the
--    office put them in the tree). Same shape either way.
-- ---------------------------------------------------------------------
drop function if exists public.my_downline();
create or replace function public.my_downline(p_by text default 'sponsor')
returns table (
  id uuid, member_code text, full_name text, rank_name text, rank_seniority int,
  status text, level int, direct_count int, team_count int,
  joined timestamptz, sponsor_id uuid, sponsor_code text, sponsor_name text
)
language sql stable security definer set search_path = public, app as $$
  with recursive tree as (
    select p.id, 1 as lvl
      from public.profiles p
     where (case when p_by = 'placement' then p.placement_parent_id else p.referrer_id end) = auth.uid()
       and p.deleted_at is null
    union all
    select c.id, t.lvl + 1
      from tree t
      join public.profiles c
        on (case when p_by = 'placement' then c.placement_parent_id else c.referrer_id end) = t.id
       and c.deleted_at is null
     where t.lvl < 12
  )
  select p.id, p.member_code, p.full_name, r.name, r.seniority,
         p.status::text, t.lvl, p.direct_count, p.team_count,
         p.created_at, s.id, s.member_code, s.full_name
    from tree t
    join public.profiles p on p.id = t.id
    left join public.ranks    r on r.id = p.rank_id
    left join public.profiles s on s.id = case when p_by = 'placement' then p.placement_parent_id else p.referrer_id end
   order by t.lvl, p.member_code
$$;
grant execute on function public.my_downline(text) to authenticated;
