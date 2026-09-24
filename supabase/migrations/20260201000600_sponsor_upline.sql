-- =====================================================================
-- Sponsor Panel — the one fact a member may know about their upline.
--
-- profiles' RLS deliberately stops a member reading anyone else's row, which
-- also blocks the `referrer:profiles(...)` embed — so the member panel showed
-- an em dash where their own sponsor's name belongs. The business rule is
-- "sponsor name only, nothing about their business", so this returns exactly
-- that and nothing else: no contact details, no rank, no counts, no earnings.
-- =====================================================================

create or replace function public.my_sponsor()
returns table (member_code text, full_name text)
language sql stable security definer set search_path = public, app as $$
  select s.member_code, s.full_name
    from public.profiles me
    join public.profiles s on s.id = me.referrer_id
   where me.id = auth.uid()
     and s.deleted_at is null
$$;

grant execute on function public.my_sponsor() to authenticated;
