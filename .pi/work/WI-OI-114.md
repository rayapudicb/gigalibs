# WI-OI-114: Fixed Assets Management, Asset Register & Depreciation Engine — Evidence

- **Work item:** WI-OI-114
- **Domain:** SDLC Orchestrator / Fixed Assets & Capital Accounting Domain (`modules/financial-operations`)
- **Status:** Review
- **Date:** 2026-10-04

---

## 1. Summary of Delivery

Delivered **Enterprise Architecture Phase 10: Fixed Assets Management, Asset Register & Depreciation Engine** extending `gigalibs_finance` (v3):
1. **Architecture & Threat Model (FA-0):** Authored `docs/architecture/ADR-0028-fixed-assets-depreciation-engine.md` establishing capital asset lifecycles, zero-float depreciation algorithms, GL posting invariants, and cross-module decoupling with EAM Operations Console (`modules/physical-operations-cmms`).
2. **Contracts & Schemas (FA-1):** Delivered `@gigalibs/contracts/finance` fixed asset extensions:
   - Enums: `DEPRECIATION_METHODS`, `DEPRECIATION_CONVENTIONS`, `FIXED_ASSET_STATUSES`, `DEPRECIATION_SCHEDULE_STATUSES`, `DEPRECIATION_RUN_STATUSES`, `ASSET_DISPOSAL_TYPES`.
   - Zod Schemas: `FixedAssetClassV1Schema`, `FixedAssetV1Schema`, `AssetDepreciationScheduleV1Schema`, `AssetDepreciationRunV1Schema`, `AssetDisposalV1Schema`, Input DTOs, and CloudEvents (`finance.asset.capitalized.v1`, `finance.depreciation.run.posted.v1`, `finance.asset.disposed.v1`).
   - Unit tests pass 5/5 in `packages/contracts/src/finance/fixed-assets.test.ts`.
3. **Forward Migrations (FA-2):** Applied `000003_finance_fixed_assets.up.sql` to `gigalibs_finance`:
   - Tables: `fixed_asset_classes`, `fixed_assets`, `asset_depreciation_schedules`, `asset_depreciation_runs`, `asset_disposals`.
   - Hardware Row-Level Security enabled and forced on all 5 tables with `tenant_isolation_policy`.
   - Immutability trigger `trg_depreciation_schedules_immutable` protecting posted financial lines.
4. **Depreciation Calculator & Engine (FA-3 to FA-7):**
   - Implemented `depreciation-calculator.ts` with zero floating-point math (exact BigInt minor units). Unit tests pass 4/4.
   - Built `FixedAssetsService` in NestJS providing asset class registration, capitalization, monthly schedule projection, batch depreciation runs posting balanced GL vouchers via `FinanceService.postJournal()`, and disposal/write-off processing with gain/loss computation.
   - Built `FixedAssetsController` with `@RequirePermissions` guards and validation.
5. **Web Workspace (FA-8):** Added "Fixed Assets" and "Depreciation Studio" tabs to `FinancialOperationsWorkspace.tsx` with register table, KPI summary, and depreciation forecast schedule.
6. **Real PostgreSQL 16 ACID Certification (FA-9):**
   - Built `scripts/verify-fixed-assets.mjs` certifying 12 database scenarios on port 5440.
   - Wired into `scripts/verify.mjs`. Full `node scripts/verify.mjs` passed 14/14 steps.

---

## 2. Real Database Verification Scenarios Certified

1. **Contracts & Zod Schema Validation:** Full enum and type conformity verified.
2. **Database Schema & Migration v3:** Verified `schema_migrations` contains version 3; verified all 5 tables exist with forced RLS.
3. **Scenario 1 (Asset Class Setup):** Registered `MACH-01` bound to GL accounts (1500, 1510, 6500, 7100).
4. **Scenario 2 (Asset Registration):** Registered `ASSET-CNC-900` in `DRAFT` state with cost $120,000.00, salvage $12,000.00.
5. **Scenario 3 (Zero-Float Math):** Verified exact cent conservation across 12 monthly straight-line periods ($9,000.00/period).
6. **Scenario 4 (Asset Capitalization):** Transitioned asset to `CAPITALIZED`; persisted 3 projected schedule lines; verified outbox event.
7. **Scenario 5 (Batch Period Depreciation Run):** Posted balanced double-entry GL journal (Debit 6500: $9,000.00, Credit 1510: $9,000.00); updated schedule to `POSTED`; transitioned asset to `DEPRECIATING`.
8. **Scenario 6 (Immutability Enforcement):** Direct SQL `UPDATE` and `DELETE` on posted schedule rejected by database trigger.
9. **Scenario 7 (Fully Depreciated State):** Fast-forwarded asset to book value == salvage value; verified transition to `FULLY_DEPRECIATED`.
10. **Scenario 8 (Asset Disposal with Gain):** Disposed delivery van for $35,000.00 (NBV $30,000.00); verified balanced GL journal and recognized $5,000.00 Gain on Sale; status transitioned to `DISPOSED`.
11. **Scenario 9 (Asset Scrap Write-Off with Loss):** Scrapped tooling rig for $0 proceeds (NBV $8,000.00); verified balanced GL journal and recognized $8,000.00 Loss on Disposal; status transitioned to `WRITTEN_OFF`.
12. **Scenario 10 (Hardware RLS Isolation):** Tested non-superuser tenant isolation via `rls_test_user`; verified Tenant B sees 0 rows from Tenant A across all fixed asset tables.

---

## 3. Verification Suite Evidence

```text
verify: full log /var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-04T11-35-53-879Z.log
PASS  build                         49 s   log line 1
PASS  test                          32 s   log line 454
PASS  audit:production-data          1 s   log line 980
PASS  audit:all-runtime-data         1 s   log line 1012
PASS  audit:package-dependencies     1 s   log line 1045
PASS  audit:api-boundary             0 s   log line 1052
PASS  audit:navigation               0 s   log line 1060
PASS  audit:sdlc                     0 s   log line 1068
PASS  audit:layers                   1 s   log line 1087
PASS  module manifests               0 s   log line 1127
KNOWN deployment profile             0 s   log line 1174
      only the known WORKFORCE_API_URL drift
PASS  financial-operations           0 s   log line 1189
PASS  treasury-reconciliation        0 s   log line 1242
PASS  fixed-assets                   0 s   log line 1299
RESULT: PASS (1 known drift)
```
