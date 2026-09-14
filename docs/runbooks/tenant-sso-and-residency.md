# Tenant IAM, SSO and Regional Data Residency Runbook

Owner: Backend & Data Engineer + Web Experience  
Work item: WI-OI-013  
Standard: FR-14, NFR-SEC-001, NFR-SEC-002, NFR-DATA-004

Implementation status: **TOTP enforcement, one-time recovery codes, the tenant-domain challenge, OIDC
Authorization Code + PKCE, explicit member link/disconnect, signed tenant export, versioned control-key
rollover and the two-admin assisted recovery API are implemented and locally certified. The administrator and target assisted-recovery UIs are
implemented and render against the real control plane; three-user manual/UAT, the production support policy,
external-provider OIDC evidence, SAML and regional routing remain production stop-ships.** This document does
not authorize a production deployment.

## 1. Tenant-domain verification — implemented local slice

1. A tenant administrator opens `/settings`, enters a public corporate hostname and a change reason, then
   creates a challenge. Private/reserved names, IP addresses, URLs, ports and paths are rejected.
2. The one-time response supplies record name `_gigalibs-verification.<domain>` and a 256-bit TXT value in
   the form `gigalibs-domain-verification=<value>`. Save it immediately; the database stores only its
   SHA-256 digest and list/status endpoints cannot retrieve it.
3. Add the TXT record in the authoritative DNS zone, then use **Verify DNS now**. Missing data is a persisted
   failed attempt, resolver failure is an explicit `DNS_VERIFICATION_UNAVAILABLE`, ten mismatches cause a
   15-minute lock, and the challenge expires after 24 hours.
4. Removing or replacing a claim clears its verified state. Every challenge, mismatch, verification and
   revocation is recorded in the tenant audit trail without the raw TXT value.

Operational checks before an environment promotion:

- Complete a positive proof using a DNS zone controlled by the operator or test tenant. The repository
  certification proves the real unmatched-DNS path but does not own a public zone for a positive result.
- Confirm DNS resolver reachability and latency from every control-plane replica.
- Confirm tenant list/current/create/status responses do not expose `customDomainVerificationDigest`.
- The migration moves old `customDomain` values into `customDomainChallengeDomain`; treat them as
  unverified legacy candidates until a new challenge succeeds.

## 2. OIDC SSO — implemented local slice; SAML planned

1. A tenant administrator first completes tenant-domain verification, then opens `/settings` and configures
   issuer, client ID, client secret, scopes, enablement, JIT policy, low-privilege default role and a change
   reason. `PUT /api/v1/auth/oidc/config` requires `settings:update` and a current `updatedAt` precondition.
2. Enabling performs live discovery. Production accepts HTTPS only, rejects redirects and private/reserved
   network destinations, and uses a five-second timeout. `OIDC_REDIRECT_URI` must exactly match the callback
   registered at the provider. `OIDC_ALLOW_TEST_LOOPBACK` is valid only with `NODE_ENV=test`.
3. A user enters the workspace slug on `/login`. Start persists a ten-minute transaction containing a
   SHA-256 state digest, nonce and context-bound encrypted PKCE verifier, then redirects to the provider with
   S256 PKCE. The callback locks and consumes the transaction once before code exchange.
4. The callback validates issuer, audience, signature, lifetime, state, nonce, PKCE and a verified-email
   claim through `openid-client`. Issuer plus subject is the durable identity key. An existing active member
   with the same verified email can authenticate only through this validated callback; other existing
   accounts require an explicit, authenticated link workflow.
5. When JIT is enabled, a new user and membership are created only when the email domain exactly equals the
   verified tenant domain. The only allowed initial roles are `MEMBER` and `VIEWER`. Outside-domain claims do
   not create a user. The resulting login uses the canonical database session and tenant MFA policy.
6. Changing issuer, client ID, client secret, scopes, disabling, or deleting the provider revokes active
   tenant sessions. Configuration and login events are audited without secrets, codes, tokens, raw state or
   PKCE verifier.
7. A member opens `/settings/profile`, selects **Sign-in Methods**, supplies a reason and starts an explicit
   provider link. The ten-minute `LINK` intent is distinct from login and stores the current user plus reason.
   Completion must return the same canonical verified email, cannot claim another user's issuer/subject and
   returns to the profile without replacing login cookies. Disconnect requires the current local password,
   current binding version and a reason; it retains a revoked record and signs out the member's other sessions.
