import { randomUUID } from 'node:crypto';
import { LOGBOOK_INCOMING_STATEMENT, LOGBOOK_OUTGOING_STATEMENT, LOGBOOK_SUPERVISOR_STATEMENT } from '@gigalibs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';
import { WORKFORCE_SCHEMA_CONTRACT_VERSION } from '../runtime-config.js';
import { LogbookService, shiftAt } from './logbook.service.js';

// WI-OI-137: the logbook on real PostgreSQL (Workforce runtime migrations 1-29, a LOGIN role that is neither superuser
// nor BYPASSRLS, logbook_entries append-only). Opt in with WORKFORCE_LOGBOOK_PG_URL.
const url = process.env['WORKFORCE_LOGBOOK_PG_URL'];
const TENANT = `log-${randomUUID().slice(0, 8)}`;
const SITE = randomUUID();
const principal = (subject: string, extra: Partial<GigaOpsPrincipal> = {}, tenantId = TENANT): GigaOpsPrincipal => ({
  tenantId, subject, sessionId: 'session', authVersion: 1, permissions: ['workforce:*'], roles: [], persona: 'OPERATIONS_SUPERVISOR',
  orgScope: { mode: 'FLAT_TENANT' }, spatialScope: { mode: 'UNBOUNDED' }, ...extra,
} as GigaOpsPrincipal);
const context = (who: GigaOpsPrincipal) => commandContext(who, undefined);
const supervisor = principal('sup-1');
const outgoing = principal('op-1');
const incoming = principal('op-2');
const windows = [{ name: 'Day', start: '06:00', end: '18:00' }, { name: 'Night', start: '18:00', end: '06:00' }];

