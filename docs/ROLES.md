# Roles, Permissions & Access-Control Research
Royal Green — Real-Estate Sales & CRM Platform

This document is the authoritative analysis of *who can do what* in the platform. It expands
§3 of `spec.md` into an implementable model: role taxonomy, identity model, capability matrix,
per-table RLS strategy, workflow authority, and the edge cases that are easy to get wrong.

Everything here is enforced in Postgres (RLS) first, and mirrored in the UI second. The UI is a
convenience layer; the database is the security boundary.

---

## 1. Two orthogonal axes: **role** vs **rank**

The single most important structural decision in this spec is that authority and pay grade are
**separate dimensions**. Conflating them is exactly how a legitimate sales CRM drifts into a
multi-level scheme.

| Axis | Column | Values | Controls |
|---|---|---|---|
| **Access role** | `profiles.role` | `admin`, `manager`, `rep`, `customer` | What rows you can read/write, which approval step you own |
| **Rank / tier** | `profiles.rank_id` → `ranks` | Associate … Diamond (14 seeded rows) | Title/badge + the commission **rate on the rep's own sales only** |

Consequences that must hold everywhere:

- A rep promoted from *Associate* to *Country Head* gains **no new data access**. They still see
  only their own leads. Their own-sale rate changes from 7% to 22%. Nothing else.
- A `manager` (access role) is **not** the same as the *Manager* rank (seniority 2, 9%). A rep can
  hold the *Manager* rank and still have `role = 'rep'`. The UI must never render rank as if it
  granted authority.
- Rank is **admin-assigned on sales performance**. There is no purchase path, no joining fee, and
  no automatic promotion by recruitment count. `ranks` has no `sponsor_rate`, no `level_rate`, no
  `generation` column — by design. See §8.

### 1.1 The 14 seeded ranks

| # | Rank | Own-sale rate |
|---|---|---|
| 1 | Associate | 7% |
| 2 | Manager | 9% |
| 3 | Senior Manager | 11% |
| 4 | AGM | 13% |
| 5 | Team Coordinator | 14% |
| 6 | Area Team Coordinator | 15% |
| 7 | District Team Coordinator | 17% |
| 8 | Zonal Team Coordinator | 18% |
| 9 | State Team Coordinator | 19% |
| 10 | Regional Team Coordinator | 20% |
| 11 | National Team Coordinator | 21% |
| 12 | Country Head | 22% |
| 13 | WTC | 25% |
| 14 | Diamond / Crown Diamond | 30% |

Rate resolution order when a sale is confirmed:
`profiles.commission_rate` (per-rep admin override, nullable) → `ranks.own_sale_rate` → `0`.
The resolved rate is **snapshotted onto the commission row** (`rate_applied`) so later rank
changes never retroactively alter a historic payout.

---

## 2. Identity model

Four audiences, but only **two authentication surfaces**.

```
                    Supabase auth.users (one table, one uid)
                              |
                   profiles.id = auth.users.id
                              |
        +--------------+------+-------+--------------+
     admin          manager          rep          customer
   (staff login)  (staff login)  (staff login)  (User-ID login)
```

- **Staff** (`admin` / `manager` / `rep`) sign in with **email + password**, optional OTP.
- **Customers** sign in with a **User ID** issued at booking (e.g. `RG-2026-00417`), not an email.
  Implementation: the User ID is stored on `profiles.user_code` and mapped to a synthetic internal
  email (`<user_code>@customers.royalgreen.local`) inside Supabase Auth. The customer never sees or
  types that address — the login form takes the User ID, resolves it through a `SECURITY DEFINER`
  RPC that only returns the auth email for `role='customer'` rows, then completes the standard
  password sign-in. This keeps one auth system (one session, one JWT, one RLS predicate) while
  presenting two different front doors.
- `profiles` is created by an `on_auth_user_created` trigger. **Role is never taken from client
  metadata** — signup always lands as `rep` with `status='pending'`, or `customer` when created by
  the booking flow. Elevation to `manager`/`admin` is an admin-only `UPDATE`, blocked by RLS for
  everyone else and recorded in `audit_log`.

### 2.1 Account lifecycle / status

`profiles.status`: `pending` → `active` → `suspended` (and back to `active`).

| Situation | Resulting status | Who unblocks |
|---|---|---|
| Rep self-registers | `pending` (email confirmed but inactive) | Admin, or Manager if configured |
| Manager/Admin account requested | `pending` — **always** | Admin only, explicitly |
| Customer created at booking | `active` | — |
| Policy violation / offboarding | `suspended` | Admin |

