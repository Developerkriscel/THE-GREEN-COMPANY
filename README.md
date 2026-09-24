# Royal Green — Real-Estate Sales & CRM Platform

A production-shaped platform for a company that sells plots across multiple projects:
public website, plot inventory, a sales/CRM back office, a customer portal, KYC, EMI tracking,
messaging, reporting and automated paperwork.

Built to the brief in [spec.md](spec.md). The access-control model is analysed in depth in
[docs/ROLES.md](docs/ROLES.md) — read that before changing anything that touches permissions.

---

## What's here

```
src/
  components/         UI kit, layouts (public shell, app shell), status badges
  context/            AuthContext — sessions, staff + customer sign-in, role flags
  lib/                supabase client, typed domain model, TanStack Query hooks, formatters
  pages/
    public/           home (auto-scrolling carousel), projects, project detail, contact, CMS pages
    auth/             staff login, customer User-ID login, registration, password reset
    admin/            dashboard, projects, plots, leads, bookings, sales, EMI, commissions,
                      KYC, ranks, staff, inbox, reports, CMS, audit log
    manager/          read-only team dashboard, approval queue, pipeline, team totals
    rep/              own dashboard, leads, bookings, sales, commission
    customer/         bookings + approval progress, EMI upload, documents
    shared/           booking detail, lead detail, leads/bookings/sales views, inbox,
                      profile, KYC, documents
supabase/
  migrations/         schema, helper functions, workflow triggers, RLS, storage, seed data
  functions/          edge functions: document + receipt PDFs, transactional email, overdue sweep
  tests/rls.test.sql  pgTAP suite asserting the isolation rules actually hold
docs/ROLES.md         roles, permissions, RLS strategy, workflow authority, threat model
```

---

## Current state: connected to Neon

The schema **is applied and verified** on the Neon database in `.env`
(`ep-shy-frost-aeg8mrsm`, PostgreSQL 18.6): 22 tables, RLS forced on 22/22, 104 policies, the
14-rank ladder seeded, and both regression suites green.

```bash
npm run db:check    # what's on the target, changes nothing
npm run db:apply    # shim + all migrations (scratch database only)
npm run db:test     # both pgTAP suites, 49 assertions
```

`scripts/apply-schema.mjs` reads `DATABASE_URL` from `.env`, needs no `psql`, no Docker and no
Supabase CLI (none of which work on this machine), infers TLS from the Neon hostname, and redacts
credentials from all output. `.env` holds both endpoints: the **direct** one for DDL and tests
(PgBouncer's transaction pooling doesn't reliably carry the session state the suites set), and the
**pooled** one for application traffic.

Two things Neon needed that a Supabase database provides out of the box, both handled by
`supabase/compat/00_plain_postgres_shim.sql`: the `auth`/`storage` schemas plus `auth.uid()`, and
the `anon`/`authenticated`/`service_role` roles — including granting the *migrating user* membership
of them, without which you cannot `SET ROLE authenticated` to test a policy by hand.

> ### ⚠️ The app is not connected yet — and can't be, directly
>
> `@supabase/supabase-js` is an HTTP client, not a Postgres driver. `.from()` calls **PostgREST**,
> `.auth` calls **GoTrue**, `.storage` calls the **Storage API**. Those are three servers. A bare
> Neon database has nothing for the browser to talk to, and no connection string will change that —
> browsers cannot speak the Postgres wire protocol at all.
>
> The schema being live on Neon is genuinely useful (it is the hard part, and it is tested), but
> to make the UI work you must pick one:
>
> 1. **Run the API layer in front of Neon** — PostgREST + GoTrue + Storage, pointed at this
>    database. The schema is already shaped for exactly this; the policies assume PostgREST's
>    `anon`/`authenticated` roles and a GoTrue-style JWT, both of which the shim already models.
>    Needs a working Docker (see the disk note below).
> 2. **Write a server-side API** — Node/Express + `pg`, and replace `src/lib/supabase.ts` and the
>    query hooks. Roughly 20 files. You would also be reimplementing auth, and RLS would only apply
>    if the API sets `request.jwt.claims` per request.
> 3. **Use a Supabase project for the app**, keeping Neon for reporting or as a second environment.
>
> Option 1 preserves everything already built and tested. Say the word and I'll set it up.

---

## Getting it running

### 1. Install

```bash
npm install
```

### 2. Point it at a Supabase project

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Only the **anon** key belongs in
`.env` — the service-role key is used exclusively by edge functions and must never reach the
browser.

### 3. Apply the database

With the Supabase CLI and Docker installed:

```bash
supabase start
supabase db reset
```

Against a hosted project:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

The migrations create every table, enable **and force** RLS on all of them, install the workflow
triggers and audit machinery, create the five storage buckets with their object policies, and seed
the 14-rank ladder plus the default CMS pages.

### 4. Deploy the edge functions

```bash
supabase secrets set RESEND_API_KEY=... MAIL_FROM="Royal Green <noreply@yourdomain>" APP_BASE_URL=https://yourdomain
supabase functions deploy generate-documents generate-receipt send-email flag-overdue-emis
```

Without `RESEND_API_KEY` the email function logs what it *would* have sent and returns success, so
local development is not blocked by a missing mail provider.

### 5. Run it

```bash
npm run dev
```

### 6. Create the first administrator

Self-registration always produces an **inactive rep** — by design, nothing submitted from the
browser can create an admin. Promote the first one directly in SQL:

```sql
update public.profiles
   set role = 'admin', status = 'active'
 where email = 'you@yourdomain.com';
```

Every account after that is managed from **Admin → Staff**.

---

