-- =====================================================================
-- Reassigning leads: the office shares leads out to members
--
-- Leads imported into the office pool (owner_id null), or sitting with a
-- member who is not working them, can be handed to one member or shared
-- round-robin among several. One call does it all in one transaction:
--   * only an administrator may call it;
--   * every target must be an active sponsor;
--   * converted leads are left alone (they belong to a sale);
--   * each moved lead gets a line in its history (lead_activities);
--   * each member gets ONE notification for the batch, not one per lead.
-- =====================================================================

create or replace function public.assign_leads(p_lead_ids uuid[], p_member_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_members  uuid[];
  v_n        int;
  v_i        int := 0;
  v_target   uuid;
  v_assigned int := 0;
  v_same     int := 0;
  v_converted int := 0;
  v_counts   jsonb := '{}'::jsonb;
  r          record;
  m          record;
begin
  if not app.is_admin() then
    raise exception 'Only the office can assign leads' using errcode = '42501';
  end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 then
    raise exception 'Choose at least one lead' using errcode = '22023';
  end if;
  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    raise exception 'Choose at least one member' using errcode = '22023';
  end if;
  if cardinality(p_lead_ids) > 5000 then
    raise exception 'Assign at most 5,000 leads at a time' using errcode = '22023';
  end if;

  -- The members, in the order given, each once; all must be active sponsors.
  select array_agg(p.id order by array_position(p_member_ids, p.id))
    into v_members
    from public.profiles p
   where p.id = any(p_member_ids)
     and p.role = 'rep' and p.status = 'active' and p.deleted_at is null;
  if v_members is null
     or cardinality(v_members) <> (select count(distinct x) from unnest(p_member_ids) x) then
    raise exception 'Leads can only be assigned to active sponsors' using errcode = '22023';
  end if;
  v_n := cardinality(v_members);

  for r in
    select l.id, l.owner_id, l.status
      from public.leads l
     where l.id = any(p_lead_ids) and l.deleted_at is null
     order by l.created_at, l.id
  loop
    if r.status = 'converted' then
      v_converted := v_converted + 1;
      continue;
    end if;

    -- round-robin; the turn advances for every lead so shares stay even
    v_target := v_members[(v_i % v_n) + 1];
    v_i := v_i + 1;

    if r.owner_id is not distinct from v_target then
      v_same := v_same + 1;
      continue;
    end if;

    update public.leads set owner_id = v_target, updated_at = now() where id = r.id;

    insert into public.lead_activities (lead_id, actor_id, kind, body)
    values (r.id, auth.uid(), 'assigned',
            case when r.owner_id is null then 'Assigned by the office from the lead pool'
                 else 'Reassigned by the office' end);

    v_assigned := v_assigned + 1;
    v_counts := jsonb_set(v_counts, array[v_target::text],
                          to_jsonb(coalesce((v_counts ->> v_target::text)::int, 0) + 1));
  end loop;

  for m in select key::uuid as member_id, value::int as n from jsonb_each_text(v_counts) loop
    insert into public.notifications (user_id, type, title, body, link)
    values (m.member_id, 'lead_assigned',
            format('%s new lead%s assigned to you', m.n, case when m.n = 1 then '' else 's' end),
            'The office has added them to your Lead follow-up. Call them soon.',
            '/sponsor/leads');
  end loop;

  return jsonb_build_object(
    'assigned', v_assigned,
    'unchanged', v_same,
    'skipped_converted', v_converted,
    'per_member', v_counts
  );
end $$;

revoke all on function public.assign_leads(uuid[], uuid[]) from public;
grant execute on function public.assign_leads(uuid[], uuid[]) to authenticated;
