#!/usr/bin/env node
/**
 * WI-EAM-004 Verification Script: Telemetry Ingestion & Meter-Driven PM Triggers
 * Checks migration, contracts, backend, web API client, and UI for all required elements.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';

let failures = 0;

function check(label, condition, hint = '') {
  if (condition) {
    console.log(`${PASS} ${label}`);
  } else {
    console.log(`${FAIL} ${label}${hint ? ` — ${hint}` : ''}`);
    failures++;
  }
}

function read(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return '';
  return readFileSync(abs, 'utf8');
}

function readExists(relPath) {
  return existsSync(join(ROOT, relPath));
}

// ─── 1. Migration 18 files exist ────────────────────────────────────────────────
const upSql = read('modules/physical-operations-cmms/db/migrations/000018_eam_telemetry_and_meter_triggers.up.sql');
const downSql = read('modules/physical-operations-cmms/db/migrations/000018_eam_telemetry_and_meter_triggers.down.sql');
check('Migration 18 up.sql exists', upSql.length > 0);
check('Migration 18 down.sql exists', downSql.length > 0);

// ─── 2. Migration creates correct tables & RLS ──────────────────────────────────
check('Migration creates cmms_meter_triggers table', upSql.includes('CREATE TABLE gigalibs_cmms.cmms_meter_triggers'));
check('Migration enables RLS on cmms_meter_triggers', upSql.includes('FORCE ROW LEVEL SECURITY') && upSql.includes('cmms_meter_triggers_tenant_isolation'));
check('Migration extends meter_readings with telemetry sources', upSql.includes('IOT_TELEMETRY') && upSql.includes('CONNECTOR_HUB') && upSql.includes('SCADA'));
check('Migration adds device_id metadata to meter_readings', upSql.includes('device_id text'));
check('Migration alters work_orders with meter_trigger_id FK', upSql.includes('meter_trigger_id uuid') && upSql.includes('work_orders_meter_trigger_fk'));
check('Migration allows METER_TRIGGER trigger_source', upSql.includes('METER_TRIGGER'));

// ─── 3. Manifest includes migration 18 ──────────────────────────────────────────
const manifest = read('modules/physical-operations-cmms/db/runtime-manifest.txt');
check('runtime-manifest.txt includes migration 18', manifest.includes('000018_eam_telemetry_and_meter_triggers.up.sql'));

// ─── 4. Contract version bumped to 18 ──────────────────────────────────────────
const runtimeConfig = read('modules/physical-operations-cmms/apps/api/src/runtime-config.ts');
check('CMMS_SCHEMA_CONTRACT_VERSION = 18', runtimeConfig.includes('CMMS_SCHEMA_CONTRACT_VERSION = 18'));

// ─── 5. Contracts built with new types ──────────────────────────────────────────
const contractsDts = read('packages/contracts/dist/cmms/index.d.ts');
check('Contracts export CmmsMeterReadingSourceV1Schema', contractsDts.includes('CmmsMeterReadingSourceV1Schema'));
check('Contracts export IngestCmmsTelemetryBatchV1Schema', contractsDts.includes('IngestCmmsTelemetryBatchV1Schema'));
check('Contracts export CmmsMeterTriggerTypeV1Schema', contractsDts.includes('CmmsMeterTriggerTypeV1Schema'));
check('Contracts export CreateCmmsMeterTriggerV1Schema', contractsDts.includes('CreateCmmsMeterTriggerV1Schema'));
check('Contracts export UpdateCmmsMeterTriggerV1Schema', contractsDts.includes('UpdateCmmsMeterTriggerV1Schema'));
check('Contracts export CmmsMeterTriggerV1', contractsDts.includes('CmmsMeterTriggerV1'));
check('CmmsWorkOrderV1 has meterTriggerId', contractsDts.includes('meterTriggerId'));
check('CmmsWorkOrderV1 supports METER_TRIGGER source', contractsDts.includes('METER_TRIGGER'));

// ─── 6. Backend MetersService implements telemetry & trigger logic ─────────────
const svc = read('modules/physical-operations-cmms/apps/api/src/meters/meters.service.ts');
check('Service has recordBatchReadings method', svc.includes('async recordBatchReadings'));
check('Service has listTriggers method', svc.includes('async listTriggers'));
check('Service has createTrigger method', svc.includes('async createTrigger'));
check('Service has updateTrigger method', svc.includes('async updateTrigger'));
check('Service has deleteTrigger method', svc.includes('async deleteTrigger'));
check('Service has evaluateTriggersForMeter policy engine', svc.includes('evaluateTriggersForMeter'));
check('Service evaluates THRESHOLD_BREACH conditions', svc.includes('THRESHOLD_BREACH'));
check('Service evaluates USAGE_INTERVAL counter deltas', svc.includes('USAGE_INTERVAL'));
check('Service creates automated work orders with Job Plan SOP tasks', svc.includes('createWithClient') && svc.includes('METER_TRIGGER'));

// ─── 7. Backend MetersController exposes endpoints ─────────────────────────────
const ctrl = read('modules/physical-operations-cmms/apps/api/src/meters/meters.controller.ts');
check('Controller exposes POST telemetry/batch', ctrl.includes('telemetry/batch'));
check('Controller exposes GET triggers', ctrl.includes('triggers'));
check('Controller exposes POST triggers', ctrl.includes('createTrigger'));
check('Controller exposes PATCH triggers/:triggerId', ctrl.includes('updateTrigger'));
check('Controller exposes DELETE triggers/:triggerId', ctrl.includes('deleteTrigger'));

// ─── 8. WorkOrdersService enriched with meter triggers ─────────────────────────
const woSvc = read('modules/physical-operations-cmms/apps/api/src/work-orders/work-orders.service.ts');
check('WO_COLUMNS includes meter_trigger_title', woSvc.includes('meter_trigger_title'));
check('WO_FROM JOINs cmms_meter_triggers', woSvc.includes('cmms_meter_triggers trig'));
check('mapWorkOrder maps meterTriggerId', woSvc.includes('meterTriggerId: row.meter_trigger_id'));
check('mapWorkOrderDetailExtras includes meterTriggerTitle', woSvc.includes('meterTriggerTitle'));
check('createWithClient persists meter_trigger_id', woSvc.includes('meter_trigger_id'));

// ─── 9. Web API client updated ──────────────────────────────────────────────────
const api = read('modules/physical-operations-cmms/web/src/api.ts');
check('Web API has ingestTelemetryBatch', api.includes('ingestTelemetryBatch'));
check('Web API has listMeterTriggers', api.includes('listMeterTriggers'));
check('Web API has createMeterTrigger', api.includes('createMeterTrigger'));
check('Web API has updateMeterTrigger', api.includes('updateMeterTrigger'));
check('Web API has deleteMeterTrigger', api.includes('deleteMeterTrigger'));

// ─── 10. Web UI CmmsMeters component ───────────────────────────────────────────
const ui = read('modules/physical-operations-cmms/web/src/components/CmmsMeters.tsx');
check('UI imports CmmsMeterTriggerV1', ui.includes('CmmsMeterTriggerV1'));
check('UI includes Trigger Policies tab', ui.includes('PM Trigger Policies'));
check('UI includes TriggerForm component', ui.includes('TriggerForm'));
check('UI allows multi-source telemetry selection (IOT/SCADA)', ui.includes('IOT_TELEMETRY') && ui.includes('SCADA'));
check('UI displays sensor / device ID input', ui.includes('deviceId'));
check('UI displays active trigger rules and firing history', ui.includes('lastTriggeredAt') && ui.includes('workOrderPriority'));

// ─── 11. Unit tests exist ───────────────────────────────────────────────────────
check('meters.service.spec.ts exists', readExists('modules/physical-operations-cmms/apps/api/src/meters/meters.service.spec.ts'));

// ─── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log('\x1b[32mAll WI-EAM-004 telemetry & meter trigger checks passed.\x1b[0m');
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m`);
  process.exit(1);
}
