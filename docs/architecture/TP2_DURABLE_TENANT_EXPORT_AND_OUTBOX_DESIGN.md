# TP-2 Architecture Design: Durable Tenant Export Job & Event Outbox Conformance

- **Status:** Proposed (Gate G3 Design Baseline)
- **Work Item:** WI-OI-048
- **Date:** 2026-09-24
- **Owning Roles:** Solution Architecture, Backend Domain, API Contracts, Infrastructure/SRE
- **Independent Reviewers Required:** Security & Privacy, IAM/Tenancy, Data Portability, QA/SDET, Product
- **Foundation Dependencies:** ADR-0002, ADR-0005, WI-OI-039, WI-OI-044, WI-OI-045, WI-OI-046

---

## 1. Executive Summary & Context

Under the Delta-5 metadata foundation directive (ADR-0005 and WI-OI-045), Tenant Profile serves as the first low-risk reference adopter. In **TP-1 (WI-OI-046)**, Tenant Profile configuration was conformed to the code-owned `ModuleAdapterDescriptorV1` registry, server-resolved deployment/cohort scopes were enforced, and live Docker 25-outcome certification was completed.

**TP-2 (WI-OI-048)** completes the second sequential milestone: **Durable Tenant-Export Job and Event Outbox Conformance**. Rather than introducing a parallel queue framework, duplicate export product, or disparate outbox table, TP-2 systematically extends the existing PostgreSQL-authoritative `TenantDataExport` subsystem and introduces the platform's canonical transactional event outbox.

### Core Objectives
1. **Durable Job Lifecycle Conformance**: Upgrade `TenantDataExport` with client idempotency, monotonic transition tracking, lease heartbeats, stale claim recovery (CAS), and user/admin cancellation.
2. **Current-Authority Revalidation**: Revalidate tenant status (active/non-suspended), user membership, and effective permissions immediately before taking data snapshots and immediately before issuing signed download URLs.
3. **Governed Metadata Portability**: Include governed `ConfigurationExtensionValue` records (the Tenant Profile extension fields saved in TP-1) in the certified portability archive (`gigalibs.tenant-portability.v1`) with pinned manifest provenance.
4. **Transactional Event Outbox**: Emit the canonical `tenant.profile.extensions.updated.v1` fact in the exact same database transaction that commits configuration extension values, backed by a durable PostgreSQL outbox and decoupled transport relay.
5. **Artifact Classification & Hygiene**: Persist data classification (`CONFIDENTIAL`), retention policy (`expiresAt` default 7 days), SHA-256 integrity verification, and scan states without exposing raw storage keys or credentials.

---

## 2. Requirements & NFR Traceability

| Requirement ID | Description | TP-2 Implementation Trace |
|---|---|---|
| **FR-01** | Multi-Tenancy & Isolation | Strict tenant-isolated job queuing, RLS-enforced queries, cross-tenant export denial. |
| **FR-04** | Event Gateway | Canonical `DomainEventEnvelopeV1` outbox facts emitted atomically on value changes. |
| **FR-05** | Data Contract & Mapping | Governed extension fields exported matching active manifest schema definitions. |
| **FR-08** | Workflow / Durable Engine | PostgreSQL-authoritative state transitions, lease heartbeats, retry backoff, and crash recovery. |
| **FR-14** | Tenant Administration | Self-service export request, status tracking, and cancellation for entitled Tenant Admins. |
| **FR-15** | Audit & Evidence | Complete audit trail for export request, claim, completion, cancellation, and download. |
| **FR-16** | Entitlements & Usage | Entitlement verification before export scheduling; storage usage tracking in metadata. |
| **NFR-GOV-001–003** | Governance & Traceability | Monotonic state transitions, immutable transition logs, no unreviewed schema mutations. |
| **NFR-SEC-001–005** | Security & Zero Trust | Pre-snapshot authority re-checks, short-lived signed URLs, zero credential leakage. |
| **NFR-DATA-001–004** | Data Integrity & Durability | Atomic DB commit with outbox, SHA-256 archive verification, uncorrupted restore target. |
| **NFR-REL-001–003** | Reliability & Resilience | Worker crash recovery via stale lease timeout, MinIO outage graceful degradation. |
| **NFR-PERF-002–003** | Performance & Scalability | Non-blocking streaming archive creation, chunked snapshotting, connection pool budgets. |
| **NFR-OBS-001–004** | Observability & Telemetry | Prometheus metrics for export durations, queue depth, outbox lag, and terminal failures. |
| **NFR-UX-001–002** | User Experience | Deterministic UI states (requested, running, ready, cancelled, expired, failed). |
| **NFR-OPS-001–004** | Operations & Automation | Single-command local certification, automated archive expiry and object pruning. |

