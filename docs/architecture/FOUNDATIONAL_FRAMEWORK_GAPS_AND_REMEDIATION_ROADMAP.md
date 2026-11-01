# Foundational Framework Gaps & Technical Remediation Roadmap
**Document ID:** `ARCH-GAP-2026-10-31`  
**Status:** Documented / Backlog for Remediation  
**Target Architecture:** GigaLibs Enterprise Operational Intelligence Platform  
**Target Roles:** `solution_architecture`, `backend_domain`, `infrastructure_observability`, `security_reviewer`

---

## 1. Executive Summary

This audit catalogs foundational framework and infrastructure discrepancies identified across `packages/`, `modules/`, database migrations, and deployment configuration environments. Addressing these items is essential for multi-tenant stability, zero-data-loss event handling, and containerized cloud deployment.

---

## 2. Catalog of Identified Architectural Gaps

### GAP-01: Ingress Topology & Port Collision Deficit
* **Severity:** Critical (P0)
* **Affected Artifacts:** `apps/workflow-platform/.env`, `.env.local`, `.env.production`
* **Finding:** Multiple microservices share identical local port assignments:
  * `RECOVERY_API_URL=http://127.0.0.1:4200` collides with `CMMS_API_URL=http://127.0.0.1:4200`.
  * `WORKFORCE_API_URL=http://127.0.0.1:4700` collides with `COMMUNICATIONS_API_URL=http://127.0.0.1:4700`.
  * `.env.production` directly references `127.0.0.1` loopback addresses, preventing inter-container networking in Docker Compose and Kubernetes.
* **Remediation:**
  1. Reassign distinct dedicated ports across all module services:
     * `cmms-api`: 4100
     * `autonomous-recovery-api`: 4200
     * `workforce-api`: 4700
     * `communications-api`: 4800
  2. Implement an API Gateway / Ingress route mapping:
     * `/api/v1/cmms/*` → `http://cmms-api:4100`
     * `/api/v1/workforce/*` → `http://workforce-api:4700`
     * `/api/v1/analytics/*` → `http://analytics-api:4400`

---

### GAP-02: PostgreSQL Row-Level Security (RLS) Session Variable Drift
* **Severity:** Critical (P0)
* **Affected Artifacts:** `packages/db/migrations/20260925000000_tp3_transactional_inbox_and_deduplication/migration.sql`
* **Finding:** While 12 core migrations enforce RLS via `current_setting('app.tenant_id', true)`, migration `20260925000000` on `platform_inbox_events` references:
  ```sql
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
  ```
* **Impact:** Application connection pools executing `SET LOCAL app.tenant_id = :tenantId` fail to match the filter for `platform_inbox_events`, resulting in empty query results or improper authorization blocks.
* **Remediation:** Write a forward migration to standardize `platform_inbox_events` RLS policy to `app.tenant_id`.

---

### GAP-03: Missing Unified `@gigalibs/storage` Framework Package
* **Severity:** High (P1)
* **Affected Artifacts:** `packages/`, `modules/physical-operations-cmms/apps/api/src/import-export/import-storage.service.ts`
* **Finding:** There is no shared multi-tenant object storage abstraction. Services write attachments and temporary import/export files to local filesystem paths (`import-storage.service.ts`).
* **Impact:** In multi-replica container environments (Kubernetes/ECS), local disk writes are ephemeral and isolated to a single pod. Photos from mobile work orders, LOTO padlocks, near-miss reports, and equipment inspections will fail to persist across container restarts or sync between replicas.
* **Remediation:** Author `packages/storage` supporting S3/MinIO/GCS object stores with:
  * Multi-tenant key prefixing: `tenants/:orgId/:moduleId/:entityId/:filename`.
  * Presigned upload/download URL generation.
  * MIME-type and magic-byte inspection before storage commit.

---

### GAP-04: Generic Pub/Sub Error Swallowing in `@gigalibs/broker`
* **Severity:** High (P1)
* **Affected Artifacts:** `packages/broker/src/broker.ts` (lines 41–47)
* **Finding:** The primary broker subscriber catches unhandled exceptions and only logs them:
  ```typescript
  try {
    await handler(msg);
  } catch (err) {
    logger.error({ err, event, messageId: msg.id }, 'Event handler error');
  }
  ```
