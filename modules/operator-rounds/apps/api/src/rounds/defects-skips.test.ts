import { randomUUID } from 'node:crypto';
import { RoundCorrectiveActionV1, type RoundSyncCommandV1, RoundSyncResponseV1 } from '@gigalibs/contracts';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RunsService } from './runs.service.js';
import { SkipsService } from './skips.service.js';

const ids = { run: randomUUID(), assignment: randomUUID(), route: randomUUID(), p1: randomUUID(), p2: randomUUID(), p3: randomUUID() };
const run = (version = 3) => ({ id: ids.run, assignment_id: ids.assignment, route_id: ids.route, route_revision: 1,
  actor_subject: 'operator-a', state: 'IN_PROGRESS', version, request_sha256: 'x', started_at: new Date(), completed_at: null });
const assignment = { id: ids.assignment, route_id: ids.route, route_revision: 1, operator_subject: 'operator-a',
  workforce_resource_ref: randomUUID(), owning_unit_id: null, site_ref: null, state: 'STARTED',
  scheduled_start: new Date(), due_at: new Date() };
const checkpoint = (id: string, position: number, branch_rule: unknown[] = []) => ({ id, position, label: `Point ${position}`,
  asset_ref: randomUUID(), meter_ref: null, tag_code: `TAG-${position}`, proof_mode: 'NFC', reading_kind: 'BOOLEAN',
  unit_code: null, nominal: null, amber_low: null, amber_high: null, red_low: null, red_high: null,
  choices: ['PASS', 'FAIL'], branch_rule, instructions: null, photo_on_exception: false });
// Point 1 always continues to point 3: a skip of point 1 must follow that branch, as a reading would.
const route = [checkpoint(ids.p1, 1, [{ condition: 'ALWAYS', nextPosition: 3 }]), checkpoint(ids.p2, 2), checkpoint(ids.p3, 3)];
const context = { principal: { tenantId: 'tenant-a', subject: 'operator-a', permissions: ['operator-rounds.runs.execute'],
  organization: { mode: 'TENANT' }, placeScope: { mode: 'ALL' }, departmentScope: { mode: 'ALL' } }, correlationId: randomUUID() } as never;
const now = new Date().toISOString();

type Step = { position: number; status: string; numeric_value: string | null; choice_value: string | null };
function runsService(steps: Step[], runVersion = 3) {
  const statements: { sql: string; values: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    if (sql.includes('FROM gigalibs_operator_rounds.sync_receipts')) return { rows: [] };
    if (sql.includes('FROM gigalibs_operator_rounds.round_runs WHERE')) return { rows: [run(runVersion)] };
    if (sql.includes('FROM gigalibs_operator_rounds.assignments WHERE')) return { rows: [assignment] };
    if (sql.includes('checkpoint_skips sk JOIN')) return { rows: sql.includes('DESC LIMIT 1') ? steps.slice(-1) : steps };
    if (sql.includes('FROM gigalibs_operator_rounds.checkpoints WHERE') && sql.includes('AND id=$3'))
      return { rows: route.filter((point) => point.id === values[2]) };
    if (sql.includes('FROM gigalibs_operator_rounds.checkpoints WHERE')) return { rows: route };
    if (sql.includes('UPDATE gigalibs_operator_rounds.round_runs')) return { rows: [{ ...run(runVersion + 1), state: sql.includes("'COMPLETE'") ? 'COMPLETE' : 'IN_PROGRESS' }] };
    return { rows: [] };
  });
  const service = new RunsService({ withTenantTransaction: async (_t: string, work: (c: { query: typeof query }) => Promise<unknown>) => work({ query }) } as never, {} as never);
  return { service, statements };
}
const outbox = (statements: { sql: string; values: unknown[] }[], topic: string) =>
  statements.filter((s) => s.sql.includes('outbox_events') && s.values.includes(topic)).map((s) => JSON.parse(String(s.values.at(-1))));

