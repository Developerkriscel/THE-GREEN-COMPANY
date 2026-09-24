# Master Prompt — Royal Green Real-Estate Sales & CRM Platform (Full Spec)

> Paste this into Claude Code as the project brief. It is a **real-estate plot-sales business platform**: public website, plot inventory, a sales/CRM back office, a customer portal, KYC, EMI tracking, messaging, reporting, and document generation. Build it as a production app with real auth, database-level access control, and audit trails.

---

## 0. Scope guardrail (read first)

This platform uses a **single-level sales commission** model: the staff member who actually sells a plot earns a commission on **that plot**, verified by an admin. It intentionally does **NOT** implement:

- multi-level / upline "sponsor" income,
- a downline earnings tree or genealogy-based payouts,
- any income that rewards recruiting members or a member hierarchy.

A **read-only manager→rep reporting view** is allowed so a manager can *see* their reps' pipeline for coordination — but no one earns money from anyone else's sale. Keep commission strictly single-level everywhere.

---

## 1. Product overview

A web platform for a company that sells real-estate plots across multiple projects. Four audiences:

1. **Public visitors** — browse projects/plots, submit enquiries.
2. **Sales staff** (reps + managers) — manage leads, inventory, bookings, sales, payments, paperwork.
3. **Admins** — approve, verify, configure, and oversee everything.
4. **Customers** — buyers who log in to track bookings, agree to terms, pay EMIs, and download documents.

Design goals: clear approval workflows, strict data isolation between reps, complete paperwork automation (PDFs), and a clean auditable trail on every create/edit/delete.

## 2. Tech stack

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query. Fully responsive (mobile-first).
- **Backend / DB / Auth / Storage:** Supabase — Postgres, Auth, **Row-Level Security (RLS)** on every table, Storage buckets for documents.
- **Server logic:** Supabase Edge Functions for PDF generation, email, and any privileged operation.
- **PDFs:** server-side generation for welcome letters, booking forms, and payment receipts.
- **Email:** transactional email via an email API (e.g. Resend) from Edge Functions.
- **Secrets:** environment variables only; never hardcode keys. Single repo.

> If porting the existing Lovable project, connect it to GitHub first and build on the real exported source (frontend + Supabase schema/migrations) rather than re-creating from the rendered pages.

---

## 3. Roles & permissions (deep)

### 3.1 Role definitions

**Admin (Super Admin)**
- Full read/write across all data and settings.
- Final approver in every workflow (booking, sale, KYC, commission payout).
- Manages projects, plots, CMS, staff accounts, roles, commission rates/plans.
- Can edit and delete any record (with confirmation + audit entry; prefer soft-delete).
- Verifies KYC, EMI slips, and registry uploads.
- Sees all reports and the full audit log.

**Manager (optional tier)**
- Read-only visibility into their **assigned reps'** leads, bookings, sales, and pipeline — for coordination only.
- May be set as the **Step-2 reviewer** in approval flows (tick to approve/reject with remark).
- Cannot edit a rep's leads or earn commission. Cannot see other managers' teams.

**Sales Rep ("Channel Partner")**
- Creates and manages **only their own** leads.
- Raises plot tokens/bookings and submits sales for approval.
- Sees only their own leads, bookings, sales, commission statements, and messages.
- Cannot see peers' data or any admin settings.

**Customer**
- Logs in with a **User ID** (issued at booking).
- Views own bookings + status, agrees to T&C, uploads EMI slips, tracks EMI status, downloads welcome letter / booking form / receipts.
- Sees nothing about other customers, reps, or internal data.

### 3.2 Staff onboarding / joining
- Sales-rep self-registration is **open**, but the account is **inactive until basic verification** (email confirmed + admin/manager review as configured).
- Any account **above base rep level** (Manager, Admin, or any elevated role) requires **explicit Admin approval** before activation.
- Admin can suspend/reactivate any account.

### 3.3 Permission matrix

