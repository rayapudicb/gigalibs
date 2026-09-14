# WI-OI-013 — Self-service tenant administration, SSO/MFA, and regional isolation slice

Status: In Progress
Parent requirements: FR-14, NFR-SEC-001, NFR-SEC-002, NFR-DATA-004  
Producer: Backend & Data Engineer + Web Experience  
Independent reviewers: Security & Privacy, Solution Architecture, QA Spec  
Gate: G1–G5

## Outcome

Enterprise self-service tenant administration suite enabling org admins to configure SAML 2.0 / OIDC Single Sign-On,
enforce TOTP MFA policies, manage custom roles, customize branding, select data residency regions (US/EU/APAC), and perform one-click GDPR data exports.

### Global platform authority, tenant-trial and entitlement extension — 2026-09-10

The screenshot-level `SUPER_ADMIN` ambiguity reproduced a real authority-model gap: the role was a
tenant membership but the UI implied cross-tenant platform authority. This extension separates global
`PLATFORM_OWNER` / `PLATFORM_ADMIN` / `PLATFORM_AUDITOR` assignments from all tenant roles and loads them
from PostgreSQL on every platform request. A tenant `SUPER_ADMIN` cannot enter the global tenant registry.

The canonical control plane now has additive desired-state records for module entitlements, isolation
bindings and platform-owned subdomain bindings. `/platform-admin` lists and creates real tenant records,
starts or extends trials, activates/suspends tenants, updates only catalog-eligible module entitlements and
records isolation requests. Every mutation uses a transaction and append-only audit evidence. Provider
execution remains explicit: isolation is `REQUESTED` until a worker stores a real binding receipt, and a
subdomain is `RESERVED` until DNS/TLS evidence exists.

Self-service workspace creation now creates a seven-day `TRIAL`, tenant-admin membership, settings,
eligible entitlements and provisioning requests in one transaction. The prior tenant-controlled transition
from `PROVISIONING` to `ACTIVE` was removed. Trial expiry is enforced during login, refresh, tenant selection
and tenant-bound requests. Automatic payment conversion remains unavailable until a selected payment
provider has signed idempotent webhook and reconciliation behavior; administrator activation is recorded as
either a billing-reference decision or explicit platform override.

The module page and navigation now distinguish visible inventory from what the current session may open.
The current local tenant has twelve entitled surfaces; the five finance routes and global Platform Control
Tower have current browser evidence.
Contained/planned modules remain blocked and cannot be activated by submitting their module keys. Workflow
Definitions, Data Contracts and Connections were returned to containment when browser verification proved
that their suite screens still target quarantined contracts. Detailed persona and capability evidence is recorded in
`docs/audits/2026-09-09-readiness/uat-access-and-role-flow-status.md`.

This extension compiles and the repository test suite passes 548 TypeScript tests plus four Python tests.
The local migration, named-account bootstrap, platform-owner/auditor journeys and tenant
admin/manager/member/viewer/suspended/independent-registrant browser/API journeys are complete. Durable
external-identity revocation/reactivation and suspension-driven deprovisioning now have isolated PostgreSQL
API evidence. Destructive tenant-lifecycle UAT now passes against the local PostgreSQL 16 control plane.
Provider workers, external-provider interoperability, representative-volume recovery/failover and
independent security/QA/product acceptance
remain open; WI-OI-013 stays In Progress / No-Go.

### PostgreSQL 16 and platform tenant-lifecycle certification — 2026-09-12

The primary local UAT database was upgraded through all 30 forward migrations. A separate isolated
PostgreSQL 16.14 rehearsal applied the same 30 migrations, persisted an attributable
user/tenant/membership/audit graph, created a 374,639-byte custom-format backup
with same-major tools, restored it into a second database and matched record plus migration integrity. Both
isolated databases and the backup were removed.

Real API/database lifecycle UAT then passed nine outcomes: atomic trial creation with owner, settings,
entitlements and requested infrastructure; tenant selection; trial extension; allowlisted entitlement
mutation; rejection of a contained module without a write; dedicated-database isolation remaining
`REQUESTED` without a fabricated binding; suspension and cancellation session revocation; explicit active
reactivation; cancelled-tenant finality; and redacted append-only audit evidence. Certification identities
and tenants are retained only as deactivated/cancelled test-attributable history, with no active session or
platform authority. Evidence is in `docs/audits/2026-09-09-readiness/evidence/uat/`.

This closes the bounded local PostgreSQL 16 logical recovery and destructive tenant-lifecycle UAT gaps. It
does not prove production-scale RPO/RTO, WAL/PITR, infrastructure-provider execution, subdomain DNS/TLS,
regional routing or independent acceptance.

### Canonical module authority and finance local-UAT extension — 2026-09-12

