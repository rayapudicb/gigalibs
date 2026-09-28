# WI-OI-048 Independent Specialist Decision Request (Gate G3)

- **Date:** 2026-09-24
- **Work Item:** WI-OI-048 (TP-2 Tenant Profile Durable Export & Event Outbox Conformance)
- **Profile:** `configuration-local-development-v1`
- **Status:** Agent-executable G3 preparation complete; named human decisions pending
- **Design Specification:** `docs/architecture/TP2_DURABLE_TENANT_EXPORT_AND_OUTBOX_DESIGN.md`
- **Work Item Detail:** `.pi/work/WI-OI-048.md`

---

## 1. Boundary & Review Policy

This packet requests independent human specialist decisions for bounded TP-2 Build entry under Gate G3.
Per AGENTS.md and the GigaLibs SDLC guide:
- No agent may mark human acceptance or fabricate specialist approvals.
- Reviewers must be named, qualified humans independent of implementation production.
- Approval covers the bounded Local Development profile only (`configuration-local-development-v1`); no production, cloud, or external release authority is inferred.
- Zero changes to the 7 protected CMMS file hashes.

---

## 2. Frozen Design Evidence

| Evidence Item | Path | Purpose |
|---|---|---|
| TP-2 Architecture Design | `docs/architecture/TP2_DURABLE_TENANT_EXPORT_AND_OUTBOX_DESIGN.md` | Formal design for job lifecycle, pre-snapshot auth, metadata bundle, and outbox |
| Work Item Definition | `.pi/work/WI-OI-048.md` | Requirements trace, scope, baseline capabilities, and exit criteria |
| Canonical Work Register | `.pi/WORK_ITEMS.md` | Registered WI-OI-048 at Gate G0–G3 |
| Delta-5 Foundation Contracts | `docs/contracts/delta-5-foundation-contracts-v1.md` | Common contracts for `AsyncAuthorityRefV1`, `OperationContextV1`, `DomainEventEnvelopeV1` |
| Delta-5 Baseline ADR | `docs/architecture/ADR-0005-delta-5-foundation-convergence.md` | Convergence architecture: PostgreSQL authoritative, BullMQ transport |

---

## 3. Specialist Decision Points (SP-01 through SP-07)

### SP-01: Backend & Data — Forward Migration & Outbox Atomicity
* **Proposal:**
  1. Forward additive migration extending `tenant_data_exports` with `idempotency_key`, `heartbeat_at`, `cancelled_at`, `cancelled_by_id`, `data_classification`, `scan_status`, and `configuration_manifest_version_id`.
  2. Create table `platform_outbox_events` with tenant foreign key and RLS.
  3. Enforce transactional outbox insertion within the exact same database transaction that updates `ConfigurationExtensionValue` in `ConfigurationStudioService.saveExtensionValues()`.
  4. Compare-and-swap (CAS) stale claim recovery query: `claimedAt < NOW() - claimTimeout` with `FOR UPDATE SKIP LOCKED`.
* **Required Reviewer:** Backend / Data Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — Schema, outbox transaction atomicity, and CAS recovery query approved as designed.
  - `[ ] REJECTED` — Specify required adjustments.

### SP-02: Security & Privacy — Pre-Snapshot Live Authority & Presigned URLs
* **Proposal:**
  1. **Pre-snapshot live revalidation**: Immediately prior to initiating database snapshots, the worker verifies live tenant active status, user membership status (`ACTIVE`), and unrevoked `tenant:export` permissions. Fails closed with `AUTHORITY_REVOKED` if lapsed.
  2. **Pre-download live revalidation**: Same check before issuing presigned download URL.
  3. Presigned URLs enforce maximum 15-minute TTL (`MIN(secondsRemaining, 900)`).
  4. Internal MinIO bucket names, secret credentials, and storage keys are strictly concealed from HTTP clients.
* **Required Reviewer:** Security & Privacy Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — Pre-action authority revalidation and storage sanitization approved.
  - `[ ] REJECTED` — Specify required adjustments.

