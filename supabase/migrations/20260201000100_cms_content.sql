-- =====================================================================
-- CMS content tables: Team, Achievers, Events, News
-- Managed from the admin Website CMS; shown on the public site.
-- Same access shape as gallery_photos: public reads active rows, admin writes.
-- =====================================================================

create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  designation text not null default '',
  category    text not null default 'branch_manager',  -- director | managing_director | branch_manager | rank_achiever
  photo_url   text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.achievers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  rank        text not null default '',
  achievement text,
  photo_url   text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  event_date  text,
  location    text,
  image_url   text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.news_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  news_date   text,
  image_url   text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['team_members','achievers','events','news_posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy "%1$s: public read active" on public.%1$I for select using (is_active = true)$f$, t);
    execute format($f$
      create policy "%1$s: admin all" on public.%1$I for all
        using ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
        with check ( (select role from public.profiles where id = (select auth.uid())) = 'admin' )
    $f$, t);
  end loop;
end $$;
