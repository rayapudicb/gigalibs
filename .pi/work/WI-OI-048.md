# WI-OI-048 — TP-2 Tenant Profile durable export and event outbox conformance

Status: Review
Gate: G4 Review; implementation and verification harness delivered for bounded Local Development TP-2
Owner: Backend Domain / API Contracts / Infrastructure/SRE
Requirements: FR-01, FR-04, FR-05, FR-08, FR-14, FR-15, FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-002–003,
NFR-OBS-001–004, NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy,
Data Portability, Infrastructure/SRE, API Contracts, QA/SDET, Product
Dependencies: WI-OI-039 Review evidence, WI-OI-044 Delta 5 baseline, WI-OI-045 adopter design,
and WI-OI-046 TP-1 Review package
Design specification: `docs/architecture/TP2_DURABLE_TENANT_EXPORT_AND_OUTBOX_DESIGN.md`

---

## 1. Single outcome

Conform the existing `TenantDataExport` subsystem to the Delta-5 durable job lifecycle (request idempotency,
lease heartbeats, CAS stale claim recovery, cancellation, and pre-snapshot authority revalidation), include
governed Tenant Profile extension values in the signed portability archive, and establish the platform's
canonical transactional event outbox for configuration mutations without introducing a parallel queue
framework or dual-write inconsistency.

This slice does not implement connection governance or full audit hash chaining. Those remain TP-4 and TP-5.

---

## 2. Baseline capabilities to preserve

| Existing capability | Evidence | Disposition |
|---|---|---|
| PostgreSQL-backed `tenant_data_exports` table | `packages/db/schema.prisma` | Extend; add idempotency, heartbeat, classification |
| `TenantDataExportService` & `TenantDataExportWorker` | `apps/playground-api` | Extend; add CAS lease recovery, pre-snapshot auth gate |
| Signed ZIP archive and Ed25519 signing | `packages/privacy-gdpr` | Reuse; add metadata extension file to archive bundle |
| Object storage abstraction | `ObjectStorageService` | Reuse; enforce TTL and non-disclosure of bucket keys |
| `ConfigurationStudioService.saveExtensionValues()` | `apps/playground-api` | Extend; emit atomic outbox event in same transaction |
| Settings UI Export Manager | `TenantDataExportManager.tsx` | Preserve; support cancellation and idempotency |

---

## 3. Bounded scope

### 3.1 Durable export job lifecycle
- Add `idempotency_key` unique per tenant on export requests to guarantee safe deduplication.
- Track monotonic transition states: `REQUESTED` -> `CLAIMED`/`RUNNING` -> `SUCCEEDED` / `FAILED_TERMINAL` / `CANCELLED` / `EXPIRED`.
- Implement worker lease renewal via `heartbeat_at` with compare-and-swap (CAS) stale claim recovery.
- Add user-initiated and admin-initiated cancellation (`POST /api/v1/tenant-data-exports/:id/cancel`).

### 3.2 Current-authority revalidation
- Before snapshotting tenant data, verify active tenant status, active user membership, and unrevoked `tenant:export` permissions against live PostgreSQL.
- Before issuing short-lived signed download URLs, re-verify user membership and permissions.
- Fail closed with `AUTHORITY_REVOKED` if membership or permissions were revoked during asynchronous processing.

### 3.3 Governed metadata in portability bundle
- Stream active `ConfigurationExtensionValue` records into `metadata/tenant-profile-extensions.json` within the exported zip.
- Pin configuration manifest version ID in the export manifest.
- Validate against the `ModuleAdapterDescriptorV1` registry delivered in TP-1.

### 3.4 Transactional event outbox engine
- Create `platform_outbox_events` table under PostgreSQL with tenant RLS.
- Enqueue `tenant.profile.extensions.updated.v1` in the exact same database transaction that commits configuration extension values.
- Implement decoupled `OutboxRelayProcessor` polling via `FOR UPDATE SKIP LOCKED` with BullMQ transport dispatch.
- Enforce at-least-once delivery, retry with exponential backoff, and poison-pill quarantine after 5 failed attempts.

### 3.5 Artifact classification and hygiene
- Stamp all export records with `data_classification = 'CONFIDENTIAL'`.
- Enforce default 7-day retention (`expires_at`), with automated cleanup of expired MinIO objects.
- Generate time-bounded download URLs (maximum 15 minutes TTL) without exposing storage credentials.

---

## 4. Explicit exclusions

- No replacement of PostgreSQL with Redis or Kafka as the authoritative source of truth.
- No second queue framework (BullMQ remains transport; PostgreSQL is authoritative).
- No raw passwords, secrets, or file bytes stored in event payloads or queue messages.
- No cross-tenant data access or shared export storage paths.
- No modifications to the 7 protected CMMS file hashes.
- No unreviewed schema migrations or live-target execution before G4 Build authorization.

---

## 5. Security & Tenancy boundaries

- Multi-tenancy: All export queries and outbox operations are scoped strictly by `tenant_id`.
- Least Privilege: Worker executes with unprivileged application database credentials under tenant RLS.
- Revalidation: Stale requests cannot exploit lapsed memberships.
- Storage Sanitization: S3 bucket names, credentials, and internal object keys are strictly concealed from HTTP clients.

---

## 6. Verification plan

Prior to G4 Build authorization, the following tests and scenarios must be designed:
1. **Idempotency tests**: Multiple concurrent export requests with identical keys return identical responses and spawn 1 job.
2. **Authority revocation tests**: Revoke membership mid-job; verify worker aborts with `FAILED_TERMINAL`.
3. **Lease recovery chaos test**: Terminate worker container mid-snapshot; verify secondary worker reclaims after timeout.
4. **Outbox atomicity test**: Database transaction rollback on value save produces 0 outbox rows.
5. **Storage outage test**: Simulate MinIO container stop; verify export transitions to `FAILED_RETRYABLE` with retry scheduled.
6. **Portability bundle verification**: Extract generated ZIP; verify `metadata/tenant-profile-extensions.json` matches active manifest and Ed25519 signature verifies cleanly.

---

## 7. Exit criteria for Gate G3

- Independent specialist reviews (Architecture, Security, IAM, SRE, QA, Product) formally recorded.
- Zero unresolved P0/P1 design blockers.
- SDLC Orchestrator issues formal sole-Build handoff moving WI-OI-048 to `In Progress` at Gate `G4`.
