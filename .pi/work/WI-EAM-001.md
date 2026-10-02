# WI-EAM-001 evidence: Enterprise Spatial Topology, CAFM Hierarchy & CAD/BIM Foundation

## Authority and state

- Task card: `.pi/tasks/WI-EAM-001.md` (Approved, Status: IN_REVIEW).
- Work Item: `WI-EAM-001` in `.pi/WORK_ITEMS.md`.
- Target Module: `physical-operations-cmms` (`gigalibs_cmms` schema).
- Branch: `feat/gigaops-convergence-core`.

## Delivered Implementation

1. **Database Migration (`gigalibs_cmms`):**
   - Migration `000015_eam_spatial_cafm_hierarchy.up.sql` created:
     - `cmms_spaces` table with composite PK `(tenant_id, id)`.
     - Spatial taxonomy: `SITE`, `BUILDING`, `FLOOR`, `ROOM`, `ZONE`.
     - Parent FK constraint `(tenant_id, parent_space_id)` referencing `cmms_spaces(tenant_id, id)`.
     - Floor number, gross area sqm, net area sqm.
     - 2D CAD layer GeoJSON `jsonb` field.
     - 3D BIM GUID anchor text field.
     - Asset table altered to add `space_id uuid` referencing `(tenant_id, space_id)`.
     - Forced Row-Level Security (RLS) on `app.tenant_id`.
   - Migration `000015_eam_spatial_cafm_hierarchy.down.sql` created.
   - `modules/physical-operations-cmms/db/runtime-manifest.txt` updated to register migration 15.
   - `CMMS_SCHEMA_CONTRACT_VERSION` incremented to 15 in `runtime-config.ts`.

2. **API Contracts (`@gigalibs/contracts`):**
   - `CmmsSpaceTypeV1Schema` (`SITE` | `BUILDING` | `FLOOR` | `ROOM` | `ZONE`).
   - `CreateCmmsSpaceV1Schema`, `UpdateCmmsSpaceV1Schema`, `UploadCadLayerV1Schema`.
   - `CmmsSpaceV1`, `CmmsSpaceTreeV1`.
   - `spaceId` added to `AssetFieldsSchema`, `SearchCmmsAssetsV1Schema`, and `CmmsAssetV1`.

3. **Backend Service & Controller (`@gigalibs/cmms-api`):**
   - `EamSpacesService` (`create`, `get`, `update`, `delete`, `tree`, `getAssetsInSpace`, `uploadCadLayer`).
   - Recursive CTE cycle detection guard preventing circular hierarchy references.
   - `EamSpacesController` with 7 REST endpoints under `/spaces`.
   - Registered in `EamSpacesModule` and imported in `AppModule`.
   - `AssetsService` updated to persist, update, and filter by `space_id`.

4. **Web Experience (`@gigalibs/cmms-web`):**
   - `CmmsSpaceExplorer.tsx` component:
     - Interactive multi-level spatial hierarchy tree (`Site → Building → Floor → Room`).
     - Spatial attribute KPI cards (floor number, gross area, net usable area, BIM GUID anchor).
     - 2D CAD layer viewer and GeoJSON boundary upload modal.
     - Contained equipment register table showing technical assets stationed inside the selected space.
     - Full space creation and editing modals with parent space selector.
   - Wired into `CmmsWorkspace.tsx` under section `'spaces'`.
   - `CmmsAssets.tsx` updated with spatial location select dropdown and panel display.
   - Registered `/cmms/spaces` in `modules/physical-operations-cmms/module.yaml`.
   - Generated Next.js page `apps/workflow-platform/app/(app)/cmms/spaces/page.tsx` via `pnpm modules:catalog`.

## Verification Evidence

### 1. Dedicated EAM Spatial Certification Harness (`scripts/verify-eam-spatial-foundation.mjs`):
```text
──────────────────────────────────────────────────────────
 EAM Spatial Topology & CAFM Hierarchy Verification
 Work Item: WI-EAM-001
──────────────────────────────────────────────────────────
[Check 01/10] Verifying Migration 15 files and runtime manifest...
  ✓ Migration 15 SQL (table, RLS, FK, indices) and runtime manifest verified.
[Check 02/10] Verifying CMMS schema contract version increment...
  ✓ CMMS_SCHEMA_CONTRACT_VERSION verified at 15.
[Check 03/10] Validating Spatial Types and Creation Schemas...
  ✓ Spatial schemas correctly validate types, codes, and numerical metrics.
[Check 04/10] Constructing 4-Level CAFM Space Hierarchy...
  ✓ 4-Level spatial tree successfully composed: Site → Building → Floor → Room
[Check 05/10] Verifying cycle detection guard logic...
  ✓ Cycle detection guard verified against direct self-parenting and deep loops.
[Check 06/10] Verifying 2D CAD Layer GeoJSON ingestion...
  ✓ 2D CAD GeoJSON vector layer validated with spatial polygon bounds.
[Check 07/10] Verifying 3D BIM IFC GUID linkage...
  ✓ 3D BIM IFC GlobalId anchor correctly parsed and persisted.
[Check 08/10] Verifying Technical Asset containment within space...
  ✓ Asset stationing within space boundary verified with schema filtering.
[Check 09/10] Verifying tenancy constraint and RLS semantics...
  ✓ Multi-tenant composite keys and forced RLS isolation verified.
[Check 10/10] Verifying Web UI integration and module registration...
  ✓ Next.js generated page (/cmms/spaces) and module catalog entry certified.
──────────────────────────────────────────────────────────
 EAM Spatial Foundation Certification: 10/10 CHECKS PASSED
──────────────────────────────────────────────────────────
```

### 2. CMMS Vitest Suite:
```text
Test Files  17 passed (17)
     Tests  117 passed (117)
```

### 3. SDLC Compliance & Verification Suite (`pnpm verify --audits`):
```text
PASS  audit:production-data          0 s
PASS  audit:all-runtime-data         0 s
PASS  audit:package-dependencies     0 s
PASS  audit:api-boundary             0 s
PASS  audit:navigation               0 s
PASS  audit:sdlc                     0 s
PASS  audit:layers                   1 s
PASS  module manifests               0 s
KNOWN deployment profile             0 s
      only the known WORKFORCE_API_URL drift
RESULT: PASS (1 known drift)
```

### 4. Build Suite:
- `@gigalibs/contracts`: Built with exit code 0
- `@gigalibs/cmms-api`: Built with exit code 0
- `@gigalibs/workflow-platform`: Built with exit code 0 (Next.js 15 production build generating `/cmms/spaces`)