The suite now derives module inventory, navigation, trial eligibility and permission requirements from one
canonical contract catalogue. The signed-in `my-workspace` session exposes all 30 registered modules and
can open the five finance workbenches at `/ar`, `/spend`, `/tax`, `/currency` and `/recovery`; platform
authority no longer substitutes for an active tenant membership, module entitlement or module permission.
An authenticated Chromium run opened all five routes with only HTTP 200 module responses and no containment
screen, page error or server error.

The Reports catalogue entry is contained and ineligible for entitlement. Its suite page had reintroduced
hard-coded balances, customers, government opportunities, recovery amounts and compliance labels with no
tenant query or persisted report snapshot. The archived source remains available for requirements recovery;
the runtime page performs no business action until WI-OI-031 supplies authoritative data lineage and evidence.

This access work does not certify all finance outcomes. A retrospective runtime check found that Currency
tenant setup had inserted hard-coded exchange rates and Recovery setup/action paths had generated findings,
scan counts, claims and provider-like receipts. The attributable generated records were removed from the
local `my-workspace` tenant. Currency and Recovery setup now create configuration only and seed zero business
records. Currency conversion requires a caller-owned idempotency key and an existing authoritative rate.
Recovery scans fail until a versioned source contract exists; payment holds, credits, claim dispatch and
settlement fail until an external provider supplies a verifiable receipt. Manual finding dismissal remains
the only internal recovery mutation and requires operator notes plus an audit event.

Nine focused financial-truth tests pass. A live API check proved Currency rates/ledger and Recovery
findings/scans/claims all remained `0 → 0` across repeated setup and rejected actions. Unsupported scan,
claim and payment-hold requests returned HTTP 503 before any business write. Evidence is retained in
`docs/audits/2026-09-09-readiness/evidence/uat/finance-suite-browser-result.json` and
`finance-truth-boundary-result.json`. These are local UAT access and fail-closed data-integrity results;
authoritative FX ingestion, recovery source contracts, provider adapters, reconciliation, PostgreSQL 16,
operational rehearsal and independent acceptance remain open. WI-OI-013 remains In Progress / No-Go.

### External identity lifecycle and deprovisioning extension — 2026-09-11

OIDC issuer/subject bindings now retain an explicit `ACTIVE` or `REVOKED` lifecycle. Platform owners and
administrators can inspect safe binding details in `/platform-admin/users`, revoke a binding, and reactivate
only a previously validated binding whose issuer still equals the tenant's configured issuer. The API never
returns the provider subject. Revocation terminates every active session for the subject and appends actor,
tenant, reason and outcome evidence. Suspending or deactivating a platform user atomically revokes sessions
and all active external bindings; restoring the user does not silently restore SSO. A later OIDC callback
fails closed when its durable binding is revoked. Changing the configured issuer or client identifier also
revokes existing bindings before a new proof can be established.

Forward migration `20260911000000_external_identity_lifecycle` adds the status, reason, revocation time and
optimistic-update timestamp, preserves all pre-existing bindings as active, adds a lifecycle check and
replaces the one-binding-per-configuration/user uniqueness constraint with a lifecycle lookup index. This
permits retained historical bindings when pairwise subjects or provider trust change; the globally unique
issuer/subject proof boundary remains intact. The migration is additive except for the superseded unique
index. Recovery is forward-only: revoke an unsafe binding or correct its lifecycle state after restoring the
pre-migration backup; do not remove the lifecycle columns after nodes depend on them.

Clean-install and seeded upgrade rehearsals passed the first 29 migrations on isolated PostgreSQL 14.20. A
later isolated PostgreSQL 16.14 rehearsal applied all 30 migrations, persisted an attributable IAM graph, created
a same-major custom-format backup, restored it into a second database and matched both record and migration
integrity before deleting both databases and the backup. The
real NestJS API certification passed nine platform-identity outcomes, including safe binding projection,
suspension deprovisioning, explicit reactivation, explicit revocation, session invalidation and audit
evidence. External Okta/Entra/Google interoperability, SCIM authority, browser UAT and
independent security/QA/product acceptance remain open, so this extension does not complete WI-OI-013.

### Explicit external-identity linking and self-service disconnect — 2026-09-12

`/settings/profile` now includes a **Sign-in Methods** workflow backed by the control plane. An authenticated
member can inspect only their own safe provider/binding projection, start an explicit ten-minute account-link
intent with a required reason, and disconnect an active binding by supplying the current local password,
the binding's current `updatedAt` value and a reason. Disconnect retains the binding as `REVOKED`, preserves
the session performing the protected action, revokes the member's other active sessions and appends the
before/after audit result. It never returns the provider subject.

Link completion uses a transaction purpose distinct from login. It locks and consumes the state row once,
revalidates the provider signature, issuer, audience, nonce, state, PKCE and `email_verified=true`, requires
an exact canonical match to the already authenticated user's email, rejects an issuer/subject owned by any
other account, and can reactivate only that same user's retained binding. A link callback returns a bounded
link result and redirects to the profile without creating or replacing authentication cookies. An exact-email
OIDC proof also records `emailVerifiedAt` for an existing account, which makes subsequent explicit linking
eligible without weakening registration or password-login verification rules. Active and unexpired trial
tenants now use the same operational-tenant rule across OIDC start/link and MFA recovery paths.

