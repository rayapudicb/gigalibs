import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { CmmsInboxService } from '../relay/inbox.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { WorkOrdersService } from './work-orders.service.js';

// WI-OI-169: a technician booked through Workforce executes the work order they are booked for, through the real inbox
// projection and the real work-order command, on PostgreSQL (migrations 1–34, a runtime login that is neither superuser
// nor BYPASSRLS). Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `bkx-${randomUUID().slice(0, 8)}`;
const principal = (subject: string): CmmsPrincipal => ({
  tenantId: TENANT, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms.work-orders.read', 'cmms.work-orders.execute-own'],
  roles: [], persona: 'WORKFORCE_MEMBER', departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
} as CmmsPrincipal);
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const booked = principal('tech-booked');
const other = principal('tech-other');

describe.skipIf(!url)('booked technicians execute their work order on PostgreSQL (WI-OI-169)', () => {
  let database: DatabaseService;
  let workOrders: WorkOrdersService;
  let inbox: CmmsInboxService;
  const workOrderId = randomUUID();
  const requirementId = randomUUID();
  const bookingId = randomUUID();
  const fact = (eventType: string, version: number, payload: Record<string, unknown>) => {
    const envelope = {
      messageId: randomUUID(), tenantId: TENANT, eventType, aggregateType: 'WORKFORCE_BOOKING', aggregateId: bookingId,
      aggregateVersion: version, correlationId: randomUUID(), causationId: null, schemaVersion: 1, occurredAt: new Date().toISOString(),
      payload: {
        sourceType: 'CMMS_WORK_ORDER', sourceRef: workOrderId, requirementId, resourceId: randomUUID(), resourceName: 'Booked Tech',
        startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), ...payload,
      },
    };
    return inbox.receive(envelope, JSON.stringify(envelope));
  };
  const version = async () =>
    (await database.withTenantTransaction(TENANT, (client) => client.query<{ version: number }>(
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
    inbox = new CmmsInboxService(database);
    await database.withTenantTransaction(TENANT, (client) =>
      client.query(
        `INSERT INTO gigalibs_cmms.work_orders (tenant_id, id, wo_number, type, title, status, created_by, updated_by, correlation_id)
         VALUES ($1, $2, 'WO-000169', 'REACTIVE', 'Replace belt', 'OPEN', 't', 't', 't')`,
        [TENANT, workOrderId],
      ),
    );
  });
  afterAll(async () => database?.onModuleDestroy());

  it('keeps the booked person’s login from the booking fact', async () => {
    await fact('WORKFORCE_RESOURCE_BOOKING_CREATED_V1', 1, { resourcePlatformUserId: 'tech-booked' });
    // A later fact without the login (an older producer) keeps the one already known.
    await fact('WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1', 2, { from: 'DRAFT', to: 'CONFIRMED' });
    const detail = await workOrders.get(booked, workOrderId);
    expect(detail.bookings).toEqual([expect.objectContaining({ bookingRef: bookingId, status: 'CONFIRMED', resourceUserRef: 'tech-booked' })]);
  });

  // WI-OI-164: "my work" on the phone — assigned to me or booked for me.
  it('lists the work order as mine for the booked technician only', async () => {
    const mine = async (who: CmmsPrincipal) => (await workOrders.search(who, { mine: true })).items.map((item) => item.id);
    expect(await mine(booked)).toEqual([workOrderId]);
    expect(await mine(other)).toEqual([]);
    expect((await workOrders.search(booked, { awaitingSignOff: true })).items).toEqual([]);
  });

  it('lets the booked technician start the work and refuses someone else', async () => {
    await expect(workOrders.changeStatus(context(other), workOrderId, { expectedVersion: await version(), status: 'IN_PROGRESS' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_OUT_OF_SCOPE' } });
    const started = await workOrders.changeStatus(context(booked), workOrderId, { expectedVersion: await version(), status: 'IN_PROGRESS' });
    expect(started.status).toBe('IN_PROGRESS');
  });

  it('stops the right once the booking is cancelled', async () => {
    await fact('WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1', 3, { from: 'CONFIRMED', to: 'CANCELLED', resourcePlatformUserId: 'tech-booked' });
    await expect(workOrders.changeStatus(context(booked), workOrderId, { expectedVersion: await version(), status: 'COMPLETED' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_OUT_OF_SCOPE' } });
  });
});
