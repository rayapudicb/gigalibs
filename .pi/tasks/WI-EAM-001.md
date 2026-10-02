# WI-EAM-001: Enterprise Spatial Topology, CAFM Hierarchy & CAD/BIM Foundation

- **Status:** IN_REVIEW
- **Work item:** WI-EAM-001 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-EAM-001.md`.
- **Size:** L
- **Depends on:** WI-OI-105 (Places ltree), WI-OI-109 (Universal Org Hierarchy), WI-OI-038 (CMMS Core)

## Goal

Elevate GigaLibs CMMS/Asset Management from flat location tags to an industrial Computer-Aided Facility Management (CAFM) spatial containment hierarchy (`Site → Building → Floor → Room/Zone`) inspired by openMAINT and ISO 55000, with 2D CAD floorplans, 3D BIM (IFC) metadata anchors, and room-level asset containment.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/` (db migrations, apps/api, module.yaml, web)
  - `packages/contracts/` or CMMS API DTO contracts
  - `apps/workflow-platform/src/components/cmms/` or CMMS workbench UI
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-EAM-001.md`
- **Must not change:**
  - The CMMS import/export protected baseline files;
  - Another agent's work (`.pi/work/WI-OI-103.md`, `scripts/verify-manufacturing-no-developer.mjs`);
  - Secrets and `.env*` files;
  - The running web on port 5180.

## Read first

- `docs/REQUIREMENTS_BASELINE.md` (FR-01, FR-04, FR-05, FR-11, FR-14, FR-15)
- `docs/SDLC_DEVELOPMENT_GUIDE.md` (Gate G0–G5 Definition of Done)
- `.pi/work/WI-OI-105.md` (Geospatial Places ltree hierarchy and boundary containment)
- `.pi/work/WI-OI-109.md` (Universal Org Hierarchy and Place linking)
- `modules/physical-operations-cmms/module.yaml` (Current CMMS capabilities)

## Steps

1. **Database Schema Migration (`gigalibs_cmms`):**
   - Add migration `000015_eam_spatial_cafm_hierarchy.up.sql` introducing:
     - `cmms_spaces`: `id UUID PK`, `tenant_id`, `place_id FK`, `parent_space_id FK self`, `space_type` (`SITE`, `BUILDING`, `FLOOR`, `ROOM`, `ZONE`), `name`, `code`, `floor_number`, `gross_area_sqm`, `net_area_sqm`, `cad_layer JSONB`, `bim_guid TEXT`, `created_at`, `updated_at`.
     - Force Row-Level Security (RLS) on `tenant_id`.
   - Update `cmms_assets` table to bind directly to `space_id FK→cmms_spaces(id)`.
2. **Backend API Endpoints (`@gigalibs/cmms-api`):**
   - Implement `EamSpacesController` with endpoints:
     - `POST /api/v1/cmms/spaces` (Create space with parent validation)
     - `GET /api/v1/cmms/spaces/tree` (Retrieve recursive space hierarchy)
     - `GET /api/v1/cmms/spaces/:id` (Space detail with area & BIM GUID)
     - `PUT /api/v1/cmms/spaces/:id` (Update space attributes)
     - `DELETE /api/v1/cmms/spaces/:id` (Delete space with children/asset guard)
     - `GET /api/v1/cmms/spaces/:id/assets` (Get assets located inside space)
     - `POST /api/v1/cmms/spaces/:id/cad-layers` (Upload 2D GeoJSON floorplan)
3. **Web Experience (`apps/workflow-platform`):**
   - Create interactive CAFM Space Explorer component in CMMS workspace:
     - Multi-level tree navigation (`Building A → Level 2 → Room 204`).
     - Room occupancy and area KPI tiles.
     - 2D CAD floorplan canvas showing room boundary polygons.
     - 3D BIM asset drawer linking BIM GUIDs to live asset records.
4. **Verification & Conformance:**
   - Unit tests covering space hierarchy traversal, cycle detection, and RLS.
   - Integration test script `scripts/verify-eam-spatial-foundation.mjs`.
   - Run `pnpm verify` and verify clean build, tests, and zero audit regressions.

## Done when

- [ ] Migration `000015` applies cleanly and idempotently with forced RLS.
- [ ] Space hierarchy prevents cycles and properly enforces multi-tenant boundaries.
- [ ] 7 space management API endpoints are live and pass authentication tests.
- [ ] Web UI displays interactive space tree, room specs, and asset containment.
- [ ] End-to-end certification script passes all stages against real PostgreSQL.
- [ ] `pnpm verify` passes.
- [ ] Evidence recorded in `.pi/work/WI-EAM-001.md`, and `.pi/NOW.md` updated.

## Stop and ask if

- A schema change impacts the existing `WI-OI-038` baseline without forward migration.
- A spatial coordinate requires PostGIS server extensions beyond the current local database setup.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
