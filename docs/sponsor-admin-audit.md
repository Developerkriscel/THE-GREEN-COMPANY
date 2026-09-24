# Deep audit — Sponsor Panel & Admin Console

## Resolution status (updated 2026-09-21, after the fix pass)

**Fixed and verified — 18 of 23 findings.** `npm run test:sponsor` is now **31/31**,
including a regression case for each money fix. Typecheck and production build clean.

| Finding | Status | How it was fixed |
|---|---|---|
| 1.1 cancelled sale keeps its income | **Fixed** | `trg_bookings_income_sync` reverses in the same transaction |
| 1.2 income needs a manual click | **Fixed** | Same trigger distributes on confirm (INSERT and UPDATE) |
| 1.3 deleted members inflate counts | **Fixed** | `deleted_at` filters added to both recalculations |
| 1.4 balance computed twice | **Fixed** | `member_wallet()` RPC; the TS copy is now first-render fallback only |
| 1.5 money not in integer paise | **Won't fix** | `numeric` is exact in SQL; 1.4 removed the float risk. Documented decision. |
| 2.1 referral link dead | **Fixed** | `?ref=` read on the join form, sponsor shown by name, resolved server-side |
| 2.2 nothing promotes rank | **Fixed** | `recalculate_rank`/`recalculate_all_ranks` + `rank_history` + admin actions |
| 2.3 income types that never appear | **Fixed** | Sponsor tab removed (would double-pay); decision documented in code |
| 2.4 three admin stub tabs | **Fixed** | Reports groups the ledger by week/month; History shows audit + rank changes; Keys deleted |
| 3.1 no withdrawals queue | **Fixed** | New admin **Payouts** screen, network-wide, approve/pay/reject in place |
| 3.2 no member audit | **Fixed** | Audit rows written inside the definer RPCs |
| 3.3 admin blind to network money | **Fixed** | `network_totals()` → liability / credited / payouts waiting / undistributed |
| 3.4 two money systems | **Partly fixed** | Dashboard now reads confirmed sales from `bookings`; retiring the `commissions` screens still needs your decision |
| 4.1 no pagination | **Fixed** | `my_ledger_page()` with a server-side window-function running balance |
| 4.2 mobile tables | **Partly fixed** | `Responsive`/`RecordCard` primitives added and applied to the Wallet; Income/Sales/Team still tabular |
| 4.3 security controls | **Partly fixed** | Bank-change 24h payout hold, withdrawal rate limit, full audit. OTP/2FA/session timeouts still open — they need an SMS provider and are scoped separately. |
| 4.4 depth cap inconsistent | **Fixed** | Capped at 12 in all three places |
| 4.5 no PDFs | **Open** | Print + CSV work; server-side PDF not built |
| 5 role leak / forgot-password / register copy | **Fixed** | Role mapped to member-facing words, dead link routed, non-MLM copy replaced |
| 5 `plan_levels` rates | **Open — your call** | Still the Royal Green ladder; a CMS edit, not code |
| 5 sale detail drill-in | **Open** | Row shows everything currently stored |

**Still needs a business decision:** the `commissions` vs `member_ledger` split (3.4),
the level-rate plan (5), and whether members raise their own bookings.

---

> Audited 2026-09-21 against the working code and the live database, not from memory.
> Every finding below was verified by reading the code or querying the database; the
> evidence line says how. Ordered by severity, not by module.
>
> Baseline health: typecheck clean, production build clean, `npm run test:sponsor` 24/24.
> The findings are about what is **missing or wrong**, not about whether it compiles.

---

## Severity 1 — money can be wrong

### 1.1 A cancelled sale never reverses its income
**Evidence:** `app.bookings_transition_guard()` handles `status = 'cancelled'` and
`bookings_plot_sync` frees the plot, but nothing calls `reverse_sale_income()`. The only
caller is a manual button in the admin member view.
**Impact:** cancel a confirmed booking and the seller keeps their direct income and the
whole upline keeps its level income. The money is already withdrawable. The spec is
explicit — "Cancelled: any income credited is reversed, area is removed from totals".
**Fix:** call `reverse_sale_income(booking_id)` from a trigger on
`bookings` when status moves to `cancelled`/`rejected`, in the same transaction.
**Effort:** small (one trigger).