Forward migration `20260912000000_oidc_account_linking` adds the `LOGIN`/`LINK` purpose, authenticated link
user and reason fields, a database shape constraint, index and cascading user relation. The exact BFF routes
are allowlisted; adjacent paths remain closed. Isolated certification applied every migration to a new
non-superuser PostgreSQL database, ran the real NestJS control plane, Next.js BFF and signed OIDC issuer, and
passed seven OIDC outcomes including password-protected disconnect, other-session revocation, distinct link
intent, proof-based reactivation and replay rejection. The disposable database, role and build directory were
removed. External Okta/Entra/Google interoperability, upstream SCIM deprovisioning, provider rotation,
SAML, WebAuthn, public DNS proof and independent acceptance remain stop-ships. WI-OI-013 remains In Progress
and No-Go.

### Platform identity, profile and password-recovery extension — 2026-09-10

The global operator plane now includes a real PostgreSQL-backed user directory at
`/platform-admin/users`. A `PLATFORM_OWNER` can grant or revoke global roles; an owner or administrator can
activate, suspend or deactivate identities and issue a display-once password-recovery link. Tenant roles
remain separate and visible as memberships. Operator targets require owner authority, self-deactivation is
rejected, the last active owner is protected and status changes revoke active sessions.

`/settings/profile` now persists display name and E.164 phone changes with an optimistic version check,
resets phone verification when the value changes and appends audit evidence. Local password changes require
the current password, reject password reuse and revoke every other active session. Administrator recovery
stores only a SHA-256 token digest, expires after a bounded interval, invalidates earlier unused credentials,
is consumable once and revokes all sessions after replacement. Password hashes and raw recovery credentials
are excluded from directory APIs and audit data.

Real local-UAT certification passed seven API/database outcomes for profile persistence, current-password
enforcement, session revocation, safe user projection, platform-role grant/revoke, digest-only recovery,
one-time consumption and suspend/reactivate login behavior. Headless Chromium then completed owner and
auditor login, profile edit, platform-user directory, recovery-link UI and auditor mutation denial with zero
page errors. The retained screenshot
masks the display-once credential and cleanup consumes test credentials before deactivating the attributable
test identity. Evidence is in `docs/audits/2026-09-09-readiness/evidence/uat/`.

## Scope

- Self-service member invitations and custom role assignment.
- SAML SSO configuration (Okta, Azure AD / Entra ID, Google Workspace) and domain verification.
- Enforced Multi-Factor Authentication (TOTP / WebAuthn).
- Multi-region database residency bindings and full tenant data export archive (JSON/CSV).

## Acceptance Criteria

1. Org admins can invite team members and modify custom RBAC permissions without platform operator intervention.
2. Enabling MFA forces all tenant members to register a TOTP authenticator on subsequent login.
3. Tenant data export generates a cryptographically signed archive of all tenant-owned records.
4. All machine governance audits pass cleanly.

## Audit repair slice — 2026-09-09

Owner instruction: proceed with implementation of WI-OI-037. Routed through the SDLC orchestrator using the repository's agile_delivery_orchestrator and tenant_identity_access roles. The original enterprise scope above remains unverified; this slice addresses IAM-01/IAM-02 only.

- Outcome: users cannot acquire fabricated administrator sessions, read seeded business records, or receive invented financial/action success from the suite.
- Requirements: FR-14, FR-15, FR-16; NFR-SEC-001/002/003, NFR-DATA-001, NFR-REL-001, NFR-UX-002. Authority: ADR-0001.
- Design: canonical control-plane identity/session/membership validation; no shared service-token delegation; unsupported suite handlers return 401/403 or explicit 503 with no business calls. Prototype screens become unavailable pending real scoped persistence. Canonical AP/OI/workflow APIs and standalone AR keep their current boundaries.
- Independent design review: engine_implementation_plan; review identified stale JWT-role merging as a residual control-plane risk and rejected shared-service-token proxies with caller-only checks.
- Data: no schema or business-data changes. Original untracked prototype source is retained under scratch/wi-oi-013-originals, outside runtime imports, for later module rebuilding.
- Acceptance: missing/invalid credentials never issue cookies; upstream auth failure remains failure; unavailable routes never invoke stores/providers; direct and nested screens do not show business fixtures; all supported route methods covered; tokens remain HttpOnly; outages do not erase otherwise renewable sessions.
- Verification: focused regression tests, actual HTTP negative probes, mandatory repository checks and independent diff review. Isolated test doubles are failure-injection tests only, never production data or end-to-end certification.
- Recovery: roll forward broken auth configuration or disabled capability integration; restoring forged-session/fake-success fallbacks is not a safe rollback.
- Exit: independent implementation review and recorded checks. Human product acceptance, real-service integration, UAT and G5–G7 remain open.

