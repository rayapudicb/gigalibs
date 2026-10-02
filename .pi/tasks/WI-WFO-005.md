# WI-WFO-005: Universal Compliance, Communications & Vendor Management

- **Status:** Review
- **Work item:** WI-WFO-005 (Compliance, Communications & Vendors). Evidence goes in `.pi/work/WI-WFO-005.md`.
- **Size:** M

## Goal

Deliver universal compliance tracking and audit reporting, multi-channel frontline communications (email, SMS, push logging), third-party staffing vendor/agency management with worker attribution, and frontline worker support ticketing.

## Scope

- **May change:**
  - `modules/gigaops/db/runtime-foundation/000025_wfo_comms_vendors.up.sql` (and `.down.sql`)
  - `modules/gigaops/apps/api/src/compliance/*` (compliance summary, audit reports, doc verification queue)
  - `modules/gigaops/apps/api/src/comms/*` (multi-channel targeted broadcast, message history)
  - `modules/gigaops/apps/api/src/vendors/*` (agency/vendor registry, worker attribution, payments)
  - `packages/contracts/src/workforce/universal.ts` (compliance, communications, and vendor DTOs)
  - `apps/workflow-platform/components/gigaops/*` (ComplianceDashboard, CommsCenter, VendorDirectory)
  - `.pi/work/WI-WFO-005.md`, `config/sdlc-governance.json`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`
- **Must not change:**
  - Core tenancy or organization hierarchy tables and migrations from `WI-OI-109`;
  - Uncommitted changes in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`;
  - CMMS import/export;
  - Secrets;
  - Live production-reachable mock data or fake provider bypasses.

## Read first

- `AGENTS.md`
- `WI_WFO_DELIVERY_MANIFEST.md` §WI-WFO-005
- `UNIVERSAL_WORKFORCEOPS_COMPLETE_DESIGN.md` §E-03, §E-08
- `modules/gigaops/apps/api/src/gigaops.module.ts`

## Steps

1. **Governance & Pre-flight:**
   - Record `WI-WFO-005` in `.pi/WORK_ITEMS.md`, update `config/sdlc-governance.json`, `.pi/NOW.md`, and initialize `.pi/work/WI-WFO-005.md`.
2. **Database Migrations:**
   - Author migration `000025_wfo_comms_vendors.up.sql` (`wfo_notification_log`, `wfo_vendors`, and `vendor_id` on `wfo_workers`) with tenant RLS isolation and reversible `.down.sql`.
3. **Contracts & API Layer:**
   - Add Zod contracts & DTOs for compliance auditing, communications sending, vendor management, and support tickets in `@gigalibs/contracts`.
   - Implement `WfoComplianceService` and `WfoComplianceController` (compliance KPI summary, doc verification queue, audit export).
   - Implement `WfoCommunicationsService` and `WfoCommunicationsController` (targeted engagement broadcasts, worker notifications history).
   - Implement `WfoVendorsService` and `WfoVendorsController` (vendor CRUD, worker attribution, agency fee/payment summaries).
4. **UI Workbench Integration:**
   - Implement `WfoComplianceDashboard.tsx` (compliance scores, expiring document alerts, verification queue).
   - Implement `WfoCommsCenter.tsx` (broadcast composer, channel selector, delivery audit log).
   - Implement `WfoVendorDirectory.tsx` (vendor list, worker roster attribution, vendor details).
   - Mount under GigaOps Workbench.
5. **Verification & Audit:**
   - Unit tests covering compliance checks, broadcast delivery state transitions, and vendor attribution.
   - Run `pnpm verify` (clean pass with known drift only).

## Done when

- [x] Migration `000025_wfo_comms_vendors.up.sql` and `.down.sql` authored with forced RLS and foreign key guards.
- [x] Compliance verification queue and audit export operational.
- [x] Frontline broadcast messaging and worker notification logs functional.
- [x] Vendor directory and agency worker attribution active.
- [x] `pnpm verify` passes cleanly across all packages and SDLC audits.
- [x] Evidence recorded in `.pi/work/WI-WFO-005.md`.

## Stop and ask if

- A decision is needed that the vision or owner has not settled;
- A step would change a running production service or live owner data without authorization.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
