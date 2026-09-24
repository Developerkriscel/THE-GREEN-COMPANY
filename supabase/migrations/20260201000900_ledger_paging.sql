-- =====================================================================
-- 4.1 — paginate the wallet, and stop deriving the running balance in the browser.
--
-- Every sponsor screen fetched the member's whole ledger, and the Wallet then
-- computed "balance after" by walking the array. That breaks the moment the
-- list is paginated — page 2 has no idea what came before it — and it will not
-- survive the 10,000-transaction target in the spec.
--
-- The balance is therefore computed server-side with a window function over the
-- member's full, correctly ordered ledger, and only then sliced. Page 2 shows
-- the same "balance after" it would on one long page.
-- =====================================================================

create or replace function public.my_ledger_page(
  p_limit  int default 25,
  p_offset int default 0,
  p_source text default null,
  p_from   timestamptz default null,
  p_to     timestamptz default null
)
returns table (
  id uuid, kind text, source text, reference text, note text,
  gross numeric, tds numeric, admin_charge numeric, net numeric,
  status text, level int, from_member_id uuid, from_member_name text,
  booking_id uuid, area_sqyd numeric, rate_applied numeric, in_kind boolean,
  created_at timestamptz, balance_after numeric, total_count bigint
)
language sql stable security definer set search_path = public, app as $$
  -- One statement, from both sources. A paid withdrawal is money that left the
  -- wallet, so it has to sit in the same ordered stream as the credits or the
  -- running balance would not be the wallet balance. Withdrawals are still not
  -- ledger rows — they are unioned for display only, never stored twice.
  with stream as (
    select l.id, l.kind, l.source, l.reference, l.note,
           l.gross, l.tds, l.admin_charge, l.net, l.status, l.level,
           l.from_member_id, l.booking_id, l.area_sqyd, l.rate_applied,
           l.in_kind, l.created_at
      from public.member_ledger l
     where l.member_id = auth.uid() and l.status = 'credited'
    union all
    select w.id, 'debit', 'withdrawal',
           coalesce(w.payout_reference, w.utr),
           'Withdrawal to ' || coalesce(w.account, 'your account'),
           0, 0, 0, w.amount, 'credited', null,
           null, null, null, null, false,
           coalesce(w.paid_at, w.processed_at, w.requested_at)
      from public.withdrawals w
     where w.member_id = auth.uid() and w.status = 'paid'
  ), ordered as (
    select s.*,
           sum(case when s.kind = 'debit' then -s.net else s.net end)
             over (order by s.created_at, s.id
                   rows between unbounded preceding and current row) as running
      from stream s
  ), filtered as (
    select * from ordered
     where (p_source is null or source = p_source)
       and (p_from   is null or created_at >= p_from)
       and (p_to     is null or created_at <= p_to)
  )
  select f.id, f.kind, f.source, f.reference, f.note,
         f.gross, f.tds, f.admin_charge, f.net,
         f.status, f.level, f.from_member_id, p.full_name,
         f.booking_id, f.area_sqyd, f.rate_applied, f.in_kind,
         f.created_at, f.running,
         count(*) over () as total_count
    from filtered f
    left join public.profiles p on p.id = f.from_member_id
   order by f.created_at desc, f.id desc
   limit greatest(1, least(coalesce(p_limit, 25), 200))
  offset greatest(0, coalesce(p_offset, 0))
$$;
grant execute on function public.my_ledger_page(int, int, text, timestamptz, timestamptz) to authenticated;

/** The member's own sales, paginated, newest first. */
create or replace function public.my_sales_page(
  p_limit int default 25, p_offset int default 0, p_status text default null
)
returns table (
  id uuid, reference text, status text, sale_value numeric,
  created_at timestamptz, confirmed_at timestamptz,
  plot_number text, plot_size numeric, project_name text,
  direct_net numeric, rate_applied numeric, total_count bigint
)
language sql stable security definer set search_path = public, app as $$
  select b.id, b.reference, b.status::text, b.sale_value,
         b.created_at, b.step3_at,
         pl.number, pl.size, pr.name,
         (select l.net from public.member_ledger l
           where l.booking_id = b.id and l.source = 'direct_income'
             and l.member_id = auth.uid() and l.status = 'credited' limit 1),
         (select l.rate_applied from public.member_ledger l
           where l.booking_id = b.id and l.source = 'direct_income'
             and l.member_id = auth.uid() limit 1),
         count(*) over ()
    from public.bookings b
    left join public.plots pl on pl.id = b.plot_id
    left join public.projects pr on pr.id = b.project_id
   where b.rep_id = auth.uid() and b.deleted_at is null
     and (p_status is null or b.status::text = p_status)
   order by b.created_at desc
   limit greatest(1, least(coalesce(p_limit, 25), 200))
  offset greatest(0, coalesce(p_offset, 0))
$$;
grant execute on function public.my_sales_page(int, int, text) to authenticated;
