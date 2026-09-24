-- =====================================================================
-- Rank: promote automatically.  Rewards: record what was actually given.
--
-- RANK — the ladder was inert. `recalculate_rank()` is admin-gated and was
-- only ever called from two buttons in the admin panel, so nothing promoted
-- anyone when the thing that decides a rank actually changed: the team.
-- `rank_history` had 0 rows across 46 ranked members.
--
-- That is not cosmetic. `distribute_sale_income()` pays direct income at the
-- seller's CURRENT rank percentage, so a member who had qualified for
-- Manager (9%) but had not been recalculated was still being paid at Channel
-- Partner (5%) on every sale. The office had to remember to click, forever.
--
-- REWARDS — a member could earn a tier and the panel would say "the office
-- will contact you about delivery", but nothing recorded whether it ever
-- arrived. There was no way to answer "did we give this member their Juicer?"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Promotion without an administrator in the loop
--
-- Same rule as recalculate_rank -- promotion only, never a demotion -- but
-- callable by the database itself. Losing a rank stays a human decision.
-- ---------------------------------------------------------------------
create or replace function app.promote_if_qualified(p_member uuid, p_reason text default 'Automatic rank review')
returns text
language plpgsql security definer set search_path = public, app as $$
declare v_new uuid; v_old uuid; v_old_sen int; v_new_sen int; v_name text;
begin
  select rank_id into v_old from public.profiles
   where id = p_member and deleted_at is null and status = 'active';
  if not found then return null; end if;

  v_new := app.qualified_rank(p_member);
  if v_new is null then return null; end if;

  select seniority into v_old_sen from public.ranks where id = v_old;
  select seniority, name into v_new_sen, v_name from public.ranks where id = v_new;

  if coalesce(v_new_sen, 0) <= coalesce(v_old_sen, 0) then return null; end if;

  update public.profiles set rank_id = v_new where id = p_member;

  insert into public.rank_history (member_id, from_rank, to_rank, reason, changed_by)
  values (p_member, v_old, v_new, p_reason, auth.uid());

  -- A promotion changes what a member earns on every future sale, so they
  -- are told rather than left to notice.
  insert into public.notifications (user_id, type, title, body, link)
  values (p_member, 'rank', 'You have been promoted to ' || v_name,
          'Your team now qualifies you for ' || v_name ||
          '. Your own-sale percentage goes up from your next verified sale.',
          '/sponsor/rank');

  return v_name;
end $$;

