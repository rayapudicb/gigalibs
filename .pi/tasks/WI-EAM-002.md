# WI-EAM-002: Technical Asset Engineering Taxonomy, Specification Attributes & Status Cascading

- **Status:** Complete (verified by node scripts/verify-eam-taxonomy-and-specs.mjs and pnpm verify --audits on 2026-10-02)
- **Work item:** WI-EAM-002 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-EAM-002.md`.
- **Size:** L
- **Depends on:** WI-EAM-001 (Spatial Topology), WI-OI-038 (CMMS Core)

## Goal

Elevate GigaLibs asset master records to enterprise engineering standards (matching IBM Maximo and openMAINT):
1. Multi-level engineering classification taxonomy (e.g. `MECHANICAL → PUMP → CENTRIFUGAL`, `ELECTRICAL → TRANSFORMER`).
2. Parametric engineering specification templates per classification with unit-of-measure (UoM) and validation ranges.
3. Deep parent-child technical equipment hierarchy (system → subsystem → assembly → component).
4. Governed operational status cascading with dependency containment (taking a parent asset offline automatically alerts and cascades degraded status to dependent subcomponents).

## Scope

- **May change:**
  - `modules/physical-operations-cmms/` (db migrations, apps/api, module.yaml, web)
  - `packages/contracts/src/cmms/`
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-EAM-002.md`
- **Must not change:**
  - The CMMS import/export baseline files;
  - Another agent's work (`.pi/work/WI-OI-103.md`, `scripts/verify-manufacturing-no-developer.mjs`);
  - Secrets and `.env*` files;
  - The running web on port 5180.

## Read first

- `docs/REQUIREMENTS_BASELINE.md` (FR-01, FR-05, FR-08, FR-11, FR-12, FR-14)
- `docs/SDLC_DEVELOPMENT_GUIDE.md` (Gate G0–G5 Definition of Done)
- `.pi/work/WI-EAM-001.md` (Spatial Topology Foundation)
- `modules/physical-operations-cmms/module.yaml` (CMMS Manifest)

## Steps

1. **Database Schema Migration (`gigalibs_cmms`):**
   - Migration `000016_eam_asset_classification_and_specs.up.sql`:
     - `cmms_asset_classifications`: `id`, `tenant_id`, `code`, `name`, `parent_class_id`, forced RLS.
     - `cmms_asset_spec_definitions`: `id`, `tenant_id`, `classification_id`, `attribute_key`, `label`, `data_type`, `uom`, `min_value`, `max_value`, forced RLS.
     - `cmms_asset_specs`: `tenant_id`, `asset_id`, `spec_definition_id`, `value_text`, `value_number`, `value_boolean`, forced RLS.
     - Alter `gigalibs_cmms.assets` to add `classification_id uuid` referencing classifications.
   - Update `runtime-manifest.txt` and bump `CMMS_SCHEMA_CONTRACT_VERSION` to 16.
2. **Contracts & API Domain (`@gigalibs/contracts` & `@gigalibs/cmms-api`):**
   - Define V1 Zod schemas for classifications, spec definitions, and spec values.
   - Implement `ClassificationsService` and `ClassificationsController`.
   - Implement dynamic spec validation engine in `ClassificationsService`.
   - Implement equipment hierarchy tree (`GET /assets/:id/equipment-tree`) and operational status cascading.
3. **Web Experience (`@gigalibs/cmms-web`):**
   - Implement equipment hierarchy tree navigation in `CmmsAssets.tsx`.
   - Implement dynamic specification sheet tab rendering engineering attributes with units.
   - Implement status cascading warning/confirmation dialog.
4. **Verification & Conformance:**
   - Vitest unit tests in `modules/physical-operations-cmms`.
   - Automated integration script `scripts/verify-eam-taxonomy-and-specs.mjs`.
   - `pnpm verify --audits` and full workspace build.

## Done when

- [x] Migration 16 up/down scripts cleanly apply with forced RLS and foreign keys.
- [x] Classification tree and dynamic specification templates are fully queryable and validated.
- [x] Equipment parent-child tree supports multi-level component drilldown.
- [x] Status cascading propagates offline/degraded states safely.
- [x] `scripts/verify-eam-taxonomy-and-specs.mjs` passes 100% (11/11 checks).
- [x] `pnpm verify --audits` passes with zero audit regressions.
- [x] Evidence recorded in `.pi/work/WI-EAM-002.md` and `.pi/NOW.md` updated.
