import { randomUUID } from 'node:crypto';
import {
  CALIBRATION_APPROVAL_STATEMENT,
  CALIBRATION_REJECTION_STATEMENT,
  CALIBRATION_TECHNICIAN_STATEMENT,
  CalibrationRecordV1Schema,
} from '@gigalibs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { CMMS_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { CalibrationService } from './calibration.service.js';

// WI-OI-134: the calibration service against real PostgreSQL (CMMS migrations from the runtime manifest, a LOGIN role
// that is neither superuser nor BYPASSRLS, the append-only grants). Opt in with CMMS_CALIBRATION_PG_URL.
const url = process.env['CMMS_CALIBRATION_PG_URL'];
const TENANT = `cal-${randomUUID().slice(0, 8)}`;
const OTHER_TENANT = `cal-${randomUUID().slice(0, 8)}`;

const principal = (subject: string, extra: Partial<CmmsPrincipal> = {}, tenantId = TENANT): CmmsPrincipal => ({
  tenantId, subject, sessionId: 'session', authVersion: 1, permissions: ['cmms:*'], roles: [],
  persona: 'OPERATIONS_SUPERVISOR', departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' }, ...extra,
});
const context = (who: CmmsPrincipal): CmmsCommandContext => ({ principal: who, correlationId: randomUUID() });
const author = principal('author-1');
const lead = principal('lead-1');
const technician = principal('tech-1');
const SITE = randomUUID();

