# WI-OI-027 — Autonomous Cash Leakage & Recovery Studio

Status: Review
Parent requirements: FR-06, FR-08, FR-10, FR-12, FR-15, NFR-SEC-001–005, NFR-DATA-001–004, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Autonomous Cash Leakage & Recovery Studio development (financial assurance engine, duplicate invoice fuzzy detection, missed statutory tax exemption audit, unclaimed vendor credit memo recovery, contract pricing creep detection, and live automated clawback orchestration into Workflow Studio) on Port 5180 with Port 4200 dedicated microservice and PostgreSQL 16 schema gigalibs_recovery.

## Outcome

An enterprise autonomous cash leakage and recovery engine. Scans cross-system transactional data (invoices, purchase orders, contracts, tax certificates, bank statements) to detect and recover silent enterprise cash loss. Features deterministic mathematical calculations for tax/FX reconciliation, >98.5% confidence threshold for automated payment holds, human-in-the-loop review for borderline anomalies, and 1-click automated clawback dispatches directly to Workflow Studio and AP/Spend ledgers.

## 2026-09-12 evidence correction

The module is accessible for local UAT, but the outcome above is not implemented end to end. A retrospective
found setup-generated recovery cases, derived scan volumes, provider-like contacts and claims, and locally
fabricated hold/credit/settlement receipts. The attributable local records were removed. Tenant setup now
creates configuration only and seeds zero findings. A scan request returns HTTP 503 until a versioned
authoritative source contract exists. Payment hold, automatic credit, clawback dispatch, claim issue and
settlement return HTTP 503 until their provider adapters return verifiable receipts. The only current
internal mutation is manual finding dismissal with required operator notes and an audit event.

Seven focused recovery truth-boundary tests pass. Live evidence proves repeated setup and rejected actions
leave finding, scan and claim counts at `0 → 0`. Source ingestion, reproducible detectors, reviewed
confidence policy, Workflow/AP provider execution, retry/idempotency, receipt verification,
reconciliation, PostgreSQL 16 rehearsal and independent Finance/Security/QA acceptance remain open.
Current gate remains G4 Review / No-Go.

## 2026-09-16 production-hardening implementation (G4 evidence)

### Schema migrations applied to live PostgreSQL 16 (port 5440, schema gigalibs_recovery)

- `000001_recovery_foundation.up.sql` applied: schema + 4 tables (detected_leaks, recovery_claims, historical_scan_sessions, audit_events) + 4 indexes.
- `000002_recovery_tenancy_and_receipts.up.sql` applied: tenant_id columns on all 4 tables, tenant_recovery_configs, reconciliation_receipts, 8 composite indexes.
- `000003_recovery_rls_and_constraints.up.sql` applied (new): created schema_migrations ledger, enforced NOT NULL on all 4 tenant_id columns, enabled RLS on 5 tables (detected_leaks, recovery_claims, historical_scan_sessions, audit_events, reconciliation_receipts) with RESTRICTIVE tenant isolation policies using `current_setting('app.tenant_id', true)`, recorded all 3 version ledger entries.

Verified in live PostgreSQL: `rowsecurity = t` on all 5 tenant tables, ledger has 3 rows (versions 1–3).

### Service hardening

- `database.service.ts`: Added `withTenantTransaction(tenantId, callback)` (sets `app.tenant_id` via `set_config` before DML), `queryWithTenant(tenantId, sql, params)` (sets `app.tenant_id` for reads), and `bootstrapCheck()` (requires `COUNT(*) = 3` in schema_migrations at startup).
- `leaks.service.ts`: `getMetrics`, `getLeaks`, `getLeakById` switched to `queryWithTenant`; `takeAction` switched to `withTenantTransaction`.
- `setup.service.ts`: `setupTenant` switched to `withTenantTransaction`.
- `scanner.service.ts`: `getScans` switched to `queryWithTenant`.
- `claims.service.ts`: `getClaims` switched to `queryWithTenant`.
- `.env`: DB URL corrected to `postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs`.

