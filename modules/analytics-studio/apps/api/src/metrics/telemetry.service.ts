import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
  payload: any;
  sourceTable: string;
  lineageSha256: string;
  isLiveDatabaseSynced: boolean;
  syncedAt: string;
}

@Injectable()
export class TelemetryService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSchema();
      this.logger.log('Telemetry series table verified in gigalibs_analytics schema');
    } catch (err) {
      this.logger.error('Failed to initialize telemetry series schema', err);
    }
  }

  private async ensureSchema(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS gigalibs_analytics.telemetry_series (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        chart_id VARCHAR(64) NOT NULL,
        sector_id VARCHAR(32) NOT NULL,
        title VARCHAR(128) NOT NULL,
        subtitle VARCHAR(256),
        chart_type VARCHAR(32) NOT NULL,
        family VARCHAR(32) NOT NULL,
        category VARCHAR(32) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        description TEXT,
        dimensions JSONB NOT NULL DEFAULT '[]',
        tags JSONB NOT NULL DEFAULT '[]',
        payload JSONB NOT NULL DEFAULT '{}',
        source_table VARCHAR(128) NOT NULL DEFAULT 'gigalibs_analytics.telemetry_series',
        lineage_sha256 VARCHAR(64) NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_analytics_tenant_chart UNIQUE (tenant_id, chart_id)
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_series_tenant_sector ON gigalibs_analytics.telemetry_series(tenant_id, sector_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_series_tenant_chart ON gigalibs_analytics.telemetry_series(tenant_id, chart_id);
    `;
    await this.db.query(sql);
  }

  async getTelemetryCharts(tenantId: string): Promise<TelemetryChartRecord[]> {
    try {
      // CONTAINED_P0: production seeding removed — ensureTenantSeriesSeeded() inserted
      // 36 hardcoded industry telemetry records into the analytics database for every
      // tenant. That is fabricated data in production routing. Seeding must only occur
      // in certified test environments, never in production-routed code paths.
      // CONTAINED_P0: cross-module metric refresh removed — refreshFinOpsLiveMetrics()
      // read gigalibs_platform.billing_invoices, gigalibs_spend.expenses and
      // gigalibs_recovery.detected_leaks with hardcoded numeric fallbacks
      // ($12,500,000 / $5,940,000 / $301,410) that were returned when queries failed.
      // These reads violate the platform contract; fallback numbers are fabricated data.

      const rows = await this.db.query(
        `SELECT * FROM gigalibs_analytics.telemetry_series
         WHERE tenant_id = $1
         ORDER BY recorded_at ASC`,
        [tenantId],
      );

      if (rows && rows.rows && rows.rows.length > 0) {
        return rows.rows.map((r) => ({
          id: r.chart_id,
          industryId: r.sector_id,
          title: r.title,
          subtitle: r.subtitle,
          chartType: r.chart_type,
          family: r.family,
          isDefault: r.is_default,
          category: r.category,
          description: r.description,
          dimensions: r.dimensions,
          tags: r.tags,
          payload: r.payload,
          sourceTable: r.source_table,
          lineageSha256: r.lineage_sha256,
          // CONTAINED_P0: unconditional true removed — isLiveDatabaseSynced must
          // reflect the result of a confirmed sync run, not a constant.
          isLiveDatabaseSynced: false,
          syncedAt: r.updated_at,
        }));
      }
    } catch (err) {
      this.logger.error(`PostgreSQL query failed for telemetry series: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    return [];
  }

  async getTelemetryChartById(tenantId: string, chartId: string): Promise<TelemetryChartRecord | null> {
    const charts = await this.getTelemetryCharts(tenantId);
    return charts.find((c) => c.id === chartId) || null;
  }

  // CONTAINED_P0: this method reads gigalibs_platform.billing_invoices,
  // gigalibs_spend.expenses and gigalibs_recovery.detected_leaks — cross-module
  // schemas forbidden by the platform contract. It is no longer called from
  // getTelemetryCharts() but is kept for type compatibility; must be removed
  // entirely once WI-OI-043 Phase 0 containment is accepted.
  private async refreshFinOpsLiveMetrics(tenantId: string): Promise<void> {
    try {
      // 1. Query live AR Revenue
      const arQuery = await this.db.query(
        `SELECT COALESCE(SUM(total_usd), 0)::float AS total_revenue, COUNT(*)::int AS count
         FROM gigalibs_platform.billing_invoices
         WHERE tenant_id = $1::text`,
        [tenantId],
      );
      // CONTAINED_P0: fallback of 12_500_000 removed — a hardcoded dollar amount
      // returned on query failure is fabricated data.
      const totalRevenue = Number(arQuery.rows[0]?.total_revenue) || 0;

      // 2. Query live Spend
      const spendQuery = await this.db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) / 100.0 AS total_spend, COUNT(*)::int AS count
         FROM gigalibs_spend.expenses
         WHERE tenant_id = $1::uuid`,
        [tenantId],
      );
      // CONTAINED_P0: fallback of 5_940_000 removed — hardcoded dollar amount.
      const totalSpend = Number(spendQuery.rows[0]?.total_spend) || 0;

      // 3. Query live Recovery
      const recQuery = await this.db.query(
        `SELECT COALESCE(SUM(amount_minor), 0) / 100.0 AS total_recovery, COUNT(*)::int AS count
         FROM gigalibs_recovery.detected_leaks
         WHERE tenant_id = $1::text`,
        [tenantId],
      );
      // CONTAINED_P0: fallback of 301_410 removed — hardcoded dollar amount.
      const totalRecovery = Number(recQuery.rows[0]?.total_recovery) || 0;

      // Update finops-variance-waterfall with live reconciliation
      const grossMargin = totalRevenue - totalSpend + totalRecovery;
      const waterfallPayload = {
        categories: ['Gross Invoiced', 'COGS Labor', 'Opex Hosting', 'G&A Overhead', 'Recovered Value', 'Net Realized'],
        series: [
          {
            name: 'Cash Contribution',
            data: [
              totalRevenue,
              -Math.round(totalSpend * 0.65),
              -Math.round(totalSpend * 0.25),
              -Math.round(totalSpend * 0.10),
              totalRecovery,
              grossMargin,
            ],
          },
        ],
      };

      const hash = createHash('sha256')
        .update(`${tenantId}:finops-variance-waterfall:${totalRevenue}:${totalSpend}:${totalRecovery}`)
        .digest('hex');

      await this.db.query(
        `UPDATE gigalibs_analytics.telemetry_series
         SET payload = $1,
             source_table = 'gigalibs_ar.invoices + gigalibs_spend.expenses + gigalibs_recovery.detected_leaks',
             lineage_sha256 = $2,
             updated_at = NOW()
         WHERE tenant_id = $3 AND chart_id = 'finops-variance-waterfall'`,
        [JSON.stringify(waterfallPayload), hash, tenantId],
      );
    } catch (err) {
      this.logger.warn(`Could not refresh live FinOps metrics: ${(err as Error).message}`);
    }
  }

  // CONTAINED_P0: ensureTenantSeriesSeeded auto-inserts 36 hardcoded industry
  // telemetry definitions into the production database for any tenant that lacks them.
  // This is fabricated data seeding in a production code path — FORBIDDEN.
  // Method is kept for type compatibility; must not be called from production paths.
  private async ensureTenantSeriesSeeded(tenantId: string): Promise<void> {
    const existing = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM gigalibs_analytics.telemetry_series WHERE tenant_id = $1`,
      [tenantId],
    );
    if (existing.rows[0]?.count >= 36) return;

    this.logger.log(`Seeding 36 industrial telemetry records into PostgreSQL for tenant ${tenantId}`);

    const baseCatalog = getInitialTelemetryDefinitions();
    for (const item of baseCatalog) {
      const sha = createHash('sha256')
        .update(`${tenantId}:${item.id}:${JSON.stringify(item.payload)}`)
        .digest('hex');

      await this.db.query(
        `INSERT INTO gigalibs_analytics.telemetry_series
          (id, tenant_id, chart_id, sector_id, title, subtitle, chart_type, family, category, is_default, description, dimensions, tags, payload, source_table, lineage_sha256, recorded_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
         ON CONFLICT (tenant_id, chart_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW()`,
        [
          `telem_${tenantId.slice(0, 8)}_${item.id}`,
          tenantId,
          item.id,
          item.industryId,
          item.title,
          item.subtitle,
          item.chartType,
          item.family,
          item.category,
          item.isDefault,
          item.description,
          JSON.stringify(item.dimensions),
          JSON.stringify(item.tags),
          JSON.stringify(item.payload),
          'gigalibs_analytics.telemetry_series',
          sha,
        ],
      );
    }
  }
}