### Canonical authority repair extension

The isolated real-DB check reproduced stale authorization: after changing a test member from TENANT_ADMIN to VIEWER, GET /settings with the old token returned 200 instead of 403. Scope remains IAM-01/IAM-02 under the same Build item. JWT authentication must load the active DB user and current membership roles; RBAC must never merge stale token-role fallback grants. Suspended users cannot issue or refresh sessions. Refresh rotation must compare-and-update the original hashed credential so concurrent reuse has one winner. No schema changes; the existing API shapes are preserved. Legacy RbacService fallback argument remains accepted but grants no authority. Final independent code review remains required.

### IAM absolute-time migration extension

The canonical IAM, tenant-lifecycle, environment, custom-role and audit models now declare 33 absolute
instant fields as PostgreSQL `timestamptz(3)`. Forward migration
`20260909000000_iam_timestamptz` converts existing Prisma-observed UTC wall-clock values with an explicit
UTC source zone, resets affected database defaults and runs atomically with a bounded lock wait. ORM
connections also set the PostgreSQL session timezone to UTC so legacy domain timestamps remain stable until
their owners classify and migrate them.

Compatibility boundary: the conversion is correct for values written by the canonical Prisma path. Any
environment containing imported local-wall-clock timestamps must reconcile that provenance before applying
the migration; the migration must not guess a source timezone. There is no destructive rollback. Recovery
uses restored pre-migration backup or a reviewed forward correction after the affected environment is
stopped; issued audit/business evidence is never silently rewritten.

Real PostgreSQL 14.20 evidence covers both paths:

- Upgrade verification applied all 18 prior migrations, inserted attributable pre-upgrade records while the
  server timezone was `Asia/Kolkata`, converted all 33 fields, preserved the session instant and proved new
  defaults were not shifted.
- Clean migration plus real NestJS/Next.js API verification passed 18 IAM checks covering schema type,
  registration, session persistence, tenant selection/isolation, the enabled administration route,
  invitation and custom-role lifecycles, enforced TOTP, live role downgrade, suspension, expiry, refresh
  replay/concurrency and logout. Both unique test databases and roles were removed.

PostgreSQL 16 clean migration and backup/restore evidence is now retained at
`docs/audits/2026-09-09-readiness/evidence/uat/postgresql16-backup-restore-result.json`. Production
data-provenance review, representative-volume RPO/RTO, WAL/PITR/failover, deployment storage and independent
review remain required. The certification used timestamped isolated databases and removed them and the
temporary backup; it did not alter the main `gigalibs` database.

### Self-service membership and custom-role extension

The canonical control plane and Next.js application now implement the first acceptance criterion for the
bounded role model: authorized tenant administrators can create a one-time invitation, list and revoke
pending invitations, accept an invitation while authenticated as the exact invited email, list members,
change base role/status, create and edit tenant custom roles, assign one custom role to a member and remove
or delete it without platform-operator database access. Invitation credentials use 32 random bytes, are
persisted only as SHA-256 digests, are returned exactly once and are never returned by list APIs. The UI
truthfully labels delivery as manual because no email provider is configured.

Every mutation is tenant-scoped, permission-guarded and audited. Member and custom-role edits require the
last observed `updatedAt` and a reason. Tenant-row locks serialize invitation replacement and administrator
membership decisions; conditional updates prevent duplicate revoke evidence. The last active tenant
administrator cannot be downgraded or suspended. Suspending a member revokes that member's active sessions
for the tenant. Custom-role permission data is format-validated, cannot contain `platform:*`, takes effect
from the database on the next request and cannot be deleted while assigned.

Migration `20260909001000_custom_role_assignment` adds a nullable foreign key and index, so existing
memberships retain their current behavior. Upgrade evidence assigns a custom role to an existing member and
proves `ON DELETE SET NULL`. Recovery is forward-only: leave the nullable column unused or unassign roles;
dropping the column is not an approved production rollback. SSO, verified automated invitation delivery,
custom-role deny rules/field scopes, regional isolation and signed GDPR export remain outside this
implemented sub-slice and keep WI-OI-013 In Progress.

### Enforced TOTP extension

Tenant administrators can now update the existing versioned `security.enforceMfa` policy through the
canonical settings API and `/settings` UI. Security-policy updates require a reason and write an audit event.
When the policy transitions to enabled, active tenant sessions have their MFA verification cleared in the
same database transaction. The global authentication guard reads that persisted policy for each protected
request and fails closed if the setting is missing or malformed. Only session context, workspace selection,
TOTP enrollment/verification and logout remain available while the second factor is pending.

