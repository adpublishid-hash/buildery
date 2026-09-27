# Buildery

A self-hosted, Notion-style website builder.

- **Part 1** — auth, dashboard shell, role system
- **Part 2** — multi-workspace, members, branding, invitations
- **Part 3** — website builder: pages, JSON blocks, publish
- **Part 4** — public page renderer, dynamic SEO, page-view analytics
- **Part 5** — online store: products, cart, checkout, orders
- **Part 6** — courses / LMS: curriculum editor, enrollment, learner area
- **Part 7** — blog CMS + form builder with CSV export
- **Part 8** — affiliate, coupons, and membership
- **Part 9** — analytics dashboard + integration settings
- **Part 10** — SaaS plans, billing, and Super Admin
- **Part 11** — Midtrans payment gateway
- **Part 12** — production-ready: VPS deploy package
- **Part 13** — security hardening, performance, polish, tests *(you are here)*

---

## Tech stack

- **Next.js 14** App Router + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (zinc, rounded-xl, minimal)
- **Prisma** + **PostgreSQL**
- **NextAuth v4** — credentials provider, JWT sessions
- **Server Actions** for all mutations
- **Zod** + **react-hook-form**
- **Recharts**, **Lucide React**, **Sonner**
- Package manager: **pnpm**

---

## Folder structure

```
app/
  (auth)/                       login, register, /api/auth
  dashboard/
    layout.tsx                  sidebar + topbar + workspace context
    page.tsx                    overview (workspace-aware)
    workspaces/
      page.tsx                  list / switch
      new/page.tsx              create
    settings/
      layout.tsx                sub-nav
      page.tsx                  general
      branding/page.tsx
      members/page.tsx
  api/auth/                     NextAuth route + register
  layout.tsx                    AuthProvider + Toaster
  page.tsx                      landing

components/
  ui/                           shadcn primitives
  dashboard/                    sidebar, topbar, switcher, settings-nav
  workspaces/                   CRUD forms, members table, invite dialog
  providers/                    SessionProvider

lib/
  actions/
    current-workspace.ts        cookie-based switch
    workspace.ts                create / update / delete / branding
    members.ts                  invite / role / remove / revoke
  auth.ts                       NextAuth options
  prisma.ts                     singleton client
  permissions.ts                Role + MemberRole + Permission maps
  workspace.ts                  getCurrentWorkspace, requireWorkspacePermission
  slug.ts
  utils.ts
  zod.ts                        all input schemas

prisma/
  schema.prisma                 User, Workspace, Member, Invitation, Upload
  seed.ts                       5 users + 2 workspaces

types/next-auth.d.ts
middleware.ts                   guards /dashboard/*
```

---

## Running locally

### 1. Prerequisites

- Node.js **≥ 18.18**, **pnpm ≥ 8**, running PostgreSQL.

### 2. Install + env

```bash
pnpm install
cp .env.example .env
# edit DATABASE_URL and NEXTAUTH_SECRET (openssl rand -base64 32)
```

### 3. Postgres via Docker (optional)

```bash
docker run --name buildery-db \
  -e POSTGRES_USER=buildery \
  -e POSTGRES_PASSWORD=buildery \
  -e POSTGRES_DB=buildery \
  -p 5432:5432 -d postgres:16
```

### 4. Migrate + seed

If you're coming from Part 1, just add the new migration:

```bash
pnpm prisma:generate
pnpm prisma:migrate           # name it "part-11-midtrans-payments"
pnpm prisma:seed
```

Fresh install:

```bash
pnpm prisma:generate
pnpm prisma:migrate           # initial
pnpm prisma:seed
```

Reset everything (drops all data):

```bash
pnpm db:reset
```

### 5. Dev server

```bash
pnpm dev      # http://localhost:3000
```

---

## Deploying to production