-- ---------------------------------------------------------------------
-- 2. Walk the sponsor chain
--
-- Qualification depends on directs, group size, how many in the team hold a
-- given rank, and legs -- all of which move when somebody JOINS below. So a
-- join re-checks the whole chain above the joiner, nearest sponsor first.
-- Working upward in that order means a sponsor who is promoted is already
-- promoted when their own sponsor is evaluated, so the cascade resolves in
-- one pass.
--
-- Bounded at 12, matching level income and my_downline(): beyond that the
-- plan pays nothing and nothing qualifies.
-- ---------------------------------------------------------------------
create or replace function app.rank_sync_chain(p_from uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_at   uuid := p_from;
  v_next uuid;
  i      int  := 0;
  v_done int  := 0;
begin
  -- Re-entrancy guard: promoting somebody fires the rank_id trigger, which
  -- would start another walk from inside this one. Transaction-local, so it
  -- clears itself however this statement ends.
  if coalesce(current_setting('app.rank_sync', true), '') = '1' then
    return 0;
  end if;
  perform set_config('app.rank_sync', '1', true);

  while v_at is not null and i < 12 loop
    if app.promote_if_qualified(v_at) is not null then
      v_done := v_done + 1;
    end if;
    select referrer_id into v_next from public.profiles where id = v_at;
    v_at := v_next;
    i := i + 1;
  end loop;

  perform set_config('app.rank_sync', '0', true);
  return v_done;
end $$;

create or replace function app.profiles_rank_sync() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    if new.referrer_id is not null then
      perform app.rank_sync_chain(new.referrer_id);
    end if;
  else
    -- A move re-checks the chain it LEFT as well as the one it joined: both
    -- change group size, legs and qualified-member counts.
    if new.referrer_id is distinct from old.referrer_id and old.referrer_id is not null then
      perform app.rank_sync_chain(old.referrer_id);
    end if;
    if new.referrer_id is not null
       and (new.rank_id is distinct from old.rank_id
            or new.referrer_id is distinct from old.referrer_id
            or new.status is distinct from old.status
            or new.deleted_at is distinct from old.deleted_at) then
      perform app.rank_sync_chain(new.referrer_id);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_profiles_rank_sync on public.profiles;
create trigger trg_profiles_rank_sync
  after insert or update of rank_id, status, deleted_at, referrer_id on public.profiles
  for each row execute function app.profiles_rank_sync();

-- ---------------------------------------------------------------------
-- 3. Rewards actually given
--
-- A reward is goods, not money, so it is recorded as an in_kind ledger row:
-- `app.member_balance` and `isCounted()` both exclude in_kind, which keeps it
-- out of the wallet while still showing on the member's Income statement.
--
-- One row per member per rank tier -- the unique index makes issuing the same
-- Juicer twice impossible even if two people click at once.
-- ---------------------------------------------------------------------
create unique index if not exists member_ledger_reward_once
  on public.member_ledger (member_id, reference)
  where source = 'reward';

create or replace function public.award_reward(
  p_member uuid,
  p_rank   uuid,
  p_note   text default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_id    uuid;
  v_title text;
  v_sqyd  numeric;
  v_ref   text;
begin
  if not app.is_admin() then
    raise exception 'Only the office can issue a reward' using errcode = '42501';
  end if;

  select reward_title, reward_sqyd into v_title, v_sqyd
    from public.ranks where id = p_rank;
  if v_title is null then
    raise exception 'That rank has no reward attached' using errcode = '23514';
  end if;

  -- The reference is what makes it idempotent, and what the member sees.
  v_ref := 'REWARD-' || replace(upper(v_title), ' ', '-') || '-' || v_sqyd::int::text;

  if exists (
    select 1 from public.member_ledger
     where member_id = p_member and source = 'reward' and reference = v_ref
  ) then
    raise exception 'That reward has already been issued to this member' using errcode = '23505';
  end if;

  insert into public.member_ledger
    (member_id, kind, source, reference, gross, tds, admin_charge, net, amount,
     in_kind, area_sqyd, note)
  values
    (p_member, 'credit', 'reward', v_ref, 0, 0, 0, 0, 0,
     true, v_sqyd, coalesce(nullif(trim(p_note), ''), v_title || ' issued'))
  returning id into v_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (p_member, 'reward', 'Your ' || v_title || ' has been issued',
          'The office has issued your ' || v_title || ' reward. It is recorded on your Income statement as awarded in kind.',
          '/sponsor/rewards');

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, summary, after)
  values (auth.uid(), 'admin', 'insert', 'member_ledger', v_id::text,
          format('Issued reward: %s', v_title),
          jsonb_build_object('member_id', p_member, 'reward', v_title, 'sqyd', v_sqyd));

  return v_id;
end $$;

revoke all on function public.award_reward(uuid, uuid, text) from public;
grant execute on function public.award_reward(uuid, uuid, text) to authenticated;

comment on function public.award_reward is
  'Office records that a reward tier has been physically issued. Written in_kind so it never touches the wallet.';

-- What a member has actually been given, for their Rewards screen.
create or replace function public.my_issued_rewards(p_member uuid default auth.uid())
returns table (reference text, note text, area_sqyd numeric, issued_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select l.reference, l.note, l.area_sqyd, l.created_at
    from public.member_ledger l
   where l.member_id = p_member
     and l.source = 'reward'
     and l.in_kind
     and (p_member = auth.uid() or app.is_admin())
   order by l.created_at desc;
$$;

revoke all on function public.my_issued_rewards(uuid) from public;
grant execute on function public.my_issued_rewards(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. KYC notification pointed at a panel that no longer exists
--
-- app.kyc_guard() linked the member to `/app/profile`. The rep panel was
-- retired on 2026-09-24, so that path now redirects to the sponsor dashboard
-- and the member never reaches their KYC screen. It also said nothing useful
-- on approval, when the one thing they want to know is that withdrawals are
-- open.
-- ---------------------------------------------------------------------
create or replace function app.kyc_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
      insert into public.notifications (user_id, type, title, body, link)
      values (
        new.user_id, 'kyc',
        case new.status
          when 'verified' then 'KYC verified'
          when 'rejected' then 'KYC could not be verified'
          else 'KYC ' || new.status
        end,
        case new.status
          when 'verified' then 'Your documents are approved. Withdrawals are now open.'
          when 'rejected' then coalesce(nullif(trim(new.reject_reason), ''),
                                        'Please check your documents and submit again.')
          else coalesce(new.reject_reason, 'Your KYC status has been updated.')
        end,
        '/sponsor/kyc'
      );
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an administrator can change KYC status' using errcode='42501';
  end if;
  if old.status = 'verified' then
    raise exception 'Verified KYC cannot be edited' using errcode='42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Catch up
--
-- Nobody has ever been through a rank review, so run one now across the
-- whole network, deepest members first so a promotion counts toward the
-- sponsor above them in the same pass.
-- ---------------------------------------------------------------------
do $$
declare r record; v_name text; n int := 0;
begin
  perform set_config('app.rank_sync', '1', true);   -- one pass, no cascades
  for r in
    select p.id from public.profiles p
     where p.role = 'rep' and p.status = 'active' and p.deleted_at is null
     order by p.team_count asc nulls first
  loop
    v_name := app.promote_if_qualified(r.id, 'Initial automatic rank review');
    if v_name is not null then n := n + 1; end if;
  end loop;
  perform set_config('app.rank_sync', '0', true);
  raise notice 'promoted % member(s) in the catch-up review', n;
end $$;