RLS rule: **every** staff-facing policy ANDs in `status = 'active'`. A suspended rep holding a
valid JWT can still authenticate, but reads zero rows. This is deliberate — suspension must not
depend on token expiry.

### 2.2 JWT claims vs. table lookup

Role checks read from `profiles`, not from JWT app_metadata, via `SECURITY DEFINER STABLE` helper
functions (`app.current_role()`, `app.is_admin()`, `app.manages(uid)`). Reasons:

1. A suspension or demotion takes effect on the next query, not the next token refresh.
2. Claims in a JWT are only as trustworthy as the last mint; the table is the live source of truth.
3. `SECURITY DEFINER` avoids the classic recursive-RLS deadlock (a policy on `profiles` that needs
   to read `profiles`). The helpers bypass RLS, are marked `STABLE` so Postgres caches them per
   statement, and are `REVOKE`d from `PUBLIC` except for the specific wrappers the app calls.

---

## 3. Capability matrix (implementation-level)

Legend: OK full · R read-only · OWN own rows only · X denied.

| Capability | Admin | Manager | Rep | Customer | Anon |
|---|---|---|---|---|---|
| Browse public site, submit enquiry | OK | OK | OK | OK | OK |
| Read published projects/plots | OK | OK | OK | OK | R |
| Manage projects / plots / CMS | OK | X | X | X | X |
| Bulk-import plots | OK | X | X | X | X |
| Create / edit leads | OK all | R team | OWN | X | X |
| See lead mobile + remark + budget | OK | R team | OWN | X | X |
| Raise token / booking | OK | X | OWN | OWN initiate | X |
| Booking **Step 2** review tick | OK | OK (own reps) | X | X | X |
| Booking **Step 3** final approval | OK | X | X | X | X |
| Sale confirmation chain | same as booking | | | | |
| Verify KYC / EMI slip / registry | OK | X | X | X | X |
| Upload registry copy | OK | X | X | X | X |
| Upload EMI slip | OK | X | X | OWN | X |
| View commission | OK all | R team totals | OWN | X | X |
| Approve / mark-paid commission | OK | X | X | X | X |
| Configure commission rates / ranks | OK | X | X | X | X |
| Edit / delete records | OK (audited) | X | OWN **drafts** | X | X |
| Reports & CSV export | OK all | R team | OWN | X | X |
| Audit log | OK | X | X | X | X |
| Messaging threads | OK all | OK assigned | OWN | OWN | X |
| Staff management (create/approve/suspend) | OK | X | X | X | X |

### 3.1 Manager scope — precisely defined

A manager's reach is exactly `{ p.id : p.manager_id = auth.uid() AND p.role = 'rep' }`, computed
by `app.managed_rep_ids()`. Properties that must hold:

- **Read-only, always.** No manager policy appears in any `UPDATE`/`DELETE`/`INSERT` `WITH CHECK`
  except the single approval tick (`bookings.step2_*`, `sale_confirmations.step2_*`), which is a
  constrained column-level write enforced by a trigger, not a blanket update grant.
- **No cross-manager visibility.** Manager A cannot read Manager B's reps, and cannot read other
  managers' rows on `profiles` beyond name/role (needed for the assignment dropdown — served by a
  restricted view, not the base table).
- **No money.** There is no policy, view, or function that credits a manager from a rep's sale.
  A manager's commission read is an **aggregate** (`v_team_commission_totals`) for pipeline
  coordination; it never produces a payable row for the manager.
- **Manager reassignment** (`profiles.manager_id`) is admin-only and audited. Historical bookings
  keep the reviewer recorded at approval time — moving a rep to a new manager does not rewrite who
  approved what.

### 3.2 Rep isolation — the critical rule

> A lead and **all** its columns are visible only to the owning rep + Admin (+ that rep's Manager,
> read-only). Never to peers.

This is enforced at three layers:

1. **RLS** on `leads`: `owner_id = auth.uid() OR app.is_admin() OR owner_id = ANY(app.managed_rep_ids())`.
2. **No permissive views** that `SELECT` leads with `security_invoker = off`. Every reporting view
   is created `WITH (security_invoker = on)` so the caller's RLS still applies.
3. **Function hygiene**: no `SECURITY DEFINER` function returns lead rows without re-checking the
   caller. The only definer functions are the tiny role helpers and the audit writer.

The reason for belt-and-braces: PostgREST exposes tables *and* views *and* RPCs. A single
`SECURITY DEFINER` reporting function is enough to leak every rep's pipeline to every other rep.

### 3.3 Customer isolation

`customer_id = auth.uid()` on `bookings`, and everything downstream (`emis`, `documents`,
`payments`, `sale_confirmations`) joins back to a booking the customer owns via
`app.owns_booking(booking_id)`. A customer:

