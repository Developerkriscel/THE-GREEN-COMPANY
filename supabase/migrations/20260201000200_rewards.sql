-- Rewards shown on the public /rewards page, managed from the admin Website CMS.
create table if not exists public.rewards (
  id          uuid primary key default gen_random_uuid(),
  level       int  not null default 1,
  title       text not null,
  joining     text,
  sales       text,
  image_url   text,
  trending    boolean not null default false,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.rewards enable row level security;

create policy "rewards: public read active"
  on public.rewards for select using (is_active = true);

create policy "rewards: admin all"
  on public.rewards for all
  using ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
  with check ( (select role from public.profiles where id = (select auth.uid())) = 'admin' );
