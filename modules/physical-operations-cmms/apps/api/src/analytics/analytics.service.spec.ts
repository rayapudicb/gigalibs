/** WI-OI-038 — overview metrics are scoped, per currency and null when unknown. */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { AnalyticsService } from './analytics.service.js';

const scoped = {
  tenantId: 'tenant-a',
  subject: 'user-1',
  departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['dept-a'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;

function serviceReturning(rows: Record<string, unknown>[][]) {
  const query = vi.fn(async () => ({ rows: rows.shift() ?? [] }));
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) => operation({ query })),
  } as unknown as DatabaseService;
  return { service: new AnalyticsService(database), query };
}

describe('CMMS AnalyticsService', () => {
  it('returns a null cycle time when nothing was completed and applies department scope', async () => {
    const { service, query } = serviceReturning([
      [{ open_count: 2, in_progress_count: 1, on_hold_count: 0, completed_30: 0, emergencies: 0, overdue_count: 1, average_cycle_hours: null }],
    ]);
    const overview = await service.workOrderOverview(scoped);
    expect(overview).toMatchObject({ openCount: 2, overdueCount: 1, averageCycleHours: null });
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('department_id = ANY($2::text[])');
    expect(values).toEqual(['tenant-a', ['dept-a']]);
  });

  it('reports valuation per currency without summing currencies together', async () => {
    const { service } = serviceReturning([
      [{ total_parts: 3, low_stock: 1, unvalued: 1 }],
      [
        { currency_code: 'EUR', amount: '120.50' },
        { currency_code: 'USD', amount: '75.00' },
      ],
    ]);
    const summary = await service.inventorySummary(scoped);
    expect(summary.valuation).toEqual([
      { currencyCode: 'EUR', amount: 120.5 },
      { currencyCode: 'USD', amount: 75 },
    ]);
    expect(summary).toMatchObject({ totalParts: 3, lowStockCount: 1, unvaluedParts: 1 });
  });
});