8. Platform owners and administrators inspect bindings in `/platform-admin/users`. Revoking a binding signs
   the subject out everywhere and prevents that issuer/subject from authenticating. Reactivation restores
   only the same previously validated binding when the user is active and the configured issuer is unchanged.
   Suspending or deactivating the user revokes every binding, and restoring the user never restores SSO
   automatically.

Operational checks before an environment promotion:

- Complete public DNS proof and interoperability tests with the selected Okta, Entra ID or Google Workspace
  tenant. The repository evidence uses an isolated RSA-signed issuer and does not certify an external IdP.
- Rehearse client-secret and provider signing-key rotation, stale JWKS behavior, outage recovery and
  multi-replica callback races.
- Define and integrate SCIM or another authoritative upstream lifecycle before relying on JIT for automated
  employee offboarding. The platform console now provides explicit manual binding revocation/reactivation
  and user-status deprovisioning.
- Complete security, QA and product acceptance. SAML metadata/assertion ingestion is not implemented.

## 3. TOTP MFA enforcement — implemented local slice

1. A tenant administrator opens `/settings`, changes **Enforce TOTP for this tenant**, supplies an audit
   reason and saves the versioned policy.
2. The policy transition clears per-session MFA verification atomically. The next protected request returns
   `MFA_REQUIRED`; the Next application redirects the member to `/mfa`.
3. A member without a credential starts enrollment after a password login no older than ten minutes. The
   raw base32 secret is shown once by `POST /api/v1/auth/mfa/totp/enroll`; only an authenticated AES-GCM
   envelope is persisted.
4. `POST /api/v1/auth/mfa/totp/verify` accepts a valid six-digit RFC 6238 code and marks only that session as
   verified. Reuse of the same time step fails. Five failed or replayed attempts lock verification for 15
   minutes.
5. Tenant switching clears session verification. Refresh rotation retains verification for the same session.
   Disabling enforcement requires an already verified administrator session.

Operational checks before any environment promotion:

- Load the active encryption key/version before startup. During rollover, put prior version-to-key entries in
  `CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON`; malformed, ambiguous or oversized key rings fail startup. Keep the old
  version loaded across every replica while sessions and records can still reference it.
- Confirm no enrollment response, request body, application log or audit row contains the raw secret or code.
- A successful TOTP proof rewraps an old credential with the active key. Inventory `totp_credentials.keyVersion`
  before retiring an old key; inactive accounts may require an approved reset or a longer retirement window.
- Rehearse the same rollover through the deployment secret manager, multi-replica abuse controls and
  PostgreSQL 16 migration/restore.
- Recovery codes provide the implemented device-loss path. Complete WebAuthn and administrator-assisted
  UI and production support identity-proof policy for users who lose both their authenticator and saved codes.

## 4. MFA recovery codes — implemented local slice

1. After the first TOTP verification, `/mfa` generates ten 100-bit recovery codes if none exist. The member
   must save the display-once response before continuing. PostgreSQL stores only user-bound SHA-256 digests.
2. A member who loses authenticator access selects **Use a recovery code** on `/mfa`. A successful code is
   atomically marked used and verifies only that session. The session context exposes a remaining count,
   never credential values.
3. An MFA-verified member opens `/settings/profile`, supplies a reason and replaces the set. Rotation
   immediately revokes every old and unused code and audit metadata records counts and reason without codes.
4. Recovery failures and replays use the same five-attempt/15-minute persisted lock as TOTP. Treat repeated
   recovery failures as an account-security incident and investigate the audit trail.

Operational checks before any environment promotion:

- Confirm application, proxy and observability logs exclude MFA request bodies and responses.
- Rehearse concurrent use and rotation across all control-plane replicas with production PostgreSQL.
- Define verified support identity proof and administrator-assisted reset. Pre-generated recovery codes do
  not solve loss of both the authenticator and saved codes.

## 5. Administrator-assisted MFA recovery — API and UI implemented; manual/UAT open

1. After completing the tenant's approved out-of-band identity-proof process, one MFA-verified tenant
   administrator creates a recovery request for another active member with the support/evidence reference
   and reason. The request expires after 24 hours and its evidence reference is audit data.
2. A distinct MFA-verified tenant administrator reviews the evidence. The requester, approver and target
   cannot be the same person. Approval returns a 256-bit grant once and immediately revokes the target's
   active tenant sessions.
3. Deliver the grant through the approved support channel. PostgreSQL stores only a target-bound SHA-256
   digest. List and audit APIs never return the grant.