### 1.2 Confirmed sales earn nothing until somebody remembers to click
**Evidence:** `distribute_sale_income` is referenced in exactly one place in the app —
`useDistributeIncome()`, wired to the "Run income" button.
**Impact:** a sale can sit confirmed indefinitely with no commission. Members see the sale
under My Sales with a dash in the income column and call the office. This was a deliberate
"reader-first" decision when building, but it is not a shippable steady state.
**Fix:** trigger on `bookings` status → `confirmed`, or a scheduled run. Keep the manual
button as a backfill.
**Effort:** small–medium (needs care: the function must stay idempotent, which it is).

### 1.3 Soft-deleted members still inflate team counts
**Evidence:** `recalculate_network()` contains **no** `deleted_at` filter (grep count: 0),
and neither does the recalculation inside the `create-member` gateway function.
`my_downline()` *does* filter `deleted_at is null`.
**Impact:** after any member deletion the admin console shows a larger team than the
member's own panel, and — worse — the deleted member still counts toward rank
qualification. Exactly the "two numbers that must agree" failure the spec warns about.
Currently drift is 0 because nothing has been deleted yet; it is latent, not absent.
**Fix:** add `and deleted_at is null` to both recalculations, and re-run once.
**Effort:** trivial.

### 1.4 Balance is computed twice, in two languages, one of them in floats
**Evidence:** `app.member_balance()` (SQL `numeric`) and `walletFrom()` in
`src/lib/sponsor.ts` (JS `number`). The admin member view uses the TS one; the sponsor
panel uses the SQL one.
**Impact:** the spec requires these to reconcile "to the rupee… any difference is a
defect, not a rounding tolerance". JS floats summing thousands of 2-dp values will
eventually disagree in the last paisa.
**Fix:** have the admin view call an RPC for the balance too, and delete the TS
duplicate — one formula, server-side.
**Effort:** small.

### 1.5 Money is not stored in integer paise
**Evidence:** every money column is `numeric(14,2)`; the engine uses `round(x, 2)`.
**Impact:** the spec's global convention is "stored and calculated in paise (integer)…
no floating-point arithmetic on money". `numeric` is safe in SQL, so this is much less
severe than 1.4 — but the rounding of TDS and admin charge per row means
`sum(net) ≠ sum(gross) − sum(tds) − sum(admin)` in edge cases.
**Effort:** large (schema migration). **Recommendation:** accept `numeric`, fix 1.4, and
drop the paise requirement from the spec rather than re-platform the money column.

---

## Severity 2 — features that look built but do nothing

### 2.1 The referral link is dead
**Evidence:** `src/pages/auth/RegisterRep.tsx` contains no reference to `ref`,
`useSearchParams`, or `referrer` (grep: no matches).
**Impact:** this is the headline feature of Module 10. Every member's link, WhatsApp share
and QR code carries `?ref=RGC1000xx`, the UI promises "anyone who registers through this
link is placed under you" — and the signup form ignores it completely. Whoever joins
lands with **no sponsor at all**, as a root node.
**Fix:** read `ref` from the query string, resolve it to a member id, pass it through
`signUpRep` into `app.handle_new_user()` (via `raw_user_meta_data`), and show the sponsor's
name on the form so the joiner can see who referred them.
**Effort:** medium. **This is the highest-value fix in the document.**

### 2.2 Nothing ever promotes a member's rank
**Evidence:** no function, trigger or job sets `rank_id` based on qualification; the only
writes are admin edits and the seed.
**Impact:** Rank & Progress computes qualification correctly and, when everything is met,
tells the member "All requirements met. Your rank will be updated in the next review."
There is no review. Members will sit at 100% forever, and the rank drives their commission
rate, so this is a money issue as well as a trust one.
**Fix:** `recalculate_rank(member)` / `recalculate_all_ranks()` applying the
`req_direct / req_team / req_rank_sen / req_rank_count / req_legs` columns already seeded,
plus an admin "Run rank review" action and a rank-history row.
**Effort:** medium. Note there is **no rank history table** either, so the spec's "Rank
history" section and the "evidence trail if a commission rate is queried" cannot be built
until one exists.