describe.skipIf(!url)('calibration service on PostgreSQL (WI-OI-134)', () => {
  let database: DatabaseService;
  let calibration: CalibrationService;
  let assetId: string;
  let standardId: string;
  let profileId: string;

  const today = new Date().toISOString().slice(0, 10);
  const shiftDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const points = (values: number[]) => values.map((measuredOutput, position) => ({ position, measuredOutput }));
  const submission = (overrides: Record<string, unknown> = {}) => ({
    clientOperationId: randomUUID(), assetId, profileId, profileRevision: 1, standardIds: [standardId],
    startedAt: new Date(Date.now() - 20 * 60_000).toISOString(), completedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    asFound: points([4, 8.01, 12.04, 16, 20]), statement: CALIBRATION_TECHNICIAN_STATEMENT, ...overrides,
  });

  beforeAll(async () => {
    database = new DatabaseService({
      nodeEnv: 'test', apiHost: '127.0.0.1', apiPort: 0, corsOrigins: [], databaseUrl: url!, databasePoolSize: 4,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION, platformContextPublicKey: 'unused',
      platformContextAudience: 'gigalibs-cmms-api',
    } as never);
    await database.onModuleInit();
    const assets = new AssetsService(database);
    calibration = new CalibrationService(database, assets, new WorkOrdersService(database, assets, new PartsService(database)));
    assetId = randomUUID();
    await database.withTenantTransaction(TENANT, (client) => client.query(
      `INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, site_ref, created_by, updated_by, correlation_id)
       VALUES ($1, $2, 'PT-101', 'Feed pressure transmitter', $3, 'author-1', 'author-1', 'test')`, [TENANT, assetId, SITE]));
  });
  afterAll(async () => database?.onModuleDestroy());

  it('keeps a bank of master standards with unique codes', async () => {
    const standard = await calibration.createStandard(context(author), {
      code: 'fluke-754-01', name: 'Fluke 754', certificateNumber: 'CERT-1', issuedBy: 'Accredited lab',
      calibratedOn: shiftDays(-100), validUntil: shiftDays(265),
    });
    standardId = standard.id;
    expect(standard).toMatchObject({ code: 'FLUKE-754-01', status: 'ACTIVE', usable: true, version: 1 });
    await expect(calibration.createStandard(context(author), {
      code: 'FLUKE-754-01', name: 'Copy', certificateNumber: 'C', issuedBy: 'L', calibratedOn: today, validUntil: today,
    })).rejects.toMatchObject({ status: 409 });
  });

  it('publishes a profile only through a second person and supersedes the previous revision', async () => {
    const draft = await calibration.createProfile(context(author), {
      assetId, inputLrv: 0, inputUrv: 100, inputUnit: 'psi', outputLrv: 4, outputUrv: 20, outputUnit: 'mA',
      toleranceValue: 0.5, testPoints: [0, 25, 50, 75, 100], intervalDays: 365,
    });
    profileId = draft.id;
    expect(draft).toMatchObject({ revision: 1, status: 'DRAFT', authoredBy: 'author-1' });
    await expect(calibration.createProfile(context(author), {
      assetId, inputLrv: 0, inputUrv: 10, inputUnit: 'bar', outputLrv: 4, outputUrv: 20, outputUnit: 'mA',
      toleranceValue: 0.5, testPoints: [0, 100], intervalDays: 30,
    })).rejects.toMatchObject({ status: 409 });
    await expect(calibration.publishProfile(context(author), draft.id, { expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_FOUR_EYES' } });
    const published = await calibration.publishProfile(context(lead), draft.id, { expectedVersion: 1 });
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedBy: 'lead-1', version: 2 });
    expect((await calibration.listInstruments(principal('viewer'))).items).toEqual([
      expect.objectContaining({ assetId, profileRevision: 1, dueState: 'NEVER', awaitingApproval: 0 }),
    ]);
  });

  it('serves the capture bundle with the published profile and the usable standards', async () => {
    const bundle = await calibration.bundle(technician, assetId);
    expect(bundle.profile).toMatchObject({ id: profileId, revision: 1 });
    expect(bundle.standards.map((standard) => standard.code)).toEqual(['FLUKE-754-01']);
  });

  let passedId: string;
  it('recomputes a passing calibration on the server and replays the same capture', async () => {
    const body = submission();
    const first = await calibration.submit(context(technician), body);
    passedId = first.record.id;
    expect(first.replayed).toBe(false);
    expect(CalibrationRecordV1Schema.parse(first.record)).toMatchObject({
      status: 'SUBMITTED', asFoundResult: 'PASS', asLeftResult: null, overallResult: 'PASS', technician: 'tech-1',
      correctiveWorkOrderId: null, assetTakenOffline: false, standards: [expect.objectContaining({ code: 'FLUKE-754-01' })],
    });
    expect(first.record.points[2]).toMatchObject({ expectedOutput: 12, errorPercentSpan: 0.25, withinTolerance: true });
    const again = await calibration.submit(context(technician), body);
    expect(again).toMatchObject({ replayed: true, record: { id: passedId } });
    await expect(calibration.submit(context(technician), { ...body, notes: 'changed' }))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_OPERATION_REUSED' } });
  });

  it('refuses a withdrawn or out-of-date standard and a capture from the future', async () => {
    const expired = await calibration.createStandard(context(author), {
      code: 'DWT-OLD', name: 'Old dead weight', certificateNumber: 'C-OLD', issuedBy: 'Lab',
      calibratedOn: shiftDays(-400), validUntil: shiftDays(-2),
    });
    expect(expired.usable).toBe(false);
    await expect(calibration.submit(context(technician), submission({ standardIds: [expired.id] })))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_STANDARD_INVALID' } });
    const withdrawn = await calibration.createStandard(context(author), {
      code: 'DWT-2', name: 'Dead weight 2', certificateNumber: 'C-2', issuedBy: 'Lab', calibratedOn: shiftDays(-10), validUntil: shiftDays(300),
    });
    await calibration.updateStandard(context(author), withdrawn.id, { expectedVersion: 1, status: 'WITHDRAWN' });
    await expect(calibration.submit(context(technician), submission({ standardIds: [withdrawn.id] })))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_STANDARD_INVALID' } });
    await expect(calibration.submit(context(technician), submission({
      startedAt: new Date(Date.now() + 60 * 60_000).toISOString(), completedAt: new Date(Date.now() + 70 * 60_000).toISOString(),
    }))).rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_CLOCK' } });
  });

  let failedId: string;
  it('contains a failed instrument: one corrective work order, taken offline, replay-safe', async () => {
    const body = submission({ asFound: points([4.2, 8.2, 12.2, 16.2, 20.2]), asLeft: points([4.2, 8.1, 12, 16, 20]) });
    const failed = await calibration.submit(context(technician), body);
    failedId = failed.record.id;
    expect(failed.record).toMatchObject({
      asFoundResult: 'FAIL', asLeftResult: 'FAIL', overallResult: 'FAIL', impactReviewRequired: true, assetTakenOffline: true,
    });
    const workOrderId = failed.record.correctiveWorkOrderId!;
    const row = await database.withTenantTransaction(TENANT, async (client) => (await client.query(
      `SELECT w.type, w.priority, w.trigger_source, w.asset_id, w.title, a.status AS asset_status
         FROM gigalibs_cmms.work_orders w JOIN gigalibs_cmms.assets a ON a.tenant_id = w.tenant_id AND a.id = w.asset_id
        WHERE w.tenant_id = $1 AND w.id = $2`, [TENANT, workOrderId])).rows[0]);
    expect(row).toEqual({ type: 'REACTIVE', priority: 'HIGH', trigger_source: 'CALIBRATION', asset_id: assetId,
      title: 'Calibration failed: PT-101', asset_status: 'OFFLINE' });
    expect(await calibration.submit(context(technician), body)).toMatchObject({ replayed: true, record: { correctiveWorkOrderId: workOrderId } });
    const count = await database.withTenantTransaction(TENANT, async (client) => (await client.query(
      `SELECT count(*)::int AS n FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND trigger_source = 'CALIBRATION'`, [TENANT])).rows[0].n);
    expect(count).toBe(1);
  });

  it('lets only another person decide, once; certificates exist only for approved records', async () => {
    await expect(calibration.decide(context(technician), passedId, { decision: 'APPROVE', expectedVersion: 1, statement: CALIBRATION_APPROVAL_STATEMENT }))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_FOUR_EYES' } });
    await expect(calibration.certificate(lead, passedId)).rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_NOT_APPROVED' } });
    const approved = await calibration.decide(context(lead), passedId, { decision: 'APPROVE', expectedVersion: 1, statement: CALIBRATION_APPROVAL_STATEMENT });
    expect(approved).toMatchObject({ status: 'APPROVED', decidedBy: 'lead-1', decisionStatement: CALIBRATION_APPROVAL_STATEMENT, version: 2 });
    await expect(calibration.decide(context(lead), passedId, { decision: 'REJECT', expectedVersion: 2, note: 'late', statement: CALIBRATION_REJECTION_STATEMENT }))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_DECIDED' } });
    const certificate = await calibration.certificate(technician, passedId);
    expect(certificate.certificateNumber).toMatch(/^CAL-\d{8}-[0-9A-F]{8}$/);
    expect(certificate.record.recordSha256).toBe(approved.recordSha256);
    expect(certificate.disclaimer).toContain('not represented as 21 CFR Part 11');
    const rejected = await calibration.decide(context(lead), failedId, { decision: 'REJECT', expectedVersion: 1, note: 'Repeat after repair', statement: CALIBRATION_REJECTION_STATEMENT });
    expect(rejected.status).toBe('REJECTED');
  });

  it('derives the next due date from the last approved pass, and serves drift', async () => {
    const [instrument] = (await calibration.listInstruments(lead)).items;
    expect(instrument).toMatchObject({ lastResult: 'PASS', dueState: 'CURRENT', awaitingApproval: 0 });
    const passed = await calibration.getRecord(lead, passedId);
    expect(Date.parse(instrument!.nextDueAt!) - Date.parse(passed.completedAt)).toBe(365 * 86_400_000);
    const drift = await calibration.drift(lead, assetId);
    expect(drift).toMatchObject({ outputUnit: 'mA', series: [expect.objectContaining({ recordId: passedId, overallResult: 'PASS' })] });
    expect(drift.series[0]!.points.map((point) => point.asFoundErrorPercentSpan)).toEqual([0, 0.0625, 0.25, 0, 0]);
  });

  it('refuses a stale profile revision after a new one is published', async () => {
    const draft = await calibration.createProfile(context(author), {
      assetId, inputLrv: 0, inputUrv: 100, inputUnit: 'psi', outputLrv: 4, outputUrv: 20, outputUnit: 'mA',
      toleranceValue: 0.25, testPoints: [0, 50, 100], intervalDays: 180,
    });
    await calibration.publishProfile(context(lead), draft.id, { expectedVersion: 1 });
    await expect(calibration.submit(context(technician), submission()))
      .rejects.toMatchObject({ response: { code: 'CMMS_CALIBRATION_PROFILE_CHANGED' } });
    expect((await calibration.listProfiles(lead, assetId)).items.map((profile) => [profile.revision, profile.status]))
      .toEqual([[2, 'PUBLISHED'], [1, 'SUPERSEDED']]);
  });

  it('hides the instrument and its records outside the caller’s place and tenant', async () => {
    const elsewhere = principal('tech-2', { placeScope: { mode: 'PLACES', placeIds: [randomUUID()] } });
    await expect(calibration.bundle(elsewhere, assetId)).rejects.toMatchObject({ status: 404 });
    await expect(calibration.getRecord(elsewhere, passedId)).rejects.toMatchObject({ status: 404 });
    await expect(calibration.getRecord(principal('lead-1', {}, OTHER_TENANT), passedId)).rejects.toMatchObject({ status: 404 });
    expect((await calibration.listInstruments(principal('viewer', {}, OTHER_TENANT))).items).toEqual([]);
  });
});