Migration `20260909002000_totp_mfa_enforcement` adds nullable per-session verification time plus one
credential record per global user. Enrollment requires an active tenant session produced by a password login
within ten minutes, creates a 160-bit RFC 4648 base32 secret, stores only an AES-256-GCM envelope bound to the
credential/user IDs and returns the raw secret only in the no-store enrollment response. RFC 6238
verification accepts one adjacent 30-second step, stores the last accepted step to reject replay, and applies
a persisted five-failure/15-minute lockout. Audit metadata records lifecycle outcomes without codes, URI or
raw secret.

Clean-database evidence now covers 50 IAM/MFA/domain/OIDC absolute-time columns and 20 core IAM HTTP checks. The upgrade
rehearsal proves the MFA migration leaves existing sessions unverified through its nullable field and the
recovery-code migration preserves its one-time timestamp and user cascade. Unit tests
include RFC 6238 SHA-1 vectors, bounded drift, pending-session guard behavior and the required change-reason
contract. WebAuthn, administrator-assisted account recovery, TOTP key-rotation rehearsal, distributed abuse controls, SSO/provider
flows, positive proof in an operator-controlled DNS zone, regional routing and signed export remain open,
so WI-OI-013 remains In Progress and No-Go.

### MFA recovery-code extension

Members now receive ten human-readable 100-bit recovery codes after their first successful TOTP
verification and can rotate the set from `/settings/profile` after completing MFA. Plaintext values are
returned only in a no-store, display-once response. PostgreSQL stores a SHA-256 digest bound to the user ID,
plus millisecond-precision creation and one-time-use timestamps. Rotation atomically deletes all previous
credentials before creating the replacement set and appends an audit event with the reason and counts only.

The pending-MFA endpoint accepts a valid recovery code, serializes use per user, conditionally stamps
`usedAt`, restores only the requesting session and resets the shared TOTP failure counter. Missing, malformed,
used and replayed values never authenticate; valid-looking failures increment the same persisted five-attempt,
15-minute lockout used by TOTP. Session context reports only the remaining unused count. The isolated
PostgreSQL/NestJS/Next.js certification proves digest-only storage, absence from audit JSON, one-time
consumption, replay denial and persisted remaining count. This is device-loss access using pre-generated
credentials; verified help-desk identity proof and administrator-assisted reset remain unimplemented.

### Verified tenant-domain extension

Tenant administrators can now create, inspect, verify and revoke one canonical organization-domain claim
through `/settings` and the tenant control-plane API. A challenge accepts only a normalized public DNS
hostname, returns a 256-bit `gigalibs-domain-verification=<value>` TXT value once under `no-store`, and
persists only its SHA-256 digest. The verification endpoint resolves the real DNS TXT record with a bounded
three-second lookup; absence remains a failed verification and resolver failure returns an explicit
dependency error. It never promotes an unmatched or unavailable lookup.

Migration `20260909003000_tenant_domain_verification` adds challenge expiry, verification, attempt and
lockout state to the canonical tenant record. Existing `customDomain` values move to an unverified candidate
field so they cannot occupy the unique trusted-domain slot without proof. Pending challenges likewise do
not reserve that slot; a successful DNS proof claims it atomically.
Tenant list/current/create/status responses use an explicit safe projection so the stored challenge digest
cannot escape through broad ORM relation loading. Tenant-row locking, the unique domain constraint and
conflict translation protect concurrent claims; challenge replacement, mismatch, successful proof and
revocation are audited with a required reason and without the raw value.

The isolated PostgreSQL/NestJS/Next.js run now passes 20 checks, including rejection of private names, a
real unmatched DNS lookup, digest-only storage, non-relisting, failed-attempt persistence, audit redaction
and revocation. The upgrade rehearsal proves pre-existing domains are not silently trusted. A positive proof
still requires an operator-controlled public DNS zone. The subsequent OIDC extension uses only a
successfully verified domain as its JIT boundary; SAML and external-provider/DNS proof remain open.

### Tenant OIDC Authorization Code + PKCE extension

Authorized tenant administrators can now create, read, update and delete one tenant-scoped OIDC
configuration from `/settings`. The safe response never returns the client secret. PostgreSQL stores the
secret only as an AES-256-GCM envelope bound to configuration and tenant IDs. Enabling performs live OIDC
discovery with a five-second timeout; production requires HTTPS, rejects redirects, resolves every outbound
host and rejects local, private, metadata, documentation, multicast and reserved addresses. A loopback HTTP
exception exists only when both `NODE_ENV=test` and `OIDC_ALLOW_TEST_LOOPBACK=true` are set.

Public start creates random state, nonce and an S256 PKCE verifier. Only a SHA-256 state digest and encrypted
verifier are stored in a ten-minute database transaction. Callback processing locks and consumes that row
once before token exchange, then `openid-client` validates the authorization response, PKCE, state, nonce,
issuer, audience, signature and ID-token lifetime. A verified email is mandatory. The durable identity key
is issuer plus subject; an existing active tenant member may be linked, while JIT can create a real user and
membership only when the email domain exactly equals the tenant's verified domain and only as `MEMBER` or
`VIEWER`. Every lifecycle and login result is audited without tokens, codes, state, verifier or secrets.

