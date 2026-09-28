# WI-OI-013 IAM and runtime-containment implementation status

## 2026-09-15 containment regression correction

A repository-wide verification pass found later work had made several unaccepted capabilities reachable
again. Event Fabric queue/replay, Saga, Governor consume/quotas, SCIM service configuration/users, user
locale mutation and Workflow Studio run-stream/webhook endpoints now fail closed through the canonical
unavailable-capability response. Five Workflow Studio pages that exposed hard-coded or simulated workflow
outcomes were also returned to explicit containment. Their original sources are preserved with verified
hashes in the containment manifest and `scratch/wi-oi-013-originals`; current work-in-progress sources are
preserved outside the runtime graph in `scratch/wi-oi-041-wip`.

The authenticated upstream boundary no longer exposes arbitrary infrastructure exception messages. Only a
validated request-body error may be returned; other failures use the fixed unavailable response. Focused
verification passes 194 containment tests and 69 authentication-boundary tests, and the repository build,
test suite and mandatory static audits pass. This is a safety correction, not IAM completion: external
IdP/SCIM/SAML/WebAuthn interoperability, operator-controlled DNS/TLS, regional infrastructure,
production-scale recovery and named independent acceptance remain open. Status remains **In Progress /
No-Go**.

## 2026-09-10 platform-authority and UAT access correction

The displayed `SUPER_ADMIN` role was confirmed to be tenant-scoped and therefore could not authorize the
cross-tenant Platform Control Tower. The new implementation introduces persisted global platform roles,
tenant trial/module-entitlement state, reserved subdomains and isolation desired state. It also adds the
real control-plane API/UI for tenant creation, lifecycle changes, trial extension and eligible-module
assignment. Self-service workspaces now begin as seven-day trials; the former tenant self-activation
shortcut was removed and expired trials fail closed.

The local UAT migration is applied and `newuser@gigalibs.io` now has an audited `PLATFORM_OWNER`
assignment plus twelve local tenant entitlements. A fresh Chromium finance flow reached the 30-entry
catalogue, opened all five finance workbenches and recorded no `5xx` or page error. Workflow Definitions,
Data Contracts and Connections were returned to containment after their legacy suite contracts returned
`503`. Other persona and mutation journeys remain open. Payment, DNS/TLS and dedicated-database provider
execution is not claimed. See
[UAT access and role-flow status](uat-access-and-role-flow-status.md) for the exact role and module matrix.

The global identity slice now adds `/platform-admin/users` and a production-shaped personal security
screen. Profile edits and password changes persist through the control plane; platform owners can inspect
safe user/membership projections, manage global roles, suspend/reactivate identities and issue bounded,
display-once recovery links. Seven real database/API outcomes and five owner/auditor browser outcomes pass, with no raw
credential retained in evidence. Members can also inspect, explicitly link and password-protect the
disconnect of their own external sign-in binding from `/settings/profile`. This completes the bounded local
owner and member identity-management paths, while external-provider interoperability, upstream lifecycle,
WebAuthn and independent acceptance remain open.

Assessment date: 2026-09-09; runtime evidence updated 2026-09-12. Status: **In Progress / No-Go**. This is implementation evidence for the
first trust-boundary slice. It is not full-platform, module, UAT, deployment or production certification.

## Implemented and verified

- Login and account registration now accept the canonical schemas, call the authoritative control plane,
  require its complete token contract and fail unavailable without issuing a fabricated user, tenant, role
  or cookie.
- Refresh, logout, tenant selection and session context use HttpOnly server cookies, bounded upstream calls,
  redirect rejection and no-store responses. An upstream outage no longer destroys a potentially renewable
  session, and logout no longer reports success when server-side revocation fails. Expired access tokens
  refresh before dispatch; an application-level `401` never replays a state-changing request.
- The Next application validates the current database session and membership before rendering its protected
  layout. Host names, legacy cookies and caller tenant headers no longer become tenant authority.
