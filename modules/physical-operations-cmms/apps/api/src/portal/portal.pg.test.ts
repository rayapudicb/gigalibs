import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePortalToken } from '@gigalibs/contracts';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { PortalService } from './portal.service.js';
import { RequestReportsService } from './request-reports.service.js';

// WI-OI-140: request links and the no-login portal against real PostgreSQL. Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `portal-${randomUUID().slice(0, 8)}`;
const principal = (subject: string, scoped = false, tenantId = TENANT): CmmsPrincipal => ({
  tenantId, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: scoped ? { mode: 'DEPARTMENTS', departmentIds: ['LINE-A'] } : { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
} as CmmsPrincipal);
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const planner = principal('planner-1');
const scoped = principal('planner-a', true);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');
const clientKey = (n: number) => n.toString(16).padStart(64, '0');

describe.skipIf(!url)('request links and the no-login portal on PostgreSQL (WI-OI-140)', () => {
  let database: DatabaseService;
  let portal: PortalService;
  const assetId = randomUUID();
  let link: { tenantId: string; id: string; secret: string };
  const portalAs = (linkId: string) => principal(`portal:${linkId}`);
  const request = (extra: Record<string, unknown> = {}) => ({
    linkId: link.id, secret: link.secret, clientKey: clientKey(1), clientOperationId: randomUUID(), issueType: 'LEAK', ...extra,
  });

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    portal = new PortalService(database, assets, new RequestsService(database, assets, new WorkOrdersService(database, assets, new PartsService(database))));
    await database.withTenantTransaction(TENANT, (client) => client.query(
      `INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, department_id, created_by, updated_by, correlation_id)
       VALUES ($1, $2, 'HS-03', 'Heat sealer 3', 'LINE-B', 'a', 'a', 't')`, [TENANT, assetId]));
  });
  afterAll(async () => database?.onModuleDestroy());

  it('issues a link whose capability is shown once and stored only as a hash', async () => {
    await expect(portal.createLink(context(scoped), { assetId })).rejects.toMatchObject({ response: { code: 'CMMS_NOT_FOUND' } });
    const created = await portal.createLink(context(planner), { assetId, label: 'Line 3 frame' });
    link = parsePortalToken(created.token)!;
    expect(link).toMatchObject({ tenantId: TENANT, id: created.link.id });
    expect(created.link).toMatchObject({ assetTag: 'HS-03', status: 'ACTIVE', submissions: 0 });
    const stored = (await database.withTenantTransaction(TENANT, (client) => client.query(
      'SELECT secret_sha256 FROM gigalibs_cmms.portal_links WHERE tenant_id = $1 AND id = $2', [TENANT, link.id]))).rows[0];
    expect(stored.secret_sha256).not.toContain(link.secret);
  });

  it('proves the link: bound to its principal, the right secret, the right tenant', async () => {
    expect(await portal.context(portalAs(link.id), { linkId: link.id, secret: link.secret }))
      .toEqual({ assetTag: 'HS-03', assetName: 'Heat sealer 3', issueTypes: expect.any(Array), recentReportMinutesAgo: null });
    for (const [who, capability] of [
      [portalAs(link.id), { linkId: link.id, secret: 'B'.repeat(43) }],
      [portalAs(randomUUID()), { linkId: link.id, secret: link.secret }],
      [principal(`portal:${link.id}`, false, 'other-tenant'), { linkId: link.id, secret: link.secret }],
    ] as const)
      await expect(portal.context(who, capability)).rejects.toMatchObject({ response: { code: 'CMMS_PORTAL_LINK_INVALID' } });
  });

  it('raises a request through the request service, replays it, and reports only its state', async () => {
    const body = request({ description: 'Water under the sealer', requesterName: 'Asha', requesterContact: 'asha@example.invalid',
      photoContentType: 'image/png', photoBase64: png });
    const receipt = await portal.submit(context(portalAs(link.id)), body);
    expect(receipt).toMatchObject({ requestNumber: expect.stringMatching(/^REQ-/), replayed: false });
    expect(await portal.submit(context(portalAs(link.id)), body)).toEqual({ ...receipt, replayed: true });
    const row = (await database.withTenantTransaction(TENANT, (client) => client.query(
      `SELECT title, priority, requester_subject, requester_email, asset_id FROM gigalibs_cmms.maintenance_requests
        WHERE tenant_id = $1 AND request_number = $2`, [TENANT, receipt.requestNumber]))).rows[0];
    expect(row).toEqual({ title: 'Leaking: HS-03', priority: 'MEDIUM', requester_subject: `portal:${link.id}`,
      requester_email: 'asha@example.invalid', asset_id: assetId });
    const status = parsePortalToken(receipt.statusToken)!;
    expect(await portal.status(principal(`portal:${status.id}`), { submissionId: status.id, secret: status.secret }))
      .toMatchObject({ requestNumber: receipt.requestNumber, assetTag: 'HS-03', state: 'RECEIVED' });
    await expect(portal.status(principal(`portal:${status.id}`), { submissionId: status.id, secret: link.secret }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PORTAL_LINK_INVALID' } });
    expect((await portal.context(portalAs(link.id), { linkId: link.id, secret: link.secret })).recentReportMinutesAgo).toBe(0);
    const submissions = await portal.listSubmissions(planner);
    expect(submissions.items[0]).toMatchObject({ assetTag: 'HS-03', issueType: 'LEAK', hasPhoto: true });
    expect(await portal.submissionPhoto(planner, submissions.items[0]!.id)).toMatchObject({ contentType: 'image/png', base64: png });
    expect((await portal.listSubmissions(scoped)).items).toHaveLength(0);
  });

  it('refuses a mislabelled photo and bounds the rate per client and per link', async () => {
    await expect(portal.submit(context(portalAs(link.id)), request({ photoContentType: 'image/jpeg', photoBase64: png })))
      .rejects.toMatchObject({ response: { code: 'CMMS_PORTAL_PHOTO_INVALID' } });
    await portal.submit(context(portalAs(link.id)), request());
    await portal.submit(context(portalAs(link.id)), request());
    await expect(portal.submit(context(portalAs(link.id)), request()))
      .rejects.toMatchObject({ response: { code: 'CMMS_PORTAL_RATE_LIMITED' }, status: 429 });
    for (let n = 2; n <= 8; n++) await portal.submit(context(portalAs(link.id)), request({ clientKey: clientKey(n) }));
    await expect(portal.submit(context(portalAs(link.id)), request({ clientKey: clientKey(99) })))
      .rejects.toMatchObject({ response: { code: 'CMMS_PORTAL_RATE_LIMITED' } });
  });

  it('stops a revoked link and keeps submissions unchanged', async () => {
    expect(await portal.revokeLink(context(planner), link.id, { reason: 'Sticker damaged' })).toMatchObject({ status: 'REVOKED', submissions: 10 });
    await expect(portal.context(portalAs(link.id), { linkId: link.id, secret: link.secret }))
      .rejects.toMatchObject({ response: { code: 'CMMS_PORTAL_LINK_INVALID' } });
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      "UPDATE gigalibs_cmms.portal_submissions SET issue_type = 'OTHER' WHERE tenant_id = $1", [TENANT]))).rejects.toMatchObject({ code: '42501' });
  });
});