Buildery self-hosts on a single VPS (Ubuntu + Node + PostgreSQL + PM2 +
Nginx + Let's Encrypt). The full step-by-step runbook — server setup,
database, SSL, backups, security checklist — is in
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

Deploy artifacts in this repo:

| File                        | Purpose                              |
| --------------------------- | ------------------------------------ |
| `DEPLOYMENT.md`             | Full VPS deployment runbook          |
| `ecosystem.config.js`       | PM2 process config                   |
| `deploy/nginx.conf`         | Nginx reverse-proxy example          |
| `scripts/deploy.sh`         | Pull → migrate → build → reload      |
| `scripts/backup-db.sh`      | Timestamped `pg_dump` (for cron)     |
| `scripts/restore-db.sh`     | Restore from a backup                |
| `scripts/setup-uploads.sh`  | Prepare the upload directory         |

```bash
pnpm build      # production build
pnpm start      # or: pm2 start ecosystem.config.js
```

---

## Testing

```bash
pnpm test       # Vitest unit suite (53 tests)
pnpm test:watch
```

Unit tests cover the utility layer (slugs, permissions, pricing, rate
limiting, CSV export, date ranges). Full QA steps and the integration-test
plan are in **[TESTING.md](TESTING.md)**.

---

## Hardening & performance (Part 13)

- **Rate limiting** — `lib/rate-limit.ts` throttles register, login, upload,
  page-view tracking, and form submissions.
- **Security headers** — set in `next.config.mjs` (and `deploy/nginx.conf`);
  `x-powered-by` removed.
- **Error boundaries** — `app/error.tsx`, `app/dashboard/error.tsx`,
  `app/global-error.tsx`.
- **Pagination** — server-rendered pager on the orders & payments tables.
- **DB indexes** — composite `(workspaceId, status)` indexes for the
  storefront / catalog / order queries.
- **Lazy images**, **command palette** (`⌘K`), **breadcrumbs**, loading
  skeletons, and route progress.

---

## Demo accounts

Password for everyone: `Password123!`

| Email                          | System role  | Workspace memberships                                 |
| ------------------------------ | ------------ | ----------------------------------------------------- |
| superadmin@buildery.test       | SUPER_ADMIN  | —                                                     |
| owner@buildery.test            | OWNER        | Acme Studio (Owner), Indie Lab (Admin)                |
| staff@buildery.test            | STAFF        | Indie Lab (Owner), Acme Studio (Editor)               |
| customer@buildery.test         | CUSTOMER     | Acme Studio (Viewer)                                  |
| affiliate@buildery.test        | AFFILIATE    | Indie Lab (Viewer)                                    |

Sign in as `owner@buildery.test` for the fullest experience — you land in
**Acme Studio**, which ships with two published pages and one draft.

### Public demo site (no login needed)

| URL                              | What it is                          |
| -------------------------------- | ----------------------------------- |
| `/site/acme-studio`              | Home page (published)               |
| `/site/acme-studio/about`        | About page (published)              |
| `/site/acme-studio/roadmap`      | Draft — 404 publicly, preview if member |
| `/site/acme-studio/products`     | Store — 4 active products           |
| `/site/acme-studio/products/classic-tee` | A product detail page       |
| `/site/acme-studio/cart`         | Cart                                |
| `/site/acme-studio/courses`      | Course catalog                      |
| `/site/acme-studio/courses/build-a-notion-style-site` | Course detail · enroll |
| `/site/acme-studio/blog`         | Blog index — 2 published posts      |
| `/site/acme-studio/blog/welcome-to-acme-studio` | Article detail page    |
| `/site/acme-studio/forms/contact` | Public contact form (5 fields)     |

---

## What's new in Part 7 — Blog CMS + Form builder

### A. Blog CMS

**Schema** ([prisma/schema.prisma](prisma/schema.prisma)) — `BlogPost`,
`BlogCategory`, `BlogTag` (tags use an implicit Prisma M2M) + enum
`BlogPostStatus`. Posts link back to their `User` author and reuse
`UploadFile` for the featured image.

**Dashboard**:

- [/dashboard/blog](app/dashboard/blog/page.tsx) — list with status,
  category, tag count, publish toggle, delete
- `/dashboard/blog/new` and `/dashboard/blog/[id]/edit` — full editor
  ([post-form.tsx](components/blog/post-form.tsx)) with title, slug
  autogen, excerpt, body (line-break preserving textarea), SEO title/meta,
  cover image upload, status, inline-created category, comma-separated tags
- `/dashboard/blog/categories` — quick category CRUD via
  [category-manager.tsx](components/blog/category-manager.tsx)

**Public**:

- [/site/[ws]/blog](app/site/[workspaceSlug]/blog/page.tsx) — index of
  PUBLISHED posts
- `/site/[ws]/blog/[postSlug]` — article detail with full SEO metadata,
  featured image, category badge, and tag list

### B. Form Builder

**Schema** — `Form`, `FormField`, `FormSubmission` + enum `FormFieldType`
(`TEXT`, `EMAIL`, `PHONE`, `TEXTAREA`, `SELECT`, `CHECKBOX`). `FormField`
stores SELECT options as `Json` (string array); submissions store the
collected `data` as `Json`.

**Dashboard**:

- [/dashboard/forms](app/dashboard/forms/page.tsx) — list with status,
  field count, submission count
- `/dashboard/forms/new` — minimal create form
  ([form-meta-form.tsx](components/forms/form-meta-form.tsx))
- `/dashboard/forms/[id]/edit` — meta + the
  [field-editor.tsx](components/forms/field-editor.tsx): add / rename /
  move up / move down / delete, each via the type-aware
  [field-dialog.tsx](components/forms/field-dialog.tsx)
- `/dashboard/forms/[id]/submissions` — table with one column per field
  plus a CSV export button

**Public**:

- [/site/[ws]/forms/[formSlug]](app/site/[workspaceSlug]/forms/[formSlug]/page.tsx)
  — renders the form via
  [public-form.tsx](components/forms/public-form.tsx) with per-type input,
  required/optional handling, and a success state. Closed forms render a
  read-only notice.

**Validation & storage** —
[lib/actions/form-submission.ts](lib/actions/form-submission.ts) revalidates
each value against its field type (email regex, phone regex, SELECT
option list, length caps), captures IP + User-Agent from request headers,
and writes one `FormSubmission` row per submit.

**CSV export** —
[/api/forms/[formId]/export](app/api/forms/[formId]/export/route.ts) is
auth + workspace-membership gated. The CSV is RFC-4180 quoted with a
UTF-8 BOM so non-ASCII characters open cleanly in Excel.

### Demo data

- **Blog**: 2 categories (Updates, Tutorials), 3 tags, 3 posts (2
  published, 1 draft)
- **Form**: one "Contact us" form with 5 fields and 2 sample submissions
  (so the dashboard table and CSV export are non-empty)

---

## What's new in Part 11 — Midtrans payments

### Schema changes

- `Payment` is rebuilt as a **polymorphic transaction record**: a `kind`
  (`ORDER` / `ENROLLMENT` / `MEMBERSHIP`), exactly one of
  `orderId` / `enrollmentId` / `customerMembershipId`, plus Midtrans
  fields (`midtransOrderId`, `snapToken`, `transactionId`,
  `transactionStatus`, `paymentType`, `fraudStatus`, `rawNotification`).
- `OrderStatus` gains `FAILED` / `EXPIRED`; `PaymentStatus` gains
  `EXPIRED` / `CANCELLED`; `EnrollmentStatus` and `MembershipStatus` gain
  `PENDING`.
- `Order.referralAffiliateId` records affiliate attribution at checkout so
  the commission can be created later, on payment success.

### Payment flow

1. Checkout / paid-course enrolment / membership purchase creates the
   resource as **PENDING** plus a PENDING `Payment`.
2. The client calls `POST /api/payments/midtrans/create`, which builds a
   Midtrans **Snap** transaction and returns the redirect URL.
3. The customer pays on Midtrans, then lands back on `/payment/success`.
4. Midtrans calls `POST /api/payments/midtrans/webhook` server-to-server.
   The handler verifies the **SHA-512 signature**, maps the transaction
   status, and runs fulfilment.

[lib/payments.ts](lib/payments.ts) `applyPaymentStatus()` is the single
transition point — idempotent, runs side-effects exactly once:

- **paid** → order: decrement stock, increment coupon usage, create the
  affiliate commission, set `Order.status = PAID`; enrolment → `ACTIVE`;
  membership → `ACTIVE`.
- **failed / expired / cancelled** → order → that status; enrolment /
  membership → `CANCELLED`.

> Stock, coupon usage, and commissions moved out of checkout into
> fulfilment, so abandoned/expired orders never touch inventory.

### Routes & pages

- `POST /api/payments/midtrans/create` — starts a payment.
- `POST /api/payments/midtrans/webhook` — signed Midtrans notifications.
- `/payment/success` · `/payment/pending` · `/payment/failed` — public
  status pages keyed by `?ref=<midtransOrderId>`.
- `/dashboard/payments` — Midtrans payment history per workspace.
- `/site/[workspaceSlug]/memberships` — public membership purchase.

### Security

- The server key is read only on the server; the webhook rejects any
  payload whose `signature_key` doesn't match
  `SHA-512(order_id + status_code + gross_amount + serverKey)`.
- `applyPaymentStatus` is idempotent — duplicate webhook deliveries and
  already-terminal payments are no-ops.
- The full notification body is stored in `Payment.rawNotification`.

### Testing without sandbox keys

Leave `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` **blank** and the app
runs in **sandbox-free mode**: `create` settles the payment instantly and
redirects to `/payment/success`. The whole purchase → fulfilment chain is
exercised locally with no external calls.

### Testing with the Midtrans sandbox

1. Create a sandbox account at
   <https://dashboard.sandbox.midtrans.com> and copy the **Server key**
   and **Client key** into `.env`.
2. Expose your dev server (e.g. with a tunnel) and set the **Payment
   Notification URL** in the Midtrans dashboard to
   `https://<tunnel>/api/payments/midtrans/webhook`.
3. Check out a product — you'll be redirected to the Snap page. Use the
   sandbox test cards / e-wallet simulators to drive **success**,
   **pending**, and **deny/expire** outcomes; the webhook updates the
   order accordingly.

---

## What's new in Part 10 — SaaS plans + Super Admin

### Schema additions

- `SaaSPlan` (one row per `SaaSPlanTier`: FREE / STARTER / PRO / BUSINESS)
  with per-resource limits and feature flags.
- `SaaSSubscription` (one per user) — `status`, `currentPeriodEnd`.
- `SiteTemplate` and `AbuseReport` for the admin area.

### Subscription limits

[lib/saas-limits.ts](lib/saas-limits.ts):

- `getUserPlan(userId)` — the user's active plan, or FREE as a fallback.
- `assertCanCreate(userId, kind)` — called inside the workspace / page /
  product / course create actions. Limits are charged to the **workspace
  owner**, so collaborators don't burn their own quota.
- `getLimitSummaries(userId)` — used/limit pairs powering the billing page.

| Plan     | Price       | Workspaces | Pages | Products | Courses | Affiliate | Membership | Adv. analytics |
| -------- | ----------- | ---------- | ----- | -------- | ------- | --------- | ---------- | -------------- |
| Free     | Rp 0        | 1          | 5     | 5        | 1       | —         | —          | —              |
| Starter  | Rp 79.000   | 2          | 20    | 50       | 5       | —         | —          | —              |
| Pro      | Rp 199.000  | 5          | 100   | 300      | 20      | ✓         | ✓          | ✓              |
| Business | Rp 499.000  | 25         | ∞     | ∞        | ∞       | ✓         | ✓          | ✓              |

### Pricing & billing

- [/pricing](app/pricing/page.tsx) — public page; "Choose plan" runs a
  **dummy** `subscribeToPlanAction` (no real payment).
- [/dashboard/billing](app/dashboard/billing/page.tsx) — current plan,
  feature flags, usage bars, and cancel.
- Affiliate, Membership, and Analytics pages render
  [UpgradeRequired](components/billing/upgrade-required.tsx) when the
  workspace owner's plan lacks the feature (gated via route layouts).

### Super Admin

`/admin/*` is guarded twice: the middleware requires a session, and
[lib/admin.ts](lib/admin.ts) `requireSuperAdmin()` redirects anyone who
isn't `SUPER_ADMIN` to `/dashboard`.

- [/admin](app/admin/page.tsx) — platform stats (users, workspaces, GMV,
  MRR, plan breakdown, open reports).
- `/admin/users` — change roles, delete accounts (can't self-demote).
- `/admin/workspaces` — inspect and delete any workspace.
- `/admin/subscriptions` — every SaaS billing record + status control.
- `/admin/templates` — CRUD the starter-template gallery.
- `/admin/reports` — file and triage abuse reports.

### Demo data

- All four SaaS plans are seeded; `owner@buildery.test` is subscribed to
  **Pro** so the demo workspace has affiliate / membership / analytics
  unlocked.
- `staff@buildery.test` has no subscription → **Free**, so logging in as
  staff shows the upgrade gates on those features.
- 3 site templates + 1 open abuse report.
- Sign in as `superadmin@buildery.test` to reach `/admin`.

---

## What's new in Part 9 — Analytics + integrations

### Schema additions

- `IntegrationSetting` (one per workspace): Meta Pixel ID, GA4 Measurement
  ID, GTM ID, Google Search Console verification token, Gmail OAuth2 email
  credentials, Mailketing API email credentials, WhatsApp settings, and a
  small inline `customHeadScript`.

### Analytics dashboard

[/dashboard/analytics](app/dashboard/analytics/page.tsx) — server-rendered
KPIs + an interactive [Recharts](https://recharts.org/) area chart.

- **Range picker** (`today` · `7d` · `30d` · `custom`) lives in
  [components/dashboard/analytics-range-picker.tsx](components/dashboard/analytics-range-picker.tsx).
  Range syncs to the URL via search params (`?range=…&from=…&to=…`).
- **Stat cards** — page views, unique visitors (de-duplicated by user
  agent), order count, and revenue (PAID + PROCESSING + COMPLETED).
- **Conversion rate** = orders / page views.
- **Tables** — top 5 products by quantity, top 5 courses by enrollment,
  top 5 affiliates by commission earned.
- All queries are workspace-scoped and fired in parallel via `Promise.all`.

Helpers live in [lib/analytics-range.ts](lib/analytics-range.ts) for date
math and chart-key alignment.

### Integration settings

- [/dashboard/settings/integrations](app/dashboard/settings/integrations/page.tsx)
  — Zod-validated form with strict regex per field (e.g. `G-…` GA4
  Measurement ID, `GTM-…`, 6–30 digits for Meta Pixel).
- [components/site/tracking-scripts.tsx](components/site/tracking-scripts.tsx)
  injects FB Pixel, GA4, GTM, and an optional custom inline snippet on
  every public site page via `next/script` (`afterInteractive`). GA4 is
  initialized with `send_page_view: false`; real page views are sent by
  [components/site/page-view-tracker.tsx](components/site/page-view-tracker.tsx)
  on each published public page, including client-side navigation. If GA4
  Enhanced Measurement is configured to send history-change page views, turn
  that option off to avoid duplicate `page_view` events.
- The Search Console verification token is exposed as a meta tag through
  `generateMetadata` on the new
  [app/site/[workspaceSlug]/layout.tsx](app/site/[workspaceSlug]/layout.tsx).
- Gmail OAuth2 email settings let order and form notification emails send
  through Gmail API `users.messages.send`. The app refreshes the access token
  from the stored refresh token, builds an RFC 2822 MIME email, and sends the
  Gmail `raw` payload as base64url.
- Mailketing email settings let the same order and form notifications send
  through `https://api.mailketing.co.id/api/v1/send` using the documented
  `api_token`, `from_name`, `from_email`, `recipient`, `subject`, and `content`
  form parameters. Mailketing takes priority over Gmail when both are enabled.
- Custom scripts are sanitised by
  [lib/integrations.ts](lib/integrations.ts): reject when the snippet
  contains `</script`, contains `<!--`, or exceeds 2000 chars. They are
  **never** executed inside the dashboard — only on `/site/*` routes.

### Demo data

Acme Studio is seeded with an empty `IntegrationSetting` row so the
settings page loads with all fields blank. Page-view events from earlier
parts surface immediately in the new analytics dashboard.

---

## What's new in Part 8 — Affiliate, coupons, membership

### Schema additions

- `AffiliateProgram` (one per workspace), `Affiliate`, `Referral`,
  `Commission` (enums `ReferralEvent`, `CommissionStatus`)
- `Coupon` (enum `CouponType: PERCENTAGE | FIXED`) + `Order.couponId`,
  `Order.discount`
- `MembershipPlan`, `CustomerMembership` (enums `MembershipLevel`,
  `MembershipStatus`) + `Course.requiredLevel`

### Affiliate system

- Workspace owner edits a single program at
  [/dashboard/affiliate/program](app/dashboard/affiliate/program/page.tsx).
  Commission percent applies to the order total at the time of sale.
- [/dashboard/affiliate](app/dashboard/affiliate/page.tsx) lists affiliates
  with click / lead / sale / earnings stats and a copy-link helper.
- Public route [/r/[code]](app/r/[referralCode]/route.ts) records a
  `CLICK`, sets the `bd_ref` cookie (30-day attribution), and redirects to
  the workspace site.
- `enrollAction` records a `LEAD` on first-time enrollment via referral;
  `createOrderAction` records a `SALE` and creates a `Commission` row.
- [/dashboard/affiliate/commissions](app/dashboard/affiliate/commissions/page.tsx)
  shows totals + per-row status control (pending → approved → paid).

### Coupons

- [/dashboard/coupons](app/dashboard/coupons/page.tsx) — CRUD with a single
  dialog. Percentage or fixed-amount, optional max uses + expiry.
- Cart actions: `applyCouponAction` / `removeCouponAction`. The cart cookie
  now carries `couponCode`.
- Cart, checkout, and order-detail show the discount line.
- `createOrderAction` validates the coupon again at checkout and increments
  `Coupon.uses` in the same transaction.

### Membership

- Plans at [/dashboard/membership/plans](app/dashboard/membership/plans/page.tsx)
  bundle access at level `FREE`, `BASIC`, or `PREMIUM`.
- Members assigned manually at
  [/dashboard/membership/members](app/dashboard/membership/members/page.tsx)
  — pick a plan, type the customer's email, the customer is created if new.
- `Course.requiredLevel` gates paid courses. Public course pages show a
  "Premium members only" badge; `enrollAction` rejects enrollment when the
  customer doesn't already have a matching active membership.

### Demo data

Acme Studio is seeded with:

- An open Affiliate Program at 25%, two affiliates (`BUDI`, `NOVA`) with
  ~60 sample clicks total, one `LEAD`, and one `SALE` + commission
  (`Rp 105.000`, APPROVED) tied to `ORD-DEMO01`.
- Two coupons: `LAUNCH20` (20% off, capped at 100 uses) and `SAVE50K`
  (Rp 50.000 flat).
- Three membership plans (Community / Basic / Premium) with Budi assigned
  to Premium.

Quick checks:

- `http://localhost:3000/r/BUDI` → redirects to `/site/acme-studio` and
  drops the attribution cookie.
- Cart at `/site/acme-studio/cart` with the bundled tee × 2 + coupon
  `LAUNCH20` shows Rp 300.000 → 60.000 → 240.000.
- `/dashboard/orders/{ORD-DEMO01}` shows a Referral card alongside the
  Payment summary.

---

## What's new in Part 6 — Courses / LMS

### Schema

Added to [prisma/schema.prisma](prisma/schema.prisma): `Course`,
`CourseModule`, `CourseLesson`, `Enrollment`, `LessonProgress` with enums
`CourseStatus`, `LessonType`, `EnrollmentStatus`. Lesson content is stored
as `Json` and parsed into a type-specific shape by
[lib/lms.ts](lib/lms.ts) (`parseLessonContent`).

`Enrollment` reuses the existing `Customer` model — enrolling a learner
upserts a customer by email and links the two.

### Lesson types

| Type          | Shape                              | Renders as                              |
| ------------- | ---------------------------------- | --------------------------------------- |
| `TEXT`        | `{ body }`                         | Whitespace-preserving prose             |
| `VIDEO_EMBED` | `{ url }`                          | Responsive `<iframe>` (YT/Vimeo normalised) |
| `PDF`         | `{ url }`                          | Inline `<object>` + open-in-new-tab     |
| `LINK`        | `{ url, label }`                   | Button that opens an external link      |

### Course management (dashboard)

- [/dashboard/courses](app/dashboard/courses/page.tsx) — list with status,
  pricing, module/enrolled counts, status changes, delete
- `/dashboard/courses/new` — basic course form (title, slug, pricing)
- `/dashboard/courses/[id]/edit` — full details (summary, description, cover
  image, free/paid + price, status)
- `/dashboard/courses/[id]/modules` — the **curriculum editor**: add and
  reorder modules with up/down arrows, add lessons of any type via a dialog,
  edit content inline, delete with confirmation
- `/dashboard/courses/[id]/lessons` — a flat list of every lesson across all
  modules with quick edit access

### Public catalog + enrollment

`/site/[workspaceSlug]/courses` lists published courses. The detail page
shows the curriculum outline plus an enrollment box. **Enrollment is just
an email + name**: a `Customer` is upserted, an `Enrollment` is created (or
reused), and the enrollment id is stored in the `bd_enrollments` cookie so
the visitor can come back without bookmarking.

Paid courses share the same form — the dummy gateway always grants access
immediately. Real payment integration is left for later.

### Learner area

`/learn/[enrollmentId]` is a two-pane app:

- **Sidebar** — every lesson grouped by module, with completion check marks
  and the current lesson highlighted
- **Main** — lesson title, type-specific viewer, "Mark as complete" toggle,
  and Previous / Next navigation

Access is by enrollment id (URL = access token for MVP). The progress bar
in the top banner shows percent complete in real time.

### Demo course

Acme Studio is seeded with **"Build a Notion-style Site in 7 Days"**
(published, free) — 3 modules, 6 lessons across all four types, plus an
enrollment for "Budi Santoso" with the first 2 lessons completed. Just
sign into the course's URL or follow the `/courses` link on the demo site.

---

## What's new in Part 5 — Online store

### Schema

Added to [prisma/schema.prisma](prisma/schema.prisma): `ProductCategory`,
`Product`, `Customer`, `Order`, `OrderItem`, `Payment` + enums
`ProductType`, `ProductStatus`, `OrderStatus`, `PaymentStatus`. The existing
`UploadFile` model now backs product images.

Money is stored as a plain integer (whole rupiah); `formatPrice()` renders it
as `Rp 1.500.000`.

### Image upload (local VPS storage)

[app/api/upload/route.ts](app/api/upload/route.ts) — authenticated, requires
`content.edit`. Validates the MIME type (PNG/JPG/WEBP/GIF) and size (≤ 5 MB),
writes the file to `public/uploads/<workspaceId>/`, and records an
`UploadFile` row. The client picker is
[image-upload.tsx](components/products/image-upload.tsx).

### Products

- [/dashboard/products](app/dashboard/products/page.tsx) — list table
- `/dashboard/products/new` · `/dashboard/products/[productId]/edit` —
  [product-form.tsx](components/products/product-form.tsx): physical/digital,
  normal + discount price, stock, free-text category (auto-created), image,
  and a status of draft / active / archived.

### Storefront

Public, under `/site/[workspaceSlug]`:

- `/products` — grid with category filter (active products only)
- `/products/[productSlug]` — detail with quantity picker + add to cart
- `/cart` — line items with quantity controls
- `/checkout` — customer form → **dummy checkout**
- `/checkout/success` — order confirmation

The cart is a signed, http-only cookie (`bd_cart`) scoped to one workspace,
managed by server actions in [lib/actions/cart.ts](lib/actions/cart.ts).

### Checkout & orders

[lib/actions/order.ts](lib/actions/order.ts) — `createOrderAction` validates
the form, re-checks stock, upserts a `Customer`, then creates the `Order`,
`OrderItem`s, and a `Payment` in one transaction. Payment is a **dummy
gateway that always succeeds**, so orders are created as `PAID` and physical
stock is decremented.

Order management:

- [/dashboard/orders](app/dashboard/orders/page.tsx) — list
- `/dashboard/orders/[orderId]` — items, customer, payment, and a status
  control (pending → paid → processing → completed → cancelled)

### Demo store data

Acme Studio is seeded with 2 categories, 5 products (4 active incl. 2 on
sale, 1 draft), 1 customer, and 1 paid order (`ORD-DEMO01`).

---

## What's new in Part 4 — Public renderer

### Schema

Added `AnalyticsEvent` to [prisma/schema.prisma](prisma/schema.prisma):
`type` (`PAGE_VIEW`), `workspaceId`, `pageId`, `path`, `referrer`,
`userAgent`, `createdAt`. Indexed by `(workspaceId, createdAt)` and `pageId`.

### Public routes

Outside the dashboard, fully public (middleware only guards `/dashboard`):

- [`/site/[workspaceSlug]`](app/site/[workspaceSlug]/page.tsx) — workspace home (the "home" page, or the first published page)
- [`/site/[workspaceSlug]/[pageSlug]`](app/site/[workspaceSlug]/[pageSlug]/page.tsx) — a specific page
- [`app/site/not-found.tsx`](app/site/not-found.tsx) — a site-flavored 404

### Visibility rules

[lib/public-page.ts](lib/public-page.ts) — `loadViewablePage()`:

- **Published** pages are visible to everyone.
- **Draft / archived** pages return `notFound()` — unless the signed-in user
  is a member of the workspace, who sees them in **preview mode** with an
  amber banner ([preview-banner.tsx](components/site/preview-banner.tsx)).

`resolvePublicPage()` is wrapped in React `cache` so `generateMetadata` and
the page render share one database read per request.

### Dynamic SEO

Each route exports `generateMetadata` → `publicPageMetadata()` builds title
(`seoTitle` ‖ `title`), description (`metaDescription`), and Open Graph tags
(incl. `ogImage`). The title uses `absolute` so published sites don't inherit
the "· Buildery" template. Non-published pages get `robots: noindex`.

### Rendering

[components/blocks/public-block-renderer.tsx](components/blocks/public-block-renderer.tsx)
renders the ordered blocks (reusing the Part 3 block components) plus a
minimal footer, with the workspace accent color exposed as `--bd-accent`.

### Page-view analytics

- [components/site/page-view-tracker.tsx](components/site/page-view-tracker.tsx) —
  a client component that POSTs to `/api/track` once per page load
  (module-scoped guard survives StrictMode). Preview views are **not** tracked.
- [app/api/track/route.ts](app/api/track/route.ts) — validates that the page
  belongs to the workspace, reads `user-agent` server-side, then inserts.
- [lib/analytics.ts](lib/analytics.ts) — `recordPageView()` (failures are
  swallowed so analytics can't break a render) and `getPageViewCounts()`.

The dashboard **Pages** table shows a live **Views** column and a
**View live** action for published pages.

---

## What's new in Part 3 — Website builder

### Schema

Added to [prisma/schema.prisma](prisma/schema.prisma):

- `Website` — one per workspace (auto-provisioned), holds pages
- `Page` — title, slug, `status` (DRAFT / PUBLISHED / ARCHIVED), SEO fields
- `PageBlock` — `type`, `order`, and a `data` JSON column — the page layout
- `PageStatus` and `BlockType` enums

### How the layout is stored

A page's layout is an ordered list of `PageBlock` rows. Each block carries a
typed JSON `data` payload. Saving from the builder runs one transaction:
delete all blocks for the page, then recreate them from the canvas array
(`order` = array index). Block `id`s are client-side only.

### Blocks

Nine block types, each with a Zod schema + defaults in
[lib/blocks/schema.ts](lib/blocks/schema.ts) and metadata in
[lib/blocks/registry.ts](lib/blocks/registry.ts):

`HERO` · `TEXT` · `IMAGE` · `CTA` · `FEATURE_GRID` · `PRICING` ·
`TESTIMONIAL` · `FAQ` · `CONTACT_FORM`

Render components live in [components/blocks/](components/blocks/) and are pure
and presentational — reused by both the canvas and the preview.

### Builder UI (`/dashboard/pages/[pageId]/builder`)

A three-pane, Notion-style editor:

- **Left** — block palette ([block-sidebar.tsx](components/builder/block-sidebar.tsx)), click to add
- **Center** — live canvas ([canvas.tsx](components/builder/canvas.tsx)) with select, move up/down, delete
- **Right** — settings panel ([settings-panel.tsx](components/builder/settings-panel.tsx)) editing the selected block
- **Topbar** — Save / Preview / Publish · Unpublish, with a dirty indicator

Reordering uses **move up / down** (no drag-and-drop).

### Pages

- [/dashboard/pages](app/dashboard/pages/page.tsx) — list with status, block count, row actions
- [/dashboard/pages/new](app/dashboard/pages/new/page.tsx) — create (slug autogen)
- `/dashboard/pages/[pageId]/builder` — the builder
- `/dashboard/pages/[pageId]/settings` — title, slug, status, SEO
- `/dashboard/pages/[pageId]/preview` — full-screen render of saved blocks

### Server actions & validation

[lib/actions/page.ts](lib/actions/page.ts) — `createPage`, `updatePageSettings`,
`savePageBlocks`, `setPageStatus`, `deletePage`, `updateWebsite`. The save
action validates the whole payload against a Zod discriminated union
(`pageBlocksSchema`) before writing.

### Design note — one website per workspace

This MVP auto-provisions a single `Website` per workspace
(`getOrCreateDefaultWebsite`). The data model already supports multiple
websites; a management UI for it is left for a later part.

---

## What's new in Part 2

### Schema

Added to [prisma/schema.prisma](prisma/schema.prisma):

- `Workspace` — name, slug, branding, custom domain
- `WorkspaceMember` — joins user ↔ workspace with a `MemberRole`
- `WorkspaceInvitation` — pending invites for users who haven't signed up yet
- `UploadFile` — placeholder model for future uploads
- `MemberRole` enum — `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`

### Workspace context

- Cookie-based current workspace (`buildery_workspace`)
- Server helpers in [lib/workspace.ts](lib/workspace.ts):
  - `getCurrentWorkspace(userId)`
  - `requireCurrentWorkspace()`
  - `requireWorkspacePermission(permission)`
  - `listMyWorkspaces(userId)`

### Permissions

Two independent layers:

1. **System role** (`User.role`) — already from Part 1. Controls global nav and admin features.
2. **Member role** (`WorkspaceMember.role`) — gates workspace data and settings.

Helpers in [lib/permissions.ts](lib/permissions.ts):
- `canInWorkspace(role, permission)` — `workspace.edit`, `members.manage`, `branding.edit`, etc.
- `assignableMemberRoles(callerRole)` — what roles a caller may assign.

### Pages

- [/dashboard/workspaces](app/dashboard/workspaces/page.tsx) — list, switch, create
- [/dashboard/workspaces/new](app/dashboard/workspaces/new/page.tsx) — create form with slug autogen
- [/dashboard/settings](app/dashboard/settings/page.tsx) — general (name, slug, danger zone)
- [/dashboard/settings/branding](app/dashboard/settings/branding/page.tsx) — logo, favicon, color, custom domain
- [/dashboard/settings/members](app/dashboard/settings/members/page.tsx) — table, invite dialog, role change, remove, pending invitations

### Components

- [components/dashboard/workspace-switcher.tsx](components/dashboard/workspace-switcher.tsx) — dropdown in sidebar + mobile sidebar
- [components/workspaces/invite-member-dialog.tsx](components/workspaces/invite-member-dialog.tsx)
- [components/workspaces/member-row-actions.tsx](components/workspaces/member-row-actions.tsx) — role change + remove
- [components/workspaces/delete-workspace-dialog.tsx](components/workspaces/delete-workspace-dialog.tsx) — type-to-confirm

### New shadcn primitives

`Dialog`, `AlertDialog`, `Select`, `Table`, `Textarea`, `Toaster` (sonner).

---

## Permission matrix (workspace level)

| Action                | OWNER | ADMIN | EDITOR | VIEWER |
| --------------------- | :---: | :---: | :----: | :----: |
| View workspace        |   ✔   |   ✔   |   ✔    |   ✔    |
| Edit name/slug        |   ✔   |   ✔   |        |        |
| Edit branding         |   ✔   |   ✔   |        |        |
| Invite / manage members |  ✔  |   ✔   |        |        |
| Edit content          |   ✔   |   ✔   |   ✔    |        |
| Delete workspace      |   ✔   |       |        |        |

---

## Invite flow (MVP)

This part keeps email delivery out of scope. The invite action does one of:

- **Email belongs to an existing user** → creates `WorkspaceMember` immediately.
- **Email is unknown** → stores a `WorkspaceInvitation` (14-day expiry). When that user later registers, you'll wire up auto-acceptance in a future part.

The members page surfaces both lists with revoke + role change.

---

## Useful scripts

```bash
pnpm dev               # start Next.js dev server
pnpm build             # production build
pnpm start             # serve production build
pnpm lint              # ESLint

pnpm prisma:generate
pnpm prisma:migrate    # name the new one e.g. "part-2-workspaces"
pnpm prisma:push       # schema-only push (dev convenience)
pnpm prisma:studio
pnpm prisma:seed
pnpm db:reset          # drop, re-migrate, reseed
```

---

## Coming in later parts

- Site builder canvas + block model (scoped to current workspace)
- Public site rendering at custom domains
- Products, courses, blog, forms, orders, affiliate
- File upload backend (S3 / local) wired to `UploadFile`
- Accept-invitation flow with one-click links
- Workspace ownership transfer
