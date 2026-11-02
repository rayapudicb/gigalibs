import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { SopService } from './sop.service.js';

// WI-OI-138: visual work instructions against real PostgreSQL. Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `sop-${randomUUID().slice(0, 8)}`;
const principal = (subject: string, scoped = false): CmmsPrincipal => ({
  tenantId: TENANT, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: scoped ? { mode: 'DEPARTMENTS', departmentIds: ['MAINT-A'] } : { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
} as CmmsPrincipal);
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const engineer = principal('eng-1');
const approver = principal('qa-1');
const technician = principal('tech-1');
const partner = principal('tech-2');
const scopedPlanner = principal('planner-a', true);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');
const steps = [
  { key: 'isolate', title: 'Isolate', instruction: 'Lock out the pump.', gate: { type: 'CONFIRM' }, dualSignoff: true },
  { key: 'rust', title: 'Rust?', instruction: 'Inspect the housing.', gate: { type: 'DECISION', question: 'Is it rusted?' }, onYes: 'oil', onNo: 'slide' },
  { key: 'oil', title: 'Oil', instruction: 'Apply penetrating oil.', gate: { type: 'NONE' }, next: 'slide' },
  { key: 'slide', title: 'Torque', instruction: 'Torque the gland bolts.', gate: { type: 'READING', unit: 'Nm', min: 40, max: 50 }, next: 'evidence' },
  { key: 'evidence', title: 'Photo', instruction: 'Photograph the fitted seal.', gate: { type: 'PHOTO' } },
];
const step = (stepKey: string, outcome: string, extra: Record<string, unknown> = {}) => ({
  clientOperationId: randomUUID(), stepKey, outcome, recordedAt: new Date().toISOString(), ...extra,
});

describe.skipIf(!url)('visual work instructions on PostgreSQL (WI-OI-138)', () => {
  let database: DatabaseService;
  let sop: SopService;
  const assetId = randomUUID();
  const workOrderId = randomUUID();
  let procedureId: string;
  let executionId: string;

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    sop = new SopService(database, assets, new WorkOrdersService(database, assets, new PartsService(database)));
    await database.withTenantTransaction(TENANT, async (client) => {
      await client.query(`INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, department_id, created_by, updated_by, correlation_id)
        VALUES ($1, $2, 'P-101', 'Feed pump', 'MAINT-B', 'a', 'a', 't')`, [TENANT, assetId]);
      await client.query(`INSERT INTO gigalibs_cmms.work_orders (tenant_id, id, wo_number, type, title, asset_id, department_id, status,
          created_by, updated_by, correlation_id) VALUES ($1, $2, 'WO-000001', 'REACTIVE', 'Replace seal', $3, 'MAINT-B', 'OPEN', 't', 't', 't')`,
        [TENANT, workOrderId, assetId]);
    });
  });
  afterAll(async () => database?.onModuleDestroy());

  it('drafts a validated procedure with workspace-wide access and checks step images', async () => {
    await expect(sop.createProcedure(context(scopedPlanner), { code: 'SEAL-01', title: 'Seal', steps }))
      .rejects.toMatchObject({ response: { code: 'CMMS_OUT_OF_SCOPE' } });
    await expect(sop.createProcedure(context(engineer), { code: 'SEAL-01', title: 'Seal', steps: [{ ...steps[0], next: 'nowhere' }] }))
      .rejects.toMatchObject({ response: { code: 'CMMS_VALIDATION_FAILED' } });
    const draft = await sop.createProcedure(context(engineer), { code: 'SEAL-01', title: 'Mechanical seal replacement', safetyCritical: true, steps });
    procedureId = draft.id;
    expect(draft).toMatchObject({ code: 'SEAL-01', revision: 1, status: 'DRAFT', safetyCritical: true, stepImages: [] });
    await expect(sop.createProcedure(context(engineer), { code: 'SEAL-01', title: 'Again', steps }))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_DRAFT_EXISTS' } });
    await expect(sop.uploadStepImage(context(engineer), procedureId, 'isolate', {
      expectedVersion: 1, contentType: 'image/png', base64: Buffer.from('<svg onload="x"/>'.padEnd(40)).toString('base64'),
    })).rejects.toMatchObject({ response: { code: 'CMMS_SOP_IMAGE_INVALID' } });
    const withImage = await sop.uploadStepImage(context(engineer), procedureId, 'isolate', { expectedVersion: 1, contentType: 'image/png', base64: png });
    expect(withImage).toMatchObject({ version: 2, stepImages: ['isolate'] });
    expect(await sop.stepImage(technician, procedureId, 'isolate')).toMatchObject({ contentType: 'image/png', base64: png });
  });

  it('publishes only through an approver who wrote none of it, and refuses execution before then', async () => {
    await expect(sop.startExecution(context(technician), { clientOperationId: randomUUID(), procedureId }))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_NOT_PUBLISHED' } });
    await sop.submit(context(engineer), procedureId, { expectedVersion: 2 });
    await expect(sop.approve(context(engineer), procedureId, { expectedVersion: 3 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_FOUR_EYES' } });
    await expect(sop.reject(context(approver), procedureId, { expectedVersion: 3 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_VALIDATION_FAILED' } });
    const published = await sop.approve(context(approver), procedureId, { expectedVersion: 3, note: 'Checked against OEM manual.' });
    expect(published).toMatchObject({ status: 'PUBLISHED', approvedBy: 'qa-1', version: 4 });
    await expect(sop.updateProcedure(context(engineer), procedureId, { expectedVersion: 4, title: 'Edited' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_STATE' } });
  });

  it('walks the branch path, blocks on a countersign by another person and flags out-of-limit readings', async () => {
    const operation = randomUUID();
    const started = await sop.startExecution(context(technician), { clientOperationId: operation, procedureId, workOrderId });
    executionId = started.execution.id;
    expect(started.execution).toMatchObject({ status: 'IN_PROGRESS', workOrderId, progress: { state: 'NEXT', stepKey: 'isolate' } });
    expect((await sop.startExecution(context(technician), { clientOperationId: operation, procedureId, workOrderId })).replayed).toBe(true);
    await expect(sop.recordStep(context(technician), executionId, step('rust', 'ANSWER_YES')))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_OFF_PATH' } });
    await expect(sop.recordStep(context(technician), executionId, step('isolate', 'DONE')))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_GATE' } });
    await expect(sop.recordStep(context(partner), executionId, step('isolate', 'CONFIRMED')))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_EXECUTOR_ONLY' } });
    const isolate = step('isolate', 'CONFIRMED');
    const afterIsolate = await sop.recordStep(context(technician), executionId, isolate);
    expect(afterIsolate.execution.progress).toEqual({ state: 'AWAITING_COSIGN', stepKey: 'isolate' });
    expect((await sop.recordStep(context(technician), executionId, isolate)).replayed).toBe(true);
    await expect(sop.recordStep(context(technician), executionId, step('rust', 'ANSWER_NO')))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_OFF_PATH' } });
    expect((await sop.listExecutions(partner, { awaitingCosign: 'true' })).items.map((item) => item.id)).toContain(executionId);
    expect((await sop.listExecutions(technician, { awaitingCosign: 'true' })).items.map((item) => item.id)).not.toContain(executionId);
    await expect(sop.cosign(context(technician), executionId, 'isolate')).rejects.toMatchObject({ response: { code: 'CMMS_SOP_TWO_PERSON' } });
    expect((await sop.cosign(context(partner), executionId, 'isolate')).progress).toEqual({ state: 'NEXT', stepKey: 'rust' });
    await expect(sop.cosign(context(partner), executionId, 'isolate')).rejects.toMatchObject({ response: { code: 'CMMS_SOP_NOTHING_TO_COSIGN' } });

    expect((await sop.recordStep(context(technician), executionId, step('rust', 'ANSWER_NO'))).execution.progress)
      .toEqual({ state: 'NEXT', stepKey: 'slide' });
    await expect(sop.complete(context(technician), executionId)).rejects.toMatchObject({ response: { code: 'CMMS_SOP_INCOMPLETE' } });
    const reading = await sop.recordStep(context(technician), executionId, step('slide', 'READING', { reading: 55 }));
    expect(reading.execution.results.at(-1)).toMatchObject({ stepKey: 'slide', reading: 55, withinLimits: false });
    await expect(sop.recordStep(context(technician), executionId, step('evidence', 'PHOTO', {
      photoContentType: 'image/jpeg', photoBase64: png,
    }))).rejects.toMatchObject({ response: { code: 'CMMS_SOP_IMAGE_INVALID' } });
    const photo = await sop.recordStep(context(technician), executionId, step('evidence', 'PHOTO', { photoContentType: 'image/png', photoBase64: png }));
    expect(photo.execution).toMatchObject({ progress: { state: 'END' } });
    expect(photo.execution.results.at(-1)).toMatchObject({ hasPhoto: true });
    expect(await sop.resultPhoto(approver, executionId, 'evidence')).toMatchObject({ contentType: 'image/png', base64: png });
    await expect(sop.recordStep(context(technician), executionId, step('oil', 'DONE', { recordedAt: new Date(Date.now() + 3_600_000).toISOString() })))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_CLOCK' } });
    const done = await sop.complete(context(technician), executionId);
    expect(done).toMatchObject({ status: 'COMPLETED', progress: { state: 'END' } });
    expect((await sop.durations(approver, procedureId)).steps.find((row) => row.stepKey === 'slide')).toMatchObject({ samples: 1, outOfLimits: 1 });
  });

  it('keeps step content in the database: results never change or disappear', async () => {
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      "UPDATE gigalibs_cmms.sop_step_results SET reading = 45 WHERE tenant_id = $1 AND execution_id = $2 AND step_key = 'slide'",
      [TENANT, executionId]))).rejects.toMatchObject({ code: '23514' });
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      'DELETE FROM gigalibs_cmms.sop_step_results WHERE tenant_id = $1 AND execution_id = $2', [TENANT, executionId])))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('hides executions outside the caller’s scope', async () => {
    await expect(sop.getExecution(scopedPlanner, executionId)).rejects.toMatchObject({ response: { code: 'CMMS_NOT_FOUND' } });
    expect((await sop.listExecutions(scopedPlanner, {})).items).toHaveLength(0);
  });

  it('takes field feedback, resolved by engineering, and revises into a new revision that supersedes on approval', async () => {
    const feedback = await sop.addFeedback(context(technician), procedureId, { stepKey: 'slide', text: 'Torque spec reads 45–55 on the nameplate.' });
    expect(feedback).toMatchObject({ status: 'OPEN', procedureCode: 'SEAL-01', revision: 1 });
    expect((await sop.listFeedback(engineer)).items.map((item) => item.id)).toContain(feedback.id);
    expect(await sop.resolveFeedback(context(engineer), feedback.id, { note: 'Revision 2 corrects the limits.' }))
      .toMatchObject({ status: 'RESOLVED', resolvedBy: 'eng-1' });

    const revision = await sop.reviseProcedure(context(engineer), procedureId, { expectedVersion: 4 });
    expect(revision).toMatchObject({ revision: 2, status: 'DRAFT', stepImages: ['isolate'] });
    const edited = await sop.updateProcedure(context(engineer), revision.id, {
      expectedVersion: 1,
      steps: steps.map((item) => item.key === 'slide' ? { ...item, gate: { type: 'READING', unit: 'Nm', min: 45, max: 55 } } : item),
    });
    await sop.submit(context(engineer), revision.id, { expectedVersion: edited.version });
    await sop.approve(context(approver), revision.id, { expectedVersion: edited.version + 1 });
    expect((await sop.getProcedure(engineer, procedureId)).status).toBe('SUPERSEDED');
    expect((await sop.listProcedures(technician)).items.filter((item) => item.code === 'SEAL-01').map((item) => item.revision)).toEqual([2]);
  });

  it('stops further steps on a withdrawn safety-critical revision', async () => {
    const current = (await sop.listProcedures(technician, 'PUBLISHED')).items.find((item) => item.code === 'SEAL-01')!;
    const run = await sop.startExecution(context(technician), { clientOperationId: randomUUID(), procedureId: current.id, assetId });
    await sop.withdraw(context(approver), current.id, { expectedVersion: current.version, note: 'Wrong seal kit.' });
    await expect(sop.recordStep(context(technician), run.execution.id, step('isolate', 'CONFIRMED')))
      .rejects.toMatchObject({ response: { code: 'CMMS_SOP_WITHDRAWN' } });
  });
});
