-- =====================================================================
-- Member detail dashboard support: freeze, welcome-letter override,
-- credit/debit ledger and withdrawals.
-- =====================================================================

alter table public.profiles
  add column if not exists frozen         boolean not null default false,
  add column if not exists welcome_letter jsonb;

-- Freeze + welcome-letter are admin-only, same as the other guarded columns.
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
  return new;
end $$;

create table if not exists public.member_ledger (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'credit',   -- credit | debit
  source      text,                             -- direct_income | level_income | reward | adjustment | withdrawal …
  reference   text,
  amount      numeric(14,2) not null default 0,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists member_ledger_member_idx on public.member_ledger (member_id, created_at desc);

create table if not exists public.withdrawals (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  amount       numeric(14,2) not null default 0,
  account      text,
  utr          text,
  status       text not null default 'requested',  -- requested | approved | paid | rejected
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists withdrawals_member_idx on public.withdrawals (member_id, requested_at desc);

do $$
declare t text;
begin
  foreach t in array array['member_ledger','withdrawals'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Admin sees/writes everything.
    execute format($f$
      create policy "%1$s: admin all" on public.%1$I for all
        using ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
        with check ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
    $f$, t);
    -- A member may read their own rows.
    execute format($f$
      create policy "%1$s: member reads own" on public.%1$I for select
        using ( member_id = (select auth.uid()) )
    $f$, t);
  end loop;
end $$;
