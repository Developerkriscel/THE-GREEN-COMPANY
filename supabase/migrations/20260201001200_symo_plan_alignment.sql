-- =====================================================================
-- Align the rank ladder with the authoritative Symo City plan deck
-- (symocity.com.pptx, 12 slides, supplied 2026-09-24).
--
-- The ladder was originally seeded from the earlier ROYAL SYMO CITY deck
-- and carried the previous brand's rank names. Slides 5-10 of the new deck
-- are the company's own numbers, so they win. What was already right is
-- left alone and listed here so the next reader does not re-check it:
--
--   own_sale_rate   5,7,9,11,13,14,15,16,17,18,19,20  (slide 5)  - correct
--   override_pct    2% for seniority 2-5, 1% for 6-12  (slide 6)  - correct
--   req_direct      3 throughout                       (slide 10) - correct
--   req_team        9,18,27,...,90,100                 (slide 10) - correct
--   req_rank_*      1/2/3 Manager then 1/2/3/10/20/30 Deputy
--                   Manager, 50 Core Manager for Crown (slide 10) - correct
--   req_legs        2,5,7,10 for seniority 9-12        (slide 10) - correct
--
-- What was wrong is corrected below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rank names (slides 5-10)
--
-- Every rank from seniority 2 upward shifted by one against the deck: our
-- "Core Manager" sat at seniority 8 where the deck has Vice President, and
-- the deck's Core Manager is seniority 9. Since a member sees this name on
-- their dashboard and ID card, the deck's names are adopted verbatim.
--
-- `ranks.name` is unique, so the rename runs in two passes: park every name
-- under a temporary value, then set the final one. A single pass would
-- collide the moment "Manager" moved from seniority 2 to seniority 3.
-- ---------------------------------------------------------------------
update public.ranks set name = '~tmp~' || seniority::text;

update public.ranks set name = v.name
  from (values
    (1,  'Channel Partner'),
    (2,  'Team Coordinator'),
    (3,  'Manager'),
    (4,  'Deputy Manager'),
    (5,  'AGM'),
    (6,  'DGM'),
    (7,  'GM'),
    (8,  'Vice President'),
    (9,  'Core Manager'),
    (10, 'Sales Country Head'),
    (11, 'Diamond'),
    (12, 'Crown')
  ) as v(seniority, name)
 where public.ranks.seniority = v.seniority;

-- ---------------------------------------------------------------------
-- 2. Monthly salary (slide 8)
--
-- This was the costly one. The ladder paid 30,000 where the plan says
-- 5,000, and 150,000 where it says 100,000 -- credit_monthly_salary()
-- reads ranks.salary directly, so every run over-credited. Ranks below
-- AGM draw no salary at all; the deck leaves those cells blank.
-- ---------------------------------------------------------------------
update public.ranks set salary = v.salary
  from (values
    (1, 0), (2, 0), (3, 0), (4, 0),
    (5,   1000),   -- AGM
    (6,   2000),   -- DGM
    (7,   5000),   -- GM
    (8,   9000),   -- Vice President
    (9,  12000),   -- Core Manager
    (10, 15000),   -- Sales Country Head
    (11, 20000),   -- Diamond
    (12, 100000)   -- Crown
  ) as v(seniority, salary)
 where public.ranks.seniority = v.seniority;

-- ---------------------------------------------------------------------
-- 3. Joining fee and training fee (slide 9)
--
-- Seniority 6 and 7 both carried 5,100, copied down from AGM. The deck
-- steps them to 11,000 and 21,000. The first four ranks join free but pay
-- a 3,000 training fee; from AGM up the training is free instead.
-- ---------------------------------------------------------------------
alter table public.ranks
  add column if not exists training_fee numeric(14,2) not null default 0;

comment on column public.ranks.training_fee is
  'One-off training fee at joining (slide 9). Charged on the free-joining ranks; waived from AGM up.';

update public.ranks set joining_fee = v.joining, training_fee = v.training
  from (values
    (1,       0, 3000),
    (2,       0, 3000),
    (3,       0, 3000),
    (4,       0, 3000),
    (5,    5100,    0),
    (6,   11000,    0),
    (7,   21000,    0),
    (8,  100000,    0),
    (9,  200000,    0),
    (10, 300000,    0),
    (11, 400000,    0),
    (12, 500000,    0)
  ) as v(seniority, joining, training)
 where public.ranks.seniority = v.seniority;