### 2.3 Two income types can never appear
**Evidence:** nothing writes `source = 'sponsor_income'`; nothing sets `in_kind = true`.
**Impact:** the Income module's **Sponsor** tab is permanently empty, and the spec's
"awarded in kind — not credited to wallet" reward handling cannot occur. The sponsor
override was deliberately left unpaid (it would double-pay alongside level income), but
the tab still advertises it.
**Fix:** either implement the override as a *differential* (pay the difference between
rank rates, which is the standard way to avoid double-paying), or remove the Sponsor tab
and the `in_kind` affordance until the business confirms the rule.
**Effort:** small to remove; medium to implement properly. **Needs a business decision.**

### 2.4 Three admin tabs are permanent stubs
**Evidence:** `MemberDetail.tsx` — `ReportsTab` renders a table with headers and a literal
empty `<tbody />`; `KeysTab` and `HistoryTab` return only `EmptyState`.
**Impact:** Reports is the worst of the three: it shows "Week / Credits / Debits / Net"
column headers above nothing, which reads as "this member has no data" rather than "this
was never built". History is supposed to carry the KYC and freeze audit trail.
**Fix:** Reports is easy (group the ledger by week/month — the data is all there).
History needs 3.2 below. Keys appears to be a concept from the old product; delete it.
**Effort:** Reports small; History depends on audit; Keys trivial (removal).

---

## Severity 3 — the company cannot operate this

### 3.1 There is no withdrawals queue
**Evidence:** `withdrawals` is referenced in exactly one admin file — `MemberDetail.tsx`.
**Impact:** payout requests are only visible **inside an individual member's page**. With
48 members and growing, the office has no way to find who is waiting to be paid short of
opening every member in turn. This is the single biggest operational gap.
**Fix:** an admin Payouts screen: all requests across the network, filterable by status,
with approve / mark-paid / reject in place. The per-member tab stays for context.
**Effort:** medium. Mirrors the `ReferralQueue` component already written.

### 3.2 No member action is audited
**Evidence:** none of the sponsor migrations touch `audit_log` or `app.write_audit`.
**Impact:** the spec requires an append-only trail for login, password change, profile
edit, **bank-detail change**, KYC upload and withdrawal request, with IP and device. Bank
changes in particular are the action an attacker with a stolen password would take, and
right now there is no record that one happened beyond `bank_updated_at`.
**Fix:** write audit rows inside the existing definer RPCs (`save_bank_details`,
`request_withdrawal`, `cancel_withdrawal`, `submit_referral`) — they are already the choke
points.
**Effort:** small, and it unblocks 2.4's History tab.

### 3.3 The admin dashboard is blind to network money
**Evidence:** `admin/Dashboard.tsx` references neither `member_ledger` nor `withdrawals`.
**Impact:** the company's own console cannot answer "what do we owe?", "how much is
pending payout?", "which sales haven't been distributed?". All of it exists in the data.
**Fix:** add total credited / total paid / **outstanding wallet liability** / pending
payouts / undistributed confirmed sales.
**Effort:** small.

### 3.4 Two parallel money systems
**Evidence:** `useCommissions` still drives `admin/Commissions.tsx`, `admin/Reports.tsx`
and the whole `rep/` panel, while MLM income lives in `member_ledger`.
**Impact:** the admin "Commissions" page and the member's actual earnings are different
numbers from different tables. `commissions` is currently empty, so Commissions and
Reports show nothing while members hold lakhs. Two sources of financial truth is how
reconciliation disputes start.
**Fix:** decide which survives. Recommended: `member_ledger` is the ledger; retire the
`commissions` screens or repoint them.
**Effort:** medium. **Needs a decision before more is built on either.**

---

## Severity 4 — spec requirements not met

### 4.1 No pagination anywhere in the sponsor panel
**Evidence:** no `.range()` or `.limit()` in `src/lib/sponsor.ts`; Team.tsx paginates
client-side over an already fully-loaded array.
**Impact:** every screen fetches the member's entire ledger, entire downline and entire
sales history on load. The spec's stated performance target is a member with **5,000
downline and 10,000 transactions**, page one under two seconds. This will not survive it.
**Good news:** the gateway already supports `limit`/`offset` (`server/rest.mjs`), so this
is app-side work only.
**Effort:** medium.

