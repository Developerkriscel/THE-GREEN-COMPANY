# Sponsor Panel — Specification & Module Breakdown

> Member/distributor self-service portal for **Royal Symo Green City Pvt Ltd** (symocity.com).
> This is the member-facing counterpart to the admin console's `MemberDetail` view.
> Source of truth for the compensation plan: `ROYAL SYMO CITY.pptx` (decoded in §2).
>
> **Note vs `spec.md`:** the root `spec.md` describes the *single-level, non-MLM* real-estate platform
> and its scope guardrail explicitly excludes upline/downline income. The Sponsor Panel is the
> **MLM evolution** of that platform (the admin console was already rebuilt for it — see
> `.claude` memory `mlm-admin-panel`). Where the two conflict, this document governs the sponsor area only.

---

## 1. Purpose & context

### 1.1 What it is
The Sponsor Panel is the portal a **member/distributor ("sponsor")** logs into to:
- see their **wallet** and **income** (direct sale, level, sponsor override, salary, rewards),
- browse **their team** and **genealogy tree**,
- track **rank qualification** and **reward** progress,
- **request withdrawals**,
- **refer/sponsor** new members,
- manage **KYC, bank details, profile, password**.

It reads the same MLM schema the admin panel writes to (`profiles`, `member_ledger`, `withdrawals`,
`ranks`, `plan_ranks`, `plan_levels`, `rewards`), scoped to `auth.uid()`.

### 1.2 Decisions locked in
| Decision | Choice |
|----------|--------|
| Role model | **New `sponsor` role** + `/sponsor` area. Non-MLM `rep` panel stays intact; seeded members migrate to `sponsor`. |
| Income scope | **Reader-first** — panel reads `member_ledger` + network now; the income engine (`distribute_sale_income`) is a second pass. |
| Plan config | Rank *logic* stays keyed on `ranks.seniority` (1–12). All names / percentages / rewards are **CMS data** (`plan_ranks`, `plan_levels`, `rewards`), so the Symo numbers are configuration, not code. |

### 1.3 Existing building blocks (reuse, do not rebuild)
| Need | Source |
|------|--------|
| Tree building, `levelize`, `findNode`, `rankTone`, `statusTone` | `src/lib/network.ts` |
| Member list / denormalized counts | `useMembers()` |
| Tabbed detail + Income/Rank/Rewards/Team tab bodies | `src/pages/admin/MemberDetail.tsx` (extract shared) |
| Stat tiles, Card, Table, Badge, EmptyState, PageHeader, Spinner | `src/components/ui` |
| Rank/KYC/status badges | `src/components/status` |
| KYC, Welcome Letter, Profile, Change Password pages | `src/pages/shared/` |
| Money / pct / date / short formatters | `src/lib/format.ts` |
| Plan/reward CMS data hook | `useCmsContent('plan_ranks' | 'plan_levels' | 'rewards')` |
| App shell + nav | `src/components/layout/AppShell.tsx`, `src/App.tsx` |

---

## 2. Compensation plan (decoded from the PPTX)

Every panel number derives from these rules. Store the tunable values in the CMS tables noted.

### 2.1 Rank ladder (seniority 1 → 12)
`Junior Associate, Team Coordinator, Manager, Deputy Manager, AGM, DGM, GM, VP, Core Manager, Sales Country Head, Diamond, Crown`.

> ⚠️ The DB `ranks` table currently holds the *royalgreencompany.com* names
> (`Channel Partner … Crown`). Reconcile by keeping `seniority` and overwriting names to the Symo
> ladder (or treating Symo as a separate tenant driven purely from `plan_ranks`).

### 2.2 Direct-sale slab + sponsor override + reward (Slide 5) → `plan_ranks`
| Seniority | Rank | Direct % | Sponsor/level override | Reward (cumulative sqyd) |
|-----------|------|----------|------------------------|--------------------------|
| 1 | Junior Associate | 5% | (induction) | — (Reward 50% received) |
| 2 | Team Coordinator | 7% | 2% | Juicer / 100 sqyd |
| 3 | Manager | 9% | 2% | Mixer / 100 sqyd |
| 4 | Deputy Manager | 11% | 2% | Phone / 100 sqyd |
| 5 | AGM | 13% | 2% | Phone / 200 sqyd |
| 6 | DGM | 14% | 1% | Phone / 300 sqyd |
| 7 | GM | 15% | 1% | Phone / 400 sqyd |
| 8 | VP | 16% | 1% | Laptop / 500 sqyd |
| 9 | Core Manager | 17% | 1% | Car / 1300 sqyd (₹7 L) |
| 10 | Sales Country Head | 18% | 1% | Car 1800 sqyd (Brezza) |
| 11 | Diamond | 19% | 1% | Car 2500 sqyd (Ertiga) |
| 12 | Crown | 20% | 1% | Car 7000 sqyd (Fortuner) |