4. The target signs in again and consumes the grant within 30 minutes. Consumption deletes the old TOTP
   credential and every recovery code, revokes other active sessions, cannot be replayed and leaves the
   current session pending MFA.
5. The target immediately enrolls and verifies a new authenticator and saves a new recovery-code set.

The administrator journey is available in `/settings`. It lists persisted requests, blocks a requester or
target from acting as approver, requires evidence/reason fields and displays an approved grant once. The
target journey is available in `/mfa` through **Use an administrator recovery grant**. The BFF permits only
the exact list/request/approve/reject/consume paths and continues to reject unrelated auth proxy paths.

The isolated API certification proves the full state and security transition. Three-user manual/UAT,
notification delivery, operator identity-proof policy, abuse alerting and multi-replica rehearsal remain
required before production use.

## 6. Tenant data portability — implemented local slice

1. Configure `TENANT_EXPORT_SIGNING_KEY_ID` and an Ed25519 PKCS8 DER private key through
   `TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64`. When both are absent, the worker stays disabled and request
   creation returns `TENANT_EXPORT_SIGNING_UNAVAILABLE`; partial or invalid configuration fails startup.
2. A user with `tenant:export` opens `/settings`, supplies an audit reason and requests an export. Only one
   `REQUESTED` or `RUNNING` job may exist per tenant. The UI shows durable state and never receives the
   object-store key.
3. The worker claims jobs with `SKIP LOCKED`, recovers stale claims and reads the classified inventory in a
   repeatable-read transaction. Authentication credentials, encrypted secret envelopes, provider secret
   references and internal storage paths are excluded. Retained source-event ciphertext is authenticated and
   decrypted into portable payload JSON; purged payloads remain visibly null.
4. Every section is rendered as deterministic JSON and CSV. The manifest contains per-file sizes and
   SHA-256 values, is signed with Ed25519 and is packaged in a deterministic ZIP. The worker verifies the
   archive locally and verifies object-store size/digest metadata before recording `SUCCEEDED`.
5. Download authorization rechecks the current database role and tenant, returns a no-store presigned URL
   bounded by both deployment policy and archive expiry, plus archive digest/size. The job retains its signing
   public key so a downloaded archive remains verifiable after signing-key rotation.
6. At expiry the worker deletes the object before recording `EXPIRED`; subsequent download attempts return
   410. Storage deletion failures retain `SUCCEEDED` and retry, avoiding false deletion claims.

Operational checks before an environment promotion:

- Keep the signing private key in the approved secret manager, restrict it to export workers, rehearse
  rotation while old archives remain downloadable and monitor signing failures.
- Size `STORAGE_MAX_FILE_BYTES`, worker concurrency, timeouts and database capacity from representative
  tenant volumes. Complete performance, cancellation/outage and backup/restore rehearsals.
- Run the isolated PostgreSQL/MinIO certification and independent security, privacy and QA review. Confirm
  inventory classification whenever the Prisma schema changes.

## 7. Control-payload key rollover — implemented local slice

1. Generate a new 32-byte AES key in the approved secret manager and assign a new immutable version label.
2. Deploy the new version/key as `CONTROL_PAYLOAD_KEY_VERSION` and `CONTROL_PAYLOAD_ENCRYPTION_KEY`, with the
   prior version/key in `CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON`. New writes immediately use the active key.
3. Keep both versions on every replica. Successful TOTP proofs rewrap credentials; saving an OIDC
   configuration rewraps its client secret; OIDC login transactions created before deployment remain usable
   until their ten-minute expiry; retained source payloads continue to use their recorded key version.
4. Inventory key-version references in `totp_credentials`, `tenant_oidc_configurations`,
   `oidc_login_transactions` and `source_events`. Do not remove a prior key while any retained record needs it.
5. Remove the prior key only after OIDC flows expire, rewrappable credentials/configurations move to the active
   version, and retention policy has purged or explicitly migrated immutable source payloads. Record the counts,
   deployment cohort and rollback window as release evidence.

The isolated evidence is `evidence/iam/control-key-rotation.txt` and
`evidence/iam/control-key-rotation-run.json`. Production secret-manager custody, replica rollout and old-key
retirement evidence remain open.

## 8. Regional data residency — planned

1. **Residency Routing:** Tenants configured with `region: "EU"` (Frankfurt) or `region: "APAC"` (Tokyo) route database transactions exclusively to region-bound database instances.

A tenant `region` string is metadata and does not prove region-bound storage or processing. Keep residency
claims unavailable until database bindings, object storage, logs, queues, backups and failover are all routed
and independently certified in every advertised region.
