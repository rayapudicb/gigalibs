import {
  type WfoDemandForecastRecordV1,
  type WfoForecastQueryV1,
  type WfoPositionsGapV1,
  type WfoUtilisationReportV1,
  WfoForecastQueryV1Schema,
} from '@gigalibs/contracts';
import {
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoForecastingService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async getForecast(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoDemandForecastRecordV1[]> {
    const query: WfoForecastQueryV1 = WfoForecastQueryV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let sql = `
        SELECT
          id,
          tenant_id as "tenantId",
          org_unit_id as "orgUnitId",
          skill_id as "skillId",
          forecast_date::text as "forecastDate",
          demand_units::float as "demandUnits",
          filled_units::float as "filledUnits",
          confidence_pct as "confidencePct",
          source,
          notes,
          calculated_at as "calculatedAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM gigalibs_workforce.wfo_demand_forecast
        WHERE tenant_id = $1
          AND forecast_date BETWEEN $2::date AND $3::date
      `;
      const params: unknown[] = [principal.tenantId, query.startDate, query.endDate];

      if (query.orgUnitId) {
        params.push(query.orgUnitId);
        sql += ` AND org_unit_id = $${params.length}`;
      }
      if (query.skillId) {
        params.push(query.skillId);
        sql += ` AND skill_id = $${params.length}`;
      }

      sql += ` ORDER BY forecast_date ASC, org_unit_id ASC`;

      const res = await client.query(sql, params);

      if (res.rows.length > 0) {
        return res.rows;
      }

      // If no persisted forecast entries exist yet for this range, project from positions
      return this.projectDynamicForecast(client, principal.tenantId, query);
    });
  }

  async getGaps(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoPositionsGapV1[]> {
    const forecasts = await this.getForecast(principal, input);

    return forecasts.map((f) => {
      const demand = f.demandUnits;
      const filled = f.filledUnits;
      const gap = Number((demand - filled).toFixed(2));
      const fillRatePct = demand > 0 ? Number(((filled / demand) * 100).toFixed(1)) : 100;

      let status: 'CRITICAL_GAP' | 'MODERATE_GAP' | 'OPTIMAL' | 'OVERSTAFFED' = 'OPTIMAL';
      if (gap > 5) {
        status = 'CRITICAL_GAP';
      } else if (gap > 0) {
        status = 'MODERATE_GAP';
      } else if (gap < 0) {
        status = 'OVERSTAFFED';
      }

      return {
        forecastDate: f.forecastDate,
        orgUnitId: f.orgUnitId,
        skillId: f.skillId,
        demandUnits: demand,
        filledUnits: filled,
        gapUnits: gap,
        fillRatePct,
        status,
      };
    });
  }

  async getUtilisation(
    principal: GigaOpsPrincipal,
    orgUnitId?: string,
    period = 'CURRENT_WEEK',
  ): Promise<WfoUtilisationReportV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const targetUnit = orgUnitId || 'GLOBAL';

      // Count active workers
      const workersRes = await client.query(
        `SELECT COUNT(*)::int as count
         FROM gigalibs_workforce.wfo_workers
         WHERE tenant_id = $1 AND lifecycle_status = 'ACTIVE'`,
        [principal.tenantId],
      );
      const headcountActive = workersRes.rows[0]?.count || 0;

      // Weekly capacity: 40 hours per worker
      const totalCapacityHours = headcountActive * 40;

      // Scheduled hours from bookings
      const bookingsRes = await client.query(
        `SELECT COUNT(*)::int as bookings_count
         FROM gigalibs_workforce.bookings
         WHERE tenant_id = $1 AND status IN ('CONFIRMED', 'DISPATCHED', 'ON_SITE', 'COMPLETED')`,
        [principal.tenantId],
      );
      const scheduledHours = (bookingsRes.rows[0]?.bookings_count || 0) * 8; // approx 8h/shift
      const actualHours = Number((scheduledHours * 0.95).toFixed(1));

      const utilisationPct = totalCapacityHours > 0
        ? Number(((scheduledHours / totalCapacityHours) * 100).toFixed(1))
        : 0;

      return {
        orgUnitId: targetUnit,
        period,
        totalCapacityHours,
        scheduledHours,
        actualHours,
        utilisationPct,
        headcountActive,
      };
    });
  }

  async recalculateForecast(
    principal: GigaOpsPrincipal,
    params: { orgUnitId?: string; source?: 'HISTORICAL' | 'CONNECTOR_PULL' | 'AI_MODEL' | 'MANUAL'; horizonDays?: number },
  ) {
    const horizon = params.horizonDays || 30;
    const source = params.source || 'HISTORICAL';
    const orgUnitId = params.orgUnitId || 'DEFAULT_ORG_UNIT';

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Calculate demand baseline from active positions
      const positionsRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 10)::int as required_qty,
                COALESCE(SUM(filled), 7)::int as filled_qty
         FROM gigalibs_workforce.wfo_engagement_positions
         WHERE tenant_id = $1 AND status = 'OPEN'`,
        [principal.tenantId],
      );
      const reqQty = Number(positionsRes.rows[0]?.required_qty || 10);
      const fillQty = Number(positionsRes.rows[0]?.filled_qty || 7);

      const generated = [];
      const today = new Date();

      for (let i = 0; i < horizon; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);

        // slight variance per day for realistic projection
        const dayVariance = (i % 7 >= 5) ? 0.6 : 1.0;
        const demandUnits = Math.round(reqQty * dayVariance);
        const filledUnits = Math.min(demandUnits, Math.round(fillQty * dayVariance));

        const res = await client.query(
          `INSERT INTO gigalibs_workforce.wfo_demand_forecast (
            tenant_id, org_unit_id, forecast_date, demand_units, filled_units, confidence_pct, source, notes
          ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, org_unit_id, forecast_date, skill_id)
          DO UPDATE SET demand_units = EXCLUDED.demand_units,
                        filled_units = EXCLUDED.filled_units,
                        calculated_at = now(),
                        updated_at = now()
          RETURNING id, tenant_id as "tenantId", org_unit_id as "orgUnitId",
                    forecast_date::text as "forecastDate", demand_units::float as "demandUnits",
                    filled_units::float as "filledUnits", confidence_pct as "confidencePct",
                    source, calculated_at as "calculatedAt"`,
          [principal.tenantId, orgUnitId, dateStr, demandUnits, filledUnits, 90, source, 'Recalculated forecast batch'],
        );
        generated.push(res.rows[0]);
      }

      return {
        status: 'SUCCESS',
        recalculatedDays: generated.length,
        orgUnitId,
        source,
        items: generated,
      };
    });
  }

  private async projectDynamicForecast(
    client: PoolClient,
    tenantId: string,
    query: WfoForecastQueryV1,
  ): Promise<WfoDemandForecastRecordV1[]> {
    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    const records: WfoDemandForecastRecordV1[] = [];
    const orgUnitId = query.orgUnitId || 'DEFAULT_ORG_UNIT';

    // Baseline count from positions
    const posRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 12)::int as total_qty, COALESCE(SUM(filled), 8)::int as filled_qty
       FROM gigalibs_workforce.wfo_engagement_positions
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const baseDemand = Number(posRes.rows[0]?.total_qty || 12);
    const baseFilled = Number(posRes.rows[0]?.filled_qty || 8);

    const curr = new Date(start);
    while (curr <= end && records.length < 90) {
      const dateStr = curr.toISOString().slice(0, 10);
      const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
      const dayDemand = isWeekend ? Math.round(baseDemand * 0.5) : baseDemand;
      const dayFilled = isWeekend ? Math.round(baseFilled * 0.5) : baseFilled;

      records.push({
        id: '00000000-0000-0000-0000-000000000000',
        tenantId,
        orgUnitId,
        skillId: query.skillId || null,
        forecastDate: dateStr,
        demandUnits: dayDemand,
        filledUnits: dayFilled,
        confidencePct: 85,
        source: 'HISTORICAL',
        notes: 'Dynamic forecast projection based on active positions',
        calculatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      curr.setDate(curr.getDate() + 1);
    }

    return records;
  }
}
