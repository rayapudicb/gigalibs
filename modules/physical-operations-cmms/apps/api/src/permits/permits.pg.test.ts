import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PermitV1 } from '@gigalibs/contracts';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { PermitsService } from './permits.service.js';

// WI-OI-142: lockout and permits, with the work-order interlock, against real PostgreSQL. Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `ptw-${randomUUID().slice(0, 8)}`;
const principal = (subject: string): CmmsPrincipal => ({
  tenantId: TENANT, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
} as CmmsPrincipal);
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const engineer = principal('eng-1');
const tech = principal('tech-1');
const helper = principal('tech-2');
const issuer = principal('issuer-1');
const lead = principal('lead-1');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');
const points = [
  { key: 'breaker', label: 'MCC-04 cubicle 12', energy: 'ELECTRICAL', isolationTag: 'MCC-04-12', method: 'Switch off and lock' },
  { key: 'bleed', label: 'Bleed valve BV-102', energy: 'HYDRAULIC', isolationTag: 'BV-102', method: 'Open to drain and lock' },
];
const window = () => ({ validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 8 * 3_600_000).toISOString() });
const point = (permit: PermitV1, key: string) => permit.isolations.find((item) => item.pointKey === key)!;

describe.skipIf(!url)('lockout and permits on PostgreSQL (WI-OI-142)', () => {
  let database: DatabaseService;
  let permits: PermitsService;
  let workOrders: WorkOrdersService;
  const assetId = randomUUID();
  const workOrderId = randomUUID();
  let procedureId: string;
  let first: PermitV1;

  const isolate = async (permit: PermitV1) => {
    let current = permit;
    for (const item of points) {
      current = await permits.lockPoint(context(tech), current.id, item.key, { expectedVersion: point(current, item.key).version,
        lockSerial: `L-${item.key}`, photoContentType: 'image/png', photoBase64: png });
      current = await permits.verifyPoint(context(tech), current.id, item.key, { expectedVersion: point(current, item.key).version, zeroEnergyConfirmed: true });
    }
    return current;
  };
  const workOrderVersion = async () => (await database.withTenantTransaction(TENANT, (client) => client.query<{ version: number }>(
    'SELECT version FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND id = $2', [TENANT, workOrderId]))).rows[0]!.version;

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    workOrders = new WorkOrdersService(database, assets, new PartsService(database));
    permits = new PermitsService(database, assets, workOrders);
    await database.withTenantTransaction(TENANT, async (client) => {
      await client.query(`INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
        VALUES ($1, $2, 'P-101', 'Feed pump', 'a', 'a', 't')`, [TENANT, assetId]);
      await client.query(`INSERT INTO gigalibs_cmms.work_orders (tenant_id, id, wo_number, type, title, asset_id, status, created_by,
          updated_by, correlation_id) VALUES ($1, $2, 'WO-000001', 'REACTIVE', 'Replace seal', $3, 'OPEN', 't', 't', 't')`, [TENANT, workOrderId, assetId]);
    });
  });
  afterAll(async () => database?.onModuleDestroy());

  it('publishes an isolation procedure only through someone who did not write it', async () => {
    const draft = await permits.createProcedure(context(engineer), { code: 'p-101-loto', title: 'Feed pump isolation', assetId, points });
    expect(draft).toMatchObject({ code: 'P-101-LOTO', status: 'DRAFT' });
    await expect(permits.publishProcedure(context(engineer), draft.id, { expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_FOUR_EYES' } });
    procedureId = (await permits.publishProcedure(context(issuer), draft.id, { expectedVersion: 1 })).id;
  });

  it('requests a permit from the procedure and keeps the work order from starting until it is live', async () => {
    const body = { clientOperationId: randomUUID(), type: 'CONFINED_SPACE', procedureId, workOrderId, title: 'Replace seal in sump', ...window() };
    const requested = await permits.request(context(tech), body);
    expect(requested.permit).toMatchObject({ number: expect.stringMatching(/^PTW-\d{6}$/), status: 'DRAFT', assetId });
    expect(requested.permit.isolations.map((item) => [item.pointKey, item.isolationTag, item.status]))
      .toEqual([['breaker', 'MCC-04-12', 'PENDING'], ['bleed', 'BV-102', 'PENDING']]);
    expect((await permits.request(context(tech), body)).replayed).toBe(true);
    first = requested.permit;
    await expect(workOrders.changeStatus(context(tech), workOrderId, { expectedVersion: await workOrderVersion(), status: 'IN_PROGRESS' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_NOT_LIVE' } });
  });

  it('locks with a photo, verifies each point, and approves with three people after a good gas test', async () => {
    await expect(permits.verifyPoint(context(tech), first.id, 'breaker', { expectedVersion: 1, zeroEnergyConfirmed: true }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_POINT_STATE' } });
    await expect(permits.lockPoint(context(tech), first.id, 'breaker', { expectedVersion: 1, lockSerial: 'L-22', photoContentType: 'image/jpeg', photoBase64: png }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_PHOTO_INVALID' } });
    first = await isolate(first);
    expect(first).toMatchObject({ status: 'AWAITING_APPROVAL' });
    expect(point(first, 'breaker')).toMatchObject({ status: 'VERIFIED', lockSerial: 'L-breaker', hasPhoto: true, verifiedBy: 'tech-1' });
    await expect(permits.witnessPoint(context(tech), first.id, 'breaker', { expectedVersion: point(first, 'breaker').version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_FOUR_EYES' } });
    first = await permits.witnessPoint(context(issuer), first.id, 'breaker', { expectedVersion: point(first, 'breaker').version });
    expect(point(first, 'breaker').witnessedBy).toBe('issuer-1');

    await expect(permits.authorize(context(tech), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_FOUR_EYES' } });
    await expect(permits.authorize(context(issuer), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_GAS_TEST' } });
    first = await permits.gasTest(context(tech), first.id, { clientOperationId: randomUUID(), oxygenPercent: 19, lelPercent: 0, coPpm: 0, h2sPpm: 0,
      testedAt: new Date().toISOString() });
    expect(first.gasTests[0]).toMatchObject({ withinLimits: false, flags: ['OXYGEN'] });
    await expect(permits.authorize(context(issuer), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_GAS_TEST' } });
    first = await permits.gasTest(context(tech), first.id, { clientOperationId: randomUUID(), oxygenPercent: 20.9, lelPercent: 0, coPpm: 1, h2sPpm: 0,
      testedAt: new Date().toISOString() });
    await expect(permits.countersign(context(lead), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_NOT_AUTHORIZED' } });
    first = await permits.authorize(context(issuer), first.id, { expectedVersion: first.version });
    await expect(permits.countersign(context(issuer), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_FOUR_EYES' } });
    first = await permits.countersign(context(lead), first.id, { expectedVersion: first.version });
    expect(first).toMatchObject({ status: 'LIVE', authorizedBy: 'issuer-1', countersignedBy: 'lead-1', liveAt: expect.any(String) });
    const started = await workOrders.changeStatus(context(tech), workOrderId, { expectedVersion: await workOrderVersion(), status: 'IN_PROGRESS' });
    expect(started.status).toBe('IN_PROGRESS');
  });

  it('refuses approval while a permit sharing an isolation point restores energy', async () => {
    let second = (await permits.request(context(tech), { clientOperationId: randomUUID(), type: 'LOTO', procedureId, title: 'Inspect coupling', ...window() })).permit;
    expect(second.clashes.map((clash) => clash.number)).toContain(first.number);
    second = await isolate(second);

    first = await permits.lockOn(context(helper), first.id);
    expect(first.personalLocks.map((lock) => lock.subject)).toEqual(['tech-2']);
    await expect(permits.startDeIsolation(context(tech), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_LOCKS_ON' } });
    await expect(workOrders.changeStatus(context(tech), workOrderId, { expectedVersion: await workOrderVersion(), status: 'COMPLETED' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_OPEN' } });
    first = await permits.lockOff(context(helper), first.id);
    first = await permits.startDeIsolation(context(tech), first.id, { expectedVersion: first.version });
    expect(first.status).toBe('DE_ISOLATING');
    await expect(permits.authorize(context(issuer), second.id, { expectedVersion: second.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_CLASH' } });

    await expect(permits.close(context(issuer), first.id, { expectedVersion: first.version }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_LOCKS_APPLIED' } });
    for (const item of points) first = await permits.removeLock(context(tech), first.id, item.key, { expectedVersion: point(first, item.key).version });
    first = await permits.close(context(issuer), first.id, { expectedVersion: first.version });
    expect(first).toMatchObject({ status: 'CLOSED', closedBy: 'issuer-1' });
    second = await permits.authorize(context(issuer), second.id, { expectedVersion: second.version });
    expect(second.authorizedBy).toBe('issuer-1');
  });

  it('cancels only once every lock is off, and keeps lock evidence unchanged', async () => {
    let third = (await permits.request(context(tech), { clientOperationId: randomUUID(), type: 'LINE_BREAK', procedureId, title: 'Line break', ...window() })).permit;
    third = await permits.lockPoint(context(tech), third.id, 'breaker', { expectedVersion: 1, lockSerial: 'L-9', photoContentType: 'image/png', photoBase64: png });
    await expect(permits.cancel(context(tech), third.id, { expectedVersion: third.version, reason: 'Job deferred' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PERMIT_LOCKS_APPLIED' } });
    third = await permits.removeLock(context(tech), third.id, 'breaker', { expectedVersion: point(third, 'breaker').version });
    expect(await permits.cancel(context(tech), third.id, { expectedVersion: third.version, reason: 'Job deferred' }))
      .toMatchObject({ status: 'CANCELLED', cancelReason: 'Job deferred' });
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      'DELETE FROM gigalibs_cmms.permit_lock_photos WHERE tenant_id = $1', [TENANT]))).rejects.toMatchObject({ code: '42501' });
    expect((await permits.list(tech, { status: 'ACTIVE' })).items.map((item) => item.status)).toEqual(['AWAITING_APPROVAL']);
  });
});
