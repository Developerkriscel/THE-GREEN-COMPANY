-- =====================================================================
-- Let a member actually contact the office.
--
-- message_threads had an INSERT policy, but nothing in the app ever created a
-- thread — threads only ever arrived from the public enquiry form. So the
-- Support screen was read-only: a member with a question about a payout had no
-- way to raise it from inside the panel.
--
-- Creating a thread correctly means three writes that must not come apart:
-- the thread, the member as a participant (without which threads_select_participant
-- hides their own thread from them), and the opening message. One RPC, one
-- transaction.
-- =====================================================================

create or replace function public.start_support_thread(
  p_subject text,
  p_body    text
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_me      uuid := auth.uid();
  v_id      uuid;
  v_subject text := nullif(trim(coalesce(p_subject, '')), '');
  v_body    text := nullif(trim(coalesce(p_body, '')), '');
  v_recent  int;
  v_status  text;
begin
  if v_me is null then
    raise exception 'You are not signed in' using errcode = '42501';
  end if;
  if v_subject is null then
    raise exception 'Please enter a subject.' using errcode = '22023';
  end if;
  if v_body is null then
    raise exception 'Please write your message.' using errcode = '22023';
  end if;

  -- An account on hold may still ask for help: this is how they reach the
  -- office about the hold itself. Only blocked/deleted accounts are refused.
  select status::text into v_status from public.profiles
   where id = v_me and deleted_at is null;
  if v_status is null then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;

  select count(*) into v_recent from public.message_threads
   where created_by = v_me and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Too many messages sent. Please try again later.' using errcode = '53400';
  end if;

  insert into public.message_threads (subject, kind, status, created_by, last_message_at)
  values (left(v_subject, 200), 'support', 'open', v_me, now())
  returning id into v_id;

  -- Without this row the author cannot read their own thread back.
  insert into public.thread_participants (thread_id, user_id, read_at)
  values (v_id, v_me, now())
  on conflict do nothing;

  insert into public.messages (thread_id, sender_id, body, internal)
  values (v_id, v_me, v_body, false);

  perform app.write_audit('insert', 'message_threads', v_id::text,
    'Support thread opened: ' || left(v_subject, 120), null, null);

  return v_id;
end $$;

grant execute on function public.start_support_thread(text, text) to authenticated;