### 2.3 Level income per 100 sqyd (Slide 6) → `plan_levels`
| Level | Per 100 sqyd |
|-------|--------------|
| 1–6 | ₹1,000 |
| 7–8 | ₹500 |
| 9 | ₹300 |
| 10–11 | ₹200 |
| 12 | ₹100 |

### 2.4 Monthly salary (Slide 6) → `plan_ranks.salary`
GM ₹30,000 · VP ₹30,000 · Core Manager ₹50,000 · Sales Country Head ₹50,000 · Diamond ₹1,00,000 · Crown ₹1,50,000. (Ranks below GM: none.)

### 2.5 Joining / package & sponsor non-working income (Slide 7)
- Joining: free up to Deputy Manager; AGM–GM ₹5,100; VP ₹1,00,000; Core ₹2,00,000; Country Head ₹3,00,000; Diamond ₹4,00,000; Crown ₹5,00,000.
- Sponsor **non-working income**: ₹50,000 for VP and above.

### 2.6 Rank qualification (Slide 8) → `plan_ranks.condition`
| Rank | Direct | Group | Rank legs / qualified downline |
|------|--------|-------|--------------------------------|
| Channel Partner (entry) | — | — | qualify @ 5% |
| Team Coordinator | 3 | 9 | — |
| Manager | 3 | 18 | 1 Manager |
| Deputy Manager | 3 | 27 | 2 Manager |
| AGM | 3 | 36 | 3 Manager |
| DGM | 3 | 45 | 1 Deputy Manager |
| GM | 3 | 54 | 2 Deputy Manager |
| VP | 3 | 63 | 3 Deputy Manager |
| Core Manager | 3 | 72 | 10 Deputy Manager, 2 legs |
| Sales Country Head | 3 | 81 | 20 Deputy Manager, 5 legs |
| Diamond | 3 | 90 | 30 Deputy Manager, 7 legs |
| Crown | 3 | 100 | 50 Core Manager, 10 legs |

### 2.7 Deductions (Slide 9, T&C)
On **every income transaction**: **TDS 5%** + **Admin charge 3%**. Net credit = `gross × 0.92`.
Other T&C: payments per govt rules; valid only with company slip; only company projects count;
rate-below-floor responsibility sits above Team Manager; company decision final.

---

## 3. Role, routing & navigation

### 3.1 Role
- Add `sponsor` to the role enum; migrate seeded `@members.rgc.local` accounts from `rep` → `sponsor`.
- Members already carry `member_code`, `referrer_id`, `placement_parent_id`, `rank_id`.

### 3.2 Routing (in `src/App.tsx`)
```
<Route element={<RequireAuth roles={['sponsor']} />}>
  <Route path="/sponsor" element={<AppShell nav={sponsorNav} area="Sponsor" />}>
    index          → SponsorDashboard
    wallet         → SponsorWallet
    income         → SponsorIncome
    withdrawals    → SponsorWithdrawals
    team           → SponsorTeam
    tree           → SponsorTree
    rank           → SponsorRank
    rewards        → SponsorRewards
    sales          → SponsorSales
    refer          → SponsorRefer
    kyc            → KycPage (shared)
    welcome        → WelcomeLetterPage (shared)
    profile        → ProfilePage (shared, + bank details)
    password       → ChangePasswordPage (shared)
  </Route>
</Route>
```

### 3.3 Sidebar (`sponsorNav`)
Dashboard · My Wallet · Income · Withdrawals · My Team · Genealogy · Rank & Progress · Rewards ·
My Sales · Refer a Member · KYC · Welcome Letter · My Profile · Change Password.

---

## 4. Module breakdown

Each module: **Route · Purpose · Data source · Layout · Fields/columns · Actions · States/edge cases · Access · Reuse.**

