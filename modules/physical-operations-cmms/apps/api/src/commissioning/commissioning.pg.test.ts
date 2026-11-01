import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { AssetAuditsService } from './asset-audits.service.js';
import { CommissioningService } from './commissioning.service.js';

// WI-OI-135: commissioning, tags and floor walks against real PostgreSQL (CMMS manifest migrations, a LOGIN role that
// is neither superuser nor BYPASSRLS, append-only grants). Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `tag-${randomUUID().slice(0, 8)}`;
const SITE = randomUUID();
const principal = (subject: string, extra: Partial<CmmsPrincipal> = {}, tenantId = TENANT): CmmsPrincipal => ({
  tenantId, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' }, ...extra,
});
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const technician = principal('tech-1');
const reviewer = principal('lead-1');

describe.skipIf(!url)('commissioning, tags and floor walks on PostgreSQL (WI-OI-135)', () => {
  let database: DatabaseService;
  let commissioning: CommissioningService;
  let audits: AssetAuditsService;
  let roomA: string;
  let roomB: string;
  let existingPump: string;

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    commissioning = new CommissioningService(database, assets);
    audits = new AssetAuditsService(database);
    roomA = randomUUID();
    roomB = randomUUID();
    existingPump = randomUUID();
    await database.withTenantTransaction(TENANT, async (client) => {
      for (const [id, code] of [[roomA, 'ROOM-A'], [roomB, 'ROOM-B']] as const)
        await client.query(
          `INSERT INTO gigalibs_cmms.cmms_spaces (tenant_id, id, code, name, space_type, site_ref, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $3, 'ROOM', $4, 'admin', 'admin', 'test')`, [TENANT, id, code, SITE]);
      await client.query(
        `INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, serial_number, manufacturer, site_ref, space_id,
           created_by, updated_by, correlation_id)
         VALUES ($1, $2, 'P-100', 'Old pump', 'SN-77', 'Grundfos', $3, $4, 'admin', 'admin', 'test')`, [TENANT, existingPump, SITE, roomA]);
    });
  });
  afterAll(async () => database?.onModuleDestroy());

  it('serves the spaces a technician picks from', async () => {
    const result = await commissioning.context(technician);
    expect(result.spaces.map((space) => space.code)).toEqual(['ROOM-A', 'ROOM-B']);
  });

  let requestId: string;
  it('takes a field proposal with duplicate candidates, and replays the same capture', async () => {
    const body = {
      clientOperationId: randomUUID(), proposedAssetTag: 'p-200', name: 'Booster pump', manufacturer: 'grundfos',
      serialNumber: 'sn-77', spaceId: roomB, nameplateText: 'Grundfos CRN 15-08 S/N SN-77', nameplateConfirmed: true,
      tag: { kind: 'NFC', value: '04:a2:b3:c4' }, specs: { ratedKw: 15 },
    };
    const first = await commissioning.submit(context(technician), body);
    requestId = first.request.id;
    expect(first).toMatchObject({ replayed: false, request: {
      status: 'SUBMITTED', proposedAssetTag: 'P-200', siteRef: SITE, tag: { kind: 'NFC', value: '04A2B3C4' },
      duplicates: [{ assetId: existingPump, reason: 'SERIAL_NUMBER' }],
    } });
    expect(await commissioning.submit(context(technician), body)).toMatchObject({ replayed: true, request: { id: requestId } });
    await expect(commissioning.submit(context(technician), { ...body, name: 'Other' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_COMMISSIONING_OPERATION_REUSED' } });
    await expect(commissioning.submit(context(technician), { ...body, clientOperationId: randomUUID(), nameplateConfirmed: false }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('lets only another person approve, creates the asset and binds the tag in one step', async () => {
    await expect(commissioning.decide(context(technician), requestId, { decision: 'APPROVE_NEW', expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_COMMISSIONING_FOUR_EYES' } });
    const approved = await commissioning.decide(context(reviewer), requestId, { decision: 'APPROVE_NEW', expectedVersion: 1 });
    expect(approved).toMatchObject({ status: 'APPROVED', decision: 'CREATED', reviewedBy: 'lead-1' });
    const resolved = await commissioning.resolveTag(technician, 'NFC', '04a2b3c4');
    expect(resolved.asset).toMatchObject({ id: approved.assetId, assetTag: 'P-200', spaceId: roomB, siteRef: SITE });
    await expect(commissioning.decide(context(reviewer), requestId, { decision: 'REJECT', expectedVersion: 2, note: 'late' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_COMMISSIONING_DECIDED' } });
  });

  it('refuses a proposal or a binding with a tag that is already bound', async () => {
    await expect(commissioning.submit(context(technician), {
      clientOperationId: randomUUID(), proposedAssetTag: 'P-201', name: 'Copy', tag: { kind: 'NFC', value: '04A2B3C4' },
    })).rejects.toMatchObject({ response: { code: 'CMMS_TAG_BOUND' } });
    await expect(commissioning.bindTag(context(reviewer), existingPump, { kind: 'NFC', value: '04A2B3C4' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_TAG_BOUND' } });
  });

  it('never creates a second asset when the tag was bound before approval', async () => {
    const pending = await commissioning.submit(context(technician), {
      clientOperationId: randomUUID(), proposedAssetTag: 'P-300', name: 'Late pump', tag: { kind: 'QR', value: 'QR-300' },
    });
    await commissioning.bindTag(context(reviewer), existingPump, { kind: 'QR', value: 'QR-300' });
    await expect(commissioning.decide(context(reviewer), pending.request.id, { decision: 'APPROVE_NEW', expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_TAG_BOUND' } });
    const count = await database.withTenantTransaction(TENANT, async (client) =>
      (await client.query(`SELECT count(*)::int AS n FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND asset_tag = 'P-300'`, [TENANT])).rows[0].n);
    expect(count).toBe(0);
    expect(await commissioning.get(reviewer, pending.request.id)).toMatchObject({ status: 'SUBMITTED' });
  });

  it('links a proposal to an existing asset, relocating it and binding the tag', async () => {
    const pending = await commissioning.submit(context(technician), {
      clientOperationId: randomUUID(), proposedAssetTag: 'P-100', name: 'Old pump seen', spaceId: roomB,
      tag: { kind: 'DATAMATRIX', value: 'DM-100' },
    });
    expect(pending.request.duplicates).toEqual([expect.objectContaining({ assetId: existingPump, reason: 'ASSET_TAG' })]);
    const linked = await commissioning.decide(context(reviewer), pending.request.id,
      { decision: 'LINK_EXISTING', assetId: existingPump, expectedVersion: 1 });
    expect(linked).toMatchObject({ status: 'APPROVED', decision: 'LINKED', assetId: existingPump });
    expect((await commissioning.resolveTag(technician, 'DATAMATRIX', 'DM-100')).asset).toMatchObject({ id: existingPump, spaceId: roomB });
    const tags = await commissioning.listTags(reviewer, existingPump);
    expect(tags.items.map((tag) => tag.kind).sort()).toEqual(['DATAMATRIX', 'QR']);
    const retired = await commissioning.retireTag(context(reviewer), tags.items.find((tag) => tag.kind === 'QR')!.id, { reason: 'Damaged' });
    expect(retired).toMatchObject({ status: 'RETIRED', retireReason: 'Damaged' });
  });

  it('reports seen, missing, relocated and unknown tags for a floor walk', async () => {
    const walk = await audits.start(context(technician), { clientOperationId: randomUUID(), label: 'Room B walk', spaceId: roomB });
    expect(walk).toMatchObject({ status: 'OPEN', spaceId: roomB, siteRef: SITE });
    const scan = (value: string, kind = 'NFC', spaceId = roomB) => ({
      clientOperationId: randomUUID(), tag: { kind, value }, spaceId, seenAt: new Date().toISOString(),
    });
    const seenBody = scan('04a2b3c4');
    const seen = await audits.record(context(technician), walk.id, seenBody);
    expect(seen).toMatchObject({ assetTag: 'P-200', replayed: false });
    expect(await audits.record(context(technician), walk.id, seenBody)).toMatchObject({ id: seen.id, replayed: true });
    await audits.record(context(technician), walk.id, scan('DM-100', 'DATAMATRIX', roomA));
    await audits.record(context(technician), walk.id, scan('FFEE0011'));
    const finished = await audits.finish(context(technician), walk.id);
    expect(finished).toMatchObject({ status: 'FINISHED', sightingCount: 3 });
    await expect(audits.record(context(technician), walk.id, scan('04a2b3c4'))).rejects.toMatchObject({ response: { code: 'CMMS_AUDIT_FINISHED' } });
    const report = await audits.report(reviewer, walk.id);
    expect(report.seen.map((item) => [item.assetTag, item.relocated]).sort()).toEqual([['P-100', true], ['P-200', false]]);
    expect(report.missing).toEqual([]);
    expect(report.unknownTags).toEqual([expect.objectContaining({ kind: 'NFC', value: 'FFEE0011' })]);
  });

  it('hides requests, tags and walks from another tenant and outside the caller’s places', async () => {
    const other = principal('lead-9', {}, `tag-${randomUUID().slice(0, 8)}`);
    await expect(commissioning.get(other, requestId)).rejects.toMatchObject({ status: 404 });
    await expect(commissioning.resolveTag(other, 'NFC', '04A2B3C4')).rejects.toMatchObject({ status: 404 });
    expect((await audits.list(other)).items).toEqual([]);
    const elsewhere = principal('tech-2', { placeScope: { mode: 'PLACES', placeIds: [randomUUID()] } });
    await expect(commissioning.resolveTag(elsewhere, 'NFC', '04A2B3C4')).rejects.toMatchObject({ status: 404 });
    expect((await commissioning.context(elsewhere)).spaces).toEqual([]);
  });
});
