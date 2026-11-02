import { randomUUID } from 'node:crypto';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCHEMA_CONTRACT_VERSION } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { HazardsService } from './hazards.service.js';

// WI-OI-141: hazard reports, triage, stop work and investigations against real PostgreSQL (a throwaway local
// database, never UAT). Opt in with SAFETY_OPERATIONS_PG_URL (a non-superuser runtime role).
const url = process.env['SAFETY_OPERATIONS_PG_URL'];
const TENANT = `safety-${randomUUID().slice(0, 8)}`;
const principal = (subject: string, permissions: string[]): ModulePrincipal => ({
  tenantId: TENANT, subject, sessionId: 'session', authVersion: 1, permissions, roles: [], persona: 'WORKFORCE_MEMBER',
  departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
} as ModulePrincipal);
const context = (who: ModulePrincipal): ModuleCommandContext => ({ principal: who, correlationId: randomUUID() } as ModuleCommandContext);
const worker = principal('op-1', ['safety-operations.hazards.report']);
const colleague = principal('op-2', ['safety-operations.hazards.report']);
const champion = principal('champion-1', ['safety-operations.hazards.report', 'safety-operations.hazards.read',
  'safety-operations.hazards.triage', 'safety-operations.stop-work.acknowledge', 'safety-operations.investigations.manage']);
const director = principal('ehs-1', ['safety-operations:*']);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)]).toString('base64');
const report = (extra: Record<string, unknown> = {}) => ({
  clientOperationId: randomUUID(), severity: 'UNSAFE_CONDITION', category: 'LEAK_SPILL', description: 'Hydraulic oil on the ladder rung',
  area: 'Catwalk B2', observedAt: new Date().toISOString(), ...extra,
});

