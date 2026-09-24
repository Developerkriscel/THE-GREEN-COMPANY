-- =====================================================================
-- Royal Green — 0001 : schema, enums, tables
-- Single-level commission model. No upline / downline / genealogy columns.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;

-- ---------------------------------------------------------------- enums
create type app_role          as enum ('admin', 'manager', 'rep', 'customer');
create type account_status    as enum ('pending', 'active', 'suspended');
create type plot_status       as enum ('available', 'token', 'booked', 'registered', 'sold', 'blocked');
create type lead_status       as enum ('new', 'contacted', 'visit_scheduled', 'negotiation', 'converted', 'lost');
create type approval_status   as enum ('draft', 'step1_done', 'step2_approved', 'confirmed', 'rejected', 'cancelled');
create type emi_status        as enum ('pending', 'awaiting_verification', 'paid', 'overdue', 'rejected');
create type commission_status as enum ('accrued', 'approved', 'paid', 'cancelled');
create type kyc_status        as enum ('pending', 'verified', 'rejected');
create type doc_type          as enum ('welcome_letter', 'booking_form', 'receipt', 'registry', 'brochure', 'agreement', 'other');
create type thread_status     as enum ('open', 'resolved');
create type thread_kind       as enum ('enquiry', 'support', 'internal');
create type audit_action      as enum ('insert', 'update', 'delete', 'access', 'login', 'approve', 'reject');

-- ---------------------------------------------------------------- ranks
-- Rank is a TITLE + an own-sale commission rate. Nothing else.
-- Deliberately has no sponsor_rate / level_rate / generation column.
create table public.ranks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  seniority     int  not null unique,
  own_sale_rate numeric(5,2) not null check (own_sale_rate >= 0 and own_sale_rate <= 100),
  description   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.ranks is
  'Rep seniority ladder. own_sale_rate applies ONLY to the rep''s own admin-confirmed sales.';

-- ------------------------------------------------------------- profiles
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            app_role not null default 'rep',
  status          account_status not null default 'pending',
  full_name       text not null default '',
  email           citext,
  phone           text,
  avatar_path     text,
  user_code       text unique,               -- staff member ID / customer login ID
  rank_id         uuid references public.ranks(id) on delete set null,
  -- manager_id is for READ-ONLY reporting + step-2 approval routing. Never for payouts.
  manager_id      uuid references public.profiles(id) on delete set null,
  commission_rate numeric(5,2) check (commission_rate >= 0 and commission_rate <= 100),
  address         text,
  city            text,
  state           text,
  pincode         text,
  notes           text,
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  last_login_at   timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profiles_not_own_manager check (manager_id is distinct from id)
);
create index on public.profiles (role, status);
create index on public.profiles (manager_id) where manager_id is not null;
comment on column public.profiles.manager_id is
  'Read-only reporting line + approval routing. Carries NO earnings of any kind.';

-- ------------------------------------------------------------- projects
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  location      text not null default '',
  city          text,
  state         text,
  description   text,
  amenities     text[] not null default '{}',
  hero_image    text,
  gallery       text[] not null default '{}',
  brochure_path text,
  map_embed     text,
  price_from    numeric(14,2),
  price_to      numeric(14,2),
  size_from     numeric(10,2),
  size_to       numeric(10,2),
  size_unit     text not null default 'sqft',
  published     boolean not null default false,
  featured      boolean not null default false,
  sort_order    int not null default 0,
  launch_date   date,
  deleted_at    timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.projects (published, featured, sort_order);

-- ---------------------------------------------------------------- plots
create table public.plots (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  number      text not null,
  size        numeric(10,2),
  size_unit   text not null default 'sqft',
  dimensions  text,
  facing      text,
  price       numeric(14,2) not null default 0,
  status      plot_status not null default 'available',
  notes       text,                             -- INTERNAL ONLY, never in public view
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, number)
);
create index on public.plots (project_id, status);

-- ---------------------------------------------------------------- leads
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references public.profiles(id) on delete set null,
  name            text not null,
  mobile          text not null,               -- private to owner + admin + owner's manager
  email           citext,
  project_id      uuid references public.projects(id) on delete set null,
  category        text,
  budget          numeric(14,2),
  visit_date      date,
  token_amount    numeric(14,2),
  plot_number     text,
  source          text not null default 'website',
  remark          text,                        -- private, same rule as mobile
  status          lead_status not null default 'new',
  next_follow_up  date,
  converted_booking_id uuid,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.leads (owner_id, status);
create index on public.leads (next_follow_up) where deleted_at is null;

create table public.lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  kind       text not null default 'note',
  body       text not null default '',
  created_at timestamptz not null default now()
);
create index on public.lead_activities (lead_id, created_at desc);

-- ------------------------------------------------------------- bookings
create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  plot_id       uuid not null references public.plots(id) on delete restrict,
  project_id    uuid not null references public.projects(id) on delete restrict,
  rep_id        uuid references public.profiles(id) on delete set null,
  customer_id   uuid references public.profiles(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  reviewer_id   uuid references public.profiles(id) on delete set null,
  status        approval_status not null default 'draft',

  sale_value    numeric(14,2) not null default 0,
  token_amount  numeric(14,2) not null default 0,
  payment_plan  text not null default 'full',   -- full | emi
  emi_count     int not null default 0,
  emi_amount    numeric(14,2) not null default 0,
  emi_start     date,

  terms_accepted_rep      boolean not null default false,
  terms_accepted_customer boolean not null default false,

  step1_at   timestamptz,  step1_by uuid references public.profiles(id) on delete set null,
  step2_at   timestamptz,  step2_by uuid references public.profiles(id) on delete set null,
  step3_at   timestamptz,  step3_by uuid references public.profiles(id) on delete set null,
  reject_step int,
  reject_remark text,
  registry_path text,
  registry_at   timestamptz,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_reviewer_not_rep check (reviewer_id is null or reviewer_id is distinct from rep_id)
);
create index on public.bookings (rep_id, status);
create index on public.bookings (customer_id);
create index on public.bookings (reviewer_id) where reviewer_id is not null;
create unique index bookings_one_live_per_plot
  on public.bookings (plot_id)
  where status in ('step1_done','step2_approved','confirmed') and deleted_at is null;

