#!/usr/bin/env node
/**
 * WI-EAM-003 Verification Script: Reliability & Job Plans
 * Checks migration, contracts, backend, web API client and UI for all required elements.
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

// ─── 1. Migration 17 exists ────────────────────────────────────────────────────
const upSql = read('modules/physical-operations-cmms/db/migrations/000017_eam_failure_hierarchy_and_job_plans.up.sql');
const downSql = read('modules/physical-operations-cmms/db/migrations/000017_eam_failure_hierarchy_and_job_plans.down.sql');
check('Migration 17 up.sql exists', upSql.length > 0);
check('Migration 17 down.sql exists', downSql.length > 0);

// ─── 2. Migration creates correct tables ─────────────────────────────────────
check('Migration creates cmms_failure_codes table', upSql.includes('CREATE TABLE gigalibs_cmms.cmms_failure_codes'));
check('Migration creates cmms_job_plans table', upSql.includes('CREATE TABLE gigalibs_cmms.cmms_job_plans'));
check('Migration creates cmms_job_plan_tasks table', upSql.includes('CREATE TABLE gigalibs_cmms.cmms_job_plan_tasks'));
check('Migration alters work_orders with failure FKs', upSql.includes('failure_problem_id') && upSql.includes('failure_cause_id') && upSql.includes('failure_remedy_id') && upSql.includes('job_plan_id'));
check('Migration enables RLS on cmms_failure_codes', upSql.includes('FORCE ROW LEVEL SECURITY') && upSql.includes('cmms_failure_codes_tenant_isolation'));

// ─── 3. Manifest includes migration 17 ────────────────────────────────────────
const manifest = read('modules/physical-operations-cmms/db/runtime-manifest.txt');
check('runtime-manifest.txt includes migration 17', manifest.includes('000017'));

// ─── 4. Contract version bumped to 17 ────────────────────────────────────────
const runtimeConfig = read('modules/physical-operations-cmms/apps/api/src/runtime-config.ts');
check('CMMS_SCHEMA_CONTRACT_VERSION = 17', runtimeConfig.includes('CMMS_SCHEMA_CONTRACT_VERSION = 17'));

// ─── 5. Contracts built with new types ────────────────────────────────────────
const contractsDts = read('packages/contracts/dist/cmms/index.d.ts');
check('Contracts export CmmsFailureCodeV1', contractsDts.includes('CmmsFailureCodeV1'));
check('Contracts export CmmsFailureHierarchyNodeV1', contractsDts.includes('CmmsFailureHierarchyNodeV1'));
check('Contracts export CmmsJobPlanV1', contractsDts.includes('CmmsJobPlanV1'));
check('Contracts export CmmsJobPlanTaskV1', contractsDts.includes('CmmsJobPlanTaskV1'));
check('Contracts export ApplyCmmsJobPlanV1Schema', contractsDts.includes('ApplyCmmsJobPlanV1Schema'));
check('Contracts export RecordCmmsFailureAttributionV1Schema', contractsDts.includes('RecordCmmsFailureAttributionV1Schema'));
check('CmmsWorkOrderV1 has jobPlanId', contractsDts.includes('jobPlanId'));
check('CmmsWorkOrderV1 has failureProblemId', contractsDts.includes('failureProblemId'));

// ─── 6. Backend service and controller exist ────────────────────────────────
check('reliability.service.ts exists', readExists('modules/physical-operations-cmms/apps/api/src/reliability/reliability.service.ts'));
check('reliability.controller.ts exists', readExists('modules/physical-operations-cmms/apps/api/src/reliability/reliability.controller.ts'));
check('reliability.module.ts exists', readExists('modules/physical-operations-cmms/apps/api/src/reliability/reliability.module.ts'));
check('reliability.service.spec.ts exists', readExists('modules/physical-operations-cmms/apps/api/src/reliability/reliability.service.spec.ts'));

// ─── 7. Service implements key methods ────────────────────────────────────────
const svc = read('modules/physical-operations-cmms/apps/api/src/reliability/reliability.service.ts');
check('Service has listFailureCodes method', svc.includes('async listFailureCodes'));
check('Service has createFailureCode method', svc.includes('async createFailureCode'));
check('Service has listJobPlans method', svc.includes('async listJobPlans'));
check('Service has createJobPlan method', svc.includes('async createJobPlan'));
check('Service has applyJobPlanToWorkOrder method', svc.includes('async applyJobPlanToWorkOrder'));
check('Service has recordFailureAttribution method', svc.includes('async recordFailureAttribution'));
check('Service validates failure code type via schema (CreateCmmsFailureCodeV1Schema)', svc.includes('CreateCmmsFailureCodeV1Schema'));
check('Service guards deletion if in use', svc.includes('CMMS_FAILURE_CODE_IN_USE'));

// ─── 8. ReliabilityModule registered in AppModule ─────────────────────────────
const appModule = read('modules/physical-operations-cmms/apps/api/src/app.module.ts');
check('AppModule imports ReliabilityModule', appModule.includes('ReliabilityModule'));

// ─── 9. WorkOrdersService updated ─────────────────────────────────────────────
const woSvc = read('modules/physical-operations-cmms/apps/api/src/work-orders/work-orders.service.ts');
check('WO_COLUMNS includes job_plan_title', woSvc.includes('job_plan_title'));
check('WO_FROM JOINs cmms_job_plans', woSvc.includes('cmms_job_plans jp'));
check('WO_FROM JOINs cmms_failure_codes (prob/cause/rem)', woSvc.includes('failure_problem_id') && woSvc.includes('failure_cause_id'));
check('mapWorkOrder maps jobPlanId', woSvc.includes('jobPlanId: row.job_plan_id'));
check('mapWorkOrder maps failureProblemId', woSvc.includes('failureProblemId: row.failure_problem_id'));
check('createWithClient persists job_plan_id', woSvc.includes("'job_plan_id'") || woSvc.includes('job_plan_id,'));
check('Detail includes enriched extras (jobPlanTitle)', woSvc.includes('mapWorkOrderDetailExtras'));

// ─── 10. Web API client updated ────────────────────────────────────────────────
const api = read('modules/physical-operations-cmms/web/src/api.ts');
check('Web API has listFailureHierarchyTree', api.includes('listFailureHierarchyTree'));
check('Web API has createFailureCode', api.includes('createFailureCode'));
check('Web API has listJobPlans', api.includes('listJobPlans'));
check('Web API has applyJobPlan', api.includes('applyJobPlan'));
check('Web API has recordFailureAttribution', api.includes('recordFailureAttribution'));

// ─── 11. UI FailureAnalysisCard component ─────────────────────────────────────
const wo = read('modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx');
check('UI includes FailureAnalysisCard component', wo.includes('FailureAnalysisCard'));
check('UI imports CmmsFailureCodeV1', wo.includes('CmmsFailureCodeV1'));
check('UI imports CmmsJobPlanV1', wo.includes('CmmsJobPlanV1'));
check('UI shows LOTO/Safety guidance section', wo.includes('LOTO') && wo.includes('Safety'));
check('UI calls recordFailureAttribution', wo.includes('recordFailureAttribution'));
check('UI calls applyJobPlan', wo.includes('applyJobPlan'));

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log('\x1b[32mAll WI-EAM-003 reliability & job plans checks passed.\x1b[0m');
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m`);
  process.exit(1);
}
