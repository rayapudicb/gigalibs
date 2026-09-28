# TP-2 Verification and Test Plan: Durable Export & Event Outbox

- **Work Item:** WI-OI-048
- **Profile:** `configuration-local-development-v1`
- **Date:** 2026-09-24
- **Owning Role:** QA / SDET, Backend Domain
- **Target Gate:** Gate G4 Verification Baseline

---

## 1. Scope & Objectives

This test plan defines the automated, integration, and chaos verification scenarios required to certify
WI-OI-048 (TP-2 Durable Tenant Export Job & Event Outbox Conformance) against live PostgreSQL 16, MinIO,
and Redis/BullMQ containers under the `configuration-local-development-v1` deployment profile.

---

## 2. Test Scenarios Matrix

| Scenario ID | Test Name | Target Component | Description & Expected Outcome |
|---|---|---|---|
| **TP2-IDEM-01** | Export Request Idempotency | `TenantDataExportController` / `Service` | Two concurrent `POST /api/v1/tenant-data-exports` with identical `Idempotency-Key` yield identical response, exactly 1 database row, and 1 queued job. |
| **TP2-IDEM-02** | Distinct Idempotency Keys | `TenantDataExportController` / `Service` | Distinct keys for the same tenant when an export is already active return HTTP 409 `TENANT_EXPORT_ALREADY_ACTIVE`. |
| **TP2-AUTH-01** | Pre-Snapshot Authority Revocation | `TenantDataExportWorker` | A user requests an export; before the worker snapshots tables, the user's membership is marked `SUSPENDED` in PostgreSQL. The worker must fail closed, marking status `FAILED_TERMINAL` with `failureCode = 'AUTHORITY_REVOKED'`. |
| **TP2-AUTH-02** | Pre-Download Authority Revocation | `TenantDataExportController` / `Service` | An export completes successfully (`SUCCEEDED`). The requesting user's permission `tenant:export` is stripped. A call to `POST /api/v1/tenant-data-exports/:id/download` must return HTTP 403 Forbidden. |
| **TP2-AUTH-03** | Cross-Tenant Export Denial | `TenantDataExportController` | Tenant B attempts to view or download Tenant A's export ID. Returns HTTP 404 (zero information leakage). |
| **TP2-LEAS-01** | Lease Heartbeat & CAS Reclamation | `TenantDataExportWorker` | Worker A claims a job and sets `claimed_at = NOW() - 360s` (stale lease simulation). Worker B's polling tick must re-claim the job with CAS `WHERE claimed_at = ...` and increment attempts. |
| **TP2-LEAS-02** | Max Attempts Terminal Failure | `TenantDataExportWorker` | If a job fails 3 consecutive attempts due to worker crashes, the third failure marks `status = 'FAILED_TERMINAL'` with error code `MAX_ATTEMPTS_EXCEEDED`. |
| **TP2-CANC-01** | Requested Job Cancellation | `TenantDataExportController` | Cancelling a `REQUESTED` job immediately marks `status = 'CANCELLED'`. Worker never picks up the job. |
| **TP2-CANC-02** | Running Job Cooperative Abort | `TenantDataExportWorker` | Cancelling a `RUNNING` job sets `status = 'CANCEL_REQUESTED'`. The worker detects the cancellation flag during chunked snapshotting, halts processing, cleans up scratch files, and marks `CANCELLED`. |
| **TP2-OUTB-01** | Outbox Atomic Insertion | `ConfigurationStudioService` | Saving a Tenant Profile extension value commits `ConfigurationExtensionValue` and a row in `platform_outbox_events` in the exact same transaction. |
| **TP2-OUTB-02** | Outbox Rollback on Value Failure | `ConfigurationStudioService` | If value validation fails or the transaction is aborted, 0 rows are written to `platform_outbox_events`. |
| **TP2-OUTB-03** | Outbox Relay Dispatch & Acknowledgment | `OutboxRelayProcessor` | Pending outbox rows are leased, published to BullMQ, and updated to `status = 'PUBLISHED'` with `published_at = NOW()`. |
| **TP2-OUTB-04** | Poison Pill Quarantine | `OutboxRelayProcessor` | An outbox event that fails publishing 5 times transitions to `status = 'QUARANTINED'` and emits an alert without stalling subsequent events. |
| **TP2-META-01** | Governed Extension in Export Bundle | `TenantExportSnapshotService` | The generated export zip archive contains `metadata/tenant-profile-extensions.json` containing the exact saved configuration fields and manifest version ID. |
| **TP2-SIGN-01** | Ed25519 Archive Signature Verification | `packages/privacy-gdpr` | The exported ZIP archive `manifest.json` correctly verifies against the configured tenant export public key using Ed25519. |
| **TP2-STOR-01** | Storage Outage Resilience | `TenantDataExportWorker` | During MinIO container outage, the worker records transient network failure, sets `status = 'FAILED_RETRYABLE'`, and schedules backoff retry without corrupting the database. |
| **TP2-PURG-01** | Automated Expiry & Archive Cleanup | `TenantDataExportWorker` | An export with `expires_at < NOW()` has its object deleted from MinIO, and database record updated to `status = 'EXPIRED'`, `archive_deleted_at = NOW()`. |

---

## 3. Mandatory Gate Verification Script Shape

Upon Gate G4 execution, the automated certification script `scripts/verify-local-tp2-runtime.mjs` will be delivered
to run all 17 scenarios live against Docker containers and write structured JSON evidence to `infra/compose/evidence/wi-oi-048-tp2-<timestamp>/runtime-results.json`.