function getInitialTelemetryDefinitions() {
  return [
    // 1. Smart Farming & Agriculture
    {
      id: 'farm-silos-temp',
      industryId: 'farming',
      title: 'Silo Temperature & Thermal Inversion',
      subtitle: 'Multi-depth probe telemetry across Silos 1 to 4',
      chartType: 'multiAxisLine',
      family: 'line',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'Continuous thermocouple telemetry measuring grain top, core, and hopper thermal stability.',
      dimensions: ['Time', 'Top Sensor (°C)', 'Core Sensor (°C)', 'Hopper Sensor (°C)'],
      tags: ['Silo', 'Thermocouple', 'Grain Quality', 'Telemetry'],
      payload: {
        categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'],
        series: [
          { name: 'Silo 1 Core Temp (°C)', data: [18.2, 18.1, 18.4, 19.2, 19.8, 19.1, 18.5], color: '#10b981' },
          { name: 'Silo 2 Core Temp (°C)', data: [17.5, 17.4, 17.6, 18.0, 18.4, 18.1, 17.7], color: '#059669' },
          { name: 'Ambient Weather (°C)', data: [12.0, 11.2, 14.5, 23.1, 24.8, 19.0, 14.2], color: '#f59e0b' },
        ],
      },
    },
    {
      id: 'farm-crop-level',
      industryId: 'farming',
      title: 'Crop Inventory & Storage Capacity',
      subtitle: 'Tonnage capacity vs currently filled metric volume',
      chartType: 'comboBarLine',
      family: 'combo',
      isDefault: true,
      category: 'comparison',
      description: 'Radar level sensor readings tracking grain inventory tonnage and fill percentage per storage bin.',
      dimensions: ['Silo Unit', 'Stored Tonnage', 'Max Capacity (T)'],
      tags: ['Inventory', 'Level Sensor', 'Capacity'],
      payload: {
        categories: ['Silo 1 (Wheat)', 'Silo 2 (Corn)', 'Silo 3 (Barley)', 'Silo 4 (Soy)', 'Silo 5 (Oats)', 'Silo 6 (Canola)'],
        barSeries: [
          { name: 'Current Stored (Tons)', data: [1420, 1850, 920, 1640, 780, 1290], color: '#10b981' },
        ],
        lineSeries: [
          { name: 'Capacity Ceiling (Tons)', data: [2000, 2000, 1500, 2000, 1000, 1500], color: '#ef4444' },
        ],
      },
    },
    {
      id: 'farm-storage-status',
      industryId: 'farming',
      title: 'Bulk Storage Utilization by Commodity',
      subtitle: 'Share of total cubic meter warehouse volume',
      chartType: 'donut',
      family: 'circular',
      isDefault: true,
      category: 'composition',
      description: 'Breakdown of agricultural commodities stored across regional dry elevators.',
      dimensions: ['Crop', 'Percentage'],
      tags: ['Commodities', 'Grain', 'Volume'],
      payload: {
        data: [
          { label: 'Yellow Corn #2', value: 38, color: '#f59e0b' },
          { label: 'Hard Red Wheat', value: 28, color: '#10b981' },
          { label: 'Soybeans Grade A', value: 20, color: '#3b82f6' },
          { label: 'Malting Barley', value: 14, color: '#8b5cf6' },
        ],
        total: '7,900 Tons',
      },
    },
    {
      id: 'farm-alarms-gauge',
      industryId: 'farming',
      title: 'Aggregate Facility Risk & Moisture Gauge',
      subtitle: 'Critical spore formation & hot-spot probability index',
      chartType: 'gauge',
      family: 'specialized',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'Predictive mold and spoilage risk algorithm based on grain moisture and temperature differential.',
      dimensions: ['Risk Index', 'Max Scale'],
      tags: ['Safety', 'Risk', 'IoT Alarm'],
      payload: {
        value: 24,
        min: 0,
        max: 100,
        unit: 'Risk Index',
        status: 'Optimal (Low Risk)',
        color: '#10b981',
      },
    },
    {
      id: 'farm-soil-radar',
      industryId: 'farming',
      title: 'Soil Nutrient & Micronutrient Matrix',
      subtitle: 'NPK telemetry across North Sector Precision Plots',
      chartType: 'radar',
      family: 'radar',
      isDefault: false,
      category: 'trends',
      description: 'Multi-parameter soil probe telemetry for nitrogen, phosphorus, potassium, and organic matter.',
      dimensions: ['Parameter', 'Optimal Range', 'Current Reading'],
      tags: ['Soil Probe', 'NPK', 'Nutrients'],
      payload: {
        labels: ['Nitrogen (N)', 'Phosphorus (P)', 'Potassium (K)', 'Moisture %', 'pH Level', 'Organic C'],
        series: [
          { name: 'Current Plot A', data: [85, 72, 90, 64, 78, 88], color: '#10b981' },
          { name: 'Agronomy Target', data: [80, 80, 80, 70, 80, 85], color: '#64748b' },
        ],
      },
    },
    {
      id: 'farm-temp-floating',
      industryId: 'farming',
      title: 'Diurnal Ambient vs Soil Temperature Range',
      subtitle: 'Floating min/max sensor thresholds across 7 days',
      chartType: 'floatingBar',
      family: 'bar',
      isDefault: false,
      category: 'comparison',
      description: 'Floating bar visualization capturing daily minimums and peak daytime highs.',
      dimensions: ['Day', 'Min Temp', 'Max Temp'],
      tags: ['Temperature', 'Diurnal', 'Range'],
      payload: {
        unit: '°C',
        data: [
          { label: 'Mon', min: 11, max: 24, color: '#10b981' },
          { label: 'Tue', min: 13, max: 26, color: '#10b981' },
          { label: 'Wed', min: 10, max: 22, color: '#10b981' },
          { label: 'Thu', min: 14, max: 28, color: '#f59e0b' },
          { label: 'Fri', min: 12, max: 25, color: '#10b981' },
          { label: 'Sat', min: 9, max: 21, color: '#10b981' },
          { label: 'Sun', min: 11, max: 23, color: '#10b981' },
        ],
      },
    },

    // 2. Energy, Utilities & Smart Grid
    {
      id: 'energy-grid-load',
      industryId: 'energy',
      title: 'Substation Megawatt Load Distribution',
      subtitle: 'Real-time active power consumption vs grid reserve margin',
      chartType: 'area',
      family: 'area',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'Continuous megawatt consumption profile capturing morning ramp, mid-day peak, and evening curve.',
      dimensions: ['Time', 'Substation 4A Load (MW)', 'Grid Ceiling (MW)'],
      tags: ['SCADA', 'Grid Load', 'Megawatts'],
      payload: {
        categories: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
        series: [
          { name: 'Active Grid Load (MW)', data: [280, 240, 320, 480, 560, 540, 610, 420], color: '#f59e0b' },
          { name: 'Renewable Feed-in (MW)', data: [80, 70, 110, 260, 310, 290, 140, 90], color: '#10b981' },
        ],
      },
    },
    {
      id: 'energy-demand-combo',
      industryId: 'energy',
      title: 'Peak Demand vs Marginal Cost of Generation',
      subtitle: 'Locational Marginal Price ($/MWh) vs hourly load',
      chartType: 'comboBarLine',
      family: 'combo',
      isDefault: true,
      category: 'comparison',
      description: 'LMP pricing correlation against hourly regional consumption demand.',
      dimensions: ['Hour', 'Megawatts', 'Spot Price ($/MWh)'],
      tags: ['LMP', 'Dispatch', 'Energy Trading'],
      payload: {
        categories: ['H01', 'H04', 'H08', 'H12', 'H16', 'H20', 'H24'],
        barSeries: [
          { name: 'Dispatch Demand (MWh)', data: [310, 260, 490, 620, 580, 640, 390], color: '#f59e0b' },
        ],
        lineSeries: [
          { name: 'Spot LMP ($/MWh)', data: [28.5, 24.1, 46.2, 78.4, 69.1, 92.5, 34.0], color: '#ef4444' },
        ],
      },
    },
    {
      id: 'energy-mix-donut',
      industryId: 'energy',
      title: 'Renewable vs Thermal Generation Fuel Mix',
      subtitle: 'Current dispatch portfolio across regional balancing authority',
      chartType: 'donut',
      family: 'circular',
      isDefault: true,
      category: 'composition',
      description: 'Live generation source breakdown between solar, wind, nuclear, hydro, and natural gas peaking.',
      dimensions: ['Fuel Source', 'Generation Share %'],
      tags: ['Clean Energy', 'Fuel Mix', 'Solar', 'Wind'],
      payload: {
        data: [
          { label: 'Solar Photovoltaic', value: 34, color: '#f59e0b' },
          { label: 'Offshore & Terrestrial Wind', value: 24, color: '#3b82f6' },
          { label: 'Nuclear Baseload', value: 20, color: '#8b5cf6' },
          { label: 'Hydroelectric Dam', value: 12, color: '#06b6d4' },
          { label: 'Combined Cycle Gas', value: 10, color: '#64748b' },
        ],
        total: '100% Net Zero',
      },
    },
    {
      id: 'energy-freq-stepped',
      industryId: 'energy',
      title: 'Grid Frequency Micro-Step Stability (60 Hz)',
      subtitle: 'Discrete governor control steps maintaining 59.95 - 60.05 Hz corridor',
      chartType: 'steppedLine',
      family: 'line',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'Frequency regulation reserve tracking governor responses to industrial load disconnects.',
      dimensions: ['Time Interval', 'Grid Frequency (Hz)'],
      tags: ['Frequency', 'Governor', 'Stability', '60Hz'],
      payload: {
        labels: ['08:00', '08:05', '08:10', '08:15', '08:20', '08:25', '08:30'],
        data: [60.01, 59.98, 60.03, 60.00, 59.99, 60.02, 60.00],
        lineColor: '#3b82f6',
        stepMode: 'middle',
      },
    },
    {
      id: 'energy-transformer-floating',
      industryId: 'energy',
      title: 'Substation Transformer Operating Temperatures',
      subtitle: 'Core oil temperature vs ambient insulation envelope',
      chartType: 'floatingBar',
      family: 'bar',
      isDefault: false,
      category: 'comparison',
      description: 'Transformer thermal envelope and dielectric oil health monitoring.',
      dimensions: ['Transformer', 'Min Temp', 'Max Temp'],
      tags: ['Transformer', 'Dielectric', 'Thermal'],
      payload: {
        unit: '°C',
        data: [
          { label: 'TX-North-1', min: 42, max: 78, color: '#10b981' },
          { label: 'TX-North-2', min: 44, max: 81, color: '#10b981' },
          { label: 'TX-East-Feed', min: 48, max: 91, color: '#f59e0b' },
          { label: 'TX-Metro-A', min: 39, max: 72, color: '#10b981' },
          { label: 'TX-Industrial-B', min: 52, max: 96, color: '#ef4444' },
        ],
      },
    },
    {
      id: 'energy-loss-waterfall',
      industryId: 'energy',
      title: 'Transmission & Distribution Loss Waterfall',
      subtitle: 'Gross generation to net customer delivered kilowatt hours',
      chartType: 'waterfall',
      family: 'specialized',
      isDefault: false,
      category: 'trends',
      description: 'Line resistance loss, step-up transformation losses, and final distribution realization.',
      dimensions: ['Stage', 'Loss (GWh)'],
      tags: ['Transmission', 'Line Loss', 'Efficiency'],
      payload: {
        categories: ['Gross Injected', 'Step-Up Loss', 'HVDC Line Loss', 'Substation Loss', 'Net Delivered'],
        series: [
          {
            name: 'Energy Realization (GWh)',
            data: [1200, -24, -48, -18, 1110],
          },
        ],
      },
    },

    // 3. Supply Chain, Fleet & Cold-Chain Logistics
    {
      id: 'fleet-velocity-combo',
      industryId: 'logistics',
      title: 'Fleet Distance Traveled vs Fuel Burn Rate',
      subtitle: 'Fleet dispatch metrics across North American Interstate corridors',
      chartType: 'comboBarLine',
      family: 'combo',
      isDefault: true,
      category: 'comparison',
      description: 'Correlating vehicle miles traveled with autonomous routing fuel efficiency.',
      dimensions: ['Corridor', 'Miles (k)', 'Burn Rate (L/100km)'],
      tags: ['Fleet', 'Telematics', 'Fuel'],
      payload: {
        categories: ['I-80 Midwest', 'I-10 Southern', 'I-95 Eastern', 'I-5 Pacific', 'I-70 Central'],
        barSeries: [
          { name: 'Vehicle Miles Traveled (k)', data: [142, 185, 210, 164, 128], color: '#3b82f6' },
        ],
        lineSeries: [
          { name: 'Fuel Economy (L/100km)', data: [8.2, 7.9, 8.8, 8.4, 7.8], color: '#10b981' },
        ],
      },
    },
    {
      id: 'cold-chain-floating',
      industryId: 'logistics',
      title: 'Refrigerated Container Temperature Envelope',
      subtitle: 'Pharma & perishable cold-chain stability (-20°C to -15°C requirement)',
      chartType: 'floatingBar',
      family: 'bar',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'Continuous Reefer GPS telemetry validating zero temperature excursion threshold.',
      dimensions: ['Reefer Unit', 'Min Temp (°C)', 'Max Temp (°C)'],
      tags: ['Cold-Chain', 'Perishables', 'IoT Sensor'],
      payload: {
        unit: '°C',
        data: [
          { label: 'Reefer-401 (Vaccines)', min: -22.4, max: -19.1, color: '#3b82f6' },
          { label: 'Reefer-402 (Biologics)', min: -21.8, max: -18.5, color: '#3b82f6' },
          { label: 'Reefer-403 (Fresh Farm)', min: 2.1, max: 4.8, color: '#10b981' },
          { label: 'Reefer-404 (Frozen Meat)', min: -19.5, max: -16.2, color: '#3b82f6' },
          { label: 'Reefer-405 (Produce)', min: 3.2, max: 6.9, color: '#f59e0b' },
        ],
      },
    },
    {
      id: 'logistics-funnel',
      industryId: 'logistics',
      title: 'Fulfillment Pipeline & Delivery Funnel',
      subtitle: 'Order creation to confirmed proof-of-delivery (POD) milestone',
      chartType: 'funnel',
      family: 'specialized',
      isDefault: true,
      category: 'pipeline',
      description: 'Conversion velocity from initial freight tender to terminal dock delivery.',
      dimensions: ['Milestone', 'Active Shipments'],
      tags: ['Funnel', 'Fulfillment', 'Delivery'],
      payload: {
        data: [
          { label: 'Order Dispatched', value: 12400, color: '#3b82f6' },
          { label: 'Cross-Dock Sorted', value: 11800, color: '#6366f1' },
          { label: 'In-Transit Linehaul', value: 10900, color: '#8b5cf6' },
          { label: 'Out for Final Delivery', value: 9800, color: '#ec4899' },
          { label: 'POD Confirmed', value: 9640, color: '#10b981' },
        ],
      },
    },
    {
      id: 'logistics-scatter',
      industryId: 'logistics',
      title: 'Delivery Distance vs Transit Delay Variance',
      subtitle: 'Correlation between route complexity and on-time SLA adherence',
      chartType: 'scatter',
      family: 'correlation',
      isDefault: true,
      category: 'statistical',
      description: 'Distribution scatter capturing localized weather and border crossing delay clusters.',
      dimensions: ['Distance (Miles)', 'Delay Variance (Min)'],
      tags: ['Scatter', 'SLA', 'Latency'],
      payload: {
        series: [
          {
            name: 'Linehaul Shipments',
            data: [
              { x: 120, y: 4 }, { x: 240, y: 12 }, { x: 380, y: 8 }, { x: 520, y: 24 },
              { x: 680, y: 18 }, { x: 840, y: 42 }, { x: 960, y: 35 }, { x: 1100, y: 55 },
              { x: 1400, y: 48 }, { x: 1750, y: 62 }, { x: 2100, y: 84 }, { x: 2400, y: 72 },
            ],
            color: '#3b82f6',
          },
        ],
      },
    },
    {
      id: 'fleet-engine-stepped',
      industryId: 'logistics',
      title: 'Autonomous Truck Drive Cycle Velocity',
      subtitle: 'Autonomous driving engagement steps vs speed profile',
      chartType: 'steppedLine',
      family: 'line',
      isDefault: false,
      category: 'iot_telemetry',
      description: 'SAE Level 4 autonomous truck governor states and cruise velocity.',
      dimensions: ['Waypoint', 'Speed (MPH)'],
      tags: ['Autonomous', 'Drive Cycle', 'Speed'],
      payload: {
        labels: ['WP-01', 'WP-02', 'WP-03', 'WP-04', 'WP-05', 'WP-06', 'WP-07'],
        data: [45, 65, 65, 55, 65, 70, 60],
        lineColor: '#10b981',
        stepMode: 'middle',
      },
    },
    {
      id: 'port-dwell-bar',
      industryId: 'logistics',
      title: 'Intermodal Port Dwell Time by Terminal',
      subtitle: 'Average container dwell hours before rail/truck drayage',
      chartType: 'bar',
      family: 'bar',
      isDefault: false,
      category: 'comparison',
      description: 'Dwell time benchmarks across major coastal maritime hubs.',
      dimensions: ['Port Hub', 'Average Hours'],
      tags: ['Maritime', 'Port Dwell', 'Intermodal'],
      payload: {
        data: [
          { label: 'Port of LA Pier 400', value: 42, color: '#f59e0b' },
          { label: 'Long Beach Pier T', value: 38, color: '#10b981' },
          { label: 'NY/NJ Maher Terminal', value: 54, color: '#ef4444' },
          { label: 'Rotterdam ECT', value: 28, color: '#10b981' },
          { label: 'Singapore Tuas', value: 22, color: '#10b981' },
        ],
      },
    },

    // 4. Manufacturing & Industrial IoT (IIoT)
    {
      id: 'mfg-oee-combo',
      industryId: 'manufacturing',
      title: 'Assembly Line Overall Equipment Effectiveness (OEE)',
      subtitle: 'Availability, Performance and Quality metrics per manufacturing cell',
      chartType: 'comboBarLine',
      family: 'combo',
      isDefault: true,
      category: 'trends',
      description: 'World-class manufacturing OEE benchmark monitoring robot assembly stations.',
      dimensions: ['Line Station', 'Production Units', 'OEE Target (%)'],
      tags: ['OEE', 'Manufacturing', 'Robotics'],
      payload: {
        categories: ['Stamping', 'Body Welding', 'Paint Shop', 'Powertrain', 'Final Assembly'],
        barSeries: [
          { name: 'Actual Yield (Units/Hr)', data: [88, 92, 84, 96, 90], color: '#8b5cf6' },
        ],
        lineSeries: [
          { name: 'OEE Health Score (%)', data: [84.2, 88.5, 81.0, 92.4, 87.6], color: '#10b981' },
        ],
      },
    },
    {
      id: 'mfg-vibration-scatter',
      industryId: 'manufacturing',
      title: 'Vibration FFT Spectrum Harmonic Signature',
      subtitle: 'Continuous accelerometer acoustic frequencies (ISO 10816 Bearing Standard)',
      chartType: 'scatter',
      family: 'correlation',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'High-frequency accelerometer frequency analysis detecting bearing spalls and imbalance.',
      dimensions: ['Harmonic Frequency (Hz)', 'Vibration Peak Velocity (mm/s)'],
      tags: ['Vibration', 'Predictive Maintenance', 'ISO 10816'],
      payload: {
        series: [
          {
            name: 'Nominal Spindle Harmonics',
            data: [
              { x: 50, y: 0.8 }, { x: 100, y: 1.2 }, { x: 150, y: 0.9 }, { x: 200, y: 2.1 },
              { x: 250, y: 1.4 }, { x: 300, y: 1.8 }, { x: 400, y: 1.1 }, { x: 500, y: 0.6 },
            ],
            color: '#10b981',
          },
          {
            name: 'Outer Race Defect Alert',
            data: [
              { x: 342, y: 4.8 }, { x: 344, y: 5.2 }, { x: 684, y: 3.9 },
            ],
            color: '#ef4444',
          },
        ],
      },
    },
    {
      id: 'mfg-pareto-column',
      industryId: 'manufacturing',
      title: 'Six-Sigma Pareto Defect Analysis',
      subtitle: 'Cumulative quality scrap frequency by root cause classification',
      chartType: 'column',
      family: 'bar',
      isDefault: true,
      category: 'statistical',
      description: '80/20 rule defect classification focusing engineering actions on root cause bottlenecks.',
      dimensions: ['Defect Cause', 'Defect Count'],
      tags: ['Pareto', 'Six-Sigma', 'Quality'],
      payload: {
        categories: ['Weld Porosity', 'Dimensional Gap', 'Paint Run', 'Torque Out-of-Spec', 'Sensor Fault'],
        series: [
          { name: 'Defect Frequency', data: [142, 88, 44, 28, 12], color: '#f59e0b' },
        ],
      },
    },
    {
      id: 'mfg-gauge-health',
      industryId: 'manufacturing',
      title: 'Robotic Cell Mean Time Between Failures (MTBF)',
      subtitle: 'Operating reliability index before required scheduled overhaul',
      chartType: 'gauge',
      family: 'specialized',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'Predictive reliability modeling calculating real-time MTBF from operating cycle logs.',
      dimensions: ['MTBF Index', 'Max Target'],
      tags: ['MTBF', 'Reliability', 'CMMS'],
      payload: {
        value: 94,
        min: 0,
        max: 100,
        unit: 'Health Score',
        status: 'Optimal (4,800 Hrs MTBF)',
        color: '#10b981',
      },
    },
    {
      id: 'mfg-thermal-floating',
      industryId: 'manufacturing',
      title: 'CNC Spindle Thermal Expansion Envelope',
      subtitle: 'Internal bearing temperature vs structural coolant thermal range',
      chartType: 'floatingBar',
      family: 'bar',
      isDefault: false,
      category: 'comparison',
      description: 'Multi-axis machining center thermal stability ensuring micron tolerance consistency.',
      dimensions: ['Machine Tool', 'Min Temp', 'Max Temp'],
      tags: ['CNC', 'Thermal Stability', 'Machining'],
      payload: {
        unit: '°C',
        data: [
          { label: 'CNC-Mill-01', min: 22, max: 48, color: '#10b981' },
          { label: 'CNC-Mill-02', min: 21, max: 46, color: '#10b981' },
          { label: 'CNC-Lathe-03', min: 24, max: 54, color: '#f59e0b' },
          { label: 'EDM-Wire-04', min: 19, max: 28, color: '#10b981' },
          { label: 'Grinder-05', min: 26, max: 62, color: '#ef4444' },
        ],
      },
    },
    {
      id: 'mfg-sensor-radar',
      industryId: 'manufacturing',
      title: 'Factory Safety & Cleanroom Environmental Radar',
      subtitle: 'Particulate count, VOCs, humidity, and static ionization',
      chartType: 'radar',
      family: 'radar',
      isDefault: false,
      category: 'trends',
      description: 'ISO Class 5 semiconductor packaging cleanroom telemetry verification.',
      dimensions: ['Parameter', 'Tolerance Band', 'Sensor Reading'],
      tags: ['Cleanroom', 'ISO Class 5', 'Safety'],
      payload: {
        labels: ['Particle Count', 'VOC Volatiles', 'Relative Humidity', 'Ionization Balance', 'Positive Pressure', 'Thermal Diff'],
        series: [
          { name: 'Bay 4 Cleanroom', data: [94, 88, 92, 96, 98, 90], color: '#8b5cf6' },
          { name: 'ISO Spec Target', data: [90, 85, 90, 90, 95, 85], color: '#64748b' },
        ],
      },
    },

    // 5. Healthcare, Clinical & Life Sciences
    {
      id: 'health-vitals-multi',
      industryId: 'healthcare',
      title: 'Multiparameter Patient Clinical Vitals',
      subtitle: 'Real-time telemetry streaming Heart Rate (BPM), SpO2 (%) & Arterial MAP (mmHg)',
      chartType: 'multiAxisLine',
      family: 'line',
      isDefault: true,
      category: 'iot_telemetry',
      description: 'FDA Class II patient monitor telemetry streaming vital parameters with automated alarm triggers.',
      dimensions: ['Time Interval', 'Heart Rate (BPM)', 'SpO2 (%)', 'Mean Arterial BP (mmHg)'],
      tags: ['ICU', 'Patient Monitoring', 'Vitals'],
      payload: {
        categories: ['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30'],
        series: [
          { name: 'Heart Rate (BPM)', data: [74, 76, 72, 81, 78, 75, 73], color: '#ef4444' },
          { name: 'Pulse Oximetry SpO2 (%)', data: [99, 98, 99, 97, 98, 99, 99], color: '#3b82f6' },
          { name: 'Mean Arterial Pressure (mmHg)', data: [92, 94, 91, 95, 93, 92, 94], color: '#10b981' },
        ],
      },
    },
    {
      id: 'health-bed-stacked',
      industryId: 'healthcare',
      title: 'Emergency & Critical Care Bed Capacity Utilization',
      subtitle: 'Occupied vs available telemetry beds across hospital departments',
      chartType: 'stackedBar',
      family: 'bar',
      isDefault: true,
      category: 'comparison',
      description: 'Real-time hospital census managing patient throughput and surge capacity.',
      dimensions: ['Department', 'Occupied Beds', 'Available Beds'],
      tags: ['Census', 'Capacity', 'Hospital Operations'],
      payload: {
        categories: ['Trauma ICU', 'Cardiac Care Unit', 'Surgical Stepdown', 'Neonatal ICU', 'General Medicine'],
        series: [
          { name: 'Occupied Beds', data: [24, 18, 42, 14, 88], color: '#ef4444' },
          { name: 'Available Beds', data: [4, 6, 8, 2, 12], color: '#10b981' },
        ],
      },
    },
    {
      id: 'health-sla-gauge',
      industryId: 'healthcare',
      title: 'Emergency Triage Door-to-Doctor SLA Adherence',
      subtitle: 'Mean clinical triage velocity benchmark (Target: < 15 minutes)',
      chartType: 'gauge',
      family: 'specialized',
      isDefault: true,
      category: 'pipeline',
      description: 'Joint Commission emergency medicine throughput and triage response time compliance.',
      dimensions: ['Triage SLA %', 'Max Target'],
      tags: ['SLA', 'Triage', 'Emergency Medicine'],
      payload: {
        value: 98,
        min: 0,
        max: 100,
        unit: 'SLA Score',
        status: 'Optimal (14.2 min avg)',
        color: '#10b981',
      },
    },
    {
      id: 'health-dept-donut',
      industryId: 'healthcare',
      title: 'Automated Pharmacy Medication Dispensing Mix',
      subtitle: 'Classified prescription batches processed via automated carousels',
      chartType: 'donut',
      family: 'circular',
      isDefault: true,
      category: 'composition',
      description: 'Barcoded medication administration verification and automated dispensing unit volume.',
      dimensions: ['Formulary Class', 'Percentage'],
      tags: ['Pharmacy', 'Medication Safety', 'Formulary'],
      payload: {
        data: [
          { label: 'Cardiovascular Regimens', value: 32, color: '#ef4444' },
          { label: 'Antibiotics & Anti-infectives', value: 26, color: '#3b82f6' },
          { label: 'Analgesics & Anesthesia', value: 18, color: '#f59e0b' },
          { label: 'Metabolic & Endocrinology', value: 14, color: '#10b981' },
          { label: 'Respiratory Inhalants', value: 10, color: '#8b5cf6' },
        ],
        total: '1,420 Doses/Day',
      },
    },
    {
      id: 'health-cleanroom-stepped',
      industryId: 'healthcare',
      title: 'USP 797 Cleanroom Positive Air Pressure Cascades',
      subtitle: 'Discrete pressure thresholds maintaining anteroom to buffer room containment',
      chartType: 'steppedLine',
      family: 'line',
      isDefault: false,
      category: 'iot_telemetry',
      description: 'USP 797 compounding sterile pharmacy differential pressure telemetry in inches water column.',
      dimensions: ['Time Interval', 'Pressure (in. w.g.)'],
      tags: ['USP 797', 'Airflow', 'Cleanroom'],
      payload: {
        labels: ['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30'],
        data: [0.032, 0.031, 0.034, 0.032, 0.033, 0.032, 0.034],
        lineColor: '#10b981',
        stepMode: 'middle',
      },
    },
    {
      id: 'health-patient-polar',
      industryId: 'healthcare',
      title: 'Patient Acuity Distribution by Clinical Service',
      subtitle: 'Standardized ESI (Emergency Severity Index) triage score clusters',
      chartType: 'polarArea',
      family: 'circular',
      isDefault: false,
      category: 'statistical',
      description: 'Polar distribution capturing patient acuity levels from Resuscitation (Level 1) to Non-urgent.',
      dimensions: ['Severity Tier', 'Case Count'],
      tags: ['Triage', 'ESI Index', 'Acuity'],
      payload: {
        data: [
          { label: 'ESI 1 (Immediate Life Threat)', value: 12, color: '#ef4444' },
          { label: 'ESI 2 (Emergent / High Risk)', value: 28, color: '#f59e0b' },
          { label: 'ESI 3 (Urgent / 2+ Resources)', value: 64, color: '#3b82f6' },
          { label: 'ESI 4 (Less Urgent)', value: 42, color: '#10b981' },
          { label: 'ESI 5 (Non-urgent)', value: 18, color: '#64748b' },
        ],
      },
    },

    // 6. Enterprise FinOps, B2B Billing & Cashflow
    {
      id: 'finops-cashflow-spline',
      industryId: 'finops',
      title: 'Net Cashflow Realization & Accrual Burn Rate',
      subtitle: 'Operating cash collections vs vendor disbursements across weekly billing cycles',
      chartType: 'line',
      family: 'line',
      isDefault: true,
      category: 'trends',
      description: 'Real cash receipts and disbursements tracked against working capital liquidity reserves.',
      dimensions: ['Billing Cycle', 'Cash Inflow ($)', 'Spend Outflow ($)'],
      tags: ['Cashflow', 'Treasury', 'Liquidity'],
      payload: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7'],
        data: [1420000, 1850000, 1640000, 2150000, 1980000, 2480000, 2350000],
        lineColor: '#10b981',
        fillGradient: true,
      },
    },
    {
      id: 'finops-ap-burndown',
      industryId: 'finops',
      title: 'Accounts Payable Aging & Trade Liabilities',
      subtitle: 'Committed vendor invoice maturities categorized by payment terms',
      chartType: 'stackedBar',
      family: 'bar',
      isDefault: true,
      category: 'comparison',
      description: 'AP payment scheduling optimizing early payment discounts while preserving working capital.',
      dimensions: ['Vendor Cohort', 'Current (<30d)', 'Overdue (30-60d)'],
      tags: ['Accounts Payable', 'Invoices', 'Disbursements'],
      payload: {
        categories: ['Cloud Vendors', 'Contractor Staffing', 'Legal & Audit', 'Facilities & HW', 'Logistics Carriers'],
        series: [
          { name: 'Current Tier (<30 Days)', data: [1240000, 840000, 320000, 680000, 510000], color: '#3b82f6' },
          { name: 'Overdue Horizon (>30 Days)', data: [0, 42000, 0, 18000, 0], color: '#ef4444' },
        ],
      },
    },
    {
      id: 'finops-variance-waterfall',
      industryId: 'finops',
      title: 'GAAP ASC 606 Revenue-to-Margin Waterfall',
      subtitle: 'Gross billings through COGS, OPEX, tax remittances to net retained EBITDA',
      chartType: 'waterfall',
      family: 'specialized',
      isDefault: true,
      category: 'trends',
      description: 'Full statutory financial bridge reconciling gross invoiced revenue down to net realized margin.',
      dimensions: ['Accounting Line Item', 'Variance Impact ($)'],
      tags: ['Waterfall', 'EBITDA', 'Gross Margin'],
      payload: {
        categories: ['Gross Invoiced', 'COGS Labor', 'Opex Hosting', 'G&A Overhead', 'Recovered Value', 'Net Realized'],
        // CONTAINED_P0: hardcoded dollar amounts removed from seeded chart definition.
        // These are fabricated FinOps figures — $12.5 M revenue, $301 K recovery, etc.
        // Chart payload must come from the analytical dataset once WI-OI-043 pipeline exists.
        series: [
          {
            name: 'Cash Contribution ($)',
            data: [0, 0, 0, 0, 0, 0],
          },
        ],
      },
    },
    {
      id: 'finops-dso-histogram',
      industryId: 'finops',
      title: 'Days Sales Outstanding (DSO) Distribution',
      subtitle: 'Frequency distribution of invoice collection cycle duration',
      chartType: 'bar',
      family: 'bar',
      isDefault: true,
      category: 'statistical',
      description: 'DSO distribution measuring portfolio payment velocity and credit risk exposure.',
      dimensions: ['DSO Cohort', 'Number of Invoices'],
      tags: ['DSO', 'Credit Risk', 'Receivables'],
      payload: {
        data: [
          { label: '0-15 Days (Prompt Pay)', value: 142, color: '#10b981' },
          { label: '16-30 Days (Standard SLA)', value: 284, color: '#10b981' },
          { label: '31-45 Days (Moderate)', value: 76, color: '#f59e0b' },
          { label: '46-60 Days (Collection Action)', value: 24, color: '#f59e0b' },
          { label: '60+ Days (High Risk Escalation)', value: 8, color: '#ef4444' },
        ],
      },
    },
    {
      id: 'finops-multitenant-stacked',
      industryId: 'finops',
      title: 'Gross Margin Contribution by Customer Cohort',
      subtitle: 'Enterprise ARR contribution vs compute infrastructure delivery cost',
      chartType: 'stackedColumn',
      family: 'bar',
      isDefault: false,
      category: 'composition',
      description: 'Unit economics and margin contribution by commercial customer segment.',
      dimensions: ['Customer Tier', 'Gross Margin ($)', 'Infrastructure Cost ($)'],
      tags: ['Unit Economics', 'ARR', 'COGS'],
      payload: {
        categories: ['Global Tier 1', 'Strategic Defense', 'Enterprise B2B', 'Mid-Market SaaS', 'Emerging Growth'],
        series: [
          { name: 'Retained Margin ($)', data: [4200000, 3100000, 2400000, 1600000, 850000], color: '#10b981' },
          { name: 'Compute COGS ($)', data: [820000, 640000, 480000, 310000, 190000], color: '#64748b' },
        ],
      },
    },
    {
      id: 'finops-cloud-spend-radar',
      industryId: 'finops',
      title: 'Cloud Infrastructure Efficiency & Resource Ratios',
      subtitle: 'Multi-cloud optimization scores across GPU, Storage, Ingress & Compute',
      chartType: 'radar',
      family: 'radar',
      isDefault: false,
      category: 'trends',
      description: 'FinOps efficiency scores measuring cloud resource utilization and unit spend variance.',
      dimensions: ['Resource Class', 'Benchmark Target', 'Achieved Score'],
      tags: ['Cloud FinOps', 'GPU', 'Cost Optimization'],
      payload: {
        labels: ['GPU Cluster Efficiency', 'Reserved Instance Coverage', 'Storage Cold-Tier Ratio', 'Network Ingress Optimization', 'K8s Cluster Bin Packing', 'Spot Fleet Utilization'],
        series: [
          { name: 'Current Multi-Cloud Footprint', data: [91, 88, 94, 82, 89, 78], color: '#10b981' },
          { name: 'Enterprise Target', data: [85, 80, 90, 80, 85, 75], color: '#64748b' },
        ],
      },
    },
  ];
}
