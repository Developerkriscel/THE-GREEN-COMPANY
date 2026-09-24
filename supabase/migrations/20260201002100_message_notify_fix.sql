-- =====================================================================
-- One message trigger, and two real bugs in the one that already existed
--
-- `app.messages_touch_thread()` has notified participants since the original
-- schema. Adding a second notifier in 20260201002000 meant every reply sent
-- two notifications, so the two are consolidated here into one trigger.
--
-- The pre-existing notifier had two defects that testing exposed:
--
-- 1. IT DID NOT SKIP INTERNAL NOTES. `messages.internal` marks a staff-only
--    note, and messages_select_participant hides those rows from a member --
--    but the notification was sent regardless, carrying the first 140
--    characters of the note in its body. A member could not open the note
--    and could read it in their notification feed. That is a leak.
--
-- 2. IT LINKED TO `/messages/<id>`, which is not a route. The panels live at
--    /sponsor/messages/:id and /admin/messages/:id, so the link dropped the
--    member on a redirect and lost the conversation.
-- =====================================================================

-- The consolidated trigger: touch the thread, keep participants honest, and
-- notify the people who are allowed to read what was written.
create or replace function app.messages_touch_thread() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_sender_name text;
  p             record;
begin
  update public.message_threads
     set last_message_at = new.created_at
   where id = new.thread_id;

  -- Writing in a thread joins it, and you have read what you just wrote.
  -- Without this a staff reply leaves the replier outside the participant
  -- list, so their unread state is wrong the moment the member answers.
  if new.sender_id is not null then
    insert into public.thread_participants (thread_id, user_id, read_at)
    values (new.thread_id, new.sender_id, new.created_at)
    on conflict (thread_id, user_id) do update set read_at = excluded.read_at;
  end if;

  -- An internal note is staff-only. It must not reach a member through a
  -- notification any more than it reaches them through the thread.
  if new.internal then
    return new;
  end if;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  for p in
    select distinct tp.user_id, pr.role
      from public.thread_participants tp
      join public.profiles pr on pr.id = tp.user_id
     where tp.thread_id = new.thread_id
       and tp.user_id is distinct from new.sender_id
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (
      p.user_id, 'message',
      'New reply from ' || coalesce(nullif(trim(v_sender_name), ''), 'the office'),
      left(new.body, 140) || case when length(new.body) > 140 then '…' else '' end,
      case when p.role = 'admin' then '/admin/messages/' else '/sponsor/messages/' end
        || new.thread_id::text
    );
  end loop;

  return new;
end $$;

-- The second trigger added in 20260201002000 is now redundant.
drop trigger if exists trg_messages_after_insert on public.messages;
drop function if exists app.messages_after_insert();

-- ---------------------------------------------------------------------
-- my_unread_threads() bypassed row security
--
-- A security definer function runs as its owner, so RLS on message_threads
-- did not apply and the count covered EVERY thread in the system -- a member
-- was told there were 23 conversations waiting, 22 of them website enquiries
-- from strangers they cannot open. The visibility rule has to be written out
-- explicitly, mirroring threads_select_participant / threads_select_admin.
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
   where
     -- the same reach threads_select_* grants, restated because definer
     -- rights skip the policies
     (
       app.is_admin()
       or t.created_by  = auth.uid()
       or t.customer_id = auth.uid()
       or t.assigned_to = auth.uid()
       or exists (select 1 from public.thread_participants x
                   where x.thread_id = t.id and x.user_id = auth.uid())
     )
     and m.sender_id is distinct from auth.uid()
     and (not m.internal or app.is_staff())
     and (tp.read_at is null or m.created_at > tp.read_at)
   group by t.id, t.last_message_at
   having count(m.id) > 0;
$$;

-- Same reasoning for marking a thread read: the existence check ran with
-- definer rights, so it accepted any thread id in the system.
create or replace function public.mark_thread_read(p_thread uuid)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.message_threads t
     where t.id = p_thread
       and (
         app.is_admin()
         or t.created_by  = auth.uid()
         or t.customer_id = auth.uid()
         or t.assigned_to = auth.uid()
         or exists (select 1 from public.thread_participants x
                     where x.thread_id = t.id and x.user_id = auth.uid())
       )
  ) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  insert into public.thread_participants (thread_id, user_id, read_at)
  values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set read_at = now();
end $$;
