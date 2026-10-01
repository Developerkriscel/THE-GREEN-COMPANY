-- =====================================================================
-- Employees: a raise reads "+15%", not "+15.0%", on the timeline.
-- Same function as 20260201003800, with trim_scale() on the percentage.
-- =====================================================================

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
                      || trim_scale(round((new.monthly_salary - old.monthly_salary) * 100 / old.monthly_salary, 1)) || '%)'
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
