import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { SparesService } from './spares.service.js';

// WI-OI-136: diagrams, live stock and reservations against real PostgreSQL. Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `bom-${randomUUID().slice(0, 8)}`;
const principal = (subject: string, tenantId = TENANT): CmmsPrincipal => ({
  tenantId, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
});
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const planner = principal('planner-1');
const reviewer = principal('planner-2');
const technician = principal('tech-1');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');

describe.skipIf(!url)('diagrams, stock and reservations on PostgreSQL (WI-OI-136)', () => {
  let database: DatabaseService;
  let spares: SparesService;
  let parts: PartsService;
  const assetId = randomUUID();
  const sealId = randomUUID();
  const workOrderId = randomUUID();
  const closedWorkOrderId = randomUUID();
  let diagramId: string;

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    spares = new SparesService(database, new AssetsService(database));
    parts = new PartsService(database);
    await database.withTenantTransaction(TENANT, async (client) => {
      await client.query(`INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
        VALUES ($1, $2, 'P-101', 'Feed pump', 'a', 'a', 't')`, [TENANT, assetId]);
      await client.query(`INSERT INTO gigalibs_cmms.parts (tenant_id, id, part_number, name, currency_code, quantity_on_hand,
          reorder_point, unit_cost, created_by, updated_by, correlation_id)
        VALUES ($1, $2, 'SEAL-75', 'Mechanical seal', 'USD', 4, 2, 12.5, 'a', 'a', 't')`, [TENANT, sealId]);
      for (const [id, number, status] of [[workOrderId, 'WO-000001', 'OPEN'], [closedWorkOrderId, 'WO-000002', 'CANCELLED']] as const)
        await client.query(`INSERT INTO gigalibs_cmms.work_orders (tenant_id, id, wo_number, type, title, asset_id, status,
            cancelled_at, created_by, updated_by, correlation_id)
          VALUES ($1, $2, $3, 'REACTIVE', 'Replace seal', $4, $5, $6, 't', 't', 't')`,
          [TENANT, id, number, assetId, status, status === 'CANCELLED' ? new Date() : null]);
    });
  });
  afterAll(async () => database?.onModuleDestroy());

  it('drafts a diagram from a checked raster image, never SVG or a mislabelled file', async () => {
    const draft = await spares.create(context(planner), assetId, {
      diagramCode: 'wet-end', title: 'Wet end', imageContentType: 'image/png', imageBase64: png, widthPx: 800, heightPx: 600,
    });
    diagramId = draft.id;
    expect(draft).toMatchObject({ diagramCode: 'WET-END', revision: 1, status: 'DRAFT', imageBytes: 72 });
    await expect(spares.create(context(planner), assetId, {
      diagramCode: 'svg', title: 'x', imageContentType: 'image/png', imageBase64: Buffer.from('<svg onload="x"/>'.padEnd(40)).toString('base64'),
      widthPx: 100, heightPx: 100,
    })).rejects.toMatchObject({ response: { code: 'CMMS_DIAGRAM_IMAGE_INVALID' } });
    await expect(spares.create(context(planner), assetId, {
      diagramCode: 'WET-END', title: 'Again', imageContentType: 'image/png', imageBase64: png, widthPx: 800, heightPx: 600,
    })).rejects.toMatchObject({ response: { code: 'CMMS_DIAGRAM_DRAFT_EXISTS' } });
  });

  it('maps hotspots on the draft and publishes only through someone who did not write it', async () => {
    const detail = await spares.replaceHotspots(context(planner), diagramId, {
      expectedVersion: 1, hotspots: [{ callout: '24', partId: sealId, quantity: 1, x: 0.5, y: 0.25 }],
    });
    expect(detail.hotspots[0]).toMatchObject({ callout: '24', availability: { onHand: 4, reserved: 0, available: 4, stockState: 'IN_STOCK' } });
    await expect(spares.publish(context(planner), diagramId, { expectedVersion: 2 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_DIAGRAM_FOUR_EYES' } });
    expect(await spares.publish(context(reviewer), diagramId, { expectedVersion: 2 })).toMatchObject({ status: 'PUBLISHED', publishedBy: 'planner-2' });
    await expect(spares.replaceHotspots(context(planner), diagramId, { expectedVersion: 3, hotspots: [] }))
      .rejects.toMatchObject({ response: { code: 'CMMS_DIAGRAM_PUBLISHED' } });
    const image = await spares.image(technician, diagramId);
    expect(image).toMatchObject({ contentType: 'image/png', base64: png });
  });

  it('revises the published diagram with its hotspots and supersedes it on publication', async () => {
    const revision = await spares.revise(context(planner), diagramId, { expectedVersion: 3 });
    expect(revision).toMatchObject({ revision: 2, status: 'DRAFT' });
    expect((await spares.detail(planner, revision.id)).hotspots.map((hotspot) => hotspot.callout)).toEqual(['24']);
    await spares.publish(context(reviewer), revision.id, { expectedVersion: 1 });
    expect((await spares.list(technician, assetId)).items.map((item) => [item.revision, item.status])).toEqual([[2, 'PUBLISHED']]);
    diagramId = revision.id;
  });

  let firstReservation: string;
  let secondReservation: string;
  it('reserves against available stock, flags low stock and refuses a shortfall', async () => {
    const body = { clientOperationId: randomUUID(), partId: sealId, workOrderId, quantity: 1, diagramId };
    const first = await spares.reserve(context(technician), body);
    firstReservation = first.reservation.id;
    expect(first).toMatchObject({ replayed: false, lowStock: false, availability: { reserved: 1, available: 3 } });
    expect(await spares.reserve(context(technician), body)).toMatchObject({ replayed: true, reservation: { id: firstReservation } });
    await expect(spares.reserve(context(technician), { ...body, quantity: 2 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_RESERVATION_OPERATION_REUSED' } });
    const second = await spares.reserve(context(technician), { ...body, clientOperationId: randomUUID(), quantity: 2 });
    secondReservation = second.reservation.id;
    expect(second).toMatchObject({ lowStock: true, availability: { available: 1, stockState: 'LOW' } });
    const alerts = await database.withTenantTransaction(TENANT, async (client) => (await client.query(
      `SELECT count(*)::int AS n FROM gigalibs_cmms.outbox_events WHERE tenant_id = $1 AND event_type = 'CMMS_PART_LOW_STOCK_V1'`, [TENANT])).rows[0].n);
    expect(alerts).toBe(1);
    await expect(spares.reserve(context(technician), { ...body, clientOperationId: randomUUID(), quantity: 2 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PART_SHORT' } });
    await expect(spares.reserve(context(technician), { ...body, clientOperationId: randomUUID(), workOrderId: closedWorkOrderId }))
      .rejects.toMatchObject({ response: { code: 'CMMS_WO_CLOSED' } });
  });

  it('fulfils the oldest reservation when the part is issued, and frees stock on release', async () => {
    await parts.issuePartToWorkOrder(context(technician), workOrderId, { partId: sealId, quantity: 1, idempotencyKey: randomUUID() });
    const reservations = (await spares.workOrderReservations(planner, workOrderId)).items;
    expect(Object.fromEntries(reservations.map((item) => [item.id, item.status]))).toEqual({
      [firstReservation]: 'ISSUED', [secondReservation]: 'OPEN',
    });
    expect((await spares.detail(technician, diagramId)).hotspots[0]!.availability).toMatchObject({ onHand: 3, reserved: 2, available: 1 });
    const released = await spares.release(context(technician), secondReservation, { reason: 'Seal kit used instead' });
    expect(released).toMatchObject({ status: 'RELEASED', closeReason: 'Seal kit used instead' });
    expect((await spares.detail(technician, diagramId)).hotspots[0]!.availability).toMatchObject({ available: 3, stockState: 'IN_STOCK' });
    await expect(spares.release(context(technician), secondReservation, { reason: 'again' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_RESERVATION_CLOSED' } });
  });

  it('reports consumption per callout and lists the asset’s open work orders', async () => {
    const consumption = await spares.consumption(planner, diagramId);
    expect(consumption.callouts).toEqual([{ callout: '24', partId: sealId, issuedQuantity: 1, issueCount: 1 }]);
    expect((await spares.openWorkOrders(technician, assetId)).items.map((item) => item.woNumber)).toEqual(['WO-000001']);
  });

  it('hides diagrams and reservations from another tenant', async () => {
    const other = principal('planner-9', `bom-${randomUUID().slice(0, 8)}`);
    await expect(spares.detail(other, diagramId)).rejects.toMatchObject({ status: 404 });
    expect((await spares.workOrderReservations(other, workOrderId)).items).toEqual([]);
  });
});