- never sees `commissions`, `leads`, `audit_log`, staff `profiles`, or any other customer;
- sees `plots`/`projects` only through the public read policy (published rows) or their own booking;
- can write `emis.slip_path` only for their own EMI rows, and can never set `status='paid'` —
  a trigger rejects any customer-initiated status transition other than
  `pending → awaiting_verification`.

---

## 4. Workflow authority (state machines)

### 4.1 Token / booking — 3 steps

```
 draft ──rep submits (T&C tick)──▶ step1_done
                                       │
                    reviewer (manager|admin) ticks
                            ├── approve ──▶ step2_approved
                            └── reject  ──▶ rejected  ──back to rep (with remark)
                                       │
                            admin final approval
                            ├── approve ──▶ confirmed   => plot = booked
                            └── reject  ──▶ rejected
```

Plot side-effects: `available → token` on Step 1, `token → booked` on final confirmation,
`→ available` on rejection or cancellation (released by trigger, never by client code).

Authority per transition, enforced by the `bookings_transition_guard` trigger + RLS:

| Transition | Who | Extra condition |
|---|---|---|
| `draft → step1_done` | owning rep (or admin) | `terms_accepted_rep = true` |
| customer-initiated draft | the customer on their own booking | `terms_accepted_customer = true` |
| `step1_done → step2_approved / rejected` | that rep's manager, or admin | remark required on reject |
| `step2_approved → confirmed / rejected` | admin only | — |
| any → `cancelled` | admin only | audited, releases plot |

A rep **cannot** approve their own Step 2 even if somehow assigned as reviewer —
`reviewer_id <> rep_id` is a table constraint.

### 4.2 Sale confirmation

Identical 3-step chain on `sale_confirmations`, gated on a `confirmed` booking. On admin
confirmation, a single transactional trigger fans out:

1. `commissions` row for `rep_id` — `status='accrued'`, `rate_applied` snapshotted (§1.1);
2. welcome letter + booking form queued for PDF generation;
3. EMI schedule materialised from the payment plan;
4. `notifications` + email to customer and rep;
5. `audit_log` entry.

### 4.3 EMI

```
pending ──customer uploads slip──▶ awaiting_verification ──admin verifies──▶ paid
   │                                        └── admin rejects ──▶ pending (with reason)
   └── due_date passed & unpaid ──(scheduled job)──▶ overdue
```

Only an admin moves anything to `paid`; only `paid` triggers receipt generation.

### 4.4 KYC

`pending → verified | rejected(reason)`. Admin-only transition. ID numbers are stored in a private
bucket, never rendered in list views, masked (`XXXX XXXX 1234`) when shown, and every read of a KYC
document writes an `audit_log` access row — not just writes.

### 4.5 Commission

`accrued → approved (admin) → paid (admin, with payout_reference)`. Reps read; never write.
Deductions (TDS, admin charge) are configurable rows applied at payout time and shown on the
statement, so the rep sees gross → deductions → net.

---

## 5. RLS strategy per table