describe.skipIf(!url)('shift logbook on PostgreSQL (WI-OI-137)', () => {
  let database: WorkforceDatabaseService;
  let logbook: LogbookService;
  let logbookId: string;

  beforeAll(async () => {
    database = new WorkforceDatabaseService({ databaseUrl: url!, databasePoolSize: 4, expectedMigrationVersion: WORKFORCE_SCHEMA_CONTRACT_VERSION } as never);
    await database.onModuleInit();
    logbook = new LogbookService(database);
  });
  afterAll(async () => database?.onModuleDestroy());

  it('creates a logbook with shift windows in its zone', async () => {
    const created = await logbook.createLogbook(context(supervisor), { code: 'unit-3', name: 'Unit 3', siteRef: SITE, timeZone: 'UTC', shiftWindows: windows });
    logbookId = created.id;
    expect(created).toMatchObject({ code: 'UNIT-3', active: true, siteRef: SITE });
    await expect(logbook.createLogbook(context(supervisor), { code: 'UNIT-3', name: 'Copy', timeZone: 'UTC', shiftWindows: windows }))
      .rejects.toMatchObject({ status: 409 });
  });

  let entryId: string;
  it('records immutable entries in their shift, replays a capture and keeps corrections as new entries', async () => {
    const body = { clientOperationId: randomUUID(), category: 'TRIP', text: 'P-101 tripped', priority: 'HIGH', occurredAt: new Date(Date.now() - 60_000).toISOString() };
    const first = await logbook.addEntry(context(outgoing), logbookId, body);
    entryId = first.entry.id;
    const shift = shiftAt(windows, 'UTC', body.occurredAt);
    expect(first).toMatchObject({ replayed: false, entry: { shiftDate: shift.shiftDate, shiftName: shift.shiftName, author: 'op-1' } });
    expect(await logbook.addEntry(context(outgoing), logbookId, body)).toMatchObject({ replayed: true, entry: { id: entryId } });
    await expect(logbook.addEntry(context(outgoing), logbookId, { ...body, text: 'changed' }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_OPERATION_REUSED' } });
    const correction = await logbook.addEntry(context(outgoing), logbookId, { ...body, clientOperationId: randomUUID(), text: 'P-101 tripped on low suction', correctsEntryId: entryId });
    expect(correction.entry.correctsEntryId).toBe(entryId);
    const list = await logbook.listEntries(supervisor, logbookId, {});
    expect(list.items.find((item) => item.id === entryId)?.correctedByEntryId).toBe(correction.entry.id);
    await expect(logbook.addEntry(context(outgoing), logbookId, { ...body, clientOperationId: randomUUID(), occurredAt: new Date(Date.now() + 3_600_000).toISOString() }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_LOGBOOK_CLOCK' } });
  });

  let bypassId: string;
  it('authorizes a bypass only through someone other than its requester', async () => {
    const requested = await logbook.requestBypass(context(outgoing), logbookId, {
      clientOperationId: randomUUID(), description: 'LSHH-12 bypassed', reason: 'Sensor fault', mitigation: 'Hourly field check',
      plannedRemovalAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    bypassId = requested.id;
    expect(requested).toMatchObject({ status: 'REQUESTED', activeHours: null, overdue: false });
    await expect(logbook.decideBypass(context(outgoing), bypassId, { decision: 'AUTHORIZE', expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_BYPASS_FOUR_EYES' } });
    expect(await logbook.decideBypass(context(supervisor), bypassId, { decision: 'AUTHORIZE', expectedVersion: 1 }))
      .toMatchObject({ status: 'AUTHORIZED', authorizedBy: 'sup-1', overdue: false });
    expect((await logbook.listBypasses(supervisor)).items.map((item) => item.id)).toContain(bypassId);
  });

  let handoverId: string;
  it('hands over between two people, against exactly the active bypasses, then countersigns with a third', async () => {
    const shift = shiftAt(windows, 'UTC', new Date().toISOString());
    const submitted = await logbook.submitHandover(context(outgoing), logbookId, {
      clientOperationId: randomUUID(), shiftDate: shift.shiftDate, shiftName: shift.shiftName, notes: 'P-101 restarted; LSHH-12 still bypassed.',
      statement: LOGBOOK_OUTGOING_STATEMENT,
    });
    handoverId = submitted.handover.id;
    expect(submitted.handover.package).toMatchObject({ activeBypasses: [{ id: bypassId }], entryCounts: { TRIP: 2 } });
    expect(submitted.handover.package.highPriorityEntries).toHaveLength(2);
    await expect(logbook.submitHandover(context(outgoing), logbookId, {
      clientOperationId: randomUUID(), shiftDate: shift.shiftDate, shiftName: shift.shiftName, notes: 'again', statement: LOGBOOK_OUTGOING_STATEMENT,
    })).rejects.toMatchObject({ status: 409 });
    await expect(logbook.acceptHandover(context(outgoing), handoverId, { expectedVersion: 1, acknowledgedBypassIds: [bypassId], statement: LOGBOOK_INCOMING_STATEMENT }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_HANDOVER_TWO_PERSON' } });
    await expect(logbook.acceptHandover(context(incoming), handoverId, { expectedVersion: 1, acknowledgedBypassIds: [], statement: LOGBOOK_INCOMING_STATEMENT }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_HANDOVER_BYPASSES_UNACKNOWLEDGED' } });

    const late = await logbook.requestBypass(context(outgoing), logbookId, {
      clientOperationId: randomUUID(), description: 'PSV-7 isolated', reason: 'Leak', mitigation: 'Standby relief',
      plannedRemovalAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await logbook.decideBypass(context(supervisor), late.id, { decision: 'AUTHORIZE', expectedVersion: 1 });
    await expect(logbook.acceptHandover(context(incoming), handoverId, { expectedVersion: 1, acknowledgedBypassIds: [bypassId, late.id], statement: LOGBOOK_INCOMING_STATEMENT }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_HANDOVER_BYPASSES_CHANGED' } });
    await expect(logbook.refreezeHandover(context(incoming), handoverId, { expectedVersion: 1 }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_HANDOVER_OUTGOING_ONLY' } });
    const refrozen = await logbook.refreezeHandover(context(outgoing), handoverId, { expectedVersion: 1 });
    expect(refrozen.package.activeBypasses.map((item) => item.id).sort()).toEqual([bypassId, late.id].sort());
    const accepted = await logbook.acceptHandover(context(incoming), handoverId, { expectedVersion: 2, acknowledgedBypassIds: [late.id, bypassId], statement: LOGBOOK_INCOMING_STATEMENT });
    expect(accepted).toMatchObject({ status: 'ACCEPTED', incomingBy: 'op-2' });
    await expect(logbook.countersignHandover(context(incoming), handoverId, { expectedVersion: 3, statement: LOGBOOK_SUPERVISOR_STATEMENT }))
      .rejects.toMatchObject({ response: { code: 'WORKFORCE_HANDOVER_THIRD_PERSON' } });
    expect(await logbook.countersignHandover(context(supervisor), handoverId, { expectedVersion: 3, statement: LOGBOOK_SUPERVISOR_STATEMENT }))
      .toMatchObject({ status: 'COUNTERSIGNED', supervisorBy: 'sup-1' });
  });

  it('clears a bypass and shows the board', async () => {
    const cleared = await logbook.clearBypass(context(incoming), bypassId, { expectedVersion: 2, note: 'Sensor replaced' });
    expect(cleared).toMatchObject({ status: 'CLEARED', clearedBy: 'op-2' });
    const board = await logbook.board(supervisor, logbookId);
    expect(board.activeBypasses.map((item) => item.description)).toEqual(['PSV-7 isolated']);
    expect(board.lastHandover).toMatchObject({ id: handoverId, status: 'COUNTERSIGNED' });
    expect(board.entries.length).toBeGreaterThanOrEqual(2);
  });

  it('hides the logbook from another tenant and outside the caller’s places', async () => {
    await expect(logbook.board(principal('sup-9', {}, `log-${randomUUID().slice(0, 8)}`), logbookId)).rejects.toMatchObject({ status: 404 });
    const elsewhere = principal('op-9', { spatialScope: { mode: 'SCOPED_PLACES', place_ids: [randomUUID()] } } as never);
    await expect(logbook.board(elsewhere, logbookId)).rejects.toMatchObject({ status: 404 });
    await expect(logbook.createLogbook(context(elsewhere), { code: 'UNIT-9', name: 'Unit 9', siteRef: SITE, timeZone: 'UTC', shiftWindows: windows }))
      .rejects.toMatchObject({ status: 403 });
  });
});