---

## 3. Architecture & Data Flow

```
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │                          HTTP / BFF (NestJS API)                             │
   └───────┬───────────────────────────────────┬─────────────────────────────────┘
           │ 1. POST /api/v1/tenant-data-exports│ 2. PUT /api/v1/configuration/values
           │    (with Idempotency-Key)         │    (Tenant Profile update)
           ▼                                   ▼
   ┌───────────────────────────────┐   ┌─────────────────────────────────────────┐
   │    TenantDataExportService    │   │      ConfigurationStudioService         │
   │  - Idempotency check          │   │  - Validate against v1 adapter          │
   │  - Membership & auth check    │   │  - Save ConfigurationExtensionValue     │
   │  - Active job limit (1/tenant)│   │  - Write AuditLog entry                 │
   │  - Insert 'REQUESTED' row     │   │  - Write OutboxEvent ('profile.updated')│
   └───────────────┬───────────────┘   └────────────────────┬────────────────────┘
                   │ [DB Transaction]                       │ [DB Transaction]
                   ▼                                        ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │                        PostgreSQL 16 Storage Engine                         │
   │  ┌───────────────────────────┐         ┌─────────────────────────────────┐  │
   │  │   tenant_data_exports     │         │     platform_outbox_events      │  │
   │  │   (Authoritative State)   │         │     (Authoritative Outbox)      │  │
   │  └─────────────┬─────────────┘         └────────────────┬────────────────┘  │
   └────────────────┼────────────────────────────────────────┼───────────────────┘
                    │                                        │
                    │ Polling / SKIP LOCKED                  │ Outbox Relay Tick
                    ▼                                        ▼
   ┌─────────────────────────────────┐      ┌─────────────────────────────────┐
   │     TenantDataExportWorker      │      │       OutboxRelayProcessor      │
   │  - Revalidate authority         │      │  - Lease pending outbox batch   │
   │  - Heartbeat / Lease renewal    │      │  - Dispatch to BullMQ transport │
   │  - Stream snapshots (incl meta) │      │  - Mark PUBLISHED / increment   │
   │  - Build signed zip & sha256    │      └─────────────────────────────────┘
   │  - Upload to MinIO/S3           │
   │  - Transition to SUCCEEDED      │
   └────────────────┬────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────┐
   │     MinIO / S3 Object Storage   │
   │  - Bucket: gigalibs-exports     │
   │  - Key: exports/<id>.zip        │
   └─────────────────────────────────┘
```

---

## 4. Detailed Component Specifications

### 4.1 Authoritative Job State Machine

The export job adheres to the strict state machine defined in ADR-0005 Section 7.1:

```text
REQUESTED ──► CLAIMED / RUNNING ──► SUCCEEDED
    │                 │
    │                 ├──────────► RETRY_SCHEDULED ──► RUNNING
    │                 │
    │                 ├──────────► FAILED_TERMINAL
    │                 │
    │                 └──────────► CANCEL_REQUESTED ──► CANCELLED
    │
    └─────────────────────────────► REJECTED / CANCELLED
```

