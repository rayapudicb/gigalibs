# WI-OI-120ac: R5 CMMS Unit-Tree Scope Proof & Manifest Role Reconciliation

- **Status:** Review
- **Work item:** WI-OI-120 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

Prove unit-tree scope enforcement across all mounted CMMS endpoints, ensure stale or missing organization tree versions fail closed, reconcile CMMS default role definitions against `explicitScopeRefusal`, and harden manifest role synchronization (`syncDefaultRoles`) to prevent unverified explicit scope widening.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/apps/api/src/auth/` (unit-tree projection, versioned hierarchy expansion, fail-closed handling)
  - `modules/physical-operations-cmms/apps/api/src/` (unit-tree integration tests and scope verifications)
  - `packages/tenancy-nest/src/tenancy.service.ts` (`syncDefaultRoles` validation against explicit scopes and transition rules)
  - `packages/tenancy-nest/src/default-roles.test.ts`
  - `.pi/work/WI-OI-120.md`, `.pi/NOW.md`
- **Must not change:**
  - Applied migrations, database schemas, UAT data, secrets.
  - The place scope gate (`places: false` remains until T3 canonical place identity).
  - The CMMS import/export files.
  - Another session's UI prototypes (`AuthAtmosphere.tsx`, `PlantSpatial3DViewer.tsx`, `public/images/`).
  - Running services or web on port 5180.

## Read first

- `docs/plans/cmms-r5-access-boundary-2026-10-08.md` § Cross-module boundary & Required implementation order
- `.pi/tasks/WI-OI-120z.md`
- `packages/contracts/src/rbac/assignment-scopes.ts`
- `packages/tenancy-nest/src/tenancy.service.ts:706–777`
- `modules/physical-operations-cmms/apps/api/src/auth/`

## Steps

1. **CMMS Unit-Tree Scope Proof:**
   - Verify unit-tree hierarchy expansion (ancestor department covers descendant departments).
   - Verify stale/mismatched organization tree versions fail closed (refuse query/mutation with 403 or empty visible set).
   - Write comprehensive unit tests in `modules/physical-operations-cmms` proving department hierarchy and version checking.
2. **Manifest Role Synchronization Hardening:**
   - In `packages/tenancy-nest/src/tenancy.service.ts` (`syncDefaultRoles`), validate updated role permissions against current member assignments using `assertScopesConsistent` and `assertScopeEnforced`.
   - Prevent role synchronization from widening permissions to unproven modules or invalid explicit scopes for existing holders.
   - Add unit tests in `default-roles.test.ts` proving refusal and safe rollback on conflict.
3. **Role Composition & explicitScopeRefusal Reconciliation:**
   - Audit CMMS default roles (`cmms-technician`, `cmms-planner`, `cmms-viewer`) and their bundled permissions (`maps.nodes.read`, `workforce.*`).
   - Prove `explicitScopeRefusal` behavior for CMMS roles under `units: true, places: false`.
4. **Verification:**
   - Run CMMS API test suite, tenancy-nest tests, contracts RBAC tests, and platform audits.
5. **Update Documentation:**
   - Update `.pi/tasks/WI-OI-120ac.md` and `.pi/work/WI-OI-120.md`.

## Done when

- [x] Unit-tree hierarchy expansion and stale/missing version fail-closed behavior are implemented and proven with unit tests.
- [x] `syncDefaultRoles` enforces scope consistency and scope bounds for all existing role holders.
- [x] Role reconciliation against `explicitScopeRefusal` is tested and documented.
- [x] All targeted unit tests pass 100%.
- [x] Platform audits pass without new violations.
- [x] Evidence is recorded in `.pi/work/WI-OI-120.md`, and `.pi/NOW.md` is updated.

## Stop and ask if

- A decision is needed on whether to split `maps.nodes.read` or workforce permissions out of default CMMS roles before opening the unit gate.
- Any change would require a schema migration or modify existing tenant assignments.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
