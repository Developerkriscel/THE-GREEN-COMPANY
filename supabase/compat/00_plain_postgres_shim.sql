-- =====================================================================
-- Compatibility shim: run the Royal Green schema on a PLAIN Postgres
-- =====================================================================
--
-- The migrations in supabase/migrations/ target a Supabase database, which
-- ships four things a stock Postgres does not have:
--
--   1. the roles  anon / authenticated / service_role / authenticator
--   2. the `auth` schema — auth.users, auth.uid(), auth.jwt(), auth.role()
--   3. the `storage` schema — storage.buckets, storage.objects
--   4. the extensions pgcrypto and citext
--
-- This file creates minimal, faithful stand-ins so the schema, the triggers
-- and every RLS policy can be applied and TESTED against plain Postgres.
--
-- WHAT THIS IS FOR:  validating migrations and running the RLS suite in CI or
--                    against a scratch database.
--
-- WHAT THIS IS NOT:  a replacement for Supabase at runtime. The React app talks
--                    to Supabase over HTTP (PostgREST for data, GoTrue for auth,
--                    Storage for files). Those are servers, not database objects
--                    — this shim cannot conjure them. See README "Connecting to
--                    a plain Postgres" for what that means in practice.
--
-- Apply BEFORE the migrations:
--   psql "$DATABASE_URL" -f supabase/compat/00_plain_postgres_shim.sql
--   psql "$DATABASE_URL" -f supabase/migrations/20260101000000_init_schema.sql
--   ... and so on, in filename order.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ------------------------------------------------------------- roles
-- PostgREST connects as `authenticator` and switches to anon/authenticated
-- per request. The policies only ever name anon / authenticated.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

-- The migrating user must also be a MEMBER of these roles, otherwise it cannot
-- `SET ROLE authenticated` — which is how the RLS test suite impersonates each
-- role, and how you'd sanity-check a policy by hand in a SQL console.
-- Supabase's `postgres` role already has this membership; Neon's `neondb_owner`
-- and most other managed owners do not.
-- The roles are NOINHERIT, so membership confers only the ability to switch to
-- them, not their privileges automatically.
do $$
begin
  execute format('grant anon, authenticated, service_role to %I', current_user);
exception when insufficient_privilege then
  raise notice
    'Could not grant the PostgREST roles to %. You will not be able to SET ROLE '
    'authenticated, so the RLS test suite cannot run as that role.', current_user;
end $$;

-- Supabase grants table privileges to these roles by default; RLS is what
-- actually restricts rows, so the grants must exist or every policy is moot.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- -------------------------------------------------------- auth schema
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- A faithful subset of Supabase's auth.users. Only the columns this schema
-- actually reads are modelled; GoTrue owns the rest in a real deployment.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  instance_id        uuid,
  aud                varchar(255) default 'authenticated',
  role               varchar(255) default 'authenticated',
  email              varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at         timestamptz,
  confirmation_token varchar(255),
  recovery_token     varchar(255),
  last_sign_in_at    timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin     boolean,
  phone              text unique,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  deleted_at         timestamptz
);

-- These three read the JWT claims that PostgREST puts into the session.
-- Identical in behaviour to Supabase's own definitions.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt()
  to anon, authenticated, service_role;

-- ----------------------------------------------------- storage schema
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now()
);

create index if not exists objects_bucket_name_idx on storage.objects (bucket_id, name);

-- Storage policies in 0004 assume RLS is already on, as it is in Supabase.
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- ------------------------------------------------------------- notes
comment on schema auth is
  'Shim for local/CI use. In Supabase this schema is owned and migrated by GoTrue.';
comment on schema storage is
  'Shim for local/CI use. In Supabase this schema is owned by the Storage API.';
