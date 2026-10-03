# WI-EAM-004: Telemetry Ingestion & Meter-Driven PM Triggers

- **Status:** Complete (implementation done 2026-10-03, awaiting commit)
- **Work item:** WI-EAM-004 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-EAM-004.md`.
- **Size:** L
- **Depends on:** WI-EAM-003 (Reliability & Job Plans), WI-EAM-002 (Engineering Taxonomy), WI-OI-038 (CMMS Core)

## Goal

Enable autonomous condition-based maintenance and meter-triggered work orders (IBM Maximo / openMAINT parity):
1. **Automated & IoT Telemetry Ingestion:** Support automated telemetry sources (`IOT_TELEMETRY`, `CONNECTOR_HUB`, `SCADA`, `MANUAL`) for continuous counter meters (run-hours, mileage, cycles) and gauge meters (temperature, pressure, vibration).
2. **Meter Trigger Policies & Rules (`cmms_meter_triggers`):** Define threshold rules (e.g. condition breach: `ABOVE_MAXIMUM`, `BELOW_MINIMUM`) and usage interval rules (e.g. every 500 run-hours) linking to Job Plans.
3. **Autonomous Work Order Generation:** When telemetry readings trigger a rule, automatically generate preventative or corrective Work Orders populated with the configured Job Plan SOP tasks and assigned priority.
4. **Telemetry & Meter Management UI:** Provide real-time gauge/counter visualizations, reading logs, and trigger policy configuration in `@gigalibs/cmms-web`.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/` (db migrations, apps/api, module.yaml, web)
  - `packages/contracts/src/cmms/`
  - `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `.pi/work/WI-EAM-004.md`
- **Must not change:**
  - The CMMS import/export baseline files;
  - Another agent's work (`.pi/work/WI-OI-103.md`, `scripts/verify-manufacturing-no-developer.mjs`);
  - Secrets and `.env*` files;
  - The running web on port 5180.

## Read first

- `docs/REQUIREMENTS_BASELINE.md` (FR-02, FR-03, FR-04, FR-05, FR-08, FR-11, FR-12)
- `docs/SDLC_DEVELOPMENT_GUIDE.md` (Gate G0–G5 Definition of Done)
- `modules/physical-operations-cmms/apps/api/src/meters/`
- `modules/physical-operations-cmms/apps/api/src/pm-schedules/`
- `modules/physical-operations-cmms/apps/api/src/reliability/`

## Steps

1. **Database Schema Migration (`gigalibs_cmms` - Migration 18):**
   - Alter `cmms_meter_readings` to support telemetry `source` values (`MANUAL`, `IOT_TELEMETRY`, `CONNECTOR_HUB`, `SCADA`) and optional device/sensor identifier metadata.
   - Create `cmms_meter_triggers` table:
     - `id`, `tenant_id`, `meter_id`, `trigger_type` (`THRESHOLD_BREACH`, `USAGE_INTERVAL`),
     - `threshold_type` (`UPPER`, `LOWER`, `OUT_OF_BOUNDS`),
     - `interval_value` (numeric increment for counter meters),
     - `last_triggered_value`, `job_plan_id`, `work_order_priority`,
     - `is_active`, `version`, `created_by`, `created_at`, `updated_at`.
     - Multi-tenant composite PK `(tenant_id, id)` and forced RLS on `app.tenant_id`.
   - Update `runtime-manifest.txt` and bump `CMMS_SCHEMA_CONTRACT_VERSION` to 18.
2. **Contracts & API Domain (`@gigalibs/contracts` & `@gigalibs/cmms-api`):**
   - Define V1 schemas for Telemetry Ingestion (batch ingestion & connector payloads) and Meter Trigger definitions.
   - Implement `MetersService.recordBatchReadings` and trigger evaluation engine.
   - Implement trigger evaluation on reading ingestion: when counter crosses interval delta or gauge crosses threshold, autonomously create work order with linked job plan.
3. **Web Experience (`@gigalibs/cmms-web`):**
   - Update `CmmsMeters.tsx` with condition monitoring alerts, telemetry reading history trend charts/gauges, and trigger configuration dialog.
4. **Verification & Conformance:**
   - Vitest unit tests in `modules/physical-operations-cmms`.
   - Automated certification script `scripts/verify-eam-telemetry-and-meter-triggers.mjs`.
   - `pnpm verify --audits` and full workspace verification.

## Done when

- [x] Migration 18 cleanly applies with composite PKs `(tenant_id, id)` and forced RLS.
- [x] Telemetry ingestion supports high-throughput batch and multi-source inputs.
- [x] Meter trigger policy engine fires work order generation on both threshold breach and counter interval delta.
- [x] Generated work orders link the configured Job Plan and auto-expand SOP checklist tasks.
- [x] `scripts/verify-eam-telemetry-and-meter-triggers.mjs` passes 100% (47/47).
- [x] `pnpm verify --audits` passes with zero audit regressions (PASS, 1 known WORKFORCE_API_URL drift).
- [x] Evidence recorded in `.pi/work/WI-EAM-004.md` and `.pi/NOW.md` updated.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.