describe.skipIf(!url)('hazard reports on PostgreSQL (WI-OI-141)', () => {
  let database: DatabaseService;
  let hazards: HazardsService;

  beforeAll(async () => {
    database = new DatabaseService({
      databaseUrl: url!, databasePoolSize: 2, expectedMigrationVersion: SCHEMA_CONTRACT_VERSION,
    } as never);
    await database.onModuleInit();
    hazards = new HazardsService(database);
  });
  afterAll(async () => database?.onModuleDestroy());

  it('takes a report once per operation, numbers it and sets triage due by severity', async () => {
    const body = report({ photoContentType: 'image/png', photoBase64: png });
    const first = await hazards.report(context(worker), body);
    expect(first.report).toMatchObject({ reference: expect.stringMatching(/^HZ-\d{6}$/), status: 'REPORTED', hasPhoto: true, stopWork: null });
    expect(Date.parse(first.report.triageDueAt) - Date.parse(first.report.receivedAt)).toBe(8 * 3_600_000);
    expect(await hazards.report(context(worker), body)).toEqual({ replayed: true, report: first.report });
    await expect(hazards.report(context(worker), { ...body, area: 'Elsewhere' }))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_OPERATION_REUSED' } });
    await expect(hazards.report(context(worker), report({ observedAt: new Date(Date.now() + 3_600_000).toISOString() })))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_CLOCK' } });
    await expect(hazards.report(context(worker), report({ photoContentType: 'image/jpeg', photoBase64: png })))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_PHOTO_INVALID' } });
    expect((await hazards.mine(worker)).items.map((item) => item.id)).toContain(first.report.id);
    expect((await hazards.mine(colleague)).items).toHaveLength(0);
    await expect(hazards.get(colleague, first.report.id)).rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_NOT_FOUND' } });
    expect(await hazards.photo(champion, first.report.id)).toMatchObject({ contentType: 'image/png', base64: png });
  });

  it('triages independently of the reporter and closes only when the work is done', async () => {
    const { report: filed } = await hazards.report(context(champion), report({ severity: 'GOOD_CATCH', category: 'SLIP_TRIP_FALL' }));
    await expect(hazards.triage(context(champion), filed.id, { expectedVersion: 1, likelihood: 2, consequence: 2, route: 'RESOLVED' }))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_FOUR_EYES' } });
    const triaged = await hazards.triage(context(director), filed.id, { expectedVersion: 1, likelihood: 2, consequence: 3, route: 'MAINTENANCE' });
    expect(triaged).toMatchObject({ status: 'TRIAGED', riskScore: 6, route: 'MAINTENANCE', triagedBy: 'ehs-1' });
    expect(await hazards.close(context(champion), filed.id, { expectedVersion: 2, resolution: 'Mat replaced' }))
      .toMatchObject({ status: 'CLOSED', closedBy: 'champion-1' });
  });

  it('raises a stop-work alert everyone sees, acknowledged once each, lifted by someone else with a reason', async () => {
    const { report: stop } = await hazards.report(context(worker), report({ severity: 'STOP_WORK', category: 'ELECTRICAL', area: 'MCC room' }));
    expect(stop.triageDueAt).toBe(stop.receivedAt);
    expect(stop.stopWork).toMatchObject({ status: 'OPEN', area: 'MCC room', acknowledgements: 0 });
    expect((await hazards.openAlerts(colleague)).items.map((item) => item.reportId)).toContain(stop.id);
    const alertId = stop.stopWork!.id;
    await hazards.acknowledge(context(champion), alertId);
    expect(await hazards.acknowledge(context(champion), alertId)).toMatchObject({ acknowledgements: 1, acknowledgedByMe: true });
    await hazards.triage(context(champion), stop.id, { expectedVersion: 1, likelihood: 4, consequence: 5, route: 'INVESTIGATION' });
    await expect(hazards.close(context(champion), stop.id, { expectedVersion: 2, resolution: 'x' }))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_STOP_WORK_OPEN' } });
    await expect(hazards.lift(context(worker), alertId, { expectedVersion: 1, reason: 'Fine now' }))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_FOUR_EYES' } });
    expect(await hazards.lift(context(director), alertId, { expectedVersion: 1, reason: 'Panel isolated and covered' }))
      .toMatchObject({ status: 'LIFTED', liftedBy: 'ehs-1' });
    await expect(hazards.acknowledge(context(colleague), alertId)).rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_STOP_WORK_LIFTED' } });

    await expect(hazards.close(context(champion), stop.id, { expectedVersion: 2, resolution: 'x' }))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_INVESTIGATION_OPEN' } });
    await hazards.saveInvestigation(context(champion), stop.id, { expectedVersion: 0, whys: ['Cover off'], rootCause: 'Cover not refitted' });
    const done = await hazards.saveInvestigation(context(director), stop.id, {
      expectedVersion: 1, whys: ['Cover off', 'No checklist'], rootCause: 'Cover not refitted after inspection',
      contributingFactors: ['Night shift handover'], complete: true,
    });
    expect(done.investigation).toMatchObject({ version: 2, completedAt: expect.any(String), whys: ['Cover off', 'No checklist'] });
    await expect(hazards.saveInvestigation(context(director), stop.id, { expectedVersion: 2, whys: ['x'], rootCause: 'y' }))
      .rejects.toMatchObject({ response: { code: 'SAFETY_OPERATIONS_INVESTIGATION_COMPLETE' } });
    expect(await hazards.close(context(champion), stop.id, { expectedVersion: 2, resolution: 'Checklist updated' })).toMatchObject({ status: 'CLOSED' });
  });

  it('counts by area and category and keeps photos and acknowledgements unchanged', async () => {
    const insights = await hazards.insights(director, 30);
    expect(insights.total).toBeGreaterThanOrEqual(3);
    expect(insights.byArea.find((row) => row.area === 'MCC room')).toMatchObject({ count: 1, stopWork: 1 });
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      'DELETE FROM gigalibs_safety_operations.hazard_photos WHERE tenant_id = $1', [TENANT]))).rejects.toMatchObject({ code: '42501' });
    await expect(database.withTenantTransaction(TENANT, (client) => client.query(
      "UPDATE gigalibs_safety_operations.stop_work_acknowledgements SET subject = 'x' WHERE tenant_id = $1", [TENANT])))
      .rejects.toMatchObject({ code: '42501' });
  });
});
