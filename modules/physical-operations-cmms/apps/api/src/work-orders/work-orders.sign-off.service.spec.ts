/** WI-OI-120bi: supervisor sign-off on completed work orders. */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { DatabaseService } from '../database/database.service.js';
import type { PartsService } from '../parts/parts.service.js';
import { WorkOrdersService } from './work-orders.service.js';

const workOrderId = '550e8400-e29b-41d4-a716-446655440001';
const tenantId = 'tenant-a';
const supervisor = 'supervisor-subject';
const technician = 'technician-subject';

const plannerPrincipal = {
  tenantId,
  subject: supervisor,
  permissions: ['cmms.work-orders.write', 'cmms.work-orders.read'],
  departmentScope: { mode: 'ALL' as const },
  placeScope: { mode: 'ALL' as const },
} as unknown as CmmsPrincipal;

const context: CmmsCommandContext = { principal: plannerPrincipal, correlationId: 'sign-off-proof' };

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: workOrderId,
    tenant_id: tenantId,
    wo_number: 'WO-000001',
    type: 'REACTIVE',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    title: 'Test WO',
    description: null,
    asset_id: null,
    asset_name: null,
    site_ref: null,
    department_id: 'north',
    assigned_to: technician,
    due_at: null,
    started_at: null,
    completed_at: new Date(),
    cancelled_at: null,
    signed_off_at: null,
    signed_off_by: null,
    sign_off_note: null,
    requires_signature: false,
    signature_data: null,
    signed_by: null,
    completion_notes: null,
    estimated_hours: null,
    trigger_source: 'MANUAL',
    pm_schedule_id: null,
    job_plan_id: null,
    failure_problem_id: null,
    failure_cause_id: null,
    failure_remedy_id: null,
    meter_trigger_id: null,
    version: 2,
    created_by: supervisor,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function serviceForRow(row: ReturnType<typeof baseRow>) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FOR UPDATE')) {
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("to_status = 'COMPLETED'")) {
      return { rows: [{ actor_subject: technician }], rowCount: 1 };
    }
    if (sql.includes('SET signed_off_at')) {
      return { rows: [{ version: Number(row.version) + 1 }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO gigalibs_cmms.work_order_events')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO gigalibs_cmms.audit_events')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO gigalibs_cmms.outbox_events')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: { query: typeof query }) => Promise<unknown>) =>
      operation({ query }),
    ),
  } as unknown as DatabaseService;
  const orders = new WorkOrdersService(database, {} as AssetsService, {} as PartsService);
  vi.spyOn(orders as unknown as { detailWithClient: () => Promise<unknown> }, 'detailWithClient').mockResolvedValue({
    id: workOrderId,
    status: 'COMPLETED',
    signedOffAt: new Date().toISOString(),
    version: Number(row.version) + 1,
  });
  return { orders, query };
}

describe('WI-OI-120bi work order sign-off', () => {
  it('refuses when the work order is not completed', async () => {
    const { orders } = serviceForRow(baseRow({ status: 'IN_PROGRESS' }));
    await expect(orders.signOff(context, workOrderId, { expectedVersion: 2, note: 'Checked on site.' })).rejects.toMatchObject({
      response: { code: 'CMMS_WORK_ORDER_STATE' },
    });
  });

  it('refuses when already signed off', async () => {
    const { orders } = serviceForRow(
      baseRow({ signed_off_at: new Date(), signed_off_by: supervisor, sign_off_note: 'Done' }),
    );
    await expect(orders.signOff(context, workOrderId, { expectedVersion: 2, note: 'Again' })).rejects.toMatchObject({
      response: { code: 'CMMS_WORK_ORDER_SIGNED_OFF' },
    });
  });

  it('refuses four-eyes when the signer completed the work', async () => {
    const techContext: CmmsCommandContext = {
      principal: { ...plannerPrincipal, subject: technician } as CmmsPrincipal,
      correlationId: 'four-eyes',
    };
    const { orders } = serviceForRow(baseRow());
    await expect(orders.signOff(techContext, workOrderId, { expectedVersion: 2, note: 'Self sign-off' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('records sign-off, bumps version, and writes audit/outbox facts', async () => {
    const { orders, query } = serviceForRow(baseRow());
    await orders.signOff(context, workOrderId, { expectedVersion: 2, note: 'Checked on site.' });
    const updateCall = query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('SET signed_off_at'));
    expect(updateCall).toBeTruthy();
    const outboxCall = query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('outbox_events'));
    expect(outboxCall).toBeTruthy();
    const auditCall = query.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('audit_events'));
    expect(auditCall).toBeTruthy();
  });

  it('refuses further changes after sign-off', async () => {
    const { orders } = serviceForRow(
      baseRow({ signed_off_at: new Date(), signed_off_by: supervisor, sign_off_note: 'Closed' }),
    );
    await expect(
      orders.changeStatus(context, workOrderId, { expectedVersion: 3, status: 'CANCELLED' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
