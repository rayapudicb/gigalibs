import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { FleetService } from './fleet.service.js';

// WI-OI-139: fleet inspections and red tags against real PostgreSQL. Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `fleet-${randomUUID().slice(0, 8)}`;
const principal = (subject: string, scoped = false): CmmsPrincipal => ({
  tenantId: TENANT, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: scoped ? { mode: 'DEPARTMENTS', departmentIds: ['YARD-A'] } : { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
} as CmmsPrincipal);
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const operator = principal('op-1');
const mechanic = principal('mech-1');
const supervisor = principal('sup-1');
const scoped = principal('sup-a', true);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');
const zones = [
  { key: 'front', title: 'Front', items: [{ key: 'forks', label: 'Forks and mast chains' }, { key: 'lights', label: 'Headlights' }] },
  { key: 'cab', title: 'Cab', items: [{ key: 'brakes', label: 'Brake pedal travel' }, { key: 'horn', label: 'Horn' }] },
];
const all = (outcomes: Record<string, unknown> = {}) =>
  ['forks', 'lights', 'brakes', 'horn'].map((itemKey) => ({ itemKey, outcome: 'PASS', ...(outcomes[itemKey] as object | undefined) }));

describe.skipIf(!url)('fleet inspections and red tags on PostgreSQL (WI-OI-139)', () => {
  let database: DatabaseService;
  let fleet: FleetService;
  const assetId = randomUUID();
  let templateId: string;
  let groundingId: string;
  const inspection = (results: unknown[], extra: Record<string, unknown> = {}) => {
    const at = new Date().toISOString();
    return { clientOperationId: randomUUID(), assetId, templateId, kind: 'PRE_TRIP', startedAt: at, submittedAt: at, certified: true, results, ...extra };
  };
  const assetStatus = async () => (await database.withTenantTransaction(TENANT, (client) =>
    client.query<{ status: string }>('SELECT status FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND id = $2', [TENANT, assetId]))).rows[0]!.status;

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    const workOrders = new WorkOrdersService(database, assets, new PartsService(database));
    fleet = new FleetService(database, assets, workOrders, new RequestsService(database, assets, workOrders));
    await database.withTenantTransaction(TENANT, (client) => client.query(
      `INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, department_id, created_by, updated_by, correlation_id)
       VALUES ($1, $2, 'FL-09', 'Forklift 9', 'YARD-B', 'a', 'a', 't')`, [TENANT, assetId]));
  });
  afterAll(async () => database?.onModuleDestroy());

  it('publishes a check with workspace-wide access and enrols only on a published code', async () => {
    await expect(fleet.createTemplate(context(scoped), { code: 'forklift', name: 'Forklift', zones }))
      .rejects.toMatchObject({ response: { code: 'CMMS_OUT_OF_SCOPE' } });
    const draft = await fleet.createTemplate(context(supervisor), { code: 'forklift', name: 'Forklift circle check', zones });
    expect(draft).toMatchObject({ code: 'FORKLIFT', revision: 1, status: 'DRAFT' });
    await expect(fleet.enroll(context(supervisor), { assetId, templateCode: 'FORKLIFT' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_NO_TEMPLATE' } });
    templateId = (await fleet.publishTemplate(context(supervisor), draft.id, { expectedVersion: 1 })).id;
    expect(await fleet.enroll(context(supervisor), { assetId, templateCode: 'FORKLIFT', intervalHours: 12, requiredCredential: 'FORKLIFT-B' }))
      .toMatchObject({ templateCode: 'FORKLIFT', intervalHours: 12 });
    const view = await fleet.assetView(operator, assetId);
    expect(view.readiness.state).toBe('INSPECTION_DUE');
    expect(view.eligibility).toEqual({ eligible: false, state: 'INSPECTION_DUE', credentialCheck: 'UNVERIFIED' });
    expect(view.template?.id).toBe(templateId);
  });

  it('accepts a complete pass, replays it, and refuses an incomplete, future or stale inspection', async () => {
    await expect(fleet.submitInspection(context(operator), inspection(all().slice(1))))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_INCOMPLETE' } });
    await expect(fleet.submitInspection(context(operator), inspection(all(), { submittedAt: new Date(Date.now() + 3_600_000).toISOString() })))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_CLOCK' } });
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await expect(fleet.submitInspection(context(operator), inspection(all(), { startedAt: old, submittedAt: old })))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_LATE' } });
    const body = inspection(all());
    const passed = await fleet.submitInspection(context(operator), body);
    expect(passed).toMatchObject({ replayed: false, inspection: { result: 'PASS', minorCount: 0, requestId: null }, readiness: { state: 'OPERATIONAL' } });
    expect(passed.inspection.results.map((result) => result.itemKey)).toEqual(['forks', 'lights', 'brakes', 'horn']);
    expect((await fleet.submitInspection(context(operator), body)).replayed).toBe(true);
    await expect(fleet.submitInspection(context(operator), { ...body, kind: 'POST_TRIP' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_OPERATION_REUSED' } });
    expect((await fleet.assetView(operator, assetId)).eligibility.eligible).toBe(true);
  });

  it('raises a maintenance request for minor defects and keeps the asset operational', async () => {
    const result = await fleet.submitInspection(context(operator), inspection(all({ lights: { outcome: 'MINOR', note: 'Left headlight out' } })));
    expect(result).toMatchObject({ inspection: { result: 'DEFECTS', minorCount: 1, criticalCount: 0 }, readiness: { state: 'OPERATIONAL' } });
    const request = (await database.withTenantTransaction(TENANT, (client) => client.query(
      'SELECT title, description, asset_id FROM gigalibs_cmms.maintenance_requests WHERE tenant_id = $1 AND id = $2',
      [TENANT, result.inspection.requestId]))).rows[0];
    expect(request).toMatchObject({ title: 'Fleet defects: FL-09', asset_id: assetId });
    expect(request.description).toContain('Front — Headlights: Left headlight out');
  });

  it('grounds the asset on a critical defect: red tag, emergency work order, asset offline', async () => {
    await expect(fleet.submitInspection(context(operator), inspection(all({
      forks: { outcome: 'CRITICAL', note: 'Chain frayed', photoContentType: 'image/jpeg', photoBase64: png },
    })))).rejects.toMatchObject({ response: { code: 'CMMS_FLEET_PHOTO_INVALID' } });
    const result = await fleet.submitInspection(context(operator), inspection(all({
      forks: { outcome: 'CRITICAL', note: 'Left mast chain frayed', photoContentType: 'image/png', photoBase64: png },
    })));
    expect(result).toMatchObject({ inspection: { result: 'GROUNDED', criticalCount: 1 }, readiness: { state: 'GROUNDED' } });
    groundingId = result.inspection.groundingId!;
    expect(result.inspection.results[0]).toMatchObject({ itemKey: 'forks', outcome: 'CRITICAL', hasPhoto: true });
    expect(await fleet.inspectionPhoto(supervisor, result.inspection.id, 'forks')).toMatchObject({ contentType: 'image/png', base64: png });
    const view = await fleet.assetView(operator, assetId);
    expect(view.eligibility.eligible).toBe(false);
    expect(view.openGrounding).toMatchObject({ id: groundingId, status: 'GROUNDED', source: 'INSPECTION' });
    const workOrder = (await database.withTenantTransaction(TENANT, (client) => client.query(
      'SELECT priority, trigger_source, asset_id FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND id = $2',
      [TENANT, view.openGrounding!.workOrderId]))).rows[0];
    expect(workOrder).toEqual({ priority: 'EMERGENCY', trigger_source: 'FLEET_DEFECT', asset_id: assetId });
    expect(await assetStatus()).toBe('OFFLINE');
    await expect(fleet.groundManually(context(operator), { clientOperationId: randomUUID(), assetId, reason: 'Again' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_GROUNDED' } });
  });

  it('clears only after a certified repair, by someone other than the mechanic, and needs a fresh check after', async () => {
    await expect(fleet.clearGrounding(context(supervisor), groundingId, { expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_NOT_REPAIRED' } });
    const certified = await fleet.certifyRepair(context(mechanic), groundingId, { expectedVersion: 1, correctiveAction: 'Replaced the left mast chain' });
    expect(certified).toMatchObject({ status: 'REPAIRED', certifiedBy: 'mech-1' });
    expect((await fleet.assetView(operator, assetId)).readiness.state).toBe('AWAITING_CLEARANCE');
    await expect(fleet.clearGrounding(context(mechanic), groundingId, { expectedVersion: 2 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_FOUR_EYES' } });
    expect(await fleet.clearGrounding(context(supervisor), groundingId, { expectedVersion: 2 }))
      .toMatchObject({ status: 'CLEARED', clearedBy: 'sup-1', override: false });
    expect(await assetStatus()).toBe('OPERATIONAL');
    expect((await fleet.assetView(operator, assetId)).readiness.state).toBe('INSPECTION_DUE');
    expect((await fleet.submitInspection(context(operator), inspection(all()))).readiness.state).toBe('OPERATIONAL');
  });

  it('takes a manual red tag once per operation and lets a supervisor override it with a reason', async () => {
    const operation = randomUUID();
    const tag = await fleet.groundManually(context(operator), { clientOperationId: operation, assetId, reason: 'Horn silent in the yard' });
    expect(tag).toMatchObject({ source: 'MANUAL', status: 'GROUNDED' });
    expect((await fleet.groundManually(context(operator), { clientOperationId: operation, assetId, reason: 'Horn silent in the yard' })).id).toBe(tag.id);
    await expect(fleet.clearGrounding(context(supervisor), tag.id, { expectedVersion: 1, override: true }))
      .rejects.toMatchObject({ response: { code: 'CMMS_VALIDATION_FAILED' } });
    expect(await fleet.clearGrounding(context(supervisor), tag.id, { expectedVersion: 1, override: true, note: 'Horn fuse replaced on site' }))
      .toMatchObject({ status: 'CLEARED', override: true });
    expect((await fleet.listGroundings(supervisor, 'ALL')).items).toHaveLength(2);
  });

  it('keeps inspections in the database unchanged and outside other scopes', async () => {
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      "UPDATE gigalibs_cmms.fleet_inspections SET result = 'PASS' WHERE tenant_id = $1", [TENANT]))).rejects.toMatchObject({ code: '42501' });
    expect((await fleet.readiness(scoped)).items).toHaveLength(0);
    expect((await fleet.listInspections(scoped, {})).items).toHaveLength(0);
    await expect(fleet.listInspections(supervisor, { from: '2026-01-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_VALIDATION_FAILED' } });
    expect((await fleet.listInspections(supervisor, { assetId })).items.length).toBeGreaterThanOrEqual(4);
  });

  it('refuses an inspection against a superseded check', async () => {
    const revision = await fleet.reviseTemplate(context(supervisor), templateId, { expectedVersion: 2 });
    await fleet.publishTemplate(context(supervisor), revision.id, { expectedVersion: 1 });
    await expect(fleet.submitInspection(context(operator), inspection(all())))
      .rejects.toMatchObject({ response: { code: 'CMMS_FLEET_TEMPLATE_CHANGED' } });
  });
});
