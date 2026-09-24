-- =====================================================================
-- Support: tell people they have a reply, and track what they have read
--
-- Two things were missing from an otherwise complete module:
--
-- 1. NOTHING NOTIFIED ANYONE. A member raises a support thread, the office
--    answers, and the member is never told. The only way to find out was to
--    open the Support screen and look -- which is the one behaviour a
--    support inbox exists to remove.
--
-- 2. READ STATE WAS NEVER USED. `thread_participants.read_at` exists and the
--    UI never reads or writes it, so there is no unread badge and no way to
--    see which conversations still need an answer.
--
-- The backfill below is a no-op on the current data and that is correct: 22
-- of the 23 threads are website enquiries from guests with no account, which
-- only staff can see and which nobody can be a participant of. It is here for
-- threads that DO have a member behind them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Everyone in a conversation is a participant
--
-- Backfill the people a thread already implies: whoever opened it and
-- whoever it is about. Marked read at the thread's last activity so nobody
-- logs in to a wall of false "unread" badges. Guest enquiry threads have
-- neither, so they are skipped.
-- ---------------------------------------------------------------------
insert into public.thread_participants (thread_id, user_id, read_at)
select t.id, t.created_by, t.last_message_at
  from public.message_threads t
 where t.created_by is not null
on conflict (thread_id, user_id) do nothing;

insert into public.thread_participants (thread_id, user_id, read_at)
select t.id, t.customer_id, t.last_message_at
  from public.message_threads t
 where t.customer_id is not null
on conflict (thread_id, user_id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Writing in a thread joins it, and bumps its activity
--
-- Without this a staff reply leaves the replier outside the participant
-- list, so their own unread state is wrong the moment the member answers.
-- ---------------------------------------------------------------------
create or replace function app.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_sender_name text;
  v_subject     text;
  r             record;
begin
  update public.message_threads
     set last_message_at = new.created_at
   where id = new.thread_id;

  -- The sender is a participant, and has by definition read their own message.
  if new.sender_id is not null then
    insert into public.thread_participants (thread_id, user_id, read_at)
    values (new.thread_id, new.sender_id, new.created_at)
    on conflict (thread_id, user_id) do update set read_at = excluded.read_at;
  end if;

  -- An internal note is staff-only and must never reach the member, in a
  -- notification or anywhere else.
  if new.internal then
    return null;
  end if;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  select subject into v_subject from public.message_threads where id = new.thread_id;

  for r in
    select distinct tp.user_id
      from public.thread_participants tp
     where tp.thread_id = new.thread_id
       and tp.user_id is distinct from new.sender_id
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (
      r.user_id, 'message',
      'New reply from ' || coalesce(nullif(trim(v_sender_name), ''), 'the office'),
      left(new.body, 140) || case when length(new.body) > 140 then '…' else '' end,
      '/sponsor/messages/' || new.thread_id::text
    );
  end loop;

  return null;
end $$;

drop trigger if exists trg_messages_after_insert on public.messages;
create trigger trg_messages_after_insert
  after insert on public.messages
  for each row execute function app.messages_after_insert();

-- ---------------------------------------------------------------------
-- 3. Marking a conversation read
--
-- Own row only, which tp_update_own already enforces; the function exists so
-- the caller does not have to know it must upsert rather than update -- a
-- plain update writes nothing when the row is missing, which is exactly the
-- state 22 of the 23 threads were in.
-- ---------------------------------------------------------------------
create or replace function public.mark_thread_read(p_thread uuid)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Only for a thread the caller can actually see; RLS on message_threads
  -- decides that, so a select through it is the check.
  if not exists (select 1 from public.message_threads where id = p_thread) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  insert into public.thread_participants (thread_id, user_id, read_at)
  values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set read_at = now();
end $$;

revoke all on function public.mark_thread_read(uuid) from public;
grant execute on function public.mark_thread_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. What is unread
--
-- A thread counts as unread when it has a message the caller has not seen
-- and did not write. Internal notes are excluded for anyone who is not
-- staff, so a member is never told about a conversation they cannot read.
-- ---------------------------------------------------------------------
create or replace function public.my_unread_threads()
returns table (thread_id uuid, unread int, last_message_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select t.id,
         count(m.id)::int,
         t.last_message_at
    from public.message_threads t
    join public.messages m on m.thread_id = t.id
    left join public.thread_participants tp
           on tp.thread_id = t.id and tp.user_id = auth.uid()
   where m.sender_id is distinct from auth.uid()
     and (not m.internal or app.is_staff())
     and (tp.read_at is null or m.created_at > tp.read_at)
   group by t.id, t.last_message_at
   having count(m.id) > 0;
$$;

revoke all on function public.my_unread_threads() from public;
grant execute on function public.my_unread_threads() to authenticated;

comment on function public.my_unread_threads is
  'Threads with messages the caller has not read and did not send. Internal notes excluded for non-staff.';
