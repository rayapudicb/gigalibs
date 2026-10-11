/**
 * WI-OI-120ab (R5 CMMS slice 2): Transaction-local legacy scope tests for
 * meters, meter triggers, and telemetry reading batches.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { MetersService } from './meters.service.js';

const meterId = '550e8400-e29b-41d4-a716-446655440021';
const triggerId = '550e8400-e29b-41d4-a716-446655440022';
const northSite = '550e8400-e29b-41d4-a716-446655440023';
const southSite = '550e8400-e29b-41d4-a716-446655440024';

const departmentPrincipal = {
  tenantId: 'tenant-a',
  subject: 'worker-dept',
  departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north-dept'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;

const placePrincipal = {
  tenantId: 'tenant-a',
  subject: 'worker-place',
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'PLACES', placeIds: [northSite] },
} as unknown as CmmsPrincipal;

const context = (principal: CmmsPrincipal): CmmsCommandContext => ({
  principal,
  correlationId: 'r5-slice2-meters-proof',
});

function serviceWithQuery(query: ReturnType<typeof vi.fn>) {
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) =>
      operation({ query }),
    ),
  } as unknown as DatabaseService;
  const assets = {} as AssetsService;
  const workOrders = {} as WorkOrdersService;
  return new MetersService(database, assets, workOrders);
}

describe('WI-OI-120ab Meters & Triggers legacy-scope boundary', () => {
  describe('Meter Triggers CRUD Scope Enforcement', () => {
    it('filters listTriggers with joins on meters and assets with scope predicates', async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const service = serviceWithQuery(query);
      await service.listTriggers(placePrincipal, meterId);
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('JOIN gigalibs_cmms.meters m ON m.tenant_id = t.tenant_id AND m.id = t.meter_id');
      expect(sql).toContain('JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id');
      expect(sql).toContain('a.site_ref = ANY($2::uuid[])');
      expect(sql).toContain('t.meter_id = $3');
      expect(values).toEqual(['tenant-a', [northSite], meterId]);
    });

    it('refuses createTrigger when parent asset is outside caller place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT m.id, a.department_id, a.site_ref')) {
          // Meter exists on southSite asset
          return {
            rows: [{ id: meterId, department_id: null, site_ref: southSite }],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.createTrigger(context(placePrincipal), {
          meterId,
          triggerType: 'THRESHOLD_BREACH',
          thresholdType: 'UPPER',
          thresholdValue: 100,
          workOrderTitle: 'Overheat PM',
          workOrderPriority: 'HIGH',
          isActive: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses createTrigger when parent asset is outside caller department scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT m.id, a.department_id, a.site_ref')) {
          return {
            rows: [{ id: meterId, department_id: 'south-dept', site_ref: northSite }],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.createTrigger(context(departmentPrincipal), {
          meterId,
          triggerType: 'THRESHOLD_BREACH',
          thresholdType: 'UPPER',
          thresholdValue: 100,
          workOrderTitle: 'Overheat PM',
          workOrderPriority: 'HIGH',
          isActive: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses updateTrigger when current trigger parent asset is outside place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT t.*, jp.title AS job_plan_title')) {
          return {
            rows: [
              {
                id: triggerId,
                meter_id: meterId,
                trigger_type: 'THRESHOLD_BREACH',
                threshold_type: 'UPPER',
                threshold_value: '100',
                interval_value: null,
                job_plan_id: null,
                work_order_title: 'High Pressure Alert',
                work_order_priority: 'HIGH',
                is_active: true,
                version: 1,
                created_by: 'admin',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                asset_department_id: null,
                asset_site_ref: southSite, // out of place scope
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.updateTrigger(context(placePrincipal), triggerId, {
          expectedVersion: 1,
          thresholdValue: 120,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses deleteTrigger when current trigger parent asset is outside place scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('SELECT t.*, jp.title AS job_plan_title')) {
          return {
            rows: [
              {
                id: triggerId,
                meter_id: meterId,
                trigger_type: 'THRESHOLD_BREACH',
                threshold_type: 'UPPER',
                threshold_value: '100',
                interval_value: null,
                job_plan_id: null,
                work_order_title: 'High Pressure Alert',
                work_order_priority: 'HIGH',
                is_active: true,
                version: 1,
                created_by: 'admin',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                asset_department_id: null,
                asset_site_ref: southSite, // out of place scope
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(service.deleteTrigger(context(placePrincipal), triggerId)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('Telemetry Batch Ingestion Scope Enforcement', () => {
    const validRequestKey1 = '550e8400-e29b-41d4-a716-446655440031';
    const validRequestKey2 = '550e8400-e29b-41d4-a716-446655440032';
    const validRequestKey3 = '550e8400-e29b-41d4-a716-446655440033';

    it('refuses telemetry batch ingestion when a reading targets a meter at an out-of-scope site', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('FOR UPDATE OF m')) {
          // Scope predicates on a. excluded this meter row
          return { rows: [] };
        }
        if (sql.includes('SELECT a.department_id, a.site_ref')) {
          // Tenant-level check finds the meter belongs to southSite
          return {
            rows: [{ department_id: null, site_ref: southSite }],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.recordBatchReadings(context(placePrincipal), {
          source: 'IOT_TELEMETRY',
          readings: [
            {
              meterId,
              value: 42.5,
              requestKey: validRequestKey1,
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('refuses telemetry batch ingestion when a reading targets a meter in an out-of-scope department', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('FOR UPDATE OF m')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT a.department_id, a.site_ref')) {
          return {
            rows: [{ department_id: 'south-dept', site_ref: northSite }],
          };
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      await expect(
        service.recordBatchReadings(context(departmentPrincipal), {
          source: 'IOT_TELEMETRY',
          readings: [
            {
              meterId,
              value: 42.5,
              requestKey: validRequestKey2,
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('processes batch readings when all target meters are within caller authorized scope', async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('FOR UPDATE OF m')) {
          return {
            rows: [
              {
                id: meterId,
                asset_id: 'asset-01',
                asset_department_id: 'north-dept',
                asset_site_ref: northSite,
                last_value: null,
                last_read_at: null,
                min_threshold: null,
                max_threshold: null,
                reading_type: 'GAUGE',
              },
            ],
          };
        }
        if (sql.includes('SELECT id FROM gigalibs_cmms.meter_readings WHERE')) {
          return { rows: [] }; // No replay
        }
        if (sql.includes('INSERT INTO gigalibs_cmms.meter_readings')) {
          return {
            rows: [
              {
                id: 'reading-01',
                meter_id: meterId,
                value: '42.5',
                read_at: new Date().toISOString(),
                source: 'IOT_TELEMETRY',
                recorded_by: 'worker-place',
                recorded_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (sql.includes('UPDATE gigalibs_cmms.meters')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT t.*, jp.title AS job_plan_title FROM gigalibs_cmms.cmms_meter_triggers')) {
          return { rows: [] }; // No triggers
        }
        return { rows: [] };
      });
      const service = serviceWithQuery(query);
      const res = await service.recordBatchReadings(context(placePrincipal), {
        source: 'IOT_TELEMETRY',
        readings: [
          {
            meterId,
            value: 42.5,
            requestKey: validRequestKey3,
          },
        ],
      });
      expect(res.processedCount).toBe(1);
      expect(res.triggeredWorkOrderIds).toEqual([]);
    });
  });
});