## The access model in one page

Two orthogonal axes, and keeping them separate is the whole design:

| | Column | Controls |
|---|---|---|
| **Access role** | `profiles.role` — admin / manager / rep / customer | what rows you can reach, which approval step you own |
| **Rank** | `profiles.rank_id` → `ranks` | your title, and your commission rate **on your own sales** |

A rep promoted from *Associate* (7%) to *Country Head* (22%) gains no new data access whatsoever.

**Commission is single-level, structurally.** A commission row can only be created by the
sale-confirmation trigger, only for `bookings.rep_id`, and only once per booking (unique index).
There is no `sponsor_id`, `upline_id`, `placement_id` or `genealogy` column anywhere in the schema,
and `ranks` has exactly one rate column. A manager's `manager_id` link carries read-only visibility
and the step-2 review tick — never money. See §8 of [docs/ROLES.md](docs/ROLES.md) for why the model
stops precisely there.

### Approval chains

Bookings and sale confirmations both run the same three gates:

```
rep submits (T&C tick) → reviewer approves → admin final approval → confirmed
```

Plot status follows automatically (`available → token → booked → registered`), driven by a trigger
rather than client code. A rejection at any step returns the record to the rep with a mandatory
remark. A rep cannot review their own work — it is a table constraint, not a UI rule.

On admin confirmation of a sale, one transaction creates the commission record (with the rate
**snapshotted**, so later promotions never rewrite history), materialises the EMI schedule, and
notifies both parties. The PDF paperwork follows from an edge function.

---

## Security posture

- **RLS is the boundary, the UI is convenience.** Every table has `ENABLE` *and* `FORCE ROW LEVEL
  SECURITY`, with explicit policies per command rather than `FOR ALL`. Route guards are advisory —
  bypassing one yields an empty screen, not data.
- **Role is read from the table, not the JWT**, through `SECURITY DEFINER STABLE` helpers. A
  suspension takes effect on the next query rather than the next token refresh.
- **Suspended means blind.** Every staff policy ANDs `status = 'active'`.
- **The audit log is append-only.** It has a SELECT policy for admins and no INSERT, UPDATE or
  DELETE policy for anyone — rows arrive only through `SECURITY DEFINER` triggers.
- **Sensitive reads are logged too**, not just writes: opening a KYC document, downloading a
  registry copy, exporting a list.
- **Storage buckets are private**, keyed on path prefix (`kyc/{user_id}/…`,
  `documents/{booking_id}/…`), served through short-lived signed URLs.
- **Full ID numbers are never stored** — only the last four digits, masked wherever displayed.
- **Views use `security_invoker = on`** so a reporting view can never become a side door around the
  policies.

Verify it rather than trusting it:

```bash
npm run db:test
```

Two pgTAP suites, **49 assertions, currently green against the live Neon database**:

- `supabase/tests/rls.test.sql` (25) — peer-rep leakage, self-promotion, self-approval, commission
  minting, manager write attempts, customer isolation, audit-log immutability.
- `supabase/tests/workflow.test.sql` (24) — both 3-step approval chains, plot-status side effects,
  the commission trigger (rate resolution, rank snapshot, deductions arithmetic), the EMI schedule,
  notifications, and the audit trail. Assertions 16 and 17 are the compliance guardrail: after a
  confirmed sale exactly **one** commission row exists in the entire database, and the rep's manager
  has **none**.

Both wrap themselves in a transaction and roll back, so they are safe to run against a live
database.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | TypeScript only |
| `npm run db:reset` | Rebuild the local database from migrations + seed |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run gen:types` | Regenerate `src/lib/database.types.ts` from the live schema |

---

## Known environment note

`package.json` contains an `overrides` block pinning `rollup` to its pure-WASM build. That is
present because the development machine has a Windows Application Control policy that blocks
Rollup's native `.node` binary, which stops Vite from starting at all. On a machine without that
policy you can delete the `overrides` block for a faster build — nothing in the application depends
on it.

---

## Build order (spec §7) — where things stand

| Milestone | Status |
|---|---|
| 1. Auth + roles + RLS scaffolding + audit log | Complete |
| 2. Projects/plots + public site + CMS + carousel | Complete |
| 3. Leads (per-owner visibility) + inbox | Complete |
| 4. Booking/token 3-step workflow + plot status | Complete |
| 5. Sale confirmation + single-level commission | Complete |
| 6. Customer portal + T&C + welcome-letter/booking PDFs | Complete |
| 7. EMI + payments + receipts | Complete |
| 8. Registry upload + KYC | Complete |
| 9. Reports/exports + notifications + admin dashboard + settings | Complete |

Worth doing next, in rough priority order:

1. **Customer account provisioning UI.** The schema and login path are in place (`user_code` +
   `resolve_customer_login`), but an admin currently has no screen to create a customer account and
   issue the User ID at booking time — today it is a SQL step.
2. **Richer PDFs.** `_shared/pdf.ts` is a dependency-free writer producing clean single-page
   documents. Swapping in `pdf-lib` would allow logos, tables and multi-page agreements; the call
   signature is deliberately the only thing callers depend on.
3. **Email fan-out on every approval step.** The templates all exist in `send-email`; the triggers
   currently write in-app notifications, and only document generation and receipts dispatch mail.
   Wiring the rest is a matter of calling the function from the remaining trigger points.
4. **Hindi labels.** The spec asks for English + Hindi where practical; all copy is currently
   English and would need extracting into a small i18n layer.
5. **Bundle splitting by route.** The entry chunk is comfortably under budget, but `React.lazy` on
   the admin area would cut first load further for customers and reps.
