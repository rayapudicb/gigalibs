# WI-OI-140: M-REQ No-login QR maintenance requests (CMMS extension, public web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything";
  order confirmed 2026-11-02); In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-140. Evidence: `.pi/work/WI-OI-140.md`. Spec: `docs/products/mobile-suite/09-no-login-qr-requester.md`;
  ADR-0035 (CMMS owns request intake and conversion; the public gateway handles the anonymous capability: a signed,
  revocable, scoped capability, no tenant trusted from the QR alone, no unrestricted anonymous write; status needs
  proof of requester control).

## Ownership and security decision (agent, under the owner's directive; for Security and Architecture review)

CMMS owns request links, portal submissions and the maintenance requests they raise; triage and conversion stay in
the existing CMMS requests flow. The anonymous path is the platform's first live public write, so it is built as a
bounded capability:

- **Capability:** a link per asset, `tenant.link.secret` (256-bit secret, only its SHA-256 stored), carried in the URL
  fragment (`/r#…`) so it never reaches server logs; revocable and optionally expiring. The tenant in the token is a
  claim the secret must prove: CMMS checks the hash under that tenant's row security.
- **Path:** public page → web `/api/public/cmms-portal/*` (body cap) → control plane public adapter (token shape,
  per-address throttle, live tenant with CMMS entitled) → a 60-second CMMS context for a portal principal holding only
  `cmms.portal.submit` → CMMS portal routes, which no web or mobile gateway lists.
- **Limits (CMMS, database-backed):** per link 10 an hour, per client per link 3 an hour (keyed HMAC of the address),
  per tenant 300 a day; photo ≤ 300 KB, sniffed; text bounded.
- **Disclosure:** the page shows the asset's tag and name and, at most, that a request was logged N minutes ago; never
  names, notes or other tickets. A receipt carries a separate status secret; status shows the request's state only.

## Design

- **Data (CMMS migration 32):** `portal_links` (asset, label, secret hash, ACTIVE/REVOKED, expiry, last use);
  `portal_submissions` (append-only: link, operation id, issue type, request, status-secret hash, client key);
  `portal_submission_photos` (append-only). Requests are raised through the request service as `portal:<link>`.
- **Admin (web):** `/cmms/request-links` — create links per asset (token shown once, printable QR labels with tag and
  name), revoke, recent portal submissions with photos. QR encoder in the CMMS web package (byte mode, level M).
- **Public web:** `/r` request card (issue type pills, description, camera photo, optional name and contact) and
  `/r/status` receipt status.
- **Mobile (signed-in):** feature `requests` — scan an asset tag, report a problem, follow own requests, through
  `/mobile/v1/requests/*` with `cmms.requests.report`.
- **Permissions:** `cmms.portal.manage` (planner); `cmms.requests.report` (members who report); `cmms.portal.submit` is
  minted only by the control plane.

## Gates

Requester SMS/email updates (Communications); shared (multi-instance) address throttle at the edge; trusted client
address from the proxy; photo storage beyond 300 KB (object storage); voice notes; bulk label formats (Avery/Brady);
device proof; owner UAT; Security review of the public path.