- Tenant discovery and workspace creation remain available when a selected tenant is stale or provisioning.
  Newly created workspaces have an explicit **Finish setup** action that activates the tenant through the
  authenticated, permission-checked and audited status API. Login, refresh and protected rendering now use
  the same operational status rule: `ACTIVE` and `TRIAL` are accepted; inactive lifecycle states fail closed.
- The RBAC guard resolves the current persisted membership role instead of retaining a higher role embedded
  in an older token. Suspended users cannot authenticate or refresh. Refresh rotation uses a conditional
  update so two consumers cannot both rotate the same persisted credential.
- A forward-only migration converts 33 IAM, tenant-lifecycle, environment, role and audit instants to
  PostgreSQL `timestamptz(3)`, preserves existing Prisma-observed UTC values and resets database defaults.
  The MFA migration adds five more absolute-time columns, domain verification adds three and recovery-code
  storage adds two and OIDC storage adds seven, bringing the checked IAM/MFA/domain/OIDC inventory to 50.
  ORM connections explicitly use UTC, preventing the PostgreSQL host timezone from shifting new sessions.
- Tenant administrators now have a persisted `/settings` workflow for member listing, invitation creation,
  one-time manual secure-link delivery, invitation revocation, base-role/status changes and custom-role
  create/update/delete/assignment. Secrets are stored only as SHA-256 digests and excluded from list APIs.
  Mutations require current database state plus a reason, serialize tenant membership decisions, append audit
  evidence and revoke the affected tenant sessions when a membership is suspended.
- Custom roles are no longer isolated records: a nullable foreign key connects them to memberships and the
  authorization guard resolves validated tenant permissions on every request. Platform permissions are
  rejected, assigned roles cannot be deleted, stale writes fail and removing a role removes its grants on
  the next request.
- Tenant administrators can enable a persisted tenant TOTP policy from `/settings`. Once enabled, the global
  authentication guard blocks every unverified tenant request except the bounded context, tenant-selection,
  enrollment, verification and logout paths. Enrollment requires a password session created within ten
  minutes, stores the 160-bit secret in an authenticated AES-GCM envelope, and returns it only during that
  enrollment response. Verification is session-specific, accepts a one-step clock window, rejects replayed
  time steps, applies a five-attempt/15-minute lockout and audits outcomes without storing codes or secrets.
- Tenant administrators can create, inspect, verify and revoke a canonical organization-domain challenge.
  The control plane accepts only normalized public hostnames, returns a 256-bit DNS TXT challenge once,
  stores only its SHA-256 digest, resolves real DNS with a bounded timeout, persists mismatch/lockout state
  and never marks a domain verified when DNS is missing or unavailable. Existing domain values move to an
  unverified candidate field, pending claims cannot squat the unique trusted-domain slot, every mutation
  requires a reason and broad tenant APIs cannot expose the challenge digest.
- Members receive ten display-once 100-bit recovery codes after initial TOTP verification and can rotate
  them from `/settings/profile`. Only user-bound SHA-256 digests and one-time use timestamps are persisted.
  Use restores one session, atomically consumes one code, reports only the remaining count, rejects replay
  and shares the persisted TOTP lockout counter. Rotation requires a reason and revokes all prior codes.
- Tenant administrators can configure one OIDC issuer/client from `/settings`. The client secret and PKCE
  verifier use context-bound AES-GCM envelopes, state is stored only as a digest and callback transactions are
  locked and consumed once. Authorization Code + S256 PKCE validates discovery metadata, issuer, audience,
  signature, lifetime, nonce, state and verified-email claims through `openid-client`. Production outbound
  requests require HTTPS and reject redirects plus private/reserved network destinations. Existing active
  members can be linked by a verified provider email; JIT creates a persisted user/membership only for the
  exact verified tenant domain and only as `MEMBER` or `VIEWER`. Trust changes revoke tenant sessions.