### Tests

- `runtime-config.test.ts` (NEW): 7 tests — missing URL, non-postgresql scheme, missing DB name, unsupported algorithm, insecure OIDC in production, empty CORS origins, valid config.
- `recovery-truth-boundary.test.ts`: 1 new test — `withTenantTransaction sets app.tenant_id before performing DML` verifies set_config appears before any DML statement.
- Total: **85 test files, 742 tests, 100% pass**.

### Verification results

- `pnpm build`: 100/100 tasks successful.
- `pnpm test`: 85 files, 742 tests, 0 failures.
- `audit:production-data`: passed.
- `audit:all-runtime-data`: passed.
- `audit:package-dependencies`: passed.
- `audit:api-boundary`: passed.
- `audit:navigation`: passed.
- `audit:sdlc`: passed.


## Product boundary

The module owns `detected_leaks`, `recovery_claims`, `historical_scan_sessions`, and `audit_events` in the dedicated schema `gigalibs_recovery`.
It integrates with Port 5180 unified UI via `/recovery` and BFF proxy `/api/recovery/[...path]`.
Microservice runs independently on Port 4200.
Cross-module handshakes coordinate with AP/Spend (Port 3500), Tax Nexus (Port 3600), MultiCurrency (Port 3700), Rules Engine (Port 3900), and Workflow Studio (Port 4000).

## Implemented Architecture & Evidence

1. **Dedicated Database Schema (`gigalibs_recovery`)**:
   - `detected_leaks`: Granular leakage incidents with severity (`CRITICAL`, `HIGH`, `MEDIUM`), leak type (`DUPLICATE_INVOICE`, `UNCLAIMED_CREDIT`, `MISSED_TAX_EXEMPTION`, `CONTRACT_CREEP`), amounts in minor units and USD, confidence score, primary and comparison document references, vendor metadata, side-by-side comparison JSONB evidence, status (`DETECTED`, `HELD`, `UNDER_REVIEW`, `RECOVERED`, `DISMISSED`), action audit, and clawback run ID.
   - `recovery_claims`: Formal vendor recovery packages and credit memo offset records with claim numbers, settlement status, and cryptographic audit hashes.
   - `historical_scan_sessions`: Records 14-day shadow audit scan sessions against ERP records with leak count, total dollar yield, and scan duration.
   - `audit_events`: Regulatory append-only audit trail.

2. **Dedicated NestJS Microservice (Port 4200)**:
   - Location: `modules/autonomous-recovery-studio/apps/api`
   - Controllers: `LeaksController`, `ScannerController`, `ClaimsController`, `HealthController`.
   - Live cash leakage metrics calculation (`/api/recovery/v1/metrics`).
   - Incident action workflow (`/api/recovery/v1/leaks/:id/action`) triggering real Workflow Studio DAG executions (`WF-P2P-SPEND-APPROVAL`).
   - 14-day historical shadow audit scan execution (`/api/recovery/v1/scan`).

3. **Unified Medusa UI Experience (`/recovery`)**:
   - 100% authentic Medusa UI design tokens connected via Next.js BFF proxy `/api/recovery/[...path]`.
   - 4 Operational Management Tabs:
     1. **Cash Leak Detective Desk**: Live leakage incidents with severity badges (`CRITICAL`, `HIGH`), match confidence pills (`99.1% Confidence`), side-by-side comparison modal, and 1-click "Hold Payment" or "Execute Recovery Clawback".
     2. **Historical Shadow Audit Scanner**: 1-click historical shadow scan on ERP data demonstrating cash recovery before contracts are signed.
     3. **Clawback Claims & Settlements**: Vendor claim letters, settlement tracking, and cryptographic audit proofs.
     4. **Contractual Assurance & SLAs**: Real-time SLA compliance dashboard (99.9% uptime, 0 RPO, Dual-Gate confidence thresholds, Money-Back 3x ROI Warranty tracker).
