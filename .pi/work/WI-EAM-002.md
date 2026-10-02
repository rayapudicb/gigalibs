# WI-EAM-002 evidence: Technical Asset Engineering Taxonomy, Specification Attributes & Status Cascading

## Authority and state

- Task card: `.pi/tasks/WI-EAM-002.md`.
- Work Item: `WI-EAM-002` in `.pi/WORK_ITEMS.md`.
- Target Module: `physical-operations-cmms` (`gigalibs_cmms` schema).
- Status: Complete (verified and certified on 2026-10-02).

## Implemented Artefacts

1. **Database Schema Migration 16 (`gigalibs_cmms`):**
   - Migration file `000016_eam_asset_classification_and_specs.up.sql` creates:
     - `cmms_asset_classifications`: Composite primary key `(tenant_id, id)`, self-referential foreign key `parent_class_id` with tenant isolation, forced RLS on `app.tenant_id`.
     - `cmms_asset_spec_definitions`: Composite primary key `(tenant_id, id)`, foreign key to classifications, data types (`NUMBER`, `TEXT`, `BOOLEAN`, `DATE`), min/max bounds, UoMs, forced RLS on `app.tenant_id`.
     - `cmms_asset_specs`: Composite primary key `(tenant_id, asset_id, spec_definition_id)`, typed values, forced RLS on `app.tenant_id`.
     - Adds `classification_id uuid` column to `gigalibs_cmms.assets` with foreign key and index.
   - Rollback file `000016_eam_asset_classification_and_specs.down.sql` cleanly drops tables and columns.
   - Registered in `modules/physical-operations-cmms/db/runtime-manifest.txt`.
   - Bumped `CMMS_SCHEMA_CONTRACT_VERSION = 16` in `modules/physical-operations-cmms/apps/api/src/runtime-config.ts`.

2. **Canonical Contracts (`@gigalibs/contracts`):**
   - In `packages/contracts/src/cmms/index.ts`:
     - Added `classificationId` to `AssetFieldsSchema`, `SearchCmmsAssetsV1Schema`, and `CmmsAssetV1`.
     - Added `CreateCmmsClassificationV1Schema`, `UpdateCmmsClassificationV1Schema`, `CmmsAssetClassificationV1`, `CmmsClassificationTreeV1`.
     - Added `CmmsSpecDataTypeV1Schema`, `CreateCmmsSpecDefinitionV1Schema`, `CmmsSpecDefinitionV1`.
     - Added `SetCmmsAssetSpecsV1Schema`, `CmmsAssetSpecValueV1`.
     - Added `CmmsEquipmentNodeV1` (hierarchical equipment tree with classification name and children).

3. **Backend Service & Controller (`@gigalibs/cmms-api`):**
   - `modules/physical-operations-cmms/apps/api/src/classifications/classifications.service.ts`:
     - `listTree`: Single-query classification tree assembly with spec/asset counts and depth metrics.
     - `create` & `update`: Cycle prevention via recursive CTE ancestor checks, tenant isolation, optimistic concurrency.
     - `listSpecDefinitions` & `createSpecDefinition`: Engineering specification catalog with attribute key validation and numeric bounds.
     - `getAssetSpecs` & `setAssetSpecs`: Atomic spec setting with range boundary enforcement (`minValue`, `maxValue`) and required attribute checks.
     - `getEquipmentTree`: Recursive CTE traversing entire downstream technical equipment hierarchy (System → Subsystem → Assembly → Component).
     - `cascadeStatus`: Atomic downward operational status cascading (propagating `OFFLINE` or `UNDER_MAINTENANCE` to all dependent components) with audit reason logging.
   - `modules/physical-operations-cmms/apps/api/src/classifications/classifications.controller.ts`:
     - Secure endpoints guarded with `@UseGuards(CmmsAuthorizationGuard)` and `@RequirePermissions('cmms.assets.read' | 'cmms.assets.write')`.
   - `modules/physical-operations-cmms/apps/api/src/classifications/classifications.module.ts`:
     - Exported and mounted in `AppModule`.

4. **Web Experience (`@gigalibs/cmms-web`):**
   - `modules/physical-operations-cmms/web/src/api.ts`:
     - Extended `cmmsApi` with `listClassificationTree`, `getClassification`, `createClassification`, `updateClassification`, `deleteClassification`, `listSpecDefs`, `createSpecDef`, `getAssetSpecs`, `setAssetSpecs`, `getEquipmentTree`, `cascadeStatus`.
   - `modules/physical-operations-cmms/web/src/components/CmmsAssets.tsx`:
     - Technical classification selector in asset registration/edit modal.
     - Three-tab detail panel: `Overview`, `Engineering Specs`, `Hierarchy & Cascade`.
     - `AssetSpecSheet`: Parametric specification sheet displaying attribute keys, data types, current values, units of measure, and inline validation editor.
     - `AssetEquipmentHierarchySection`: Recursive equipment tree view with status badges, criticality, taxonomy tag, and status cascading execution dialog.

## Verification Evidence

1. **Classifications Service Unit Tests:**
   - `modules/physical-operations-cmms/apps/api/src/classifications/classifications.service.spec.ts`
   - Command: `pnpm vitest run modules/physical-operations-cmms/apps/api/src/classifications/classifications.service.spec.ts`
   - Result: 6/6 tests passing (100%).

2. **Integration Verification Suite:**
   - Script: `scripts/verify-eam-taxonomy-and-specs.mjs`
   - Command: `node scripts/verify-eam-taxonomy-and-specs.mjs`
   - Checks:
     - Check 01: Migration 16 SQL & manifest registration (PASS)
     - Check 02: CMMS schema contract version increment to 16 (PASS)
     - Check 03: V1 Classification Schema Contracts (PASS)
     - Check 04: Multi-level Classification Tree construction (PASS)
     - Check 05: Cycle detection guard in classification graph (PASS)
     - Check 06: Specification Definition schemas & UoMs (PASS)
     - Check 07: Parametric Specification Values validation engine (PASS)
     - Check 08: Multi-level Equipment Hierarchy Tree traversal (PASS)
     - Check 09: Atomic Downward Status Cascading simulation (PASS)
     - Check 10: Multi-tenant composite keys and forced RLS isolation (PASS)
     - Check 11: Web UI integration in @gigalibs/cmms-web (PASS)
   - Result: 11/11 checks passed.

3. **Workspace Audits & TypeScript Conformance:**
   - Command: `pnpm --filter @gigalibs/workflow-platform exec tsc --noEmit` -> PASS (0 errors).
   - Command: `pnpm --filter @gigalibs/cmms-api build` -> PASS (0 errors).
   - Command: `pnpm verify --audits` -> PASS (0 audit regressions, only known baseline drift).
