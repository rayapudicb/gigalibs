# WI-OI-140 evidence: M-REQ no-login QR maintenance requests

Card: `.pi/tasks/WI-OI-140.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — CMMS, control-plane portal adapter, public web, admin web, mobile BFF and mobile app

**Ownership and security (agent decision under the owner's directive; for Security and Architecture review).** CMMS
owns request links, portal submissions, signed-in reports and the maintenance requests they raise; triage and
conversion stay in the CMMS requests flow. This is the platform's first live anonymous write (public forms stay
contained), built as a bounded capability per ADR-0035:

- **Capability.** A link per asset, `tenant.link.secret` (256-bit secret; CMMS stores only its SHA-256, unique). It
  rides in the URL fragment (`/r#…`), which browsers never send to servers; the pages send no referrer and are
  `noindex`. The tenant in the token is a claim: CMMS checks the secret's hash under that tenant's row security, and
  a context minted for another tenant or link finds nothing. Unknown, revoked, expired, archived-asset, unentitled and
  closed-tenant links all answer the same `PORTAL_LINK_INVALID`.
- **Path.** Public page → web `/api/public/cmms-portal/{context|requests|status}` (POST only, body cap, client
  address, no cookie/authorization/tenant header/query) → control plane `PublicCmmsPortalController` (token and body
  shape, in-process throttle 30/min per address, live tenant with CMMS entitled) → a 60-second CMMS context for
  `portal:<link>` holding only `cmms.portal.submit` → CMMS `v1/portal/*`, which no web or mobile gateway lists (test
  asserts it). Answers are re-validated against strict contracts before they leave the control plane.
- **Limits (CMMS, from its own records, serialised by a lock on the link):** 10 an hour per link, 3 an hour per client
  per link (the client key is an HMAC of the address with a daily-rotating label, keyed from the control plane's CMMS
  key; the address itself never reaches CMMS), 300 a day per tenant. Photo ≤ 300 KB, sniffed; text bounded.
- **Disclosure.** The card shows the asset tag and name and, at most, that a problem was reported N minutes ago
  (never what or by whom). A receipt carries a separate status capability derived from the link secret and the
  browser's operation id (so a replay returns the same one); status shows only RECEIVED, IN_HAND, DONE or CLOSED.

**Contracts** (`packages/contracts/src/cmms/portal.ts`): token parser, issue types, limits, links, submissions,
public context/submit/receipt/status, signed-in reports; `portalState`. Mobile problem `MOBILE_REPORT_CONFLICT`.

**CMMS migration 32** (`000032_request_portal_links`): `portal_links` (hash-only secret, whole revocation, expiry
after creation), `portal_submissions` (unique per link and operation, unique status hash, append-only),
`portal_submission_photos`, `request_reports` (unique per member and operation, append-only),
`request_report_photos`. Forced tenant RLS; append-only lists in compose and `verify-cmms-runtime.sh`; pins 31 → 32.
Proof `db/proofs/000032_request_portal_links.sql` passed; down to 31 while empty and up to 32, passes again (proof 31
still passes).

**Services** (`apps/api/src/portal/`): `PortalService` (links: create with the token shown once, revoke, list with
counts, submissions with photos; portal: context, submit, status) and `RequestReportsService` (signed-in report as the
member, replay by operation and payload hash, own reports with state). Requests are raised through
`RequestsService.submitWithClient` (issue → title and priority; contact → email or phone). Tests: 6 on real
PostgreSQL; the CMMS suite passes. Compiled `AppModule` loads.

**QR labels**: a dependency-free encoder in the CMMS web package (byte mode, level M, versions 1–15, lowest-penalty
mask) tested against the published HELLO WORLD Reed–Solomon vector, the standard format strings and the version-7
information bits, plus structure (finders, timing, dark module).

**Manifest**: `cmms.portal.manage` (planner), `cmms.requests.report`; the IAM containment manifest lists the new
`public` API root (reviewed family; the Security review stays open); manager routes only on the gateway; `/cmms/request-links` "QR Request
Links": pick assets, create labels (shown once; print sheet with QR, tag and name), revoke with a reason, requests
through links with photos. **Public web**: `/r` request card (issue pills, details, camera photo downscaled to ≤ 300
KB, optional name and contact, duplicate notice, resend with the same operation id) and `/r/status`.

**Control plane**: `callModule` split out of the mobile forwarder (mobile mapping unchanged; adapter suites pass);
portal adapter (5 tests); bounded 1 MiB parser also on `/api/v1/public/cmms-portal/requests` and `/api/v1/mobile/requests`.

**Mobile (signed-in)**: `MobileRequestsController` (tag resolve, report, mine) with its own permission
`cmms.requests.report` (technician, planner, viewer, equipment operator): checking the core `cmms.requests.create` in
the control plane would mark it platform-checked and stop it being unit- or place-scoped, which the CMMS role
reconciliation caught; session grant `requests`; BFF allowlist. App: contracts mirror, adapter (receipt must match asset and problem), feature
`@gigalibs/mobile-feature-requests` (scan, my reports with state, report card with photo; unchanged resend), routes
`/requests`, `/requests/report/[assetId]`; feature, binding, profiles, containment. Mobile lint, typecheck, 1,969
tests, 2 profiles, architecture pass.

**Gates still open**: requester SMS/email updates (Communications); a shared edge throttle (the address limit is per
process) and a trusted client address from the proxy; photos beyond 300 KB (object storage); voice notes; industrial
label formats; scanning a printed label with a phone (device proof); owner UAT; Security review of the public path.

**Module gate (2026-11-02).** `pnpm verify`: everything passes except the test step's four known pre-existing suites;
14 optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T02-28-54-283Z.log`. The first run
caught two real issues, both fixed: the control plane checking the core `cmms.requests.create` (now
`cmms.requests.report`), and the IAM containment manifest not yet classifying the public API root. `next build`
passes (`/cmms/request-links`, `/r`, `/r/status`); token audit clean. The synthetic worst signed-context
configuration is now 16,250 characters (refused at minting with a reason); the platform decision in WI-OI-134
remains open.
