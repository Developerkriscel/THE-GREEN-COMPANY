-- Plans page content: the rank/income table and the level-payout ladder.
-- Managed from the admin Website CMS "Plans" tab; shown on public /plans.

create table if not exists public.plan_ranks (
  id          uuid primary key default gen_random_uuid(),
  rank        text not null,
  joining     text,
  direct      text,
  pct         text,
  features    text,
  elite       boolean not null default false,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.plan_levels (
  id          uuid primary key default gen_random_uuid(),
  level       int  not null default 1,
  rate        int  not null default 0,
  tag         text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['plan_ranks','plan_levels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy "%1$s: public read active" on public.%1$I for select using (is_active = true)$f$, t);
    execute format($f$
      create policy "%1$s: admin all" on public.%1$I for all
        using ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
        with check ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
    $f$, t);
  end loop;
end $$;