Migration `20260909005000_tenant_oidc` adds configuration, one-time transaction and external-identity tables,
seven `timestamptz(3)` fields, unique identity/configuration boundaries and cascade cleanup. Configuration
trust changes use a row lock plus required `updatedAt` precondition; issuer, client, secret, scopes, disable or
removal changes revoke active tenant sessions and discard pending flows.

The isolated certification starts a real PostgreSQL database, NestJS control plane, Next.js BFF and an
isolated signed OIDC provider. It proves encrypted secret/verifier storage, hashed/one-time state,
existing-member login, real session-cookie issuance, callback replay denial, exact-domain low-privilege JIT,
rejection without user persistence for an outside-domain identity, and the explicit link/disconnect lifecycle
described above. This establishes protocol behavior in the isolated harness, not interoperability with a
customer's provider. External Okta/Entra/Google evidence, provider/client-secret/signing-key rotation
rehearsal, upstream SCIM deprovisioning, SAML, positive public DNS proof and independent human security/QA
acceptance remain stop-ships. WI-OI-013 remains In Progress and No-Go.

### Signed tenant-export service extension

`packages/privacy-gdpr` creates deterministic tenant-portability manifests plus per-section JSON and CSV,
hashes every file with SHA-256, signs the canonical manifest with Ed25519 and packages it as a deterministic
stored ZIP. Verification checks the ZIP structure, CRCs, signature, manifest digest, exact file set, byte
sizes and every file digest. An authoritative inventory classifies all 96 Prisma models; its schema-coverage
test fails when a model is added without an export, redaction, security exclusion or global-data decision.

The control plane exposes tenant-admin list/request/download APIs and a settings UI. Requests are durable,
one-active-job-per-tenant operations. The worker claims with `SKIP LOCKED`, recovers stale claims, reads all
exportable models in one repeatable-read snapshot, decrypts retained source-event payloads, recursively
redacts secret-like configured fields and converts dates/decimals/bigints without precision loss. It signs,
self-verifies and uploads to the active S3-compatible object store, then checks object length and digest
metadata before persisting success. Download URLs cannot outlive the archive; expiry deletes the object and
records `EXPIRED`. Request, success/failure, download and deletion are audited without secret material.

Forward migration `20260910000000_tenant_data_exports` adds the job lifecycle, retry/claim state, archive
digest/size, per-result verification public key, expiry/deletion evidence and bounded failures. Database
checks reject malformed lifecycle shapes, invalid digests/counts/expiry and concurrent active jobs. The
table is additive and empty for existing tenants. Recovery is forward-only: disable signing/request creation,
retain job/audit evidence and apply a corrective migration; do not drop completed history as rollback.

The isolated certification applied all migrations to disposable PostgreSQL 14, used the authenticated NestJS
API and real MinIO, verified concurrent-request rejection, every classified model query, signed archive
download, secret absence, live role downgrade, automatic object deletion, 410 after expiry and audit evidence.
Both data stores and the sparse test volume were removed. Production signing-key custody/rotation, large-data
performance, PostgreSQL 16/backup rehearsal and independent human security/privacy/QA acceptance remain open,
so this extension does not make WI-OI-013 Done or production-approved.

### Control-payload encryption-key rotation extension

The control plane now accepts one active AES-256 key plus a bounded, version-addressed decryption ring from
`CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON`. Startup rejects malformed JSON, invalid or duplicate active versions,
non-canonical keys and more than 16 prior keys. Every new TOTP enrollment, OIDC secret/configuration update
and source-event write continues to use only the active version. An old-key TOTP credential is rewrapped only
after a successful authenticator proof; an authorized OIDC configuration save decrypts the prior envelope and
rewraps it with the active key. OIDC callbacks can finish across a deployment rotation while their old flow
key remains loaded, and retained immutable source payloads remain readable until retention permits retirement.

The isolated rotation certification applies all migrations to a uniquely named PostgreSQL database, runs the
real NestJS control plane with generated active/previous keys, verifies TOTP rewrap plus audit evidence, OIDC
client-secret rewrap and retained source-payload decryption, then removes the database and role. This proves
the application rollover path locally. Production secret-manager custody, replica-by-replica rollout,
key-version inventory/retention, external IdP client-secret and signing-key rotation, and independent security
acceptance remain required.

### Administrator-assisted MFA recovery service extension