### 4.1 Dashboard — `/sponsor`
- **Purpose:** at-a-glance health of the member's business.
- **Data:** `member_ledger` (balance, this-month income), `profiles.direct_count`/`team_count`, `profiles.rank`, `plan_ranks` (next-rank requirement).
- **Layout:** header (name, `member_code` as Sponsor ID, rank badge) → 5 stat tiles → 2-column panels.
- **Stat tiles:** Wallet balance · This-month net income · Direct members · Team size · Current rank + next-rank progress %.
- **Panels:** Recent income (last 6 ledger credits, net) · Team growth / newest downline · Alerts (KYC not verified, pending withdrawal, frozen account).
- **States:** frozen account → amber banner "Account frozen, contact admin"; empty ledger → "No income yet"; KYC unverified → CTA card (reuse rep dashboard pattern).
- **Access:** read own.
- **Reuse:** `StatTile`, `Card`, `CardHeader`, `EmptyState`, KYC CTA card from `rep/Dashboard.tsx`.

### 4.2 My Wallet — `/sponsor/wallet`
- **Purpose:** authoritative balance + full transaction history.
- **Data:** `member_ledger` (all rows for member).
- **Layout:** balance header (Available / Total credited / Total withdrawn / Pending withdrawal) → filter bar (source, date range, credit/debit) → ledger table.
- **Columns:** Date · Source (Direct/Level/Sponsor/Salary/Reward/Adjustment/Withdrawal) · Reference · Gross · TDS 5% · Admin 3% · **Net** · Note.
- **Actions:** "Withdraw" CTA → §4.4; export CSV (client-side).
- **States:** running balance must reconcile with sum of net credits − debits; debit rows (withdrawals) shown in red.
- **Access:** read own (`member_ledger: member reads own` RLS already exists).
- **Reuse:** `Table`, `Td/Th`, `money`, `moneyShort`, `date`.

### 4.3 Income — `/sponsor/income`
- **Purpose:** break income down by type so the member understands *why* they earned.
- **Data:** `member_ledger` grouped by `source`; `plan_levels` for the level ladder reference.
- **Layout:** sub-tabs — **Direct** · **Level** · **Sponsor override** · **Salary** · **Rewards**. Each sub-tab: summary tile (total net) + table.
- **Direct tab:** own-sale commission — Sale ref · Plot/sqyd · Slab % · Gross · Net.
- **Level tab:** per-100-sqyd payouts from downline — Level (1–12) · Source member · sqyd · Rate · Net; plus a reference card of the level ladder (§2.3).
- **Sponsor tab:** override/differential + non-working income.
- **Salary tab:** monthly rank salary credits (GM+).
- **Rewards tab:** reward payouts/gifts credited.
- **States:** each tab empty-state; totals footer per table.
- **Access:** read own.
- **Reuse:** the admin `MemberDetail` **Income** tab body (reads `plan_levels`) — extract to a shared `<IncomeTab member={...}/>`.

