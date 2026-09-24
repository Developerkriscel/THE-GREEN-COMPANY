-- =====================================================================
-- Royal Green — MLM network layer
-- Adds sponsor / placement / referral genealogy on top of profiles so the
-- admin panel can present Members, Member Tree and Genealogy exactly like
-- the production Royal Green Company console.
--
-- Design:
--   member_code         each member's own public ID (RGC100001, RGC100002 …)
--                       shown in the UI as the "Sponsor ID" column.
--   referrer_id         who SPONSORED / referred this member (Sponsor tree).
--                       shown as "Referral ID" (the referrer's member_code).
--   placement_parent_id where this member sits in the PLACEMENT tree.
--                       shown as "Placement ID" (the parent's member_code).
--   direct_count        number of directly-referred members (denormalised).
--   team_count          total downline size in the sponsor tree (denormalised).
-- =====================================================================

-- ------------------------------------------------- 1. rank ladder alignment
-- Rename the seeded ladder to the 12-rank Royal Green ladder used on the
-- public Plans page and in the production panel, and drop the two extras.
update public.ranks set name = 'Channel Partner'  where seniority = 1;
update public.ranks set name = 'Manager'          where seniority = 2;
update public.ranks set name = 'Senior Manager'   where seniority = 3;
update public.ranks set name = 'AGM'              where seniority = 4;
update public.ranks set name = 'Team Manager'     where seniority = 5;
update public.ranks set name = 'District Manager' where seniority = 6;
update public.ranks set name = 'Zonal Manager'    where seniority = 7;
update public.ranks set name = 'Core Manager'     where seniority = 8;
update public.ranks set name = 'Platinum'         where seniority = 9;
update public.ranks set name = 'Gold Leader'      where seniority = 10;
update public.ranks set name = 'Diamond'          where seniority = 11;
update public.ranks set name = 'Crown'            where seniority = 12;
delete from public.ranks where seniority in (13, 14);

-- ------------------------------------------------- 2. MLM columns
alter table public.profiles
  add column if not exists member_code         text,
  add column if not exists referrer_id         uuid references public.profiles(id) on delete set null,
  add column if not exists placement_parent_id uuid references public.profiles(id) on delete set null,
  add column if not exists placement_position  text,
  add column if not exists direct_count        int  not null default 0,
  add column if not exists team_count          int  not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_member_code_key') then
    alter table public.profiles add constraint profiles_member_code_key unique (member_code);
  end if;
end $$;

create index if not exists profiles_referrer_idx on public.profiles (referrer_id) where referrer_id is not null;
create index if not exists profiles_placement_idx on public.profiles (placement_parent_id) where placement_parent_id is not null;

comment on column public.profiles.member_code is 'Public network ID (RGC100001). Shown as "Sponsor ID".';
comment on column public.profiles.referrer_id is 'Sponsor / referral tree parent.';
comment on column public.profiles.placement_parent_id is 'Placement tree parent.';

-- ------------------------------------------------- 3. member-code sequence
create sequence if not exists public.member_code_seq start 100001;

create or replace function app.next_member_code() returns text
language sql volatile as $$
  select 'RGC' || nextval('public.member_code_seq')::text
$$;

-- ------------------------------------------------- 4. bootstrap: assign a
-- member_code to every new staff/rep profile on creation.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_is_customer boolean := coalesce(new.raw_app_meta_data->>'account_kind', '') = 'customer';
  v_seq         bigint;
  v_code        text;
begin
  v_seq := nextval('public.user_code_seq');
  if v_is_customer then
    v_code := 'RG-C-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
  else
    v_code := 'RG-S-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone, user_code, rank_id, member_code)
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
    case when v_is_customer then null else app.next_member_code() end
  );
  return new;
end $$;

-- ------------------------------------------------- 5. extend the column guard
-- Only an admin may change the MLM wiring, same rule as role/status/rank.
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
     or new.approved_by  is distinct from old.approved_by
     or new.deleted_at   is distinct from old.deleted_at
  then
    raise exception 'Only an administrator can change role, status, rank, manager, commission rate, member wiring or user code'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- ------------------------------------------------- 6. recalculation RPCs
-- Recompute direct_count / team_count over the sponsor (referrer) tree.
create or replace function public.recalculate_network() returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can recalculate the network' using errcode = '42501';
  end if;

  -- direct sponsor count
  update public.profiles p
     set direct_count = coalesce(d.n, 0)
    from (select referrer_id, count(*) n from public.profiles
           where referrer_id is not null group by referrer_id) d
   where d.referrer_id = p.id;
  update public.profiles p
     set direct_count = 0
   where not exists (select 1 from public.profiles c where c.referrer_id = p.id);

  -- whole-downline team count via recursive walk
  with recursive tree as (
    select id as root, id as node from public.profiles
    union all
    select t.root, c.id
      from tree t join public.profiles c on c.referrer_id = t.node
  )
  update public.profiles p
     set team_count = coalesce(t.n, 0)
    from (select root, count(*) - 1 n from tree group by root) t
   where t.root = p.id;
end $$;
grant execute on function public.recalculate_network() to authenticated;

-- Recalculate a single member's direct + team counts.
create or replace function public.recalculate_member(p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can recalculate a member' using errcode = '42501';
  end if;

  update public.profiles p
     set direct_count = (select count(*) from public.profiles c where c.referrer_id = p_id)
   where p.id = p_id;

  with recursive tree as (
    select p_id as node
    union all
    select c.id from tree t join public.profiles c on c.referrer_id = t.node
  )
  update public.profiles p
     set team_count = (select count(*) - 1 from tree)
   where p.id = p_id;
end $$;
grant execute on function public.recalculate_member(uuid) to authenticated;
