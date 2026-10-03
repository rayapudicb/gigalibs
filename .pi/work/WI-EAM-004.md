# WI-EAM-004 Evidence: Telemetry Ingestion & Meter-Driven PM Triggers

## What changed

### Migration 18 (up + down)
- Extended `gigalibs_cmms.meter_readings` constraints to support telemetry sources: `MANUAL`, `IOT_TELEMETRY`, `CONNECTOR_HUB`, `SCADA`.
- Added `device_id` and `payload_ref` metadata columns to `gigalibs_cmms.meter_readings`.
- Created table `gigalibs_cmms.cmms_meter_triggers`:
  - `trigger_type`: `THRESHOLD_BREACH` (instantaneous gauges) or `USAGE_INTERVAL` (continuous run-hour / cycle counters).
  - `threshold_type`: `UPPER`, `LOWER`, `OUT_OF_BOUNDS`.
  - `interval_value`, `last_triggered_value`, `last_triggered_at`.
  - `job_plan_id` FK to `cmms_job_plans` for automated SOP checklist task expansion.
  - Multi-tenant composite PK `(tenant_id, id)` and forced RLS on `app.tenant_id`.
- Altered `gigalibs_cmms.work_orders`:
  - Added `meter_trigger_id` FK to `cmms_meter_triggers`.
  - Added `METER_TRIGGER` to `trigger_source` check constraint.
- `runtime-manifest.txt` updated, `CMMS_SCHEMA_CONTRACT_VERSION = 18`.

### Contracts (`@gigalibs/contracts`)
- `CmmsMeterReadingSourceV1Schema` (`MANUAL`, `IOT_TELEMETRY`, `CONNECTOR_HUB`, `SCADA`)
- Updated `RecordCmmsMeterReadingV1Schema` with `source`, `deviceId`, `payloadRef`.
- `IngestCmmsTelemetryBatchV1Schema` for high-throughput gateway / Connector Hub telemetry batches.
- `CmmsMeterTriggerTypeV1Schema` and `CmmsMeterThresholdTypeV1Schema`.
- `CreateCmmsMeterTriggerV1Schema`, `UpdateCmmsMeterTriggerV1Schema`, `CmmsMeterTriggerV1`.
- `CmmsWorkOrderV1` extended with `meterTriggerId`, supporting `triggerSource: 'METER_TRIGGER'`.
- `CmmsWorkOrderDetailV1` extended with `meterTriggerTitle`.

### Backend (`@gigalibs/cmms-api`)
- **`MetersService`** extended:
  - `recordReading`: updated to persist telemetry source & device metadata, and trigger evaluation.
  - `recordBatchReadings`: atomic batch ingestion with replay deduplication and per-meter trigger evaluation.
  - `listTriggers`, `createTrigger`, `updateTrigger`, `deleteTrigger`: full CRUD with audit mutations.
  - `evaluateTriggersForMeter`: condition monitoring engine that fires condition-based and usage-delta work orders with automatic Job Plan SOP task expansion.
- **`MetersController`** extended:
  - `POST /v1/meters/telemetry/batch`
  - `GET /v1/meters/triggers`
  - `POST /v1/meters/triggers`
  - `PATCH /v1/meters/triggers/:triggerId`
  - `DELETE /v1/meters/triggers/:triggerId`
- **`WorkOrdersService`** updated:
  - `WO_COLUMNS` and `WO_FROM` enriched with LEFT JOIN on `cmms_meter_triggers`.
  - `mapWorkOrder` maps `meterTriggerId`.
  - `mapWorkOrderDetailExtras` maps `meterTriggerTitle`.
  - `createWithClient` persists `meter_trigger_id` and provenance `'METER_TRIGGER'`.

### Web Client & UI (`@gigalibs/cmms-web`)
- **`api.ts`** updated with:
  - `ingestTelemetryBatch`
  - `listMeterTriggers`
  - `createMeterTrigger`
  - `updateMeterTrigger`
  - `deleteMeterTrigger`
- **`CmmsMeters.tsx`** updated:
  - Two-tab navigation: "Readings" (with source/deviceId metadata) & "PM Trigger Policies".
  - Multi-source telemetry recorder supporting manual, IoT, Connector Hub, and SCADA sources.
  - Active trigger policy cards showing trigger type, breach direction, interval delta, linked Job Plan, and firing history.
  - `TriggerForm` component to define autonomous PM policies linked to Job Plans.

## Evidence

- `pnpm --filter @gigalibs/contracts build` — **0 errors**
- `pnpm --filter @gigalibs/cmms-api build` — **0 errors**
- `pnpm --filter @gigalibs/workflow-platform exec tsc --noEmit` — **0 errors**
- `scripts/verify-eam-telemetry-and-meter-triggers.mjs` — **47/47 checks pass**
- Unit tests: `meters.service.spec.ts` — **13/13 tests pass**
- Full CMMS test suite: **20/20 test files pass, 150 tests pass**
- `pnpm verify --audits` — **PASS** (1 known WORKFORCE_API_URL drift)

## Files created

| File | Purpose |
|------|---------|
| `modules/physical-operations-cmms/db/migrations/000018_eam_telemetry_and_meter_triggers.up.sql` | Migration 18 up |
| `modules/physical-operations-cmms/db/migrations/000018_eam_telemetry_and_meter_triggers.down.sql` | Migration 18 down |
| `modules/physical-operations-cmms/apps/api/src/meters/meters.service.spec.ts` | Unit tests (13 tests) |
| `scripts/verify-eam-telemetry-and-meter-triggers.mjs` | Verification script (47 checks) |

## Files modified

| File | Change |
|------|--------|
| `packages/contracts/src/cmms/index.ts` | Telemetry batch, source enum, meter trigger schemas/interfaces, work order provenance |
| `modules/physical-operations-cmms/apps/api/src/runtime-config.ts` | Version 17 → 18 |
| `modules/physical-operations-cmms/db/runtime-manifest.txt` | Added migration 18 |
| `modules/physical-operations-cmms/apps/api/src/meters/meters.service.ts` | Telemetry batch ingestion, triggers CRUD, policy evaluation engine |
| `modules/physical-operations-cmms/apps/api/src/meters/meters.controller.ts` | Telemetry batch and trigger endpoints |
| `modules/physical-operations-cmms/apps/api/src/work-orders/work-orders.service.ts` | WO_COLUMNS/WO_FROM JOIN, meter_trigger_id persistence and mapping |
| `modules/physical-operations-cmms/web/src/api.ts` | Telemetry and trigger API client methods |
| `modules/physical-operations-cmms/web/src/components/CmmsMeters.tsx` | Telemetry source selection, trigger policies tab, trigger creation dialog |