Migration `20260910001000_mfa_assisted_recovery` adds a tenant-scoped recovery state machine with one
active request per target, bounded reasons/evidence references, two-person approval, a 30-minute one-time
grant digest and exact request/approval/consumption/rejection/expiry constraints. The requester, approver and
target must be distinct; both operators must remain active tenant administrators, and the approver must have
completed MFA in the current session. Approval revokes the target's active tenant sessions. After the target
signs in again, consuming the display-once grant deletes the old TOTP credential and all recovery codes,
revokes other sessions, clears the current session's MFA state and forces fresh authenticator enrollment.
The raw grant is never persisted, listed or audited.

The real isolated NestJS/PostgreSQL certification proves requester self-approval denial, distinct
MFA-verified approval, session revocation, digest-only storage, one-time consumption, replay denial, old
credential deletion, audit redaction and required reenrollment. The database and role are removed. The
administrator and target UI, production support identity-proof policy, notification delivery,
multi-replica rehearsal and independent security/QA acceptance remain open.

### Authenticated application landing and truthful capability catalogue extension

Every completed email/password, tenant-selection, TOTP, recovery-code and OIDC path now lands on
`/modules`; the former `/dashboard` remains as a compatibility redirect. The protected layout still resolves
the current database session, tenant membership and MFA state before rendering. A failed context request now
distinguishes denied workspace access from an unavailable control plane and offers workspace selection,
retry and fresh-sign-in actions. The supplied local tenant-admin account was verified through the real Next.js
BFF and active NestJS control plane: login returned an authenticated tenant-bound session and `/modules`
returned 200.

The catalogue displays 30 capabilities with explicit `AVAILABLE`, `REVIEW`, `CONTAINED` or `PLANNED` labels.
It replaces the prior hardcoded `24 / 24 Online & Verified` dashboard and invented counts, savings and live
status. Contained pages continue to perform no business action. The unused client-side persona store that
could manufacture user, tenant and role cookies was removed. A predominantly white animated login atmosphere
uses deterministic CSS particles, restrained color and reduced-motion handling; it does not change the
authentication authority or persist data.

The exact root build passed 94/94 tasks, the root test command passed 548 TypeScript and four Python tests,
the focused authentication/containment run passed 362 tests, and production-data, all-runtime-data, package,
API-boundary, navigation, anti-duplication and SDLC audits passed. This is local runtime and regression
evidence only. The catalogue makes unfinished modules visible and honest; it does not certify them as
functional, business complete or production ready. WI-OI-013 remains In Progress and No-Go.

### Workspace lifecycle and local super-admin access repair

The workspace-selection flow no longer deadlocks a user inside a newly created `PROVISIONING` tenant. Tenant
discovery and workspace creation are user-scoped operations and now explicitly bypass the selected-tenant
boundary, while membership and user validation still run. `ACTIVE` and `TRIAL` are the only operational
tenant states accepted by login, refresh and protected application rendering. A newly created
`PROVISIONING` workspace is shown as **Finish setup**; selecting it uses the authenticated, permission-checked
and audited tenant-status API to activate it before routing to `/modules`. This closes the prior sequence in
which selecting a provisioning tenant caused the global tenant guard to block both recovery and discovery.

The supplied local account now has an active persisted `SUPER_ADMIN` membership in the active
`my-workspace` tenant. The local operator bootstrap recorded an immutable audit entry and did not attribute
the grant to the affected user. A fresh real BFF login returned a complete session/MFA context with
`roles=[SUPER_ADMIN]`; the rendered `/modules` response contained the module home and role label and contained
neither workspace nor membership failure text. The live local PostgreSQL database has all 30 repository
migrations applied, and the rebuilt NestJS control plane and Next.js production server are serving on ports
3333 and 5180.

`SUPER_ADMIN` remains the highest legacy **tenant membership** role and never grants global authority.
The later platform-authority extensions described above add separate persisted global roles, a database-backed
guard, credential-free bootstrap and audited tenant/user administration. Those local-UAT capabilities do not
constitute production certification; external-provider operations, two-person policy decisions and independent
security review remain open work.

### Assisted-recovery user-interface extension

Tenant Settings now renders the persisted administrator-assisted MFA recovery state machine. An authorized
administrator can select another active member, enter the out-of-band identity-evidence reference and
reason, create a request, inspect its status/expiry and approve or reject it. The UI enforces the visible
two-person boundary: the requester and target cannot approve, every decision requires a reason, and an
approval shows the 256-bit grant once for controlled delivery. The MFA screen now accepts that exact grant,
calls the pending-MFA-safe consume endpoint, reports credential revocation and requires immediate enrollment
of a replacement authenticator.

The Next.js BFF exposes only the assisted-recovery collection, consume and exact approve/reject paths under
its existing authenticated control-plane proxy; unrelated auth paths remain rejected. Request bodies retain
the configured byte bound, upstream redirects remain forbidden and no credential is written to browser
storage. The service now consistently treats persisted `SUPER_ADMIN` and `TENANT_ADMIN` memberships as
tenant-administrator authority; all lower roles remain denied.

