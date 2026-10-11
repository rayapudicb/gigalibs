# WI-OI-120ad: T3 Canonical Place Identity & CMMS Place-Scope Projection Proof

- **Status:** Review
- **Work item:** WI-OI-120 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

Establish canonical place identity projection (T3) connecting the Geospatial place hierarchy to CMMS place-scope enforcement, implement descendant place expansion (site → building → floor → zone/space), ensure unlisted, disjoint, or missing place references fail closed (403 / empty set), and provide authoritative test proofs for descendant-aware place scoping across CMMS.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/apps/api/src/auth/place-projection.ts` (canonical place tree expansion and fail-closed checks)
  - `modules/physical-operations-cmms/apps/api/src/auth/scope.ts` (descendant-aware place expansion in `scopePredicates` and `assertWritableScope`)
  - `modules/physical-operations-cmms/apps/api/src/auth/place-projection.spec.ts` (authoritative unit test suite)
  - `.pi/tasks/WI-OI-120ad.md`
  - `.pi/work/WI-OI-120.md`, `.pi/NOW.md`
- **Must not change:**
  - Applied migrations, database schemas, UAT data, secrets.
  - Global scope gates (`SCOPE_ENFORCING_MODULES['asset-maintenance'].places` remains false until independent review).
  - The CMMS import/export files.
  - Another session's UI prototypes (`AuthAtmosphere.tsx`, `PlantSpatial3DViewer.tsx`, `public/images/`).
  - Running services or web on port 5180.

## Read first

- `docs/architecture/ADR-0006-spatial-hierarchy-and-scope.md`
- `docs/plans/cmms-r5-access-boundary-2026-10-08.md` § Missing place/unit scope & Step 4
- `docs/plans/platform-implementation-plan.md` § T3 (One place identity)
- `modules/physical-operations-cmms/apps/api/src/auth/scope.ts`
- `modules/physical-operations-cmms/apps/api/src/auth/organization-projection.ts`

## Steps

1. **Canonical Place Tree Projection:**
   - Define `CmmsPlaceNode`, `CmmsPlaceTree`, and `expandPlaceRoots(tree, rootIds)` in `modules/physical-operations-cmms/apps/api/src/auth/place-projection.ts`.
   - Implement breadth-first descendant traversal so a role granted at a site automatically covers all contained buildings, floors, rooms, and spaces.
   - Enforce fail-closed handling for detached nodes or empty trees.

2. **Descendant-Aware Place Scope Enforcement:**
   - Update `scopePredicates` in `scope.ts` to expand place roots via `tree?: CmmsPlaceTree`.
   - Update `assertWritableScope` in `scope.ts` to ensure mutations require the target `siteRef` to fall within the caller's expanded place hierarchy, rejecting null-site writes for place-scoped callers with 403 `CMMS_OUT_OF_SCOPE`.

3. **Authoritative Place Scope Test Proof:**
   - Create `modules/physical-operations-cmms/apps/api/src/auth/r5-place-projection.spec.ts` proving:
     - Single root expansion covers multi-level descendants (site → building → floor → room).
     - Multiple disjoint root expansion unions descendants cleanly.
     - Queries against sibling or unassigned sites yield empty sets / `FALSE`.
     - Writes to authorized descendant sites succeed; writes to unassigned sites or null sites throw 403.
     - Place scope bound parameters are securely parameterized.

4. **Verification:**
   - Run CMMS API test suite, contracts RBAC tests, tenancy-nest tests, and platform audits.

5. **Update Documentation:**
   - Update `.pi/tasks/WI-OI-120ad.md` to Review, record evidence in `.pi/work/WI-OI-120.md`, and update `.pi/NOW.md`.

## Done when

- [x] Canonical place tree projection (`expandPlaceRoots`) is implemented and tested.
- [x] `scopePredicates` and `assertWritableScope` enforce descendant-aware place scoping.
- [x] Comprehensive unit test suite (`r5-place-projection.spec.ts`, 13 tests) passes 100%.
- [x] All 29 CMMS API test suites (229 tests) and platform audits pass without regressions.
- [x] Evidence recorded in `.pi/work/WI-OI-120.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A schema change to `spatial_nodes` or `spaces` is proposed (ADR-0006 forbids cross-schema joins/FKs).
- Global scope gates are requested to be opened prematurely.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.