alter table public.leads
  add constraint leads_converted_booking_fk
  foreign key (converted_booking_id) references public.bookings(id) on delete set null;

-- --------------------------------------------------- sale confirmations
create table public.sale_confirmations (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id) on delete cascade,
  rep_id      uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  status      approval_status not null default 'draft',
  sale_value  numeric(14,2) not null default 0,
  sale_date   date not null default current_date,

  terms_accepted_rep      boolean not null default false,
  terms_accepted_customer boolean not null default false,

  step1_at timestamptz, step1_by uuid references public.profiles(id) on delete set null,
  step2_at timestamptz, step2_by uuid references public.profiles(id) on delete set null,
  step3_at timestamptz, step3_by uuid references public.profiles(id) on delete set null,
  reject_step int,
  reject_remark text,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sale_confirmations (rep_id, status);

-- ----------------------------------------------------------- commissions
-- Exactly one commission row per sale, for the rep who made THAT sale.
create table public.commissions (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  rep_id        uuid not null references public.profiles(id) on delete restrict,
  sale_value    numeric(14,2) not null,
  rate_applied  numeric(5,2) not null,            -- snapshot; rank changes never rewrite history
  rank_at_sale  text,
  gross_amount  numeric(14,2) not null,
  deductions    numeric(14,2) not null default 0,
  net_amount    numeric(14,2) not null,
  status        commission_status not null default 'accrued',
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  paid_at       timestamptz,
  payout_reference text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index commissions_one_per_booking on public.commissions (booking_id);
create index on public.commissions (rep_id, status);
comment on table public.commissions is
  'Single-level only. Created solely by the sale-confirmation trigger for bookings.rep_id.';

create table public.commission_deductions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  percent    numeric(5,2) not null default 0 check (percent >= 0 and percent <= 100),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- emis
create table public.emis (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  seq         int not null,
  due_date    date not null,
  amount      numeric(14,2) not null,
  status      emi_status not null default 'pending',
  slip_path   text,
  slip_uploaded_at timestamptz,
  paid_at     timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  reject_reason text,
  reference   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (booking_id, seq)
);
create index on public.emis (status, due_date);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  emi_id      uuid references public.emis(id) on delete set null,
  amount      numeric(14,2) not null,
  mode        text not null default 'bank_transfer',
  reference   text,
  paid_on     date not null default current_date,
  recorded_by uuid references public.profiles(id) on delete set null,
  receipt_no  text unique,
  created_at  timestamptz not null default now()
);
create index on public.payments (booking_id);

-- ------------------------------------------------------------ documents
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references public.bookings(id) on delete cascade,
  owner_id    uuid references public.profiles(id) on delete set null,
  type        doc_type not null,
  title       text not null,
  storage_path text not null,
  size_bytes  bigint,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.documents (booking_id, type);

-- ------------------------------------------------------------------ kyc
create table public.kyc (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  id_type       text not null default 'aadhaar',
  id_last4      text,                       -- never store/display the full number in a list view
  id_doc_path   text,
  address_doc_path text,
  photo_path    text,
  status        kyc_status not null default 'pending',
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  reject_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

-- ------------------------------------------------------------- messaging
create table public.message_threads (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null default '',
  kind         thread_kind not null default 'support',
  status       thread_status not null default 'open',
  created_by   uuid references public.profiles(id) on delete set null,
  assigned_to  uuid references public.profiles(id) on delete set null,
  customer_id  uuid references public.profiles(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  booking_id   uuid references public.bookings(id) on delete set null,
  guest_name   text,
  guest_email  citext,
  guest_phone  text,
  last_message_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index on public.message_threads (assigned_to, status);
create index on public.message_threads (customer_id);

create table public.thread_participants (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  read_at   timestamptz,
  primary key (thread_id, user_id)
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.message_threads(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  internal   boolean not null default false,   -- internal notes hidden from customers
  created_at timestamptz not null default now()
);
create index on public.messages (thread_id, created_at);

-- --------------------------------------------------------- notifications
create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  type      text not null,
  title     text not null,
  body      text,
  link      text,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, read_at);

-- -------------------------------------------------------------- audit log
create table public.audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  actor_role app_role,
  action     audit_action not null,
  entity     text not null,
  entity_id  text,
  summary    text,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index on public.audit_log (at desc);
create index on public.audit_log (entity, entity_id);
create index on public.audit_log (actor_id, at desc);
comment on table public.audit_log is
  'Append-only. No UPDATE or DELETE policy exists, not even for admins.';

-- --------------------------------------------------------------- CMS
create table public.cms_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  body       text not null default '',
  published  boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.cms_banners (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  subtitle   text,
  image_url  text,
  cta_label  text,
  cta_link   text,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.site_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------- updated_at glue
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'ranks','profiles','projects','plots','leads','bookings','sale_confirmations',
    'commissions','emis','kyc'
  ] loop
    execute format(
      'create trigger trg_%1$s_touch before update on public.%1$s
       for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;