### 4.4 Withdrawals — `/sponsor/withdrawals`
- **Purpose:** request payouts and track their status.
- **Data:** `withdrawals` (member's rows).
- **Layout:** "Available to withdraw" tile → **Request form** (amount, payout account/UPI, note) → history table.
- **Form fields:** Amount (≤ available balance) · Payout account (from saved bank details) · Note.
- **History columns:** Requested date · Amount · Account/UTR · Status badge (`requested`/`approved`/`paid`/`rejected`) · Processed date.
- **Actions:** **submit request** (INSERT `withdrawals` with `status='requested'`).
- **Guards:** block if KYC unverified, account frozen, no bank details on file, or amount > available.
- **Access:** **write** — needs a new RLS INSERT policy (see §5.1); admin approves/pays in `MemberDetail` Withdrawals tab.
- **Reuse:** withdrawal form pattern from `MemberDetail.tsx` (admin add-withdrawal), but self-scoped.

### 4.5 My Team — `/sponsor/team`
- **Purpose:** level-by-level view of the downline.
- **Data:** scoped subtree from `network.ts` (`buildForest('sponsor')` → `findNode(me)` → `levelize`).
- **Layout:** summary tiles (Total team · Active · Directs) → per-level accordion.
- **Per level:** Level # · Headcount · Active count · Level-income earned from that level · member list (code, name, rank, status, join date).
- **States:** collapse levels beyond L1 by default; empty downline state.
- **Access:** read own subtree only (see §5.2 security).
- **Reuse:** `levelize`, admin `MemberDetail` **Team** tab body → shared `<TeamTab member={...}/>`.

### 4.6 Genealogy / Tree — `/sponsor/tree`
- **Purpose:** visual sponsor tree rooted at the member.
- **Data:** `buildForest(members, 'sponsor')` then root at `findNode(forest, myId)`.
- **Layout:** expandable node tree; each node shows code, name, rank badge, direct/team counts, status.
- **Actions:** expand/collapse; click node → member card (read-only summary, **not** admin detail).
- **States:** must **not** render upline or sibling branches — only the caller's subtree.
- **Access:** read own subtree only (§5.2).
- **Reuse:** admin `MemberTree`/`Genealogy` rendering, scoped to the subtree root.

### 4.7 Rank & Progress — `/sponsor/rank`
- **Purpose:** show current rank and exactly what's needed for the next.
- **Data:** `profiles.rank` (current), `ranks` by `seniority+1` (next), `plan_ranks.condition` (requirements), computed downline stats (directs, group size, qualified-rank counts, legs).
- **Layout:** current-rank hero card → next-rank requirement checklist with progress bars → full rank ladder table (§2.2, §2.6).
- **Progress rows:** Directs (`direct_count` / required) · Group (`team_count` / required) · Qualified downline ranks (e.g. "2 of 3 Managers") · Legs (n / required).
- **States:** at Crown → "Top rank achieved"; unmet items highlighted amber.
- **Access:** read own. Leg/qualified-rank counting needs the scoped subtree (or a helper RPC for accuracy).
- **Reuse:** admin `MemberDetail` **Rank** tab body (reads `plan_ranks`) → shared `<RankTab member={...}/>`.

### 4.8 Rewards — `/sponsor/rewards`
- **Purpose:** show reward tiers and the member's progress toward each gift.
- **Data:** `rewards` (CMS) vs. member cumulative sqyd sold (from `bookings`/`sales`, or a stored aggregate).
- **Layout:** reward cards (image, title, sqyd requirement) with earned/locked/in-progress state + progress bar.
- **States:** earned rewards badged; next reward highlighted.
- **Access:** read own.
- **Reuse:** admin `MemberDetail` **Rewards** tab body (reads `rewards`) → shared `<RewardsTab member={...}/>`.

### 4.9 My Sales / Plots — `/sponsor/sales`
- **Purpose:** the member's own plot sales that generate direct income + sqyd toward rewards.
- **Data:** `bookings`/`sales` where the member is the seller.
- **Layout:** summary tiles (confirmed sales, total sqyd, total value) → sales table.
- **Columns:** Reference · Project/Plot · sqyd · Sale value · Slab % · Direct income · Status.
- **Actions:** view detail (reuse `BookingDetail`); optionally "raise booking" if members sell directly.
- **Access:** read own.
- **Reuse:** `rep/Sales.tsx` list patterns.

### 4.10 Refer a Member — `/sponsor/refer`
- **Purpose:** grow the downline.
- **Data:** member's `member_code` → referral link `…/register?ref=RGC1000xx`.
- **Layout:** referral link card (copy/share) → optional self-serve "Add member under me" form.
- **Actions:** copy link; (optional) create member via the `create-member` gateway function with `referrer_id = me` (admin-gated today — decide if sponsors may self-enroll or only invite).
- **States:** show pending invites if tracked.
- **Access:** write via gateway function only; never direct `profiles` insert (guarded).

### 4.11 KYC — `/sponsor/kyc`
- **Purpose:** submit/track identity verification (gates withdrawals).
- **Reuse:** `src/pages/shared/Kyc.tsx` as-is.
- **Access:** member writes own KYC; admin verifies.

### 4.12 Welcome Letter — `/sponsor/welcome`
- **Purpose:** view the personalized welcome letter (`profiles.welcome_letter`, admin-authored).
- **Reuse:** `src/pages/shared/WelcomeLetter.tsx` (read-only for member).

### 4.13 My Profile / Bank details — `/sponsor/profile`
- **Purpose:** edit self-editable profile fields + **bank/payout details** for withdrawals.
- **Data:** `profiles` (self fields) + new payout fields (§5.1).
- **Fields:** name, phone, address, city/state/pin (self-editable); bank account, IFSC, UPI, PAN (self-editable, added to guard allow-list); **locked** fields shown read-only (member_code, rank, referrer, status).
- **Access:** self-update only; MLM wiring stays admin-only (`profiles_guard`).
- **Reuse:** `src/pages/shared/Profile.tsx` extended with a bank-details section.

### 4.14 Change Password — `/sponsor/password`
- **Reuse:** `src/pages/shared/ChangePassword.tsx` as-is (gateway `set-member-password` / self flow).

---

## 5. Data model changes required

### 5.1 Migration `20260201000500_sponsor_panel.sql`
1. **Role enum:** add `'sponsor'` to `app_role`; migrate seeded members.
   ```sql
   alter type app_role add value if not exists 'sponsor';
   update public.profiles set role = 'sponsor'
     where email like '%@members.rgc.local' and role = 'rep';
   ```
2. **Withdrawal request policy** (members currently cannot insert):
   ```sql
   create policy "withdrawals: member requests own" on public.withdrawals
     for insert with check ( member_id = (select auth.uid()) and status = 'requested' );
   ```
3. **Bank / payout fields** on `profiles`: `bank_account text, ifsc text, upi_id text, pan text` — and add them to the *self-editable* set so `profiles_guard` does **not** block them (they are currently unguarded, so allowed; confirm they aren't added to the guard list).
4. **Slab config columns** on `plan_ranks`: `salary numeric, joining_fee numeric, override_pct numeric, condition text` (or reuse existing `pct`/`features`/`joining`), so §2 values are CMS-driven.
5. **`my_downline()` RPC** (`security definer`) returning only the caller's subtree — powers Team/Tree/Rank without exposing the whole network via RLS (see §5.2).

> **GOTCHA (from project memory):** the gateway introspects the schema at startup. After adding
> tables/columns, **restart the gateway** or REST returns 404 for them. And every `site_settings`/CMS
> upsert must pass `{ onConflict: 'key' }`.

### 5.2 Genealogy access — security
A member must read downline profiles for Team/Tree but must **not** see the whole network.
- **Recommended:** `security definer` RPC `my_downline()` that walks `referrer_id` from `auth.uid()` and returns only the subtree (same pattern as `recalculate_member`). The panel calls this instead of `useMembers()` for the tree modules.
- Avoid a recursive `is_ancestor` predicate in `profiles` RLS (expensive per-row).

---

## 6. Income engine (Phase 2 — reader-first means panel ships before this)

The panel is a **reader** of `member_ledger`; income rows are produced by an admin-triggered engine.
- **RPC `distribute_sale_income(booking_id)`** (`security definer`, admin-gated): on a confirmed sale it
  1. credits the seller direct income = `gross × direct% (from plan_ranks by rank)`,
  2. walks the upline crediting **level income** (`plan_levels.rate × sqyd/100`) per level 1–12,
  3. credits **sponsor override / non-working income** to qualifying upline,
  4. applies **TDS 5% + admin 3%** to every credit (store `gross`, `tds`, `admin_charge`, `net`),
  5. inserts `member_ledger` rows with the right `source`.
- **Salary** (monthly, GM+) and **reward** credits: separate scheduled/admin actions.
- Until this exists, the panel works against **seeded** ledger rows.

---

## 7. Build phases

| Phase | Deliverable |
|-------|-------------|
| **1. Foundation** | Migration §5.1 (role, withdrawal policy, bank fields, `my_downline()`); `sponsorNav` + `/sponsor` routes/guard; seed `plan_ranks`/`plan_levels`/`rewards` with §2 numbers. |
| **2. Shared extraction** | Pull Income/Rank/Rewards/Team tab bodies out of `MemberDetail.tsx` into `member`-prop components used by both admin and sponsor. |
| **3. Reader modules** | Dashboard, Wallet, Income, Team, Tree, Rank, Rewards, Sales (all read-only over existing data). |
| **4. Write modules** | Withdrawals request, Refer, KYC, Profile/bank details. |
| **5. Income engine** | `distribute_sale_income` + salary/reward crediting; wire to sale confirmation. |
| **6. Verify** | Log in as a seeded member (`Member@123`), walk every module in the preview. |

---

## 8. Open items to confirm
1. **Rank ladder:** overwrite DB `ranks` names to the Symo ladder, or treat Symo as a separate tenant?
2. **Self-enrollment:** may sponsors create downline members themselves (via `create-member`), or invite-only?
3. **Do members sell plots directly** (needs booking-raise in §4.9), or is selling done by `rep` staff only and members earn purely on network?
4. **Joining/package purchase flow** (Slide 7 fees) — in scope for the panel, or admin-only onboarding?
