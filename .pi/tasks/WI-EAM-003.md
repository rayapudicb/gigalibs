# WI-EAM-003: Maintenance Manuals, Standard Procedures & Failure Mode Hierarchy

- **Status:** Complete (implementation done 2026-10-03, awaiting commit)
- **Work item:** WI-EAM-003 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-EAM-003.md`.
- **Size:** L
- **Depends on:** WI-EAM-002 (Engineering Taxonomy), WI-OI-038 (CMMS Core)

## Goal

Implement an enterprise reliability engineering framework matching IBM Maximo and openMAINT ISO 14224 standards:
1. Multi-tier Failure Hierarchy: Problem → Cause → Remedy (standardized failure code catalog linked to technical classifications).
2. Standard Operating Procedures (SOPs) & Job Plan templates with safety guidelines, PPE requirements, and Lockout/Tagout (LOTO) protocols.
3. Automated Work Order Checklist Generation: applying a Job Plan instantly populates pre-configured, sequential maintenance tasks and safety controls.
4. Failure code logging and resolution tracking on corrective work orders for reliability analytics.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/` (db migrations, apps/api, module.yaml, web)
  - `packages/contracts/src/cmms/`
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-EAM-003.md`
- **Must not change:**
  - The CMMS import/export baseline files;
  - Another agent's work (`.pi/work/WI-OI-103.md`, `scripts/verify-manufacturing-no-developer.mjs`);
  - Secrets and `.env*` files;
  - The running web on port 5180.

## Read first

- `docs/REQUIREMENTS_BASELINE.md` (FR-01, FR-04, FR-05, FR-08, FR-10, FR-12, FR-15)
- `docs/SDLC_DEVELOPMENT_GUIDE.md` (Gate G0–G5 Definition of Done)
- `.pi/work/WI-EAM-002.md` (Taxonomy & Specifications Evidence)
- `modules/physical-operations-cmms/module.yaml` (CMMS Manifest)

## Steps

1. **Database Schema Migration (`gigalibs_cmms`):**
   - Migration `000017_eam_failure_hierarchy_and_job_plans.up.sql`:
     - `cmms_failure_codes`: `id`, `tenant_id`, `type` (`PROBLEM`, `CAUSE`, `REMEDY`), `code`, `description`, `parent_code_id`, `classification_id`, forced RLS on `app.tenant_id`.
     - `cmms_job_plans`: `id`, `tenant_id`, `code`, `title`, `description`, `classification_id`, `estimated_duration_minutes`, `safety_guidelines`, `version`, forced RLS on `app.tenant_id`.
     - `cmms_job_plan_tasks`: `id`, `tenant_id`, `job_plan_id`, `sequence`, `label`, `task_type`, `required`, `estimated_minutes`, forced RLS on `app.tenant_id`.
     - Alter `gigalibs_cmms.work_orders` to add `failure_problem_id`, `failure_cause_id`, `failure_remedy_id`, `job_plan_id`.
   - Update `runtime-manifest.txt` and bump `CMMS_SCHEMA_CONTRACT_VERSION` to 17.
2. **Contracts & API Domain (`@gigalibs/contracts` & `@gigalibs/cmms-api`):**
   - V1 schemas for Failure Codes (`PROBLEM`, `CAUSE`, `REMEDY`), Job Plans, Job Plan Tasks, and Work Order failure attribution.
   - Implement `ReliabilityService` and `ReliabilityController`.
   - Implement automated Job Plan task expansion onto work orders (`POST /v1/job-plans/:id/apply-to-work-order/:workOrderId`).
3. **Web Experience (`@gigalibs/cmms-web`):**
   - Update `CmmsWorkOrders.tsx` with Failure Analysis panel (Problem → Cause → Remedy cascaded selection).
   - "Apply Job Plan / Standard SOP" action that auto-populates checklist tasks and displays LOTO / safety requirements.
   - Job Plan library management interface.
4. **Verification & Conformance:**
   - Vitest unit tests in `modules/physical-operations-cmms`.
   - Automated integration certification script `scripts/verify-eam-reliability-and-job-plans.mjs`.
   - `pnpm verify --audits` and full workspace verification.

## Done when

- [x] Migration 17 cleanly applies with composite PKs `(tenant_id, id)` and forced RLS.
- [x] Multi-tier failure catalog enforces Problem → Cause → Remedy structure.
- [x] Job Plans support sequential task checklists and safety/LOTO guidelines.
- [x] Applying a Job Plan to a Work Order atomically expands tasks and preserves audit history.
- [x] `scripts/verify-eam-reliability-and-job-plans.mjs` passes 100% (48/48).
- [x] `pnpm verify --audits` passes with zero audit regressions (PASS, 1 known WORKFORCE_API_URL drift).
- [x] Evidence recorded in `.pi/work/WI-EAM-003.md` and `.pi/NOW.md` updated.
