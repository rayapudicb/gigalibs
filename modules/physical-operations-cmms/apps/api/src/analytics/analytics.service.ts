import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

// Observation window for OEE/reliability metrics: rolling 90 days.
// Using a fixed window avoids division-by-zero for recently commissioned assets
// while keeping the numbers representative. Window is returned in the provenance
// block so callers can display the qualifying period to end-users.
const OEE_WINDOW_DAYS = 90;

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
    const windowHours = OEE_WINDOW_DAYS * 24;

    const [assets, aggregate] = await Promise.all([
      // Per-asset summary: downtime incidents and total hours in window
      this.db.queryWithTenant(
        tenantId,
        `SELECT
           a.id, a.name, a.criticality, a.status,
           COUNT(d.id) FILTER (WHERE d.started_at >= NOW() - INTERVAL '${OEE_WINDOW_DAYS} days') AS downtime_incidents,
           COALESCE(
             SUM(d.duration_hours) FILTER (WHERE d.started_at >= NOW() - INTERVAL '${OEE_WINDOW_DAYS} days'),
             0
           ) AS total_downtime_hours
         FROM gigalibs_cmms.assets a
         LEFT JOIN gigalibs_cmms.asset_downtimes d ON d.tenant_id = a.tenant_id AND d.asset_id = a.id
         WHERE a.tenant_id = $1 AND NOT a.is_deleted${deptClause}
         GROUP BY a.id, a.name, a.criticality, a.status
         ORDER BY total_downtime_hours DESC
         LIMIT 10`,
        [tenantId, ...deptValues],
      ),

      // Fleet-wide OEE aggregate
      // MTBF = (window_hours - total_unplanned_downtime_hours) / unplanned_failure_count
      //   — only UNPLANNED downtimes count as failures for MTBF
      // Availability = (window_hours - total_all_downtime_hours) / window_hours * 100
      //   — all downtime (planned + unplanned) reduces availability
      // RAV ratio = operational_assets / total_assets * 100
      //   — Reliability-Availability proxy using current asset status
      this.db.queryWithTenant(
        tenantId,
        `WITH asset_set AS (
           SELECT a.id, a.status,
                  a.created_at AS commissioned_at,
                  a.updated_at
           FROM gigalibs_cmms.assets a
           WHERE a.tenant_id = $1 AND NOT a.is_deleted${deptClause}
         ),
         downtime_window AS (
           SELECT d.asset_id,
                  d.downtime_status,
                  d.duration_hours,
                  d.ended_at
           FROM gigalibs_cmms.asset_downtimes d
           WHERE d.tenant_id = $1
             AND d.started_at >= NOW() - INTERVAL '${OEE_WINDOW_DAYS} days'
             AND d.ended_at IS NOT NULL
         ),
         fleet AS (
           SELECT
             COUNT(DISTINCT s.id)                                    AS total_assets,
             COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'OPERATIONAL') AS operational_assets,
             -- MTTR: mean time to restore (average per-incident downtime, all types)
             COALESCE(
               AVG(w.duration_hours) FILTER (WHERE w.duration_hours > 0),
               0
             )                                                        AS overall_mttr_hours,
             -- Total downtime for availability
             COALESCE(SUM(w.duration_hours), 0)                       AS total_downtime_hours,
             -- Unplanned failure count (for MTBF numerator)
             COUNT(w.asset_id) FILTER (WHERE w.downtime_status = 'UNPLANNED') AS unplanned_failure_count,
             -- Unplanned downtime hours (subtracted from window for uptime)
             COALESCE(
               SUM(w.duration_hours) FILTER (WHERE w.downtime_status = 'UNPLANNED'),
               0
             )                                                        AS unplanned_downtime_hours,
             MAX(GREATEST(s.updated_at, COALESCE(w.ended_at, s.updated_at))) AS data_through
           FROM asset_set s
           LEFT JOIN downtime_window w ON w.asset_id = s.id
         )
         SELECT
           total_assets,
           operational_assets,
           overall_mttr_hours,
           total_downtime_hours,
           unplanned_failure_count,
           unplanned_downtime_hours,
           data_through,
           -- MTBF (hours): uptime / failure count; null when no failures recorded
           CASE WHEN unplanned_failure_count > 0
             THEN ROUND(
               (${windowHours}::numeric - unplanned_downtime_hours) / unplanned_failure_count,
               1
             )
             ELSE NULL
           END AS overall_mtbf_hours,
           -- Availability (%): uptime fraction over observation window
           CASE WHEN total_assets > 0
             THEN ROUND(
               (${windowHours}::numeric - total_downtime_hours) / ${windowHours}::numeric * 100,
               2
             )
             ELSE NULL
           END AS overall_availability_percent,
           -- RAV ratio (%): operational assets / total assets
           CASE WHEN total_assets > 0
             THEN ROUND(
               operational_assets::numeric / total_assets::numeric * 100,
               2
             )
             ELSE NULL
           END AS rav_ratio_percent
         FROM fleet`,
        [tenantId, ...deptValues],
      ),
    ]);

    const summary = aggregate.rows[0];
    const totalAssets = Number(summary?.total_assets ?? 0);
    const overallMtbfHours = summary?.overall_mtbf_hours != null
      ? Number(summary.overall_mtbf_hours) : null;
    const overallAvailabilityPercent = summary?.overall_availability_percent != null
      ? Number(summary.overall_availability_percent) : null;
    const ravRatioPercent = summary?.rav_ratio_percent != null
      ? Number(summary.rav_ratio_percent) : null;

    return {
      totalAssets,
      operationalAssetsCount: Number(summary?.operational_assets ?? 0),
      overallMttrHours: Math.round(Number(summary?.overall_mttr_hours ?? 0) * 10) / 10,
      // OEE metrics — now live from gigalibs_cmms.asset_downtimes
      overallMtbfHours,
      overallAvailabilityPercent,
      ravRatioPercent,
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
        observationWindowDays: OEE_WINDOW_DAYS,
        generatedAt: new Date().toISOString(),
        dataThrough: summary?.data_through
          ? new Date(summary.data_through).toISOString()
          : null,
        // null = insufficient data (no downtime incidents recorded yet)
        mtbfNote: overallMtbfHours === null
          ? 'No unplanned downtime incidents recorded in the observation window.'
          : undefined,
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