Default posture on **every** table: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`,
zero permissive grants to `anon`, and explicit policies per command (`SELECT`/`INSERT`/`UPDATE`/
`DELETE`) rather than `FOR ALL`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | self · admin · manager→own reps | trigger only | self (safe cols) · admin (all) | admin |
| `ranks` | any authenticated | admin | admin | admin |
| `projects`, `plots` | public (published) · staff (all) | admin | admin | admin |
| `leads` | owner · admin · manager→reps | owner, admin | owner (non-terminal) · admin | admin (soft) |
| `bookings` | rep · customer · reviewer · admin | rep, customer(own), admin | guarded by trigger | admin |
| `sale_confirmations` | as bookings | rep, admin | guarded | admin |
| `commissions` | own rep · admin (manager → aggregate view only) | trigger only | admin | admin |
| `emis` | booking party · admin | trigger (schedule) | customer (slip only) · admin | admin |
| `payments`, `documents` | booking party · admin | edge fn / admin | admin | admin |
| `kyc` | owner · admin | owner | owner (while pending) · admin | admin |
| `message_threads`, `messages` | participants · admin | participants | author (edit window) · admin | admin |
| `notifications` | own | trigger | own (`read_at`) | own |
| `audit_log` | **admin only** | trigger only (`SECURITY DEFINER`) | nobody | nobody |
| `cms_*` | public read published · admin all | admin | admin | admin |

Notes:

- `audit_log` has **no** `UPDATE`/`DELETE` policy at all, and the table owner is a role the app
  never connects as — making it append-only in practice, which is what "immutable log" requires.
- **Soft delete** (`deleted_at`) is the default; every `SELECT` policy ANDs `deleted_at IS NULL`
  except the admin policies, so admins can still see and restore tombstoned rows.
- Storage buckets mirror the same logic with storage-object policies keyed on path prefix:
  `kyc/{user_id}/…`, `documents/{booking_id}/…`, `emi-slips/{booking_id}/…`. Buckets are
  **private**; the app hands out short-lived signed URLs, never public links.

---

## 6. Attack surface — what a hostile rep would try

These are the specific cases the RLS test-suite covers (`supabase/tests/rls.test.sql`):

1. `GET /rest/v1/leads?select=*` with a rep JWT → returns **only** own rows (the API itself, not a
   filtered UI).
2. `GET /rest/v1/leads?owner_id=eq.<peer-uuid>` → empty set, no count leakage.
3. `PATCH /rest/v1/profiles?id=eq.<self>` with `{"role":"admin"}` → rejected by column guard.
4. `PATCH /rest/v1/bookings?id=eq.<own>` with `{"status":"confirmed"}` → rejected by transition
   trigger (a rep cannot self-approve past Step 1).
5. `PATCH /rest/v1/emis?id=eq.<own>` with `{"status":"paid"}` as customer → rejected.
6. `POST /rest/v1/commissions` as rep → no INSERT policy, rejected.
7. `DELETE /rest/v1/audit_log?id=eq.<x>` as admin → rejected (no policy exists, even for admin).
8. Suspended rep with a still-valid JWT → all staff reads return zero rows.
9. Manager reads `commissions` of own rep → denied on the base table; aggregate view only.
10. Customer requests a signed URL for another booking's document → storage policy denies.
11. `SELECT * FROM v_*` reporting views as a rep → `security_invoker = on` keeps RLS applied.
12. Anonymous read of `plots` → only published projects, and no internal `notes` column (served
    through `v_public_plots`, which omits it).

---

## 7. UI surface per role

| Route prefix | Admin | Manager | Rep | Customer |
|---|---|---|---|---|
| `/` public site | OK | OK | OK | OK |
| `/admin/*` | OK | X | X | X |
| `/team/*` (read-only pipeline) | OK | OK | X | X |
| `/app/*` (rep self-service) | OK | OK | OK | X |
| `/portal/*` (customer) | X | X | X | OK |

Route guards are **advisory**. Every page still issues RLS-constrained queries, so a guard bypass
yields an empty screen, not data.

The rep panel (§5.19 of the spec) deliberately contains: my profile & ID, my rank badge, my KYC,
my leads, my bookings/sales with approval status, my single-level commission statements, my
documents, my messages. It deliberately does **not** contain: a downline/genealogy tree, a "team
earnings" widget, a wallet fed by others' sales, or any sponsor/level income display.

---

## 8. Compliance guardrail — why the model stops where it does

The spec's §0 and §8 exclusions are structural, not stylistic. A commission structure that pays a
member from another member's sale, or from recruitment, is what separates a sales organisation from
a money-circulation scheme (in India, the Prize Chits and Money Circulation Schemes (Banning) Act
1978 and the Direct Selling Rules under the Consumer Protection Act 2019 draw the line there;
equivalent rules exist in most jurisdictions). The safe design, implemented here:

- Commission is created **only** by the sale-confirmation trigger, **only** for `bookings.rep_id`,
  and **only once** per sale (unique index on `commissions(booking_id)`).
- There is no `sponsor_id`, `upline_id`, `placement_id`, or `genealogy` column anywhere in the
  schema. `manager_id` exists solely for read-only reporting and approval routing.
- No revenue enters the system from joining, rank purchase, or renewal — the only money-in events
  are plot bookings and EMI payments from customers.
- `ranks` carries exactly one rate column (`own_sale_rate`). Any future column named for levels,
  generations, or sponsor types should be treated as a schema regression.

Structural guarantee worth restating: **the set of people who can cause a commission row to exist
for user X is empty — only X's own admin-confirmed sale does.**

---

## 9. Audit expectations

Every `INSERT`/`UPDATE`/`DELETE` on a business table writes `audit_log(actor_id, actor_role,
action, entity, entity_id, summary, before, after, at)` from a `SECURITY DEFINER` trigger, so the
row is written even when the actor could not `INSERT` into `audit_log` directly.

Additionally logged as **access events** (read, not write): KYC document view, registry download,
commission statement export, CSV export of leads. These are the reads that matter in a dispute.

Retention: audit rows are never deleted by the application. Archival is a DBA operation.
