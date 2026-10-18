/** WI-OI-120aa: Reliability commands must respect the target work order's legacy write scope. */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { ReliabilityService } from './reliability.service.js';

const workOrderId = '550e8400-e29b-41d4-a716-446655440001';
const jobPlanId = '550e8400-e29b-41d4-a716-446655440002';
const principal = {
  tenantId: 'tenant-a', subject: 'worker-a', departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;
const context: CmmsCommandContext = { principal, correlationId: 'r5-proof' };

function serviceWithQuery(query: ReturnType<typeof vi.fn>) {
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) => operation({ query })),
  } as unknown as DatabaseService;
  return new ReliabilityService(database);
}

describe('WI-OI-120aa Reliability work-order boundary', () => {
  it('refuses failure attribution before reading codes or changing an out-of-scope work order', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: workOrderId, version: 1, department_id: 'south', site_ref: null, signed_off_at: null }],
    }));
    const service = serviceWithQuery(query);
    await expect(service.recordFailureAttribution(context, workOrderId, { expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(false);
  });

  it('refuses job-plan application before inserting tasks into an out-of-scope work order', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('cmms_job_plans')) return { rows: [{ id: jobPlanId, code: 'P1', title: 'Plan', version: 1,
        estimated_duration_minutes: 60, created_by: 'worker-a', created_at: new Date(), updated_at: new Date() }] };
      if (sql.includes('cmms_job_plan_tasks')) return { rows: [] };
      return { rows: [{ id: workOrderId, version: 1, status: 'OPEN', department_id: 'south', site_ref: null }] };
    });
    const service = serviceWithQuery(query);
    await expect(service.applyJobPlanToWorkOrder(context, jobPlanId, workOrderId, { expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(false);
  });

  it('refuses failure attribution when the work order is signed off', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('signed_off_at')) {
        return {
          rows: [{ id: workOrderId, version: 1, department_id: 'north', site_ref: null, signed_off_at: new Date() }],
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const service = serviceWithQuery(query);
    await expect(service.recordFailureAttribution(context, workOrderId, { expectedVersion: 1 })).rejects.toMatchObject({
      response: { code: 'CMMS_WORK_ORDER_SIGNED_OFF' },
    });
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(false);
  });

  it('preserves an in-scope failure-attribution action with audit and outbox writes', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('signed_off_at')) {
        return { rows: [{ id: workOrderId, version: 1, department_id: 'north', site_ref: null, signed_off_at: null }] };
      }
      if (sql.includes('UPDATE gigalibs_cmms.work_orders')) return { rows: [{ version: 2 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const service = serviceWithQuery(query);
    await expect(service.recordFailureAttribution(context, workOrderId, { expectedVersion: 1 })).resolves.toBeUndefined();
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO gigalibs_cmms.audit_events'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO gigalibs_cmms.outbox_events'))).toBe(true);
  });
});
