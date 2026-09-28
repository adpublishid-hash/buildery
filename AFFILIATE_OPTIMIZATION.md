# Affiliate Optimization

Implemented on 18 September 2026.

## Security and attribution

- [x] HMAC-signed referral tokens with expiry and database revalidation
- [x] Workspace isolation at capture and commission settlement
- [x] First-click or last-click attribution with configurable 1-365 day window
- [x] Cross-subdomain/custom-domain attribution handoff
- [x] Bot flagging, 30-minute click deduplication, hashed visitor/IP identifiers
- [x] 90-day privacy cleanup for user-agent, referrer, and IP hash metadata
- [x] Self-referral prevention (configurable override)
- [x] SaaS feature checks on dashboard, public application, and redirects

## Affiliate lifecycle

- [x] Email OTP before application lookup or referral-code disclosure
- [x] Manual or automatic application approval
- [x] Pending, active, suspended, rejected, and archived states
- [x] Soft archive preserving click, commission, adjustment, and payout history
- [x] Referral-code rotation with 90-day aliases for old links
- [x] Owner/admin-only management and payout permissions

## Commission ledger

- [x] Product, course, and membership commissions
- [x] Merchandise-after-discount basis by default
- [x] Optional shipping, added tax, and fee inclusion
- [x] Immutable source, basis, rate, amount, currency, and availability snapshots
- [x] Idempotent source keys for webhook retries
- [x] Configurable refund hold and automatic approval sweep
- [x] Forward-only pending -> approved -> payout scheduled -> paid lifecycle
- [x] Refund/cancellation adjustments and post-payment clawbacks

## Payouts and operations

- [x] Configurable minimum payout threshold
- [x] Auditable payout batches and commission items
- [x] Processing, paid, failed, and cancelled settlement states
- [x] Required payment reference plus optional proof URL and notes
- [x] Encrypted payout account details and payout-time snapshots
- [x] Affiliate email notifications for application, approval, sale, commission, and payout
- [x] Paginated commissions, bulk approval, CSV export, conversion metrics, and unique clicks
- [x] Member affiliate portal with referral link, performance, payout settings, and history
- [x] Campaign resources (links, images, and ready-to-use copy) in the affiliate portal

## Dashboard pass (28 September 2026)

- [x] Affiliates list: status tabs with counts, search by name/email/code, pending-review banner, bulk approve/reject, reject with an internal note
- [x] Status changes follow an explicit transition table (`lib/affiliate-status.ts`) and are validated server-side
- [x] Commission ledger status filter (pagination keeps the filter) and inline approve with refund-hold date
- [x] Payouts: failed or cancelled batches release their commissions for re-batching; `FAILED` is now final, like `PAID` and `CANCELLED`
- [x] Payouts are only offered for active or suspended affiliates, matching the server rule

## Rates, referrals, and recurring commissions (28 September 2026)

- [x] Per-item commission rates for products, courses, and membership plans (Rates tab)
- [x] Negotiated rate per partner; precedence is partner rate > item rate > program default
- [x] Multi-product orders use each line's rate weighted by its value (`lib/affiliate-rates.ts`)
- [x] Optional recurring commission: membership renewals pay the original referrer without a fresh click
- [x] Referral log (clicks, leads, sales) with partner, landing page, source, and order, bots hidden
- [x] One-click open/close for public applications
- [x] Migration: `20260928120000_affiliate_rates_recurring` (nullable columns; existing behaviour unchanged)

## Deployment

1. Apply `20260918130000_affiliate_platform_upgrade` and `20260928120000_affiliate_rates_recurring`.
2. Run `prisma generate` after deployment.
3. Ensure the background job runner is active so `AFFILIATE_LIFECYCLE_SWEEP` runs hourly.
4. Optionally set `AFFILIATE_ATTRIBUTION_SECRET` and `AFFILIATE_PAYOUT_SECRET`; both fall back to `NEXTAUTH_SECRET`.