* **Impact:**
  * No Dead-Letter Queue (DLQ) routing for poisoned or unprocessable messages.
  * No retry mechanism with exponential backoff on transient database failures.
  * Potential for dual-write inconsistencies when standard `broker.publish()` is called outside the `outbox-relay` definer mechanism.
* **Remediation:**
  1. Add Dead-Letter Queue (DLQ) support and retry policies to `packages/broker`.
  2. Mandate that all business-critical cross-domain events use `packages/module-sdk/src/outbox-relay.ts`.

---

### GAP-05: Mobile Offline Synchronization & Idempotency Protocol
* **Severity:** High (P1)
* **Affected Artifacts:** `modules/mobile-bff`, `packages/contracts/src/`
* **Finding:** The 12 frontline mobile products specify offline-first execution via local SQLite, but `mobile-bff` lacks an explicit delta-sync and conflict-resolution engine.
* **Impact:** Risk of Last-Write-Wins data loss if an entity is edited concurrently on mobile and web, as well as duplicate record creation if mobile mutation replays fail mid-network transition.
* **Remediation:** Codify a formal sync contract in `packages/contracts/src/mobile/sync.ts`:
  * Mandatory client mutation tracking with `client_mutation_id` (UUIDv7) + `base_version`.
  * Optimistic concurrency checks (`expected_version`).
  * Delta synchronization endpoints returning modified records since `last_sync_timestamp`.

---

### GAP-06: Custom Fields Runtime ORM Injection Gap
* **Severity:** Medium (P2)
* **Affected Artifacts:** `packages/custom-fields-nest/src/custom-fields-nest.service.ts`
* **Finding:** `custom-fields-nest` provides definition storage and validation utilities, but lacks automatic interceptors or ORM hooks. Each module must manually declare a `custom_fields JSONB` column and remember to call `validateCustomFields()`.
* **Impact:** Risk of inconsistent validation enforcement across modules; potential for slow table scans on JSONB without standardized GIN index generation.
* **Remediation:** Create a reusable NestJS interceptor / middleware in `packages/custom-fields-nest` that automatically validates and binds custom fields on incoming payloads.

---

### GAP-07: Verification Baseline & Audit Test Drifts
* **Severity:** Medium (P2)
* **Affected Artifacts:** `scripts/verify.mjs`, `.pi/NOW.md`
* **Finding:** Pre-existing drifts recorded in the baseline:
  * `KNOWN_PROFILE_DRIFT`: `WORKFORCE_API_URL` flagged in deployment profile verification.
  * Undeclared `vitest` dependency in `packages/multi-currency`.
  * Suspicious text match flags in `audit:production-data` and `audit:all-runtime-data`.
* **Remediation:** Address during standard verification cleanup pass per `.pi/NOW.md`.

---

## 3. Prioritized Execution Matrix

| Priority | ID | Task | Target Module/Package |
|:---:|---|---|---|
| **P0** | `GAP-01` | Re-assign colliding ports (`4200`, `4700`) & clean `.env.production` | `apps/workflow-platform/.env*` |
| **P0** | `GAP-02` | Forward migration: Unify RLS session variable to `app.tenant_id` | `packages/db/migrations/` |
| **P1** | `GAP-03` | Create `@gigalibs/storage` for multi-tenant S3/MinIO media persistence | `packages/storage/` |
| **P1** | `GAP-04` | Add DLQ and retry policies to `packages/broker` | `packages/broker/` |
| **P1** | `GAP-05` | Codify idempotent delta-sync contract in `mobile-bff` | `packages/contracts/src/mobile/` |
| **P2** | `GAP-06` | Build automatic NestJS interceptor for custom fields validation | `packages/custom-fields-nest/` |
| **P2** | `GAP-07` | Clean `verify.mjs` baseline drifts (`multi-currency`, `WORKFORCE_API_URL`) | `scripts/verify.mjs` |

---
_Document created: 2026-10-31 · For review by product office and solution architecture prior to production deployment._