-- ---------------------------------------------------------------------
-- 4. Reward tiers (slide 7)
--
-- The car tiers were shifted up by one rank. The deck gives the same
-- 7-lakh car at BOTH Core Manager and Sales Country Head (1300 sq yd each),
-- which pushed Brezza and Ertiga down a rung in our copy and invented a
-- Fortuner tier at 7000 sq yd that the plan does not contain.
-- ---------------------------------------------------------------------
update public.ranks set reward_title = v.title, reward_sqyd = v.sqyd
  from (values
    (1,  null,                   0),
    (2,  'Juicer',             100),
    (3,  'Mixer Grinder',      100),
    (4,  'Mobile phone',       100),
    (5,  'Mobile phone',       200),
    (6,  'Mobile phone',       300),
    (7,  'Mobile phone',       400),
    (8,  'Laptop',             500),
    (9,  'Car (₹7 lakh)',     1300),
    (10, 'Car (₹7 lakh)',     1300),
    (11, 'Car — Brezza',      1800),
    (12, 'Car — Ertiga',      2500)
  ) as v(seniority, title, sqyd)
 where public.ranks.seniority = v.seniority;

-- ---------------------------------------------------------------------
-- 5. The chosen plan (slide 5: "Rank select choice only one time")
--
-- A member picks a rank slab once, when they join, and pays that rank's
-- joining fee. That purchased slab is their PLAN. It is distinct from the
-- rank they have since QUALIFIED for by performance (slide 10), which is
-- what `rank_id` already tracks and what recalculate_rank() promotes.
--
-- This is why the reference panel shows "Current plan: Crown" beside
-- "Current rank: Unranked" -- bought the top slab, not yet qualified.
--
-- Set once, by the office, at joining: there is no member-facing write
-- path, and profiles_guard already refuses member edits to their own row.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan_rank_id uuid references public.ranks(id) on delete set null,
  add column if not exists plan_chosen_at timestamptz;

comment on column public.profiles.plan_rank_id is
  'The rank slab the member purchased at joining -- their plan. Chosen once (slide 5). Distinct from rank_id, which is the rank they have qualified for.';

create index if not exists profiles_plan_rank_idx on public.profiles (plan_rank_id);

-- Existing members have no recorded choice. Their current rank is the best
-- evidence of the slab they bought, so seed it there rather than leaving the
-- panel showing a dash for everyone.
update public.profiles
   set plan_rank_id = rank_id,
       plan_chosen_at = coalesce(plan_chosen_at, created_at)
 where plan_rank_id is null and rank_id is not null;

-- ---------------------------------------------------------------------
-- 6. Reward qualification needs 50% collected (slide 7)
--
--   "Reward Count After 50% payment"
--
-- Area only counts toward a reward tier once at least half the sale value
-- has actually been received. A confirmed booking with nothing paid against
-- it earns no reward progress, which is the whole point of the rule.
--
-- Exposed as a function so the panel and any report agree on one definition.
-- Security definer because a member cannot read public.payments directly for
-- a booking they do not own -- but they may always read their own totals.
-- ---------------------------------------------------------------------
create or replace function public.my_reward_area(p_member uuid default auth.uid())
returns numeric
language sql stable security definer set search_path = public, app as $$
  select coalesce(sum(
           case
             when p.size_unit = 'sqyd' then p.size
             else p.size          -- other units are stored already normalised
           end), 0)
    from public.bookings b
    join public.plots p on p.id = b.plot_id
   where b.rep_id = p_member
     and b.status = 'confirmed'
     and b.deleted_at is null
     -- at least half the sale value received
     and coalesce((select sum(pay.amount) from public.payments pay
                    where pay.booking_id = b.id), 0)
         >= coalesce(b.sale_value, 0) * 0.5
     -- a member may only ever ask about themselves
     and (p_member = auth.uid() or app.is_admin());
$$;

revoke all on function public.my_reward_area(uuid) from public;
grant execute on function public.my_reward_area(uuid) to authenticated;

comment on function public.my_reward_area(uuid) is
  'Sq yd counting toward reward tiers: confirmed sales with >= 50% of the sale value collected (slide 7).';