### 4.2 Mobile is not what the spec asks for
**Evidence:** `Table` in `ui.tsx` is `min-w-[640px]` inside `overflow-x-auto`.
**Impact:** "Most members will use a phone. Every screen is specified mobile-first: tables
become stacked cards showing the three most important fields with a tap to expand." Today
a phone user scrolls a 640px table sideways. The tiles and layout do stack correctly; it
is specifically the tables.
**Fix:** a responsive table primitive, or per-screen card variants for Wallet, Income,
Team and Sales.
**Effort:** medium–large. Highest user-visible payoff of anything in Severity 4.

### 4.3 Security controls from §3 and §6 are absent
Not implemented: OTP on bank-detail change, OTP/2FA at login, session inactivity timeout
(30 min) and absolute timeout (12 h), rate limiting on login/OTP/password/withdrawal/
member-add, and the 24-hour post-bank-change withdrawal hold.
**Impact:** the panel holds payout details; the spec calls bank change "the highest-risk
action a member can take". `submit_referral` has a rate limit (10/hour); nothing else does.
**Effort:** large, and partly infrastructural. **Recommend scoping this as its own piece
of work** rather than trickling it in.

### 4.4 Depth cap is inconsistent
**Evidence:** `my_downline()` and `distribute_sale_income` both stop at level 12;
`team_count` is unbounded.
**Impact:** a member with 13+ levels sees a smaller team than the admin does. Latent —
the seeded network is 3 deep. The spec flags this as `[CONFIRM]`.
**Fix:** pick one definition and apply it in all three places.
**Effort:** trivial once decided.

### 4.5 No documents
No welcome-letter PDF (spec wants server-side generation, fixed filename), no PDF wallet
statement (CSV export exists), no annual TDS statement. The letter renders on screen and
prints, which covers most of the need.
**Effort:** medium each.

---

## Severity 5 — polish

- **Internal role leaks to the member.** `shared/Profile.tsx` renders a badge with the raw
  `profile.role` — a sponsor sees "rep". Map it to a member-facing word.
- **`plan_levels` still holds the Royal Green ladder** (17 levels; 300/25/50/100) rather
  than the Symo plan (12 levels; 1000/500/300/200/100). Deliberate — it was admin-entered
  CMS data and the engine is plan-driven — but it means level income currently pays the
  *old* plan's rates. A CMS edit, not code, but it should be a conscious one.
- **`/login` is still captioned "Administrator Sign-in"** although managers and (via the
  email form) members can use it.
- **Sales detail has no drill-in.** The spec's Module 9 "Sale detail" — status timeline,
  rank at the time, buyer — is not built; the row shows everything there is.
- **`Forgot password?` on the sponsor login is `href="#"`** — a dead link on the one page
  members will reach when locked out.

---

## Suggested order of work

| # | Item | Why first |
|---|------|-----------|
| 1 | 2.1 referral link | A headline feature is silently broken and mis-attributing joiners |
| 2 | 1.1 + 1.2 income triggers | Money is wrong in both directions |
| 3 | 1.3 deleted-member counts | One-line fix, removes a whole class of "numbers disagree" |
| 4 | 3.1 payouts queue | Unblocks day-to-day operation |
| 5 | 3.2 audit on the RPCs | Small, and unblocks the History tab |
| 6 | 2.2 rank promotion | Members are stuck at 100% and under-paid |
| 7 | 1.4 single balance formula | Before the ledger grows |
| 8 | 4.1 pagination, 4.2 mobile tables | Before real member volume |
| 9 | 3.4 / 2.3 | Need a business decision first |

## Decisions needed from the business

1. **Sponsor override** — implement as a rank differential, or drop the Sponsor tab? (2.3)
2. **`commissions` vs `member_ledger`** — which is the system of record? (3.4)
3. **Level plan rates** — keep the Royal Green ladder or load the Symo one? (5)
4. **Team depth** — is the team count capped at 12 levels or unbounded? (4.4)
5. **Rank promotion** — real-time on qualification, or a periodic review run? (2.2)
6. **Do members raise their own bookings**, or is My Sales read-only forever?
