-- =====================================================================
-- Employees: the office's HR records
--
-- The company's own staff (office, site, accounts, drivers...) as records
-- the office keeps. They are NOT login accounts and have no panel: Staff
-- (/admin/staff) manages who can sign in, this module manages people.
--
--   employees            the master record: personal, job, pay, statutory,
--                        emergency contact, exit, ID card validity
--   employee_documents   papers in the private `hr` bucket, with expiry
--   employee_events      the timeline; joins, promotions, transfers, salary
--                        revisions and status changes are written by trigger
--   employee_assets      what was issued (laptop, phone, SIM, keys...) and
--                        whether it came back
--   employee_leaves      leave taken, against a yearly quota per employee
--
-- Everything is admin-only, except one narrow public door: the QR on an
-- employee's ID card opens /verify/employee/<token>, which shows whether the
-- card is genuine and current (name, photo, designation, validity) and
-- nothing else. Re-issuing a card changes the token, so a lost card's QR
-- stops verifying.
-- =====================================================================

create sequence if not exists app.employee_code_seq start 1;

create table if not exists public.employees (
  id                  uuid primary key default gen_random_uuid(),
  employee_code       text unique not null,

  -- personal
  full_name           text not null check (length(trim(full_name)) between 2 and 120),
  photo_path          text,
  gender              text check (gender in ('male', 'female', 'other')),
  dob                 date,
  blood_group         text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  marital_status      text check (marital_status in ('single', 'married', 'widowed', 'divorced')),
  father_name         text,
  spouse_name         text,
  qualification       text,
  experience_years    numeric(4, 1) check (experience_years is null or experience_years between 0 and 60),
  previous_employer   text,

  -- contact
  phone               text,
  alt_phone           text,
  email               text,
  personal_email      text,
  current_address     text,
  permanent_address   text,
  city                text,
  state               text,
  pincode             text,

  -- job
  department          text,
  designation         text,
  employment_type     text not null default 'full_time'
                      check (employment_type in ('full_time', 'part_time', 'contract', 'intern', 'consultant')),
  work_location       text,
  shift               text,
  joining_date        date not null default current_date,
  probation_end       date,
  confirmation_date   date,
  contract_end        date,
  reporting_manager_id uuid references public.employees(id) on delete set null,

  -- pay
  monthly_salary      numeric(12, 2) check (monthly_salary is null or monthly_salary >= 0),
  salary_mode         text not null default 'bank' check (salary_mode in ('bank', 'cash', 'upi', 'cheque')),
  bank_name           text,
  bank_account        text,
  ifsc                text,
  account_holder      text,
  upi_id              text,

  -- statutory. Only the last four digits of Aadhaar are kept as data; the
  -- card itself, if needed, is a document in the private bucket.
  pan                 text,
  aadhaar_last4       text check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  uan                 text,
  esic_no             text,

  -- emergency contact (also printed on the back of the ID card)
  emergency_name      text,
  emergency_relation  text,
  emergency_phone     text,

  -- status and exit
  status              text not null default 'active'
                      check (status in ('active', 'on_notice', 'suspended', 'exited')),
  notice_date         date,
  exit_date           date,
  exit_type           text check (exit_type in ('resigned', 'terminated', 'absconded', 'retired', 'contract_end', 'other')),
  exit_reason         text,
  fnf_settled         boolean not null default false,
  fnf_amount          numeric(12, 2),
  rehire_eligible     boolean,

  -- ID card
  card_token          uuid not null default gen_random_uuid() unique,
  card_issue_no       int not null default 1,
  card_issued_on      date not null default current_date,
  card_valid_till     date,

  leave_quota         jsonb not null default '{"casual": 12, "sick": 6, "earned": 15}'::jsonb,
  notes               text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint employees_exit_chk check (status <> 'exited' or exit_date is not null),
  constraint employees_manager_chk check (reporting_manager_id is distinct from id)
);

create index if not exists employees_status_idx on public.employees (status) where deleted_at is null;
create index if not exists employees_department_idx on public.employees (department) where deleted_at is null;

