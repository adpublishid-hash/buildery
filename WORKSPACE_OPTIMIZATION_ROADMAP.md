# Workspace Optimization Roadmap

Status: implemented on 18 September 2026.

## Governance and access

- [x] Explicit invite accept/decline flow with hashed, single-use, expiring tokens.
- [x] Invite resend rotates the token; revoke and expiry keep lifecycle history.
- [x] Role hierarchy is enforced on the server, including peer-admin protection.
- [x] Ownership transfer and voluntary workspace leave.
- [x] Plan-based member/seat limits.
- [x] Workspace audit log for sensitive governance changes.

## Domain and tenant safety

- [x] Custom-domain entitlement is enforced from the owner's plan.
- [x] DNS target plus TXT ownership verification.
- [x] HTTPS status and certificate expiry inspection.
- [x] Only active, verified domains resolve publicly.
- [x] Old workspace slugs redirect to the current canonical slug.
- [x] Inactive workspaces are excluded from public store and dashboard context.

## Lifecycle and recovery

- [x] Workspace statuses: active, suspended, and pending deletion.
- [x] Owner deletion uses a 30-day recovery window.
- [x] Owner restore flow from the workspace list.
- [x] Scheduled lifecycle sweep expires invites and purges due workspaces.
- [x] Super-admin suspend/reactivate controls.

## Operations and portability

- [x] Workspace health center with setup, domain, analytics, and job status.
- [x] Usage summary for content and operational data.
- [x] Audit activity feed.
- [x] Selective workspace clone for pages, forms, and store settings.
- [x] Clone excludes credentials, customers, transactions, submissions, and analytics.
- [x] Versioned JSON export with the same privacy boundary.

## Workspace experience

- [x] Locale, timezone, currency, and date-format defaults.
- [x] Searchable workspace switcher with favorites, recent ordering, and status.
- [x] Dedicated overview link from workspace cards.
- [x] Unit coverage for member hierarchy and invitation token hashing/rotation.

## Operational notes

- Apply migration `20260918150000_workspace_governance_upgrade` before starting the new application build.
- Existing unaccepted invitations are intentionally marked expired during migration and must be resent.
- Existing custom domains return to pending verification and need a newly saved TXT token before they become routable.