| Capability | Admin | Manager | Rep | Customer |
|---|---|---|---|---|
| Public website / enquiry | ✅ | ✅ | ✅ | ✅ |
| Manage projects/plots/CMS | ✅ | ❌ | ❌ | ❌ |
| Create/manage own leads | ✅ (all) | 👁 team (read) | ✅ own | ❌ |
| Raise token/booking | ✅ | ❌ | ✅ own | initiate own (tick) |
| Approve — Step 2 (review) | ✅ | ✅ | ❌ | ❌ |
| Approve — Step 3 (final) | ✅ | ❌ | ❌ | ❌ |
| Verify KYC / EMI / registry | ✅ | ❌ | ❌ | ❌ |
| View commission | ✅ all | 👁 team totals | ✅ own | ❌ |
| Configure commission rates | ✅ | ❌ | ❌ | ❌ |
| Edit / delete records | ✅ | ❌ | own drafts only | ❌ |
| Reports & exports | ✅ all | 👁 team | ✅ own | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ |
| Inbox / messaging | ✅ | ✅ | ✅ own threads | ✅ own threads |

Enforce **all** of this in RLS policies, not just the UI. A rep must not be able to reach another rep's rows through the API.

### 3.4 Ranks / tiers (attribute, not an earnings ladder)
Every rep carries a **rank/tier** — Channel Partner, Zonal Manager, and the rest of your **12-tier ladder**. Rank is an attribute of the rep, **separate** from the access role in §3.1. Rank affects only (a) the title/badge shown on the rep, and (b) optionally the rep's commission rate **on their own sales** (§5.18). Rank **never** grants any income from another person's sale. See §5.18 for the full rank module.

---

## 4. Global conventions

- **Auth:** email/password + optional OTP; separate customer login by User ID. Password reset flow. Session management.
- **Access control:** every table has RLS. Default deny; grant by role and ownership.
- **Audit:** every create/edit/delete writes an `audit_log` row (actor, action, entity, before/after summary, timestamp).
- **Soft delete:** prefer `deleted_at` over hard delete; hard delete is admin-only and audited.
- **Validation:** validate on client and server; never trust client role claims.
- **Notifications:** in-app notification center + transactional email on key events (§4.16).
- **Localization:** UI copy should support English + Hindi labels where practical.
- **Responsive:** works on phone, tablet, desktop.

---

## 5. Modules (deep)

### 5.1 Public website + CMS
**Purpose:** market projects and capture enquiries.
**Features**
- Home with a **"Latest Projects" auto-scrolling carousel**.
- Project listing + project detail (name, location, description, gallery, plot sizes, price range, amenities, map, brochure download).
- Plot availability view per project (available/booked indicative status).
- Enquiry form → creates a lead (name, mobile, project/category, budget, visit date).
- Admin CMS to edit pages, banners, projects, gallery, the featured-projects list, and contact details.
**Access:** public read; CMS write = Admin.

