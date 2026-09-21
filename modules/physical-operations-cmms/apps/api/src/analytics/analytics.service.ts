import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getWorkOrderOverview(tenantId: string, departmentIds?: readonly string[]) {
    const conditions: string[] = ['tenant_id = $1', 'NOT is_deleted'];
    const values: unknown[] = [tenantId];
    let idx = 2;
    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
         COUNT(*) FILTER (WHERE status = 'OPEN') AS open_count,
         COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'ON_HOLD') AS on_hold_count,
         COUNT(*) FILTER (WHERE priority = 'EMERGENCY' AND status NOT IN ('COMPLETED', 'CANCELLED')) AS active_emergencies,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('COMPLETED', 'CANCELLED')) AS overdue_count,
         COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600) FILTER (WHERE status = 'COMPLETED' AND started_at IS NOT NULL), 0) AS avg_cycle_time_hours
       FROM gigalibs_cmms.work_orders
       WHERE ${conditions.join(' AND ')}`,
      values,
    );
    const row = result.rows[0];
    return {
      completedCount: Number(row.completed_count),
      openCount: Number(row.open_count),
      inProgressCount: Number(row.in_progress_count),
      onHoldCount: Number(row.on_hold_count),
      activeEmergencies: Number(row.active_emergencies),
      overdueCount: Number(row.overdue_count),
      avgCycleTimeHours: Math.round(Number(row.avg_cycle_time_hours) * 10) / 10,
    };
  }

  async getAssetReliability(tenantId: string, departmentIds?: readonly string[]) {
    const deptClause = (departmentIds && departmentIds.length > 0)
      ? ` AND (a.department_id IS NULL OR a.department_id = ANY($2::uuid[]))`
      : '';
    const deptValues = (departmentIds && departmentIds.length > 0) ? [departmentIds] : [];
    const [assets, aggregate] = await Promise.all([
      this.db.queryWithTenant(
        tenantId,
      `SELECT
         a.id, a.name, a.criticality, a.status,
         COUNT(d.id) AS downtime_incidents,
         COALESCE(SUM(d.duration_hours), 0) AS total_downtime_hours
       FROM gigalibs_cmms.assets a
       LEFT JOIN gigalibs_cmms.asset_downtimes d ON d.tenant_id = a.tenant_id AND d.asset_id = a.id
       WHERE a.tenant_id = $1 AND NOT a.is_deleted${deptClause}
       GROUP BY a.id, a.name, a.criticality, a.status
       ORDER BY total_downtime_hours DESC
       LIMIT 10`,
      [tenantId, ...deptValues],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT
           COUNT(DISTINCT a.id) AS total_assets,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'OPERATIONAL') AS operational_assets,
           COALESCE(
             AVG(d.duration_hours) FILTER (
               WHERE d.ended_at IS NOT NULL AND d.duration_hours > 0
             ),
             0
           ) AS overall_mttr_hours,
           MAX(GREATEST(a.updated_at, COALESCE(d.updated_at, a.updated_at))) AS data_through
         FROM gigalibs_cmms.assets a
         LEFT JOIN gigalibs_cmms.asset_downtimes d
           ON d.tenant_id = a.tenant_id AND d.asset_id = a.id
         WHERE a.tenant_id = $1 AND NOT a.is_deleted${deptClause}`,
        [tenantId, ...deptValues],
      ),
    ]);

    const summary = aggregate.rows[0];

    return {
      totalAssets: Number(summary?.total_assets ?? 0),
      operationalAssetsCount: Number(summary?.operational_assets ?? 0),
      overallMttrHours: Math.round(Number(summary?.overall_mttr_hours ?? 0) * 10) / 10,
      assetsWithMostDowntime: assets.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        criticality: r.criticality,
        status: r.status,
        downtimeIncidents: Number(r.downtime_incidents),
        totalDowntimeHours: Number(r.total_downtime_hours),
      })),
      provenance: {
        source: 'gigalibs_cmms.assets+asset_downtimes',
        generatedAt: new Date().toISOString(),
        dataThrough: summary?.data_through
          ? new Date(summary.data_through).toISOString()
          : null,
        unavailableMetrics: ['overallMtbfHours', 'overallAvailabilityPercent', 'ravRatioPercent'],
      },
    };
  }

  async getInventorySummary(tenantId: string, departmentIds?: readonly string[]) {
    const conditions: string[] = ['tenant_id = $1', 'NOT is_deleted'];
    const values: unknown[] = [tenantId];
    let idx = 2;
    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT
         COUNT(*) AS total_parts,
         COUNT(*) FILTER (WHERE quantity_on_hand <= COALESCE(reorder_point, min_quantity)) AS low_stock_count,
         COALESCE(SUM(quantity_on_hand * COALESCE(unit_cost, 0)), 0) AS total_inventory_valuation
       FROM gigalibs_cmms.parts
       WHERE ${conditions.join(' AND ')}`,
      values,
    );
    const row = result.rows[0];
    return {
      totalParts: Number(row.total_parts),
      lowStockCount: Number(row.low_stock_count),
      totalInventoryValuation: Number(row.total_inventory_valuation),
    };
  }
}