- Members can manage their own OIDC binding from the **Sign-in Methods** tab in `/settings/profile`. Link
  transactions are separately typed, expiring and one-time; completion requires a signed verified-email
  proof matching the authenticated account and cannot take over another user's issuer/subject. Disconnect
  requires the current local password plus an optimistic version and reason, retains the revoked lifecycle,
  preserves the acting session, revokes other sessions and records redacted audit evidence.
- Tenant admins now have a settings workflow and tenant-scoped APIs to request, inspect and download a signed
  portability archive. An inventory classifies every Prisma model and fails tests when schema inventory drifts.
  The worker uses a repeatable-read snapshot, explicit redaction/security exclusions, retained source-payload
  decryption, deterministic JSON/CSV/ZIP, SHA-256 plus Ed25519 evidence, verified S3-compatible upload,
  recoverable claims/retries, bounded presigned downloads and automatic expiry deletion. Every lifecycle
  transition is audited; live role downgrades remove access on the next request.
- Control-payload encryption now supports one active key and a bounded version-addressed old-key ring. New
  writes use only the active key, a successful TOTP proof rewraps an old credential, an authorized OIDC
  configuration save rewraps its client secret, in-flight OIDC transactions can survive a deployment rollover,
  and retained source payloads remain readable under their recorded version. Malformed or ambiguous key-ring
  configuration fails startup.
- The control-plane API now has durable administrator-assisted MFA recovery. A target cannot request or
  approve their own reset; a distinct second tenant administrator with MFA must approve an expiring request.
  Approval revokes target sessions, returns a one-time grant exactly once, and consumption deletes old TOTP
  and recovery-code credentials, rejects replay and forces reenrollment. The grant is stored only as a
  user-bound digest and excluded from tenant exports and audit data.
- Tenant Settings now exposes the assisted-recovery request, persisted history, approve/reject and
  display-once grant journey. The MFA page consumes the grant and requires replacement authenticator
  enrollment. The BFF accepts only the exact recovery paths, and the service recognizes both persisted
  `TENANT_ADMIN` and `SUPER_ADMIN` tenant authority while denying lower roles.
- Global platform owners now have a PostgreSQL-backed user and RBAC console. Safe directory responses omit
  password hashes, status changes revoke sessions, role mutations enforce owner-only and last-owner
  protections, and operator targets cannot be changed by a lower platform role. Personal profile edits use
  optimistic concurrency; local password changes require the current password and revoke other sessions.
  Display-once password recovery persists only a bounded SHA-256 token digest, rejects replay and revokes
  all active sessions after replacement.
- Forward migration `20260910000000_tenant_data_exports` provides the additive persistent export-job state
  machine. Database constraints require exact request/running/success/failure/expiry shapes, complete archive,
  manifest, signing-public-key, expiry and count evidence, and only one active job per tenant. No existing
  tenant rows are backfilled.
- Unsafe suite API routes and prototype page entry points recorded in the containment manifest are fail-closed. Anonymous and
  forged sessions get a denial; a verified session gets `CAPABILITY_UNAVAILABLE` and no business-success
  response. Original source is retained outside runtime imports under `scratch/wi-oi-013-originals` and is
  indexed by [iam-containment-manifest.json](iam-containment-manifest.json).
- Canonical control-plane, workflow, run and operational-intelligence BFF roots remain available for their
  own scoped integration verification. The standalone Accounts Receivable application was not replaced by
  the disabled suite bridge.
- The primary `/ar` route now uses a local-only, allowlisted BFF bridge to the standalone Accounts
  Receivable API. It derives tenant and actor identity from the verified suite session and supports real
  PostgreSQL-backed setup, customer creation/listing, invoice draft creation/listing and immutable issue for
  platform-owner/admin UAT. Nested legacy AR routes remain contained; this bridge does not certify complete
  AR or production federation.

## Recorded verification

