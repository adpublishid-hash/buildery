# Buildery — Testing

## Automated tests

Unit tests run on [Vitest](https://vitest.dev/). They cover the pure
utility layer — the logic most worth locking down because the rest of the
app depends on it.

```bash
pnpm test         # run once
pnpm test:watch   # watch mode
```

### What's covered

| Suite                       | Module under test        | Focus                                            |
| --------------------------- | ------------------------ | ------------------------------------------------ |
| `test/slug.test.ts`         | `lib/slug`               | URL slug generation, length cap, edge cases      |
| `test/permissions.test.ts`  | `lib/permissions`        | System + **workspace authorization matrix**      |
| `test/analytics-range.test.ts` | `lib/analytics-range` | Date-range parsing, chart day keys               |
| `test/utils.test.ts`        | `lib/utils`              | Price/initials formatting, class merging         |
| `test/store.test.ts`        | `lib/store`              | Effective price, discounts, cart totals          |
| `test/forms.test.ts`        | `lib/forms`              | Form option parsing, CSV export + escaping       |
| `test/rate-limit.test.ts`   | `lib/rate-limit`         | Fixed-window limiting, reset, key isolation      |
| `test/public-return-requests.test.ts` | `lib/public-return-requests` | Public return intake: tokens, rate limits, duplicates, evidence |
| `test/job-health.test.ts`   | `lib/jobs/health`        | Recurring sweep health: stale, overdue, failed   |
| `test/payment-reconciliation.test.ts` | `lib/payment-reconciliation` | Midtrans sync sweep and single-payment retry |
| `test/payment-expiry.test.ts` | `lib/payments`         | Expiry sweep and single-payment manual expiry    |
| `test/forms.test.ts`        | `lib/forms`, `lib/forms-shared` | Field options, CSV rows, visibility rules on both entry points |
| `test/form-delivery-retry.test.ts` | `lib/form-delivery-retry` | Redelivery sweep: backoff, claiming, attempt ceiling |
| `test/form-webhook.test.ts` | `lib/form-delivery`      | Webhook signing, redirect refusal, SSRF refusal   |
| `test/outbound-url.test.ts` | `lib/outbound-url`       | Private/loopback/metadata address classification  |
| `test/form-submission-dedupe.test.ts` | `lib/actions/form-submission` | Submission idempotency key handling      |
| `test/form-funnel.test.ts`  | `lib/analytics`          | Form view recording and funnel aggregation        |

`test/permissions.test.ts` doubles as the **workspace-access integration
check**: every dashboard action and API route gates on `canInWorkspace()` /
`can()`, so exercising that matrix verifies the authorization rules the
whole app relies on.

### Test setup notes

- `vitest.config.ts` aliases `server-only` and `next/headers` to stubs in
  `test/stubs/`, so server-tagged libraries can be imported and their pure
  functions tested in a plain Node environment.
- Tests never touch the database — they're fast and deterministic.

---

## End-to-end tests

Playwright drives the real app in a browser, against the real database. The
suite covers the money path — checkout, payment, return request, refund — and
the access rules on the public return link.

```bash
pnpm test:e2e         # headless
pnpm test:e2e:ui      # Playwright UI mode
```

First run only:

```bash
pnpm exec playwright install chromium
```

### What's covered

| Spec                              | Flow                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `e2e/checkout-to-refund.spec.ts`  | Affiliate link → add to cart → manual-transfer checkout → seller verifies payment → customer files a return → seller refunds → stock restored, commission reversed |
| `e2e/return-access.spec.ts`       | The public return link with a missing, forged, expired, or wrong-order token                               |

### Setup notes

- **No external services.** Every scenario pays through a seeded manual
  transfer method, so Midtrans is never contacted.
- Each test seeds its own workspace, owner, product and affiliate
  (`e2e/fixtures/scenario.ts`) and deletes the workspace afterwards, which
  cascades the rest away. Specs never share state.
- `playwright.config.ts` starts `pnpm dev` if nothing is listening, and
  reuses a server that is already up. Point it elsewhere with `E2E_PORT` or
  `E2E_BASE_URL`.
- Workers are pinned to 1: the specs assert on stock counts and sweep state
  in one shared database.
- The specs assert on the rendered not-found page rather than a 404 status —
  the dev server answers `notFound()` with a 200 carrying the not-found UI.
- The public return action is rate limited to 5 requests per 10 minutes per
  IP. Without `TRUST_PROXY=true` every client counts as one IP, so running
  the checkout spec more than five times inside ten minutes will start
  failing on the rate limit rather than on a real regression.

### Deeper integration tests (future)

The E2E suite currently runs against the development database. To isolate it
fully:

1. A separate Postgres database, e.g. `buildery_test`.
2. `DATABASE_URL` pointed at it via `.env.test`.
3. `prisma migrate deploy` against it in a global setup hook.

The flows not covered above are verified by the manual QA checklist below.

---

## Manual QA checklist

Run through this before tagging a release. Use the seeded demo accounts
(`pnpm prisma:seed`, password `Password123!`).

### Authentication & onboarding

- [ ] Register a new account → redirected to `/verify`
- [ ] Verification code appears in the server console (`[verify] code …`)
- [ ] Wrong code shows an error; correct code advances to `/onboarding`
- [ ] Resend code issues a new one; the old one stops working
- [ ] `/onboarding` creates the first workspace → lands in the dashboard
- [ ] Visiting `/dashboard` while unverified redirects to `/verify`
- [ ] Login with a bad password fails; 8 rapid attempts get rate-limited
- [ ] Logout (sidebar button) confirms, then returns to `/login`

### Workspaces & members

- [ ] Workspace switcher changes the active workspace everywhere
- [ ] Branding changes (logo, colour) reflect on the public site
- [ ] Invite a member; role permissions are enforced (VIEWER can't edit)
- [ ] A non-member cannot open another workspace's data

### Builder & public pages

- [ ] Page builder: add / edit / reorder / delete blocks, then save
- [ ] Publish a page → visible at `/site/<workspace>/<slug>`
- [ ] Draft page → 404 publicly, but visible to members in preview mode
- [ ] SEO title / meta description render in the page `<head>`

### Store & payments

- [ ] Create a product (with image upload) → appears in the store
- [ ] Add to cart, apply a coupon, see the discount, check out
- [ ] Sandbox-free mode settles instantly → `/payment/success`
- [ ] With Midtrans keys: Snap redirect works; webhook flips the order
- [ ] Order + payment appear in the dashboard; statuses are correct
- [ ] Out-of-stock physical product can't be over-ordered

### Courses, blog, forms

- [ ] Free course: enrol → `/learn/<id>`, mark lessons complete
- [ ] Paid course: enrol → payment → access granted on success
- [ ] Blog post publishes; categories and tags work
- [ ] Public form submits; submission shows in the dashboard; CSV exports

### Affiliate, coupons, membership

- [ ] `/r/<code>` redirects and drops the attribution cookie
- [ ] A referred sale creates a commission row
- [ ] Coupon limits (max uses, expiry) are enforced at checkout
- [ ] Membership gate blocks enrolment in a premium course

### Analytics & admin

- [ ] Analytics range filter (today / 7d / 30d / custom) updates the chart
- [ ] Integration settings inject scripts on `/site/*`, not the dashboard
- [ ] `/admin` is reachable only by `SUPER_ADMIN`

### Cross-cutting

- [ ] Large tables paginate (orders, payments)
- [ ] Loading skeletons appear on navigation; route progress bar shows
- [ ] Empty states render when there's no data
- [ ] Triggering an error shows the error boundary with a retry button
- [ ] `⌘K` opens the command palette and jumps to pages
- [ ] Mobile: sidebar opens as a sheet; layouts are usable
- [ ] Security headers present (`curl -I` any page)
- [ ] `pnpm build` completes with no type errors
