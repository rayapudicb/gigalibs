# WI-WFO-001 evidence: Universal WorkforceOps Foundation

## Authority and state

- Owner approved `.pi/tasks/WI-WFO-001.md` on 2026-10-02 with "OK" / "go".
- WI-WFO-001 is the sole active implementation item.
- Preserved: uncommitted corrections in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`.

## Implementation Evidence (2026-10-02)

1. **Database Migrations (Forward & Rollback):**
   - `000020_wfo_worker_registry.up.sql` & `.down.sql`:
     - `gigalibs_workforce.wfo_workers` with tenant isolation RLS, identity hash deduplication, skills JSONB, and onboarding percentage check.
     - `gigalibs_workforce.wfo_compliance_documents` with tenant isolation RLS, worker foreign key cascade, expiry date tracking, and verification four-eyes constraint (`CHECK (status <> 'APPROVED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))`).
   - `000021_wfo_engagements.up.sql` & `.down.sql`:
     - `gigalibs_workforce.wfo_engagements` with cross-industry types (`EVENT`, `PROJECT`, `WORK_ORDER`, `ROUTE`, `VOYAGE`, `ROSTER_PERIOD`, `DUTY_ROSTER`), date range check, and `org_unit_id` hierarchy scoping.
     - `gigalibs_workforce.wfo_engagement_positions` with quota checks (`CHECK (filled <= quantity)`), rate type enums, and engagement foreign key cascade.

2. **Shared Contracts (`@gigalibs/contracts`):**
   - Added `packages/contracts/src/workforce/universal.ts` with Zod validation schemas and TypeScript types:
     - Worker: `CreateWfoWorkerV1Schema`, `UpdateWfoWorkerV1Schema`, `WfoWorkerRecordV1Schema`.
     - Compliance: `CreateWfoComplianceDocV1Schema`, `VerifyWfoComplianceDocV1Schema`, `WfoComplianceDocRecordV1Schema`.
     - Engagements: `CreateWfoEngagementV1Schema`, `UpdateWfoEngagementV1Schema`, `WfoEngagementRecordV1Schema`.
     - Positions: `CreateWfoEngagementPositionV1Schema`, `WfoEngagementPositionRecordV1Schema`.
   - Contract test suite: `modules/gigaops/apps/api/src/workers/wfo.contracts.spec.ts` (5 tests passing).

3. **Backend API Domain (`modules/gigaops`):**
   - Implemented `WfoWorkersService` and `WfoWorkersController` (`/api/v1/wfo/workers`):
     - Duplicate identity hash check, email uniqueness per tenant, lifecycle state transitions, compliance doc upload, verification with automatic onboarding % calculation.
   - Implemented `WfoEngagementsService` and `WfoEngagementsController` (`/api/v1/wfo/engagements`):
     - Multi-type engagement scheduling, publication, position creation with quotas and rate definitions.
   - Registered controllers and services into `GigaOpsModule`.
   - Bumped `WORKFORCE_SCHEMA_CONTRACT_VERSION = 21` in `runtime-config.ts` matching migration 000021.

4. **Frontend Workbench (`apps/workflow-platform`):**
   - Extended `GIGAOPS_SECTIONS` with `'workers'` and `'engagements'`.
   - Built `WfoWorkerDirectory.tsx`: search, lifecycle filtering, create worker modal, worker detail panel with compliance document verification.
   - Built `WfoEngagementCalendar.tsx`: cross-industry engagement catalogue, creation form, position quotas, and publishing controls.
   - Integrated into `GigaOpsWorkforceWorkbench.tsx` navigation and section renderer.
   - Next.js production build (`@gigalibs/workflow-platform`) compiles cleanly (100+ routes).

5. **Mandatory Verification Gate:**
   - Full `pnpm verify` run: **PASS** (1 known drift on `WORKFORCE_API_URL`).
     - Build: PASS (0 errors)
     - Test: PASS (2,189 tests passing, 0 failures)
     - All 7 SDLC audits: PASS (`audit:sdlc`, `audit:production-data`, `audit:all-runtime-data`, `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`, `audit:layers`).