- **Idempotency Key**: Scoped uniquely to `(tenant_id, idempotency_key)`. Repeated requests with the same key return the existing record without spawning a duplicate job.
- **Lease Timeout & Heartbeat**: A worker claims a batch with `FOR UPDATE SKIP LOCKED`, setting `claimed_at = NOW()` and `heartbeat_at = NOW()`. If a worker dies, any job in `RUNNING` whose `heartbeat_at` is older than `claimTimeoutSeconds` (default 300s) is eligible for reclamation by another worker up to `max_attempts` (default 3).
- **Graceful Cancellation**: An entitled user may issue `POST /api/v1/tenant-data-exports/:id/cancel`. If the job is `REQUESTED`, it moves immediately to `CANCELLED`. If `RUNNING`, it transitions to `CANCEL_REQUESTED`; the worker aborts snapshotting on the next heartbeat tick and finalizes the job as `CANCELLED`.

### 4.2 Current-Authority Revalidation Boundary

An export request carries an `AsyncAuthorityRefV1` capturing request-time actor context. However, before executing sensitive actions:
1. **Pre-Snapshot Gate**: The worker verifies:
   - Tenant is not suspended or soft-deleted (`tenants.deleted_at IS NULL`).
   - Requesting user membership is active (`tenant_members.status = 'ACTIVE'`).
   - Requesting user still holds the required permissions (`tenant:export`).
   If authority was revoked in the interim, the worker fails closed, setting status `FAILED_TERMINAL` with error code `AUTHORITY_REVOKED`.
2. **Pre-Download Gate**: `createDownload()` re-verifies current user membership and `tenant:export` permissions before generating the signed S3/MinIO URL.

### 4.3 Governed Metadata Inclusion in Portability Bundle

The portability archive (`gigalibs.tenant-portability.v1`) incorporates governed Tenant Profile extension values:
- File path inside archive: `metadata/tenant-profile-extensions.json`.
- Payload structure:
  ```json
  {
    "schemaVersion": 1,
    "manifestVersionId": "cmms-v1.0.0-hash",
    "surfaceKey": "tenant-profile-extension",
    "exportedAt": "2026-09-24T21:30:00.000Z",
    "values": {
      "maintenance_window": "Sunday 02:00-06:00 UTC",
      "regulatory_jurisdiction": "ISO-55001"
    }
  }
  ```
- Integrity: Checksum of `tenant-profile-extensions.json` is recorded in the root `manifest.json` which is cryptographically signed using Ed25519.

### 4.4 Transactional Event Outbox Engine

To prevent dual-write inconsistencies, all domain events originating from metadata mutations use the platform transactional outbox:
1. **Atomic Insertion**: When `ConfigurationStudioService.saveExtensionValues()` commits, it inserts into `platform_outbox_events` in the exact same PostgreSQL transaction:
   - `event_id`: UUIDv7 (time-ordered).
   - `event_type`: `'tenant.profile.extensions.updated.v1'`.
   - `tenant_id`: current tenant ID.
   - `aggregate_type`: `'tenant_profile'`.
   - `aggregate_id`: tenant ID.
   - `payload`: JSON object containing updated field keys and version (zero credentials or secret values).
   - `status`: `'PENDING'`.
2. **Outbox Relay**: A decoupled background task (`OutboxRelayProcessor`) periodically queries `platform_outbox_events` with `FOR UPDATE SKIP LOCKED`, dispatches events to BullMQ/Redis transport queues, and updates status to `'PUBLISHED'` with `published_at = NOW()`.
3. **Poison Pill Quarantine**: If delivery repeatedly fails, the event transitions to `'QUARANTINED'` after 5 attempts with `last_error` recorded, emitting a critical telemetry alert.

### 4.5 Storage Governance & Retention Policy

- **Classification**: All tenant data export archives are stamped with `data_classification = 'CONFIDENTIAL'`.
- **Integrity**: Worker calculates streaming SHA-256 during archive assembly; verified before upload and before URL generation.
- **Retention & Auto-Purge**:
  - `expires_at`: default 7 days from completion (`completed_at + INTERVAL '7 days'`).
  - Scheduled cleanup deletes S3/MinIO objects whose `expires_at <= NOW()` and marks `archive_deleted_at = NOW()`, `status = 'EXPIRED'`.