### 5.2 Lead management
**Purpose:** capture and convert enquiries.
**Fields:** name, mobile number, project/category, **visit date, budget, token, plot number**, source, remark, status, assigned rep. Support **multiple/bulk entries**.
**Pipeline:** New → Contacted → Visit Scheduled → Negotiation → Converted / Lost.
**Visibility rule (critical):** a lead and **all** its columns (mobile, remark, budget) are visible **only** to the owning rep + Admin (+ that rep's Manager, read-only). Never to peers.
**Features:** assignment, follow-up reminders, activity timeline per lead, convert-to-booking action, filters/search, CSV export (own leads for reps; all for admin).

### 5.3 Plot inventory
**Purpose:** source of truth for what can be sold.
**Model:** Projects → Plots. Plot: number, size, dimensions, facing, price, status (Available / Token / Booked / Registered / Sold), notes.
**Features:** admin CRUD, bulk import, status auto-driven by the booking workflow, price/plan config, block/unblock a plot.

### 5.4 Token / booking workflow (3-step approval)
**Purpose:** reserve a plot with a controlled, auditable approval chain (staff/admin — not an earnings chain).
**Flow**
1. **Step 1 — Rep** raises the token/booking, selects plot + customer, ticks "I agree with Terms & Conditions."
2. **Step 2 — Reviewer** (Manager or designated approver) reviews and ticks Approve/Reject (with remark).
3. **Step 3 — Admin** gives final approval.
**Rules:** booking is **Confirmed only after Admin final approval**. On rejection at any step, it returns to the rep with the remark. Plot → Token on Step 1, → Booked on final approval.
**Visibility:** booking detail visible to the raising rep, the reviewer, and Admin only.

### 5.5 Sale confirmation
**Purpose:** convert a confirmed booking into a confirmed sale.
**Flow:** same 3-step T&C-agreement chain (Rep → Reviewer → Admin). On admin confirmation: create commission record (§5.10), generate welcome letter (§5.8), set EMI schedule (§5.9).

### 5.6 Registry upload
When a plot's legal registry completes, **Admin uploads the registry copy**; it attaches to the booking and is visible in the customer portal. Plot → Registered. Audited.

### 5.7 Customer portal
**Login:** User ID (issued at booking) + password.
**Features**
- Dashboard of the customer's bookings and each one's status through the approval flow.
- **Customer T&C tick** to confirm their own booking (flow: Customer tick → Rep → Reviewer → Admin).
- Download welcome letter / booking form / receipts (PDFs).
- **Upload EMI slips**; see EMI status (Paid / Pending / Overdue / Awaiting verification).
- View registry copy once uploaded.
- Profile + password management, support messages (§5.13).

### 5.8 Document generation (PDF)
- **Welcome letter / booking form:** auto-generated on Admin final approval, pushed to the customer portal + emailed.
- **Payment receipt / invoice:** generated whenever a payment/EMI is recorded and verified.
- Store in an access-controlled bucket; link to the booking; list under the customer's documents.

### 5.9 EMI / payments system
**Purpose:** track installment payments per booking.
**Features**
- Payment schedule per booking (amount, due dates, count).
- Customer uploads an EMI slip from the portal; status → Awaiting verification.
- On upload, notify Admin + rep; **Admin verifies** → status Paid; overdue auto-flag past due date.
- Collection dashboard: due / overdue / collected, per rep and per project.
- Receipt generated on verification (§5.8).

### 5.10 Commission (single-level)
**Rule:** on admin-confirmed sale, create a commission record for the **rep who made that sale**, using a configurable rate/plan. The rate may vary by the rep's **rank/tier** (§5.18), but is applied **only** to their own sale. **No upline/sponsor share, no multi-level split.**
**States:** Accrued → Approved (Admin) → Paid (with payout reference).
**Views:** rep sees own commission statements; admin sees all; manager sees team totals (read-only).

### 5.11 KYC (privacy-conscious)
- Collect KYC where genuinely required for property transactions (ID proof, address proof, photo).
- Store documents in an access-controlled bucket; RLS restricts to Admin + the record owner.
- Don't show ID numbers in list views; mask where displayed; log every access.
- KYC states: Pending → Verified / Rejected (with reason). 

### 5.12 Inbox / messaging
**Purpose:** internal + customer communication (the panel's "messages").
**Features**
- Threaded messages: enquiries from the website, customer support threads, internal notes.
- Rep sees only their own threads; Admin/Manager see assigned/all per role.
- Unread counts, assignment, status (Open/Resolved), email fan-out on reply.

### 5.13 Account settings
- **Profile page:** view/edit own profile (name, contact, photo).
- **Password page:** change password; reset flow.
- **Staff management (Admin):** create/approve/suspend accounts, assign roles + manager, set commission rate.

### 5.14 Reports & exports
- Sales report (by period, project, rep), booking funnel, lead conversion rate.
- EMI aging / collection report; commission report.
- Every list supports filter + search + **CSV/Excel export** (scoped by role).

### 5.15 Audit log
- Immutable log of create/edit/delete across the app (actor, role, entity, action, timestamp, change summary).
- Admin-only viewer with filters. Backs the "edit and delete everywhere" requirement safely.

### 5.16 Notifications
- **In-app** notification center (bell + list).
- **Email** on: each booking/sale approval step, admin final approval (with PDF), EMI slip upload, EMI verified, KYC status change, new message.

### 5.17 Admin dashboard
- Live tiles: total/active members, new today/week/month, KYC pending, ranks/plans (as plan tiers, not earnings), total/verified sales, sale value, payouts (commission) this month/all-time, leads, active CRM sales, EMIs due/overdue, collected, new messages, published projects.
- Recently-joined table, quick links to pending approvals/verifications.

### 5.18 Ranks & commission tiers (single-level)
**Purpose:** represent the full rank ladder, where rank sets the rep's commission rate **on their own sales only**.

**Rank table to seed** (name, seniority, own-sale commission rate). Rates are taken from the "Sale Direct %" column of the company plan:

| # | Rank | Own-sale commission |
|---|------|---------------------|
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

**Features**
- Admin-managed ranks table (name, seniority order, own-sale rate, active flag), seeded with the 14 rows above.
- Each rep is assigned a rank (badge/title on profile + lists). When that rep's own sale is admin-confirmed, commission = sale value × the rank's own-sale rate (feeds §5.10).
- **Rank advancement is admin-assigned, based on the rep's real sales performance** — never purchased. There is **no joining/membership fee** to hold or move up a rank.
- Company deductions from the plan (e.g. TDS, admin charge) may be modeled as configurable deductions applied to a payout, if you want statutory/company handling reflected.
- Admin can create/edit/delete ranks and reassign reps; all changes audited.
- **Hard rule:** rank grants a title and an own-sale rate only — **never** a share of anyone else's sale, no joining-fee income, no recruitment/"sponsor direct" payout, no level/generation income, and no reward tied to number of people recruited.

### 5.19 Sales Rep self-service portal ("sponsor panel" — legitimate scope)
**Purpose:** what a rep sees when they log in — the legitimate equivalent of the member/sponsor panel. Every widget is scoped to the rep's **own** data.
**Features**
- **My profile & ID:** profile details, member/User ID, rank/tier badge, KYC status.
- **My leads:** only the rep's own leads; mobile number and remark hidden from everyone else.
- **My bookings / tokens & sales:** raise, track the 3-step approval status, agree T&C.
- **My commission:** single-level statements on the rep's own sales (Accrued → Approved → Paid). No one else's sales appear.
- **My documents:** welcome letters, booking forms, receipts for the rep's own deals.
- **Messages / notifications:** the rep's own threads and alerts.
**Optional (management view, read-only):** a Manager sees their assigned reps' pipeline (leads/bookings/sales) for coordination — for visibility only, with no earnings and no payout tree.
**Explicitly excluded from this panel:** a downline/genealogy "my team" earning tree, "direct income by sponsor type," a member wallet fed by others' sales, and any sponsor/upline payout. A rep earns solely from plots they personally sell.

---

## 6. Data model (starting schema)
`profiles(id, role, rank_id, manager_id, status, commission_rate)` · `ranks(id, name, seniority, own_sale_rate, approved, active)` · `projects` · `plots(project_id, status, price, …)` · `leads(owner_id, status, …)` · `bookings(plot_id, customer_id, rep_id, status, step1/2/3_at)` · `sale_confirmations(booking_id, …)` · `documents(booking_id, type, storage_path)` · `emis(booking_id, due_date, amount, status, slip_path, verified_by)` · `payments/receipts` · `commissions(rep_id, booking_id, amount, status)` · `kyc(user_id, docs, status)` · `messages(thread_id, sender, body, …)` · `notifications(user_id, type, read_at)` · `audit_log(actor, action, entity, at)` · `cms_pages` / `cms_projects`.

Enforce §3–§5 visibility in **RLS policies** on every table.

## 7. Build order (milestones)
1. Auth + roles + RLS scaffolding + audit log.
2. Projects/plots + public website + CMS + latest-projects carousel.
3. Leads (per-owner visibility) + inbox.
4. Booking/token 3-step workflow + plot status.
5. Sale confirmation + commission (single-level).
6. Customer portal + T&C + welcome-letter/booking PDFs.
7. EMI + payments + receipts.
8. Registry upload + KYC.
9. Reports/exports + notifications + admin dashboard + account settings.

## 8. Out of scope (do not build)
Multi-level / upline "sponsor" income, downline earnings trees, genealogy-based payouts, and any payout that rewards recruiting or a member hierarchy. Commission stays **single-level** to the actual seller. Ranks exist only as titles and/or single-level commission rates on a rep's **own** sales (§5.18) — they never grant a share of anyone else's sale. A read-only manager→rep reporting view is the only hierarchy permitted, and it carries no earnings.
