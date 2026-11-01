import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentsService } from './assignments.service.js';

const routeId = randomUUID();
const input = {
  requestKey: randomUUID(), workforceResourceRef: randomUUID(),
  operatorSubject: 'cmuy0autt0031l807snorsbhr',
  scheduledStart: '2026-10-30T08:00:00.000Z', dueAt: '2026-10-30T09:00:00.000Z',
};
const existing = {
  id: randomUUID(), route_id: routeId, route_revision: 1,
  workforce_resource_ref: input.workforceResourceRef,
  operator_subject: input.operatorSubject, owning_unit_id: null, site_ref: null,
  scheduled_start: new Date(input.scheduledStart), due_at: new Date(input.dueAt),
  state: 'ASSIGNED', version: 1,
  request_sha256: createHash('sha256').update(JSON.stringify({ routeId, ...input })).digest('hex'),
};
const context = { principal: {
  tenantId: 'tenant-a', subject: input.operatorSubject,
  permissions: ['operator-rounds.assignments.manage'],
  organization: { mode: 'TENANT' }, placeScope: { mode: 'ALL' },
  departmentScope: { mode: 'ALL' },
} } as never;

describe('Rounds assignment retry', () => {
  it('returns the original assignment after the route changes and Workforce is unavailable', async () => {
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM gigalibs_operator_rounds.assignments')) return { rows: [existing] };
      throw new Error('A replay must not read current route state.');
    }) };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, run: (db: typeof client) => Promise<unknown>) => run(client)) };
    const workforce = { assertEligible: vi.fn(async () => { throw new Error('Workforce unavailable'); }) };
    const service = new AssignmentsService(database as never, {} as never, workforce as never);
    await expect(service.assign(context,routeId,input)).resolves.toMatchObject({
      assignment: { id: existing.id }, replayed: true,
    });
    expect(workforce.assertEligible).not.toHaveBeenCalled();
  });

  it('refuses reuse of a key with changed assignment content', async () => {
    const client = { query: vi.fn(async () => ({ rows: [existing] })) };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, run: (db: typeof client) => Promise<unknown>) => run(client)) };
    const service = new AssignmentsService(database as never, {} as never, {} as never);
    await expect(service.assign(context,routeId,{ ...input, dueAt:'2026-10-30T10:00:00.000Z' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
