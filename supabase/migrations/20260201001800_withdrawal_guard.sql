-- =====================================================================
-- Withdrawals: put the money rules on the server
--
-- `request_withdrawal()` is careful -- frozen check, KYC gate, bank lock,
-- one open request, rate limit, minimum, balance check. Everything AFTER
-- that was client-side only. `withdrawals` had no triggers at all and no
-- constraint on `status`, which is a free-text column that the balance
-- formula keys off by exact string:
--
--   app.member_balance: withdrawn = status 'paid'
--                       pending   = status 'requested' | 'approved'
--
-- So a value the formula does not recognise counts as NEITHER. A typo such
-- as 'Paid' would leave the money in `available` after it had been sent --
-- the member could withdraw it a second time. Nothing stopped a paid
-- request being paid again, or moved back to 'requested'; the "a reason is
-- required when rejecting" rule lived in TypeScript, so a direct API call
-- could reject with silence; and `processed_by` was never written, so there
-- was no record of who released the money.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Only the five real statuses
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'withdrawals_status_check') then
    alter table public.withdrawals
      add constraint withdrawals_status_check
      check (status in ('requested', 'approved', 'paid', 'rejected', 'cancelled'));
  end if;
end $$;

comment on column public.withdrawals.status is
  'requested | approved | paid | rejected | cancelled. app.member_balance keys off these exact values, so the set is constrained.';

-- ---------------------------------------------------------------------
-- 2. Which moves are legal, and who may make them
--
--   requested -> approved | rejected   (office)
--   requested -> cancelled             (the member, via cancel_withdrawal)
--   approved  -> paid | rejected       (office)
--   paid / rejected / cancelled        terminal
--
-- Amount and member are frozen once the request exists: raising the amount
-- after approval would hand out money the balance check never saw.
-- ---------------------------------------------------------------------
create or replace function app.withdrawals_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_admin boolean := app.is_admin();
  v_mine  boolean := old.member_id = auth.uid();
begin
  if new.amount is distinct from old.amount then
    raise exception 'The amount of a withdrawal cannot be changed' using errcode = '23514';
  end if;
  if new.member_id is distinct from old.member_id then
    raise exception 'A withdrawal cannot be moved to another member' using errcode = '23514';
  end if;

  if new.status = old.status then
    -- Not a transition: only the office may edit a request's details, and
    -- only while it is still open.
    if not v_admin then
      raise exception 'Only the office can change a withdrawal' using errcode = '42501';
    end if;
    if old.status in ('paid', 'rejected', 'cancelled') then
      raise exception 'This withdrawal is closed and cannot be edited' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status in ('paid', 'rejected', 'cancelled') then
    raise exception 'This withdrawal is already %, it cannot be changed', old.status
      using errcode = '42501';
  end if;

  -- The member's own cancellation, which cancel_withdrawal() performs.
  if new.status = 'cancelled' then
    if not (v_mine or v_admin) then
      raise exception 'Only the member or the office can cancel this' using errcode = '42501';
    end if;
    if old.status <> 'requested' then
      raise exception 'A request being processed cannot be cancelled' using errcode = '42501';
    end if;
    new.processed_at := coalesce(new.processed_at, now());
    return new;
  end if;

  -- Everything else is an office decision.
  if not v_admin then
    raise exception 'Only the office can approve, reject or pay a withdrawal' using errcode = '42501';
  end if;

  if new.status = 'approved' then
    if old.status <> 'requested' then
      raise exception 'Only a new request can be approved' using errcode = '23514';
    end if;
    new.approved_at := coalesce(new.approved_at, now());

  elsif new.status = 'paid' then
    if old.status <> 'approved' then
      raise exception 'A withdrawal must be approved before it is paid' using errcode = '23514';
    end if;
    -- The terms require a company reference against every payment.
    if coalesce(nullif(trim(coalesce(new.payout_reference, '')), ''),
                nullif(trim(coalesce(new.utr, '')), '')) is null then
      raise exception 'A UTR or payout reference is required when marking a withdrawal paid'
        using errcode = '23514';
    end if;
    new.paid_at := coalesce(new.paid_at, now());

  elsif new.status = 'rejected' then
    -- This rule used to live only in the browser.
    if coalesce(trim(coalesce(new.reject_reason, '')), '') = '' then
      raise exception 'A reason is required when rejecting a withdrawal' using errcode = '23514';
    end if;

  else
    raise exception 'Illegal withdrawal transition % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  new.processed_at := coalesce(new.processed_at, now());
  new.processed_by := coalesce(new.processed_by, auth.uid());
  return new;
end $$;

drop trigger if exists trg_withdrawals_guard on public.withdrawals;
create trigger trg_withdrawals_guard
  before update on public.withdrawals
  for each row execute function app.withdrawals_guard();

-- ---------------------------------------------------------------------
-- 3. Tell the member
--
-- The panel has a Notifications module, but nothing ever told a member what
-- had happened to their own money -- the one thing they actually watch for.
-- ---------------------------------------------------------------------
create or replace function app.withdrawals_notify() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_title text;
  v_body  text;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'approved' then
    v_title := 'Withdrawal approved';
    v_body  := format('Your request for %s has been approved and is queued for payment.',
                      to_char(new.amount, 'FM₹99,99,99,990'));
  elsif new.status = 'paid' then
    v_title := 'Payment sent';
    v_body  := format('%s has been sent to your registered account. Reference: %s',
                      to_char(new.amount, 'FM₹99,99,99,990'),
                      coalesce(nullif(new.payout_reference, ''), new.utr, '—'));
  elsif new.status = 'rejected' then
    v_title := 'Withdrawal not approved';
    v_body  := format('Your request for %s was not approved. %s',
                      to_char(new.amount, 'FM₹99,99,99,990'),
                      coalesce(new.reject_reason, ''));
  else
    return new;   -- a member cancelling their own request needs no telling
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (new.member_id, 'withdrawal', v_title, v_body, '/sponsor/withdrawals');

  return new;
end $$;

drop trigger if exists trg_withdrawals_notify on public.withdrawals;
create trigger trg_withdrawals_notify
  after update of status on public.withdrawals
  for each row execute function app.withdrawals_notify();

-- ---------------------------------------------------------------------
-- 4. What the office is about to pay out
--
-- A batch total for the bank run, so the office can see the day's exposure
-- before releasing anything.
-- ---------------------------------------------------------------------
create or replace function public.payout_batch()
returns table (
  approved_count int, approved_amount numeric,
  requested_count int, requested_amount numeric,
  paid_today_count int, paid_today_amount numeric,
  blocked_no_kyc int
)
language sql stable security definer set search_path = public, app as $$
  select
    count(*) filter (where w.status = 'approved')::int,
    coalesce(sum(w.amount) filter (where w.status = 'approved'), 0),
    count(*) filter (where w.status = 'requested')::int,
    coalesce(sum(w.amount) filter (where w.status = 'requested'), 0),
    count(*) filter (where w.status = 'paid' and w.paid_at::date = current_date)::int,
    coalesce(sum(w.amount) filter (where w.status = 'paid' and w.paid_at::date = current_date), 0),
    count(*) filter (
      where w.status in ('requested', 'approved')
        and coalesce((select k.status::text from public.kyc k where k.user_id = w.member_id), '') <> 'verified'
    )::int
  from public.withdrawals w
  where app.is_admin();
$$;

revoke all on function public.payout_batch() from public;
grant execute on function public.payout_batch() to authenticated;

comment on function public.payout_batch is
  'Totals for the office payout run: approved and waiting, still to review, paid today, and how many are held by KYC.';