describe('Rounds ad-hoc defects', () => {
  const defect = { clientOperationId: randomUUID(), runId: ids.run, checkpointId: ids.p2, routeRevision: 1, observedAt: now,
    severity: 'RED' as const, description: 'Oil leak under the gearbox', requestWorkOrder: true, evidenceId: null };

  it('raises a DEFECT exception and one CMMS corrective action without changing the route path', async () => {
    const { service, statements } = runsService([{ position: 1, status: 'NORMAL', numeric_value: null, choice_value: 'PASS' }]);
    const result = await service.defect(context, defect);
    expect(result).toMatchObject({ type: 'DEFECT', exceptionState: 'ACTION_PENDING', runVersion: 3 });
    const insert = statements.find((s) => s.sql.includes('INSERT INTO gigalibs_operator_rounds.exceptions'))!;
    expect(insert.sql).toContain("'DEFECT'");
    expect(insert.values).toEqual(expect.arrayContaining(['RED', 'ACTION_PENDING', ids.p2, defect.description, 'operator-a']));
    expect(statements.some((s) => s.sql.includes('UPDATE gigalibs_operator_rounds.round_runs'))).toBe(false);
    // CMMS strips the envelope's aggregate binding before parsing, exactly as here.
    const [{ aggregateId, aggregateVersion, ...command }] = outbox(statements, 'operator-rounds.cmms.v1');
    expect({ aggregateId, aggregateVersion }).toEqual({ aggregateId: result.exceptionId, aggregateVersion: 1 });
    const parsed = RoundCorrectiveActionV1.safeParse(command);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ origin: 'DEFECT', readingId: null, reading: null, defectDescription: defect.description, checkpointId: ids.p2 });
  });

  it('waits for supervisor review when no work order is requested', async () => {
    const { service, statements } = runsService([]);
    await expect(service.defect(context, { ...defect, requestWorkOrder: false })).resolves.toMatchObject({ exceptionState: 'OPEN' });
    expect(outbox(statements, 'operator-rounds.cmms.v1')).toEqual([]);
  });

  it('refuses a checkpoint outside the run’s route', async () => {
    const { service } = runsService([]);
    await expect(service.defect(context, { ...defect, checkpointId: randomUUID() })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Rounds checkpoint skips in the route path', () => {
  const skip = (checkpointId: string, expectedRunVersion = 3) => ({ clientOperationId: randomUUID(), runId: ids.run, checkpointId,
    routeRevision: 1, expectedRunVersion, capturedAt: now, reasonCode: 'INACCESSIBLE' as const, note: null });

  it('records a requested skip at the expected checkpoint and advances the run version', async () => {
    const { service, statements } = runsService([]);
    await expect(service.skip(context, skip(ids.p1))).resolves.toMatchObject({ type: 'SKIP', skipState: 'REQUESTED', runVersion: 4 });
    expect(statements.some((s) => s.sql.includes('INSERT INTO gigalibs_operator_rounds.checkpoint_skips'))).toBe(true);
  });

  it('refuses a skip out of route order or at a stale run version', async () => {
    await expect(runsService([]).service.skip(context, skip(ids.p2))).rejects.toBeInstanceOf(ConflictException);
    await expect(runsService([]).service.skip(context, skip(ids.p1, 2))).rejects.toBeInstanceOf(ConflictException);
  });

  it('follows the skipped checkpoint’s ALWAYS branch for the next step', async () => {
    const skipped = [{ position: 1, status: 'SKIPPED', numeric_value: null, choice_value: null }];
    await expect(runsService(skipped).service.skip(context, skip(ids.p2))).rejects.toThrow(/out of route order/);
    await expect(runsService(skipped).service.skip(context, skip(ids.p3))).resolves.toMatchObject({ skipState: 'REQUESTED' });
  });

  it('completes a path that contains a pending skip and reports how many were skipped', async () => {
    const steps = [{ position: 1, status: 'SKIPPED', numeric_value: null, choice_value: null },
      { position: 3, status: 'NORMAL', numeric_value: null, choice_value: 'PASS' }];
    const { service, statements } = runsService(steps, 4);
    await expect(service.complete(context, { clientOperationId: randomUUID(), runId: ids.run, expectedRunVersion: 4 }))
      .resolves.toMatchObject({ type: 'COMPLETE', accepted: true });
    expect(outbox(statements, 'operator-rounds.facts.v1').at(-1)).toMatchObject({ readingCount: 1, skipCount: 1 });
  });

  it('dispatches DEFECT and SKIP commands in order through offline sync', async () => {
    const service = new RunsService({} as never, {} as never);
    vi.spyOn(service, 'defect').mockResolvedValue({ type: 'DEFECT', accepted: true, replayed: false } as never);
    vi.spyOn(service, 'skip').mockRejectedValue(new ConflictException('stale'));
    const commands: RoundSyncCommandV1[] = [
      { type: 'DEFECT', payload: { clientOperationId: randomUUID(), runId: ids.run, checkpointId: ids.p1, routeRevision: 1,
        observedAt: now, severity: 'AMBER', description: 'Guard loose', requestWorkOrder: false, evidenceId: null } },
      { type: 'SKIP', payload: skip(ids.p1) },
    ];
    const response = await service.sync({} as never, commands);
    expect(RoundSyncResponseV1.safeParse(response).success).toBe(true);
    expect(response.results).toMatchObject([{ accepted: true, type: 'DEFECT' }, { accepted: false, type: 'SKIP', state: 'CONFLICT' }]);
  });
});

describe('Rounds skip decisions', () => {
  const row = (state = 'REQUESTED', requestedBy = 'operator-a') => ({ id: randomUUID(), run_id: ids.run, checkpoint_id: ids.p1,
    reason_code: 'UNSAFE', note: null, requested_by: requestedBy, state, decided_by: null, decision_note: null, decided_at: null,
    version: 1, captured_at: new Date(), received_at: new Date(), assignment_id: ids.assignment, owning_unit_id: null,
    site_ref: null, route_id: ids.route, route_code: 'R-1', checkpoint_label: 'Point 1', asset_ref: randomUUID() });
  const supervisor = (subject: string) => ({ principal: { tenantId: 'tenant-a', subject, permissions: ['operator-rounds.skips.approve'],
    organization: { mode: 'TENANT' }, placeScope: { mode: 'ALL' }, departmentScope: { mode: 'ALL' } }, correlationId: randomUUID() }) as never;
  const skips = (current: ReturnType<typeof row>) => new SkipsService({ withTenantTransaction: async (_t: string,
    work: (c: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => work({ query: async (sql: string) =>
      sql.includes('FOR UPDATE OF sk') ? { rows: [current] }
        : sql.includes('UPDATE gigalibs_operator_rounds.checkpoint_skips') ? { rows: [{ version: 2, decided_at: new Date() }] } : { rows: [] } }) } as never);

  it('lets a different authorized person approve a requested skip', async () => {
    const current = row();
    await expect(skips(current).decide(supervisor('supervisor-b'), current.id, { version: 1, decision: 'APPROVED', note: 'Area flooded' }))
      .resolves.toMatchObject({ state: 'APPROVED', decidedBy: 'supervisor-b', version: 2 });
  });

  it('refuses the requester deciding their own skip, a stale version and a second decision', async () => {
    const own = row('REQUESTED', 'supervisor-b');
    await expect(skips(own).decide(supervisor('supervisor-b'), own.id, { version: 1, decision: 'APPROVED', note: 'x' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    const current = row();
    await expect(skips(current).decide(supervisor('supervisor-b'), current.id, { version: 2, decision: 'REJECTED', note: 'x' }))
      .rejects.toBeInstanceOf(ConflictException);
    const decided = row('APPROVED');
    await expect(skips(decided).decide(supervisor('supervisor-b'), decided.id, { version: 1, decision: 'REJECTED', note: 'x' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Rounds → CMMS corrective action contract', () => {
  const base = { requestKey: randomUUID(), exceptionId: randomUUID(), runId: ids.run, routeId: ids.route, checkpointId: ids.p1,
    assetId: randomUUID(), placeRef: null, severity: 'RED', checkpointLabel: 'Point 1', observedAt: now };
  it('reads a command relayed before defects existed as a threshold exception', () => {
    const parsed = RoundCorrectiveActionV1.parse({ ...base, readingId: randomUUID(), reading: { numericValue: '9', choiceValue: null, unitCode: 'bar' } });
    expect(parsed).toMatchObject({ origin: 'READING', defectDescription: null });
  });
  it('requires exactly the evidence its origin names', () => {
    expect(RoundCorrectiveActionV1.safeParse({ ...base, origin: 'DEFECT', readingId: null, reading: null, defectDescription: 'Leak' }).success).toBe(true);
    expect(RoundCorrectiveActionV1.safeParse({ ...base, origin: 'DEFECT', readingId: randomUUID(), reading: null, defectDescription: 'Leak' }).success).toBe(false);
    expect(RoundCorrectiveActionV1.safeParse({ ...base, origin: 'READING', readingId: randomUUID(), reading: null }).success).toBe(false);
    expect(RoundCorrectiveActionV1.safeParse({ ...base, origin: 'DEFECT', readingId: null, reading: null }).success).toBe(false);
  });
});