| Evidence | Result | Scope limit |
| --- | --- | --- |
| Prior root build | 92/92 tasks passed before this extension | Historical local build; no deployment |
| Current workspace build | Exact `pnpm build` passed 94/94 Turbo tasks; Prisma, contracts, auth, database, RBAC, tenancy, finance NestJS services and the optimized Next.js production output were rebuilt | Local build evidence only; no deployment |
| Root tests | Exact `pnpm test` passed 548 TypeScript tests and 4 Python tests | Includes seven external-identity BFF cases and nine Currency/Recovery financial-truth boundary cases. Several older tests still exercise prototype engines, so passing is not business certification |
| IAM focused tests | 358 route/auth cases passed in the earlier focused run | Test doubles inject upstream failures; no business data |
| Real negative HTTP | 132 checks passed | Built Next.js with control/execution planes deliberately unavailable; no business writes |
| Real Chromium | 7 checks passed, 0 page errors | Automated negative flows; not human UAT |
| Isolated persistence | Migrations, control-plane certification and 14-check IAM run passed against a new attributable DB; DB and role removed | PostgreSQL 14.20, not the planned PostgreSQL 16; no providers |
| IAM migration upgrade | Eleven checks passed across all 18 prior migrations, pre-upgrade data, 33 type conversions, preserved instant, non-UTC-server defaults, nullable custom-role/MFA state, explicitly unverified legacy domains, recovery-code storage and OIDC tables/cascades; DB and role removed | PostgreSQL 14.20; assumes existing timestamps came from the canonical Prisma UTC path; imported local-wall-clock data needs provenance review |
| Updated isolated persistence | Clean migrations, control-plane certification and 20-check IAM run passed; DB and role removed | PostgreSQL 14.20; includes invitation/custom-role concurrency, TOTP enrollment/enforcement/replay/lockout, hashed one-time recovery codes and a real unmatched DNS lookup; no SSO/email providers or production data |
| PostgreSQL 16 migration and recovery | PostgreSQL 16 applied all 35 forward migrations, passed generated-client and zero-physical-schema-drift checks, persisted an attributable user/tenant/membership/audit graph, produced a 420,338-byte same-major custom backup, restored matching record/migration integrity and removed both isolated databases plus the temporary backup | Minimal IAM graph; production-import provenance, representative volume, WAL/PITR, RPO/RTO, deployment storage and failover remain open; evidence in `evidence/uat/postgresql16-backup-restore-result.json` |
| Platform tenant lifecycle | Nine real API/database outcomes passed on PostgreSQL 16: atomic trial creation, tenant selection, extension, allowlisted entitlements, contained-module denial without write, truthful pending isolation, suspension/cancellation session revocation, explicit activation, cancellation finality and append-only audit evidence | Test identities/tenant are deactivated/cancelled and visibly attributable; provider execution, DNS/TLS, billing conversion, regional routing and independent acceptance remain open; evidence in `evidence/uat/platform-tenant-lifecycle-result.json` |
| Isolated OIDC persistence | Seven end-to-end outcomes passed with real NestJS/Next.js processes, PostgreSQL and a signed OIDC issuer, including explicit password-protected disconnect and proof-based relinking; DB, role and isolated build directory removed | Isolated certification issuer, not external Okta/Entra/Google interoperability, upstream SCIM lifecycle or production data |
| Isolated tenant export | Seven end-to-end outcomes passed through the authenticated NestJS API with disposable PostgreSQL 14 and real MinIO; database, object data and sparse volume removed | Isolated certification records; production key custody/rotation, large-data performance and PostgreSQL 16 remain open |
| Isolated control-key rotation and assisted recovery | TOTP rewrap/audit, OIDC client-secret rewrap, retained source-payload decryption and the two-admin one-time recovery workflow passed through a real NestJS process and disposable PostgreSQL; database and role removed | Generated keys and records only; three-user UI UAT/support policy, production secret-manager rollout, old-key retention inventory and external IdP rotation remain open |
| Current local UI | The rebuilt Next.js production build is serving on port 5180. The supplied local account has an active persisted `SUPER_ADMIN` membership in the active `my-workspace` tenant. A fresh real BFF login returned a complete tenant-bound session/MFA context, and `/modules` rendered the module home plus `SUPER_ADMIN` without workspace or membership failure text. The login renders the white animated atmosphere. All successful auth paths land on the 30-capability catalogue; `/dashboard` is a compatibility redirect. | `SUPER_ADMIN` is a tenant membership role in the current schema, not global platform authority. Local account and development services only; no human business UAT, external IdP or production deployment. Catalogue labels are disclosure, not module certification. |
| Supplied-account browser flow | A non-mutating Chromium run authenticated the supplied account, opened the 30-module catalogue, rendered personal profile/password/external sign-in methods, rendered the PostgreSQL-backed Platform Tenant Control and proved the contained Reports route performed no business action; four checks passed with zero page errors | This verifies access and truthful containment in local UAT. It does not certify every catalogue module or any production deployment; evidence in `evidence/uat/current-account-browser-result.json` |
| Platform identity API/database | Nine outcomes passed for optimistic profile persistence, current-password enforcement, session revocation, safe directory projection, global-role grant/revoke, digest-only one-time recovery, suspend/reactivate behavior and durable external-identity revocation/reactivation | Attributable isolated-UAT users; external subjects stay out of the API/evidence; independent security review remains open |
| Platform identity browser | Owner login, profile update, user directory, display-once recovery and auditor read-only/403 enforcement passed five outcomes with zero page errors; the retained recovery screenshot masks the credential | Local Chromium and PostgreSQL only; the new external-identity controls still need browser UAT and independent acceptance |
| Live local runtime | PostgreSQL 16 is available at the configured local endpoint, all 30 migrations are applied, the rebuilt NestJS API is ready on port 3333 and the optimized Next.js application is ready on port 5180. A live authenticated probe rendered `/modules` and `/settings/profile`; fresh Chromium opened every finance workbench. | Local services and supplied UAT account only; no external provider or production deployment |
| Accounts Receivable local UAT | Authenticated suite BFF completed real tenant setup, customer creation/read-back, invoice draft calculation, immutable issuance as `UAT-000001`, issued-record read-back and idempotent setup replay; Chromium rendered the issued invoice with zero page errors | Loopback development OIDC bridge only. Payments, credits, void/rebill, supplemental billing, delivery, aging/reconciliation, production federation and independent acceptance remain open |
| Tax Configuration local UAT | Authenticated suite BFF and PostgreSQL-backed API completed tenant binding, jurisdiction, effective rate, pending exemption, explicit verification, tax calculation, idempotent replay, ledger/monitor readback, unauthenticated denial and cross-tenant isolation; platform-owner Chromium opened all five workbench sections with zero server errors | Local development issuer and shared local runtime role only. Statutory source/version lineage, policy lifecycle/revocation, concurrency/outbox recovery, backup/restore/load, accessibility and independent acceptance remain open |
| Five-module finance browser UAT | Supplied platform owner authenticated into `my-workspace`; the 30-module catalogue exposed all five finance links and Chromium opened `/ar`, `/spend`, `/tax`, `/currency` and `/recovery` with HTTP 200 module responses, no containment screen, no page error and no server error | Route access and current read/workbench rendering only; each module retains the outcome limits in its own work item |
| Currency and Recovery truth boundary | Nine focused tests pass. Live setup replay kept Currency pairs/ledger and Recovery findings/scans/claims at `0 → 0`; scan, claim and payment-hold requests without configured source/provider evidence returned HTTP 503 before business writes | Currency has no authoritative local rate feed and Recovery has no authoritative detection source or external action adapter. Empty truthful states are expected and are not business-outcome certification |
| Mandatory audits | Production data, all-runtime data, package dependencies, API boundary, navigation and SDLC passed | Static scanners do not prove end-to-end outcomes |

