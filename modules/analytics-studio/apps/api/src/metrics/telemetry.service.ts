import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface TelemetryChartRecord {
  id: string;
  industryId: string;
  title: string;
  subtitle: string;
  chartType: string;
  family: string;
  isDefault: boolean;
  category: string;
  description: string;
  dimensions: string[];
  tags: string[];
  payload: unknown;
  sourceTable: string;
  lineageSha256: string;
  isLiveDatabaseSynced: boolean;
  syncedAt: string;
}

type TelemetryRow = {
  chart_id: string;
  sector_id: string;
  title: string;
  subtitle: string | null;
  chart_type: string;
  family: string;
  is_default: boolean;
  category: string;
  description: string | null;
  dimensions: string[];
  tags: string[];
  payload: unknown;
  source_table: string;
  lineage_sha256: string;
  updated_at: Date | string;
};

@Injectable()
export class TelemetryService {
  constructor(private readonly db: DatabaseService) {}

  async getTelemetryCharts(tenantId: string): Promise<TelemetryChartRecord[]> {
    const rows = await this.db.queryWithTenant<TelemetryRow>(
      tenantId,
      `SELECT chart_id, sector_id, title, subtitle, chart_type, family, is_default,
              category, description, dimensions, tags, payload, source_table,
              lineage_sha256, updated_at
       FROM gigalibs_analytics.telemetry_series
       WHERE tenant_id = $1
       ORDER BY recorded_at ASC`,
      [tenantId],
    );

    return rows.rows.map((row) => ({
      id: row.chart_id,
      industryId: row.sector_id,
      title: row.title,
      subtitle: row.subtitle ?? '',
      chartType: row.chart_type,
      family: row.family,
      isDefault: row.is_default,
      category: row.category,
      description: row.description ?? '',
      dimensions: Array.isArray(row.dimensions) ? row.dimensions : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      payload: row.payload,
      sourceTable: row.source_table,
      lineageSha256: row.lineage_sha256,
      // Stored chart metadata does not prove a source sync. WI-OI-043 will
      // derive this state from durable ingestion evidence.
      isLiveDatabaseSynced: false,
      syncedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
    }));
  }

  async getTelemetryChartById(
    tenantId: string,
    chartId: string,
  ): Promise<TelemetryChartRecord | null> {
    const charts = await this.getTelemetryCharts(tenantId);
    return charts.find((chart) => chart.id === chartId) ?? null;
  }
}
