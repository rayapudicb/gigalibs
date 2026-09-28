import { Injectable } from '@nestjs/common';
import type { CmmsInventorySummaryV1, CmmsWorkOrderOverviewV1 } from '@gigalibs/contracts';
import type { CmmsPrincipal } from '../auth/authorization.js';
import { scopePredicates } from '../auth/scope.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * Source-derived maintenance counts within the caller's scope. Definitions: overdue = active with due_at in
 * the past; cycle time = completed_at - started_at over work completed in the last 90 days; valuation =
 * quantity on hand x standard unit cost, per currency (never summed across currencies). Unknown stays null.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async workOrderOverview(principal: CmmsPrincipal): Promise<CmmsWorkOrderOverviewV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['tenant_id = $1', ...scopePredicates(principal, values)];
      const result = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress_count,
           COUNT(*) FILTER (WHERE status = 'ON_HOLD')::int AS on_hold_count,
           COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completed_at >= now() - interval '30 days')::int AS completed_30,
           COUNT(*) FILTER (WHERE priority = 'EMERGENCY' AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD'))::int AS emergencies,
           COUNT(*) FILTER (WHERE due_at < now() AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD'))::int AS overdue_count,
           AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600.0)
             FILTER (WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at >= now() - interval '90 days')
             AS average_cycle_hours
         FROM gigalibs_cmms.work_orders
         WHERE ${where.join(' AND ')}`,
        values,
      );
      const row = result.rows[0];
      return {
        openCount: row.open_count,
        inProgressCount: row.in_progress_count,
        onHoldCount: row.on_hold_count,
        completedLast30Days: row.completed_30,
        activeEmergencies: row.emergencies,
        overdueCount: row.overdue_count,
        averageCycleHours:
          row.average_cycle_hours === null ? null : Math.round(Number(row.average_cycle_hours) * 10) / 10,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async inventorySummary(principal: CmmsPrincipal): Promise<CmmsInventorySummaryV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['tenant_id = $1', 'archived_at IS NULL', ...scopePredicates(principal, values)];
      const [counts, valuation] = await Promise.all([
        client.query(
          `SELECT COUNT(*)::int AS total_parts,
                  COUNT(*) FILTER (WHERE NOT non_stock AND quantity_on_hand <= COALESCE(reorder_point, min_quantity))::int AS low_stock,
                  COUNT(*) FILTER (WHERE NOT non_stock AND unit_cost IS NULL)::int AS unvalued
             FROM gigalibs_cmms.parts WHERE ${where.join(' AND ')}`,
          values,
        ),
        client.query(
          `SELECT currency_code, ROUND(SUM(quantity_on_hand * unit_cost), 2) AS amount
             FROM gigalibs_cmms.parts
            WHERE ${where.join(' AND ')} AND NOT non_stock AND unit_cost IS NOT NULL
            GROUP BY currency_code
            ORDER BY currency_code`,
          values,
        ),
      ]);
      return {
        totalParts: counts.rows[0].total_parts,
        lowStockCount: counts.rows[0].low_stock,
        valuation: valuation.rows.map((row) => ({ currencyCode: row.currency_code, amount: Number(row.amount) })),
        unvaluedParts: counts.rows[0].unvalued,
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