describe.skipIf(!url)('signed-in problem reports on PostgreSQL (WI-OI-140)', () => {
  let database: DatabaseService;
  let reports: RequestReportsService;
  const assetId = randomUUID();
  const member = principal('op-7');

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 2,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    reports = new RequestReportsService(database, assets, new RequestsService(database, assets, new WorkOrdersService(database, assets, new PartsService(database))));
    await database.withTenantTransaction(TENANT, (client) => client.query(
      `INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
       VALUES ($1, $2, 'CV-02', 'Conveyor 2', 'a', 'a', 't')`, [TENANT, assetId]));
  });
  afterAll(async () => database?.onModuleDestroy());

  it('raises a request as the member, replays the same operation, and lists only the member’s own', async () => {
    const body = { clientOperationId: randomUUID(), assetId, issueType: 'STOPPED', photoContentType: 'image/png', photoBase64: png };
    const first = await reports.report(context(member), body);
    expect(first).toMatchObject({ replayed: false, report: { assetTag: 'CV-02', issueType: 'STOPPED', state: 'RECEIVED' } });
    expect(await reports.report(context(member), body)).toEqual({ replayed: true, report: first.report });
    await expect(reports.report(context(member), { ...body, issueType: 'NOISE' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_REPORT_OPERATION_REUSED' } });
    const row = (await database.withTenantTransaction(TENANT, (client) => client.query(
      'SELECT priority, requester_subject FROM gigalibs_cmms.maintenance_requests WHERE tenant_id = $1 AND id = $2',
      [TENANT, first.report.requestId]))).rows[0];
    expect(row).toEqual({ priority: 'HIGH', requester_subject: 'op-7' });
    expect((await reports.mine(member)).items.map((item) => item.id)).toEqual([first.report.id]);
    expect((await reports.mine(principal('op-8'))).items).toHaveLength(0);
  });
});