Evidence lives in [evidence/iam](evidence/iam). The independent architecture/security design review is
[independent-design-review.md](evidence/iam/independent-design-review.md). A final independent code review
was attempted but was not completed because the reviewer agent reached its usage limit; human security and
product acceptance remain required by the SDLC.

## Open stop-ship findings

1. PostgreSQL 16 clean migration and isolated logical backup/restore now pass with record and migration
   integrity. Data-provenance review for non-Prisma imports, representative-volume RPO/RTO, WAL/PITR,
   deployment backup storage, failover and independent review of the timestamp conversion remain required
   before production deployment. The rehearsal did not alter the main `gigalibs` database.
2. External-provider OIDC interoperability and rotation, SAML, positive proof using an operator-controlled DNS zone,
   upstream deprovisioning/SCIM, WebAuthn and the assisted-recovery support policy and three-user UAT,
   automated invitation delivery and regional database bindings are not implemented. Tenant export now works
   end to end in isolated PostgreSQL/MinIO certification, while production signing-key custody/rotation,
   large-data performance and independent security/privacy/QA review remain open. Control-key rotation now has isolated
   application evidence, while secret-manager and multi-replica rollout plus multi-replica rate limiting still require
   deployment rehearsal. Custom roles currently add validated permission codes to one
   base membership; deny rules, field masks, groups and temporary grants remain open.