create table if not exists public.employee_documents (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  doc_type      text not null check (doc_type in (
                  'aadhaar', 'pan', 'photo_id', 'address_proof', 'resume', 'education', 'experience',
                  'offer_letter', 'appointment_letter', 'nda', 'bank_proof', 'police_verification',
                  'medical', 'driving_licence', 'increment_letter', 'warning_letter', 'relieving_letter', 'other')),
  title         text not null,
  doc_number    text,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  expiry_date   date,
  verified      boolean not null default false,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists employee_documents_emp_idx on public.employee_documents (employee_id);

create table if not exists public.employee_events (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  kind          text not null check (kind in (
                  'joined', 'confirmed', 'promotion', 'transfer', 'salary', 'status', 'exit', 'card',
                  'note', 'appreciation', 'warning', 'training', 'incident')),
  title         text not null,
  detail        text,
  event_date    date not null default current_date,
  auto          boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists employee_events_emp_idx on public.employee_events (employee_id, event_date desc);

create table if not exists public.employee_assets (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  asset_type    text not null check (asset_type in (
                  'laptop', 'desktop', 'mobile', 'sim', 'tablet', 'id_card', 'access_card', 'keys',
                  'vehicle', 'uniform', 'tools', 'other')),
  name          text not null,
  serial_no     text,
  value         numeric(12, 2),
  issued_on     date not null default current_date,
  returned_on   date,
  condition_out text,
  condition_in  text,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint employee_assets_dates_chk check (returned_on is null or returned_on >= issued_on)
);
create index if not exists employee_assets_emp_idx on public.employee_assets (employee_id);

create table if not exists public.employee_leaves (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type    text not null check (leave_type in ('casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity', 'comp_off', 'other')),
  from_date     date not null,
  to_date       date not null,
  days          numeric(5, 1) not null check (days > 0),
  status        text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason        text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint employee_leaves_dates_chk check (to_date >= from_date)
);
create index if not exists employee_leaves_emp_idx on public.employee_leaves (employee_id, from_date desc);

-- ---------------------------------------------------------------------
-- Row security: the office only
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employees', 'employee_documents', 'employee_events', 'employee_assets', 'employee_leaves'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format('create policy %1$s_admin on public.%1$s for all to authenticated using (app.is_admin()) with check (app.is_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Code, defaults and housekeeping
-- ---------------------------------------------------------------------
create or replace function app.employees_before() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    if new.employee_code is null or trim(new.employee_code) = '' then
      new.employee_code := 'RSGC-E-' || lpad(nextval('app.employee_code_seq')::text, 4, '0');
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    new.card_issued_on := coalesce(new.card_issued_on, current_date);
  else
    new.updated_at := now();
    -- A card is re-issued only through reissue_employee_card(), so the
    -- token, number and issue date move together.
    if new.card_token is distinct from old.card_token and current_setting('app.card_reissue', true) is distinct from 'on' then
      new.card_token := old.card_token;
    end if;
  end if;

  new.full_name := regexp_replace(trim(new.full_name), '\s+', ' ', 'g');
  new.pan := nullif(upper(regexp_replace(coalesce(new.pan, ''), '\s', '', 'g')), '');
  new.ifsc := nullif(upper(regexp_replace(coalesce(new.ifsc, ''), '\s', '', 'g')), '');
  if new.pan is not null and new.pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'PAN % does not look right (e.g. ABCDE1234F).', new.pan using errcode = '22023';
  end if;
  if new.ifsc is not null and new.ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
    raise exception 'IFSC % does not look right (e.g. HDFC0001234).', new.ifsc using errcode = '22023';
  end if;
  if new.dob is not null and new.dob > current_date - interval '14 years' then
    raise exception 'Date of birth makes the employee younger than 14.' using errcode = '22023';
  end if;

  -- Exiting: the card stops verifying from the exit date (verify_employee
  -- checks the status); leaving the company clears notice.
  if new.status = 'exited' then
    new.exit_date := coalesce(new.exit_date, current_date);
  elsif tg_op = 'UPDATE' and old.status = 'exited' then
    -- Rejoining: the old exit stays in the timeline, not on the record.
    new.exit_date := null; new.exit_type := null; new.exit_reason := null;
    new.fnf_settled := false; new.fnf_amount := null;
  end if;
  if new.status = 'on_notice' then
    new.notice_date := coalesce(new.notice_date, current_date);
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_before on public.employees;
create trigger trg_employees_before before insert or update on public.employees
  for each row execute function app.employees_before();

-- ---------------------------------------------------------------------
-- The timeline writes itself for the changes that matter
-- ---------------------------------------------------------------------
create or replace function app.employees_timeline() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  ev record;
begin
  if tg_op = 'INSERT' then
    insert into public.employee_events (employee_id, kind, title, detail, event_date, auto, created_by)
    values (new.id, 'joined', 'Joined as ' || coalesce(new.designation, 'employee'),
            concat_ws(' · ', new.department, new.work_location, replace(new.employment_type, '_', ' ')),
            new.joining_date, true, auth.uid());
    return new;
  end if;

  for ev in
    select * from (values
      (new.designation is distinct from old.designation, 'promotion',
       'Designation: ' || coalesce(old.designation, '—') || ' → ' || coalesce(new.designation, '—'), null::text),
      (new.department is distinct from old.department or new.work_location is distinct from old.work_location, 'transfer',
       'Moved to ' || concat_ws(', ', new.department, new.work_location),
       'From ' || coalesce(nullif(concat_ws(', ', old.department, old.work_location), ''), '—')),
      (new.monthly_salary is distinct from old.monthly_salary, 'salary',
       'Salary revised to ₹' || coalesce(to_char(new.monthly_salary, 'FM99,99,99,990'), '—') || ' a month',
       'Was ₹' || coalesce(to_char(old.monthly_salary, 'FM99,99,99,990'), '—')
         || case when old.monthly_salary > 0 and new.monthly_salary is not null
                 then ' (' || case when new.monthly_salary >= old.monthly_salary then '+' else '' end
                      || round((new.monthly_salary - old.monthly_salary) * 100 / old.monthly_salary, 1) || '%)'
                 else '' end),
      (new.confirmation_date is distinct from old.confirmation_date and new.confirmation_date is not null, 'confirmed',
       'Confirmed after probation', null),
      (new.status is distinct from old.status and new.status <> 'exited', 'status',
       case new.status when 'on_notice' then 'Serving notice'
                       when 'suspended' then 'Suspended'
                       when 'active' then case when old.status = 'exited' then 'Rejoined' else 'Back to active' end
       end,
       case when new.status = 'on_notice' then nullif(new.exit_reason, '') end),
      (new.status = 'exited' and old.status is distinct from 'exited', 'exit',
       'Left the company' || coalesce(' (' || replace(new.exit_type, '_', ' ') || ')', ''),
       nullif(new.exit_reason, '')),
      (new.reporting_manager_id is distinct from old.reporting_manager_id, 'transfer',
       'Now reports to ' || coalesce((select full_name from public.employees where id = new.reporting_manager_id), 'no one'), null)
    ) as t(changed, kind, title, detail)
    where changed
  loop
    insert into public.employee_events (employee_id, kind, title, detail, event_date, auto, created_by)
    values (new.id, ev.kind, ev.title, ev.detail,
            case when ev.kind = 'exit' then new.exit_date
                 when ev.kind = 'confirmed' then new.confirmation_date
                 else current_date end,
            true, auth.uid());
  end loop;
  return new;
end $$;

drop trigger if exists trg_employees_timeline on public.employees;
create trigger trg_employees_timeline after insert or update on public.employees
  for each row execute function app.employees_timeline();

drop trigger if exists trg_employees_audit on public.employees;
create trigger trg_employees_audit after insert or update or delete on public.employees
  for each row execute function app.audit_trigger();

-- ---------------------------------------------------------------------
-- Re-issue an ID card (lost, damaged, details changed): a new QR token, so
-- the old card's QR stops verifying, and a new validity.
-- ---------------------------------------------------------------------
create or replace function public.reissue_employee_card(p_employee_id uuid, p_valid_till date, p_reason text default null)
returns public.employees
language plpgsql security definer set search_path = public, app as $$
declare
  v public.employees;
begin
  if not app.is_admin() then
    raise exception 'Only the office can issue ID cards.' using errcode = '42501';
  end if;
  if p_valid_till is not null and p_valid_till < current_date then
    raise exception 'The card must be valid until a future date.' using errcode = '22023';
  end if;
  perform set_config('app.card_reissue', 'on', true);
  update public.employees
     set card_token = gen_random_uuid(),
         card_issue_no = card_issue_no + 1,
         card_issued_on = current_date,
         card_valid_till = p_valid_till
   where id = p_employee_id and deleted_at is null
  returning * into v;
  perform set_config('app.card_reissue', 'off', true);
  if v.id is null then
    raise exception 'Employee not found.' using errcode = 'P0002';
  end if;
  insert into public.employee_events (employee_id, kind, title, detail, auto, created_by)
  values (v.id, 'card', 'ID card re-issued (issue ' || v.card_issue_no || ')',
          concat_ws(' · ', nullif(trim(coalesce(p_reason, '')), ''),
                    'valid till ' || coalesce(to_char(p_valid_till, 'DD Mon YYYY'), 'no end date'),
                    'the previous card''s QR no longer verifies'),
          true, auth.uid());
  return v;
end $$;
revoke all on function public.reissue_employee_card(uuid, date, text) from public;
grant execute on function public.reissue_employee_card(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- The public card check (QR on the card -> /verify/employee/<token>)
-- ---------------------------------------------------------------------
create or replace function public.verify_employee(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_token uuid;
  e public.employees;
  v_state text;
begin
  begin
    v_token := p_token::uuid;
  exception when others then
    return jsonb_build_object('state', 'unknown');
  end;

  select * into e from public.employees where card_token = v_token and deleted_at is null;
  if e.id is null then
    return jsonb_build_object('state', 'unknown');
  end if;

  v_state := case
    when e.status = 'exited' then 'exited'
    when e.status = 'suspended' then 'suspended'
    when e.card_valid_till is not null and e.card_valid_till < current_date then 'expired'
    else 'valid' end;

  -- An ex-employee's card proves nothing about them today: only the name
  -- and the fact that they have left.
  if v_state = 'exited' then
    return jsonb_build_object('state', v_state, 'name', e.full_name, 'code', e.employee_code, 'exit_date', e.exit_date);
  end if;

  return jsonb_build_object(
    'state', v_state,
    'name', e.full_name,
    'code', e.employee_code,
    'designation', e.designation,
    'department', e.department,
    'location', e.work_location,
    'photo_path', e.photo_path,
    'blood_group', e.blood_group,
    'joining_date', e.joining_date,
    'valid_till', e.card_valid_till,
    'issue_no', e.card_issue_no
  );
end $$;
revoke all on function public.verify_employee(text) from public;
grant execute on function public.verify_employee(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage: the private `hr` bucket. Objects are <employee id>/<file>.
-- The office reads and writes everything; anyone may read a CURRENT
-- employee's photo -- the one the verify page shows -- and nothing else.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr', 'hr', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.hr_public_photo(p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.employees
                  where photo_path = p_name and deleted_at is null and status in ('active', 'on_notice'))
$$;
grant execute on function app.hr_public_photo(text) to anon, authenticated;

drop policy if exists hr_admin_read   on storage.objects;
drop policy if exists hr_photo_read   on storage.objects;
drop policy if exists hr_admin_insert on storage.objects;
drop policy if exists hr_admin_update on storage.objects;
drop policy if exists hr_admin_delete on storage.objects;

create policy hr_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'hr' and app.is_admin());
create policy hr_photo_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'hr' and app.hr_public_photo(name));
create policy hr_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'hr' and app.is_admin());
create policy hr_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'hr' and app.is_admin());
create policy hr_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'hr' and app.is_admin());
