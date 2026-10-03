#!/usr/bin/env node
/**
 * WI-EAM-005 Verification Script: MRO Storeroom Logistics & Universal Workforce Relay
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

// ─── 1. Migration 19 files exist ────────────────────────────────────────────────
const upSql = read('modules/physical-operations-cmms/db/migrations/000019_eam_storerooms_and_mro_logistics.up.sql');
const downSql = read('modules/physical-operations-cmms/db/migrations/000019_eam_storerooms_and_mro_logistics.down.sql');
check('Migration 19 up.sql exists', upSql.length > 0);
check('Migration 19 down.sql exists', downSql.length > 0);

// ─── 2. Migration creates correct tables & RLS ──────────────────────────────────
check('Migration creates cmms_storerooms table', upSql.includes('CREATE TABLE gigalibs_cmms.cmms_storerooms'));
check('Migration enables RLS on cmms_storerooms', upSql.includes('FORCE ROW LEVEL SECURITY') && upSql.includes('cmms_storerooms_tenant_isolation'));
check('Migration creates cmms_part_balances table', upSql.includes('CREATE TABLE gigalibs_cmms.cmms_part_balances'));
check('Migration enables RLS on cmms_part_balances', upSql.includes('cmms_part_balances_tenant_isolation'));
check('Migration alters stock_movements with storeroom_id and bin_location', upSql.includes('storeroom_id uuid') && upSql.includes('bin_location text'));

// ─── 3. Manifest includes migration 19 ──────────────────────────────────────────
const manifest = read('modules/physical-operations-cmms/db/runtime-manifest.txt');
check('runtime-manifest.txt includes migration 19', manifest.includes('000019_eam_storerooms_and_mro_logistics.up.sql'));

// ─── 4. Contract version bumped to 19 ──────────────────────────────────────────
const runtimeConfig = read('modules/physical-operations-cmms/apps/api/src/runtime-config.ts');
check('CMMS_SCHEMA_CONTRACT_VERSION = 19', runtimeConfig.includes('CMMS_SCHEMA_CONTRACT_VERSION = 19'));

// ─── 5. Contracts built with new types ──────────────────────────────────────────
const contractsDts = read('packages/contracts/dist/cmms/index.d.ts');
check('Contracts export CreateCmmsStoreroomV1Schema', contractsDts.includes('CreateCmmsStoreroomV1Schema'));
check('Contracts export UpdateCmmsStoreroomV1Schema', contractsDts.includes('UpdateCmmsStoreroomV1Schema'));
check('Contracts export CmmsStoreroomV1', contractsDts.includes('CmmsStoreroomV1'));
check('Contracts export SetCmmsPartBalanceV1Schema', contractsDts.includes('SetCmmsPartBalanceV1Schema'));
check('Contracts export CmmsPartBalanceV1', contractsDts.includes('CmmsPartBalanceV1'));
check('Contracts export IssueCmmsPartToWorkOrderV1Schema', contractsDts.includes('IssueCmmsPartToWorkOrderV1Schema'));
check('Contracts export ReturnCmmsPartFromWorkOrderV1Schema', contractsDts.includes('ReturnCmmsPartFromWorkOrderV1Schema'));
check('Contracts export CmmsWorkOrderTcoV1', contractsDts.includes('CmmsWorkOrderTcoV1'));
check('CmmsWorkOrderDetailV1 has tco field', contractsDts.includes('readonly tco?: CmmsWorkOrderTcoV1 | null'));

// ─── 6. Backend PartsService implements storerooms & TCO ────────────────────────
const partsSvc = read('modules/physical-operations-cmms/apps/api/src/parts/parts.service.ts');
check('PartsService has listStorerooms method', partsSvc.includes('async listStorerooms'));
check('PartsService has createStoreroom method', partsSvc.includes('async createStoreroom'));
check('PartsService has updateStoreroom method', partsSvc.includes('async updateStoreroom'));
check('PartsService has deleteStoreroom method', partsSvc.includes('async deleteStoreroom'));
check('PartsService has listPartBalances method', partsSvc.includes('async listPartBalances'));
check('PartsService has setPartBalance method', partsSvc.includes('async setPartBalance'));
check('PartsService has issuePartToWorkOrder method', partsSvc.includes('async issuePartToWorkOrder'));
check('PartsService has returnPartFromWorkOrder method', partsSvc.includes('async returnPartFromWorkOrder'));
check('PartsService has calculateWorkOrderTco method', partsSvc.includes('async calculateWorkOrderTco'));
check('PartsService has getWorkOrderTco method', partsSvc.includes('async getWorkOrderTco'));

// ─── 7. Backend WorkOrdersService calculates TCO on detail view ────────────────
const woSvc = read('modules/physical-operations-cmms/apps/api/src/work-orders/work-orders.service.ts');
check('WorkOrdersService calculates TCO in detailWithClient', woSvc.includes('tco:') && woSvc.includes('labourCost') && woSvc.includes('partsCost'));
check('WorkOrdersService joins cmms_storerooms for parts used', woSvc.includes('cmms_storerooms'));

// ─── 8. Backend PartsController exposes REST endpoints ─────────────────────────
const partsCtrl = read('modules/physical-operations-cmms/apps/api/src/parts/parts.controller.ts');
check('PartsController has GET /parts/storerooms', partsCtrl.includes("'storerooms'"));
check('PartsController has POST /parts/storerooms', partsCtrl.includes("Post('storerooms')"));
check('PartsController has GET /parts/balances', partsCtrl.includes("'balances'"));
check('PartsController has PUT /parts/balances', partsCtrl.includes("Put('balances')"));
check('PartsController has POST /parts/work-orders/:workOrderId/issue', partsCtrl.includes("'work-orders/:workOrderId/issue'"));
check('PartsController has POST /parts/work-orders/:workOrderId/return', partsCtrl.includes("'work-orders/:workOrderId/return'"));
check('PartsController has GET /parts/work-orders/:workOrderId/tco', partsCtrl.includes("'work-orders/:workOrderId/tco'"));

// ─── 9. Web API client contains methods ────────────────────────────────────────
const webApi = read('modules/physical-operations-cmms/web/src/api.ts');
check('Web API has listStorerooms', webApi.includes('listStorerooms:'));
check('Web API has createStoreroom', webApi.includes('createStoreroom:'));
check('Web API has listPartBalances', webApi.includes('listPartBalances:'));
check('Web API has setPartBalance', webApi.includes('setPartBalance:'));
check('Web API has issuePartToWorkOrder', webApi.includes('issuePartToWorkOrder:'));
check('Web API has returnPartFromWorkOrder', webApi.includes('returnPartFromWorkOrder:'));
check('Web API has getWorkOrderTco', webApi.includes('getWorkOrderTco:'));

// ─── 10. Web UI components render TCO and Storeroom logistics ──────────────────
const cmmsWo = read('modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx');
check('CmmsWorkOrders renders TcoCard', cmmsWo.includes('<TcoCard workOrder={workOrder} />'));
check('CmmsWorkOrders PartsCard has storeroom selection', cmmsWo.includes('name="storeroomId"'));
check('CmmsWorkOrders PartsCard has part return action', cmmsWo.includes('cmmsApi.returnPartFromWorkOrder'));
check('CmmsWorkOrders StaffingCard handles craft bookings', cmmsWo.includes('StaffingCard') && cmmsWo.includes('bookingRef'));

const cmmsParts = read('modules/physical-operations-cmms/web/src/components/CmmsParts.tsx');
check('CmmsParts renders Storeroom Bin Balances', cmmsParts.includes('Storeroom Bin Balances'));
check('CmmsParts PartPanel supports storeroom selection', cmmsParts.includes('name="storeroomId"'));

// ─── 11. Unit tests exist ──────────────────────────────────────────────────────
const spec = read('modules/physical-operations-cmms/apps/api/src/parts/parts.service.spec.ts');
check('parts.service.spec.ts exists and tests storerooms and TCO', spec.includes('WI-EAM-005') && spec.includes('CreateCmmsStoreroomV1Schema'));

console.log(`\nVerification finished: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