3. Source review after containment still finds production-reachable fallback or simulation behavior in the
   canonical AP, value, opportunities, connections, credentials and data-contract experiences. Passing the
   regex integrity scanner does not resolve these findings. Each path needs real lineage/persistence or an
   unavailable state before candidate use.
4. The disabled modules are contained, not completed. The five finance routes are now visible local-UAT
   workbenches, but visibility is not production completion. AR has a bounded actionable foundation and
   incomplete lifecycle outcomes. Spend and Tax have local persisted slices. Currency correctly remains
   empty until an authoritative rate source is configured. Recovery correctly remains empty until an
   authoritative finding source is connected, and external financial actions remain unavailable without
   provider receipts. CMMS, rule studio, data studio, connector hub, workflow studio, platform
   administration and solution-pack outcomes still need their planned tenant-scoped persistence,
   authorization, provider receipts, reconciliation and recovery.
   Reports is explicitly contained after its suite page was found to render hard-coded financial statements,
   counterparties, government opportunities and recovery values without tenant-scoped source records.
   Geospatial Studio also remains contained: a late `/api/maps` prototype returned fixed facilities,
   personnel, freight values, SLA metrics and fleet telemetry from source code. That runtime route was
   archived and removed, and the containment classifier now rejects any unreviewed Maps API reintroduction.
5. Full action-by-action source review, real-provider integration, representative migration recovery,
   performance,
   resilience, accessibility, manual business-role testing and human UAT are incomplete.
6. No production deployment, production telemetry window, security/risk acceptance, finance/domain
   acceptance or release authorization has occurred.
7. `SUPER_ADMIN` remains tenant-scoped by design. Persisted global platform roles, the platform guard,
   credential-free bootstrap, tenant control tower and user/RBAC console now exist for local UAT. External
   manual external-identity revocation/reactivation, member self-service link/disconnect and status-driven
   deprovisioning are implemented with isolated PostgreSQL API evidence; SCIM/upstream deprovisioning and independent
   security, QA and product acceptance remain open.

The next implementation work remains within WI-OI-013: external-provider OIDC/DNS interoperability and
provider-rotation evidence, authoritative SCIM lifecycle administration, SAML, WebAuthn and regional
binding. WI-OI-039 universal configuration and the remaining AR business scope stay behind this IAM
authority layer and its independent evidence. The bounded local AR foundation does not move another module
into production certification.