- **Signed URL TTL**: Capped strictly to `MIN(secondsRemaining, 900)` (maximum 15 minutes).

---

## 5. Physical Database Schema Migration Plan

A forward migration (`packages/db/migrations/20260925000000_tp2_durable_export_and_outbox/`) will apply the required schema additions:

### 5.1 Additions to `tenant_data_exports`
```sql
ALTER TABLE "tenant_data_exports"
  ADD COLUMN "idempotency_key" TEXT NULL,
  ADD COLUMN "heartbeat_at" TIMESTAMPTZ(3) NULL,
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3) NULL,
  ADD COLUMN "cancelled_by_id" TEXT NULL,
  ADD COLUMN "data_classification" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  ADD COLUMN "scan_status" TEXT NOT NULL DEFAULT 'UNSCANNED',
  ADD COLUMN "configuration_manifest_version_id" TEXT NULL;

-- Unique constraint for per-tenant request idempotency
CREATE UNIQUE INDEX "tenant_data_exports_tenant_id_idempotency_key_idx"
  ON "tenant_data_exports" ("tenantId", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Lease recovery index
CREATE INDEX "tenant_data_exports_status_heartbeat_idx"
  ON "tenant_data_exports" ("status", "heartbeat_at");
```

### 5.2 Creation of `platform_outbox_events`
```sql
CREATE TABLE "platform_outbox_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "aggregate_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "claimed_at" TIMESTAMPTZ(3) NULL,
  "published_at" TIMESTAMPTZ(3) NULL,
  "last_error" TEXT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "fk_outbox_tenant" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX "platform_outbox_events_status_available_idx"
  ON "platform_outbox_events" ("status", "available_at");
CREATE INDEX "platform_outbox_events_tenant_created_idx"
  ON "platform_outbox_events" ("tenant_id", "created_at" DESC);
```

---

## 6. Threat Modeling & Failure Modes

| Threat / Failure Scenario | Mitigation Strategy | Acceptance Verification |
|---|---|---|
| **Worker Crash During Zip Streaming** | Stale heartbeat detection (`heartbeat_at < NOW() - 300s`) reclaims job up to `maxAttempts`; partial S3 multipart uploads aborted. | Kill worker process mid-snapshot; verify job is reclaimed or marked `FAILED_TERMINAL`. |
| **Concurrent Duplicate Requests** | Atomic `idempotency_key` unique index and `SELECT FOR UPDATE` on tenant row reject race conditions. | 10 concurrent identical POST requests yield 1 export job and 9 identical idempotent responses. |
| **Cross-Tenant Artifact Exfiltration** | RLS enforcement on `tenant_data_exports` and explicit tenant predicate in `createDownload()`. | Tenant B requesting Tenant A's export ID receives HTTP 404. |
| **Privilege Revocation During Long Export** | Pre-snapshot and pre-download revalidation gates re-verify membership and scopes against live DB. | Revoke user membership while job is `RUNNING`; verify worker marks job `FAILED_TERMINAL`. |
| **Object Storage (MinIO) Outage** | Storage operations timeout at 10s with retry; if storage is down, job transitions to `FAILED_RETRYABLE`. | Stop MinIO container during export; verify clean error logging and retry scheduling. |
| **Poison Pill Outbox Event** | Maximum attempt threshold (5) transitions event to `QUARANTINED` without blocking queue progression. | Inject malformed payload; verify subsequent events process and alert is emitted. |

---

## 7. Exit Criteria for Gate G3 (Design Review)

1. Independent reviews recorded by named specialists:
   - Solution Architecture
   - Security & Privacy
   - IAM / Tenancy
   - Data Portability
   - Infrastructure / SRE
   - QA / SDET
   - Product
2. Work Item `WI-OI-048` registered in `.pi/WORK_ITEMS.md`.
3. Work Item detail file `.pi/work/WI-OI-048.md` committed with complete requirements trace and verification commands.
4. No production code or migration executed until explicit G4 Build authorization and sole-active handoff.