### SP-03: IAM & Tenancy — Tenant Isolation & Cancellation Authority
* **Proposal:**
  1. Tenant isolation strictly enforced on all queries, outbox events, and storage artifacts (`tenant_id` predicate on all operations).
  2. Cross-tenant access attempt immediately returns HTTP 404 (zero existence disclosure).
  3. Cancellation endpoint (`POST /api/v1/tenant-data-exports/:id/cancel`) restricted to the requesting user or Tenant Admin within the same tenant.
* **Required Reviewer:** IAM / Tenancy Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — Multi-tenant boundary and cancellation permissions approved.
  - `[ ] REJECTED` — Specify required adjustments.

### SP-04: API Contracts — Idempotency & Wire Compatibility
* **Proposal:**
  1. `POST /api/v1/tenant-data-exports` accepts `Idempotency-Key` header and optional body field `idempotencyKey`. Duplicate requests within the tenant return existing job record with HTTP 200/201 without spawning duplicate jobs.
  2. `POST /api/v1/tenant-data-exports/:id/cancel` returns standardized `TenantDataExportResponse` reflecting `CANCELLED` or `CANCEL_REQUESTED`.
  3. Existing public response shape (`EXPORT_PUBLIC_FIELDS`) preserved for backward compatibility.
* **Required Reviewer:** API Contracts Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — API request/response contracts and idempotency semantics approved.
  - `[ ] REJECTED` — Specify required adjustments.

### SP-05: Infrastructure & SRE — Worker Polling, Heartbeats & Outage Resilience
* **Proposal:**
  1. Polling interval: 10s default; batch size: 5; lease timeout: 300s.
  2. MinIO outage resilience: storage calls timeout at 10s; transient network/storage errors schedule retry with exponential backoff up to 3 attempts, transitioning to `FAILED_RETRYABLE` before terminal failure.
  3. Worker shutdown hook drains active uploads before process termination.
* **Required Reviewer:** Infrastructure / SRE Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — Operational parameters and resilience bounds approved.
  - `[ ] REJECTED` — Specify required adjustments.

### SP-06: Data Portability — Metadata Inclusion & Archive Integrity
* **Proposal:**
  1. Active `ConfigurationExtensionValue` records streamed to `metadata/tenant-profile-extensions.json` within the portability archive.
  2. Checksum included in root `manifest.json`, signed via Ed25519 using configured tenant export private key.
  3. Archive verified for SHA-256 integrity before upload and before download grant.
* **Required Reviewer:** Data Portability Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — Metadata bundle format and archive signing approved.
  - `[ ] REJECTED` — Specify required adjustments.

### SP-07: QA & SDET — Test Matrix & Verification Coverage
* **Proposal:**
  1. Automated test suite covering:
     - Request deduplication with identical and distinct idempotency keys.
     - Live authority revocation mid-job yielding `FAILED_TERMINAL`.
     - Worker crash simulation with CAS lease recovery.
     - Outbox rollback on configuration save error (0 orphaned outbox rows).
     - Storage outage retry behavior.
     - Cross-tenant download denial.
  2. Pre-Build baseline verified clean across all 9 audits and active container stack.
* **Required Reviewer:** QA / SDET Specialist
* **Decision Choices:**
  - `[ ] ACCEPTED` — Verification scope and test plan approved.
  - `[ ] REJECTED` — Specify required adjustments.

---

## 4. Handoff to SDLC Orchestrator

Upon recording of named specialist decisions for SP-01 through SP-07:
1. Record human decisions in `docs/reviews/WI-OI-048-g3-decision-record.md`.
2. Transition `WI-OI-048` from `Proposed` to `In Progress` at Gate `G4` in `.pi/WORK_ITEMS.md`.
3. Update `activeImplementationWorkItems: ["WI-OI-048"]` in `config/sdlc-governance.json` as the sole active implementation item.
4. Begin Gate G4 implementation.
