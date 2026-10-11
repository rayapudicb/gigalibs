# WI-OI-120ab (R5 CMMS slice 2): Close storeroom/balance, meter trigger and space/CAD legacy scope paths

- **Status:** Review (implementation verified 2026-10-11).
- **Work item:** WI-OI-120 (`.pi/WORK_ITEMS.md`); second repair slice under WI-OI-120z. Evidence belongs in `.pi/work/WI-OI-120.md`.
- **Size:** M, bounded legacy-scope repair and regression tests.
- **Trace:** FR-14, FR-15; NFR-SEC-001, NFR-GOV-001–003, NFR-DATA-003, NFR-REL-001–002; ADR-0003, ADR-0018, ADR-0034.

## Goal

Ensure that storerooms, inventory balances, meter triggers, meter reading telemetry batches, and spaces/CAD hierarchies enforce transaction-local legacy site/department scope checks. A scoped maintenance user must not create, modify, or list entities belonging to a site or department outside their authorized scope.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/apps/api/src/parts/parts.service.ts` (storeroom CRUD and balance updates)
  - `modules/physical-operations-cmms/apps/api/src/meters/meters.service.ts` (meter trigger CRUD and reading batch scope checks)
  - `modules/physical-operations-cmms/apps/api/src/spaces/spaces.service.ts` (spaces tree, detail and CAD layer updates)
  - Focused service test specs under `modules/physical-operations-cmms/apps/api/src/`
  - Next BFF verification in `apps/workflow-platform/__tests__/`
  - Task cards, evidence in `.pi/work/WI-OI-120.md` and `.pi/NOW.md`.
- **Must not change:**
  - Applied database migrations or running UAT database;
  - `SCOPE_ENFORCING_MODULES` or `PER_ASSIGNMENT_SCOPE_MODULES` (gates remain closed until all R5 slices pass);
  - CMMS import/export files;
  - Base role catalogue definitions;
  - Secrets and ports.

## Read first

`.pi/NOW.md`; `WI-OI-120z.md`; `WI-OI-120aa.md`; `docs/plans/cmms-r5-access-boundary-2026-10-08.md`; `parts.service.ts`, `meters.service.ts`, `spaces.service.ts`.

## Steps

1. **Storerooms & Balances:** In `parts.service.ts`, ensure `createStoreroom`, `updateStoreroom`, `deleteStoreroom`, and `setPartBalance` assert place scope against the storeroom's `site_ref`, and fail closed for department-scoped actors without assigned department ownership.
2. **Meter Triggers & Telemetry Batch:** In `meters.service.ts`, ensure `listTriggers`, `createTrigger`, `updateTrigger`, `deleteTrigger`, and `recordReadingBatch` validate that the referenced meter and its parent asset are in the caller's authorized scope before inserting readings or evaluating triggers.
3. **Spaces & CAD Layers:** In `spaces.service.ts`, enforce place scope on `getSpaceTree`, `getSpaceDetail`, `createSpace`, `updateSpace`, `deleteSpace`, and CAD layer mutations, verifying that `site_ref` matches the caller's authorized place scope.
4. **Focused Unit & BFF Proof:** Add unit regression tests in CMMS API asserting 403 on cross-scope access, and verify the Next BFF gateway forwarding and entitlement checks.
5. **Audits & Reconciliation:** Run `node scripts/verify-sdlc-governance.mjs` and `node scripts/verify.mjs --audits`, record evidence in `.pi/work/WI-OI-120.md`, and update `.pi/NOW.md`.

## Done when

- [x] Storeroom and balance paths enforce site-scope validation and reject cross-site mutations. Verified: storeroom CRUD and balance mutations fail-closed for department-scoped users (403) and reject out-of-scope sites (403).
- [x] Meter trigger CRUD and reading batches assert parent asset/meter scope before mutation. Verified: triggers and telemetry batch reject cross-department and cross-site requests with 403.
- [x] Space tree, detail, and CAD layer endpoints enforce place-scope validation. Verified: spaces queries and CAD mutations enforce place scope predicates and fail-closed for department-scoped writes.
- [x] Focused unit tests pass 100% across parts, meters, and spaces (30/30 new tests, 46/46 CMMS R5 unit tests).
- [x] Next BFF gateway tests verify end-to-end forwarding and token claims (`cmms-r5-repaired-paths.test.ts` 9/9 pass).
- [x] Applicable platform audits pass (`node scripts/verify.mjs --audits`, `node scripts/verify-sdlc-governance.mjs`).
- [x] Evidence recorded in `.pi/work/WI-OI-120.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A path requires a new forward database migration to model storeroom department ownership;
- A change requires altering base role definitions or granting new permissions;
- A test touches production or live UAT instances.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