The production build renders the new panel at `/settings` for the supplied persisted super-admin account,
and the authenticated list call returned the real empty PostgreSQL result. Targeted tests passed 89 cases,
including seven exact BFF allowlist cases and seven administrator-role cases. A complete manual journey still
requires three distinct active users, enforced MFA, a previously enrolled target, the approved support
identity-proof procedure and two MFA-verified administrator sessions. That human/UAT and multi-replica
evidence remains open; this extension does not complete WI-OI-013.

### Platform finance inspection navigation extension

Persisted platform roles can now see and open Accounts Receivable, Spend Management & AP, Tax
Configuration, Multi-Currency FX and Autonomous Recovery Studio under Financial Operations. This is an
operator inspection surface: it does not grant a tenant entitlement, add a tenant permission or bypass an
API containment boundary. Each route identifies its current `REVIEW` or `CONTAINED` state, the scope that
can be inspected and the mutations that remain blocked. Three-Way Match remains the only finance route
labelled for active local UAT.

The focused access and containment suites passed 302 tests, workflow-platform type checking passed, the
navigation audit passed 72 page routes and 119 static links, and the optimized Next.js build completed all
114 application routes. After rebuilding and restarting port 5180, an authenticated server-rendered
`/modules` response contained all five finance sidebar routes, and every requested route returned HTTP 200
with its module-specific inspection screen. Evidence is recorded in
`docs/audits/2026-09-09-readiness/evidence/uat/finance-navigation-visibility-result.json`.

This visibility does not make the five modules business complete. Their real tenant-scoped APIs,
persistence, provider receipts, reconciliation paths and module-specific acceptance evidence remain under
their existing work items and completeness gates.

### Accounts Receivable actionable local-UAT extension — 2026-09-11

The `/ar` containment screen is replaced by a bounded local-UAT workbench backed by the standalone AR
NestJS API and its PostgreSQL schema. A persisted platform owner or administrator with an active selected
tenant and the required tenant permission can configure the tenant billing entity and invoice series,
create and list customers, create and list invoice drafts, and permanently issue a draft. The UI displays
only server-returned records and calculations; it has no fixture, generated-result or browser-persistence
fallback.

The suite BFF derives the AR tenant binding from the verified canonical tenant, derives the actor from the
verified session, accepts only the exact setup/customer/invoice paths and forwards idempotency and quoted
ETag preconditions. Writes require the browser's public protocol and host to match. The development OIDC
exchange and AR origin are limited to a configured credential-free loopback origin, so this integration is
available for local UAT and cannot be represented as the production federation contract.

Real local evidence completed tenant setup, customer creation, a two-unit draft calculated to 2,500 USD
minor units, immutable issuance as `UAT-000001`, and database read-back at version 2. Replaying setup with
the same idempotency key returned the original result. Headless Chromium logged in through the supplied
platform-owner account, opened `/ar`, selected Invoices and rendered the issued record with zero page
errors. The focused boundary and containment suites pass 299 tests, type checking passes and the optimized
Next.js build completes all 114 routes. Evidence is recorded in
`docs/audits/2026-09-09-readiness/evidence/uat/accounts-receivable-actionable-result.json`.

This is an actionable AR foundation, not complete AR certification. Payments, credit notes, void and
authorized rebilling, delivery, supplemental invoice families, aging and reconciliation remain absent.
Spend and Tax have bounded persisted local-UAT slices. Currency and Recovery expose truthful empty states
until authoritative sources and provider receipts are configured. Production identity federation,
independent review and the WI-OI-013 stop-ship items remain open.

### Final local account and containment regression — 2026-09-13

The supplied account completed a non-mutating Chromium journey through login, the 30-module catalogue,
personal profile and external sign-in methods, global Platform Tenant Control and the contained Reports
screen with zero page errors. A separate fresh browser run opened all five finance workbenches. The active
Next.js process was replaced after a competing IDE-managed listener served mismatched chunks and could not
reach the healthy control plane; one rebuilt server now owns port 5180 and BFF login returns HTTP 200.

Late source review also intercepted a Geospatial `/api/maps` route that returned fixed facilities, named
personnel, freight values, SLA percentages and fleet telemetry directly from code although the catalogue
marks the module `CONTAINED`. The prototype is retained under `scratch/wi-oi-013-originals`, removed from
runtime and protected by the containment classifier. Reports, Connector Hub and Workflow Studio remain
fail-closed where authoritative tenant-scoped outcomes are absent.

The exact root build passed 94/94 tasks, the root test command passed 548 TypeScript tests plus four Python
tests, the six mandatory audits passed and the final focused catalogue/containment run passed. Evidence is
recorded in `docs/audits/2026-09-09-readiness/evidence/uat/current-account-browser-result.json` and
`finance-suite-browser-result.json`. This closes the bounded local access regression; it does not close the
external-provider, regional-binding, disaster-recovery-at-scale or independent-acceptance stop-ships.
