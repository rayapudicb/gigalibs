import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface MetricLineageProof {
  metricKey: string;
  domain: string;
  sourceTable: string;
  rowCount: number;
  aggregatedValue: number;
  currency: string;
  lineageSha256: string;
  verifiedAt: string;
  sampleRecords: Array<Record<string, any>>;
}

export interface MetricSummary {
  netArRevenueUsd: number;
  arInvoicesCount: number;
  committedSpendUsd: number;
  spendExpensesCount: number;
  fxConvertedVolumeUsd: number;
  fxOrdersCount: number;
  recoveryPreservedUsd: number;
  recoveryLeaksCount: number;
  totalTransactionsCount: number;
  overallLineageVerified: boolean;
  computedAt: string;
}

export interface ChartTimeSeriesPoint {
  date: string;
  revenue: number;
  spend: number;
  recovery: number;
  fx: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private readonly db: DatabaseService) {}

  async getExecutiveSummary(tenantId: string): Promise<MetricSummary> {
    const [arRes, spendRes, fxRes, recoveryRes] = await Promise.all([
      this.getArMetrics(tenantId),
      this.getSpendMetrics(tenantId),
      this.getFxMetrics(tenantId),
      this.getRecoveryMetrics(tenantId),
    ]);

    const totalTransactions =
      arRes.count + spendRes.count + fxRes.count + recoveryRes.count;

    return {
      netArRevenueUsd: arRes.total,
      arInvoicesCount: arRes.count,
      committedSpendUsd: spendRes.total,
      spendExpensesCount: spendRes.count,
      fxConvertedVolumeUsd: fxRes.total,
      fxOrdersCount: fxRes.count,
      recoveryPreservedUsd: recoveryRes.total,
      recoveryLeaksCount: recoveryRes.count,
      totalTransactionsCount: totalTransactions,
      // CONTAINED_P0: unconditional true removed — lineage is unverified until
      // the ingestion pipeline exists and a real sync run has completed.
      overallLineageVerified: false,
      computedAt: new Date().toISOString(),
    };
  }

  async getTimeSeries(tenantId: string): Promise<ChartTimeSeriesPoint[]> {
    // CONTAINED_P0: this method reads gigalibs_platform.billing_invoices,
    // gigalibs_spend.expenses, gigalibs_recovery.detected_leaks and
    // gigalibs_currency.conversion_ledger — all other business-module schemas.
    // These cross-module reads violate the platform contract (no business-module joins).
    // Must be replaced with analytical dataset queries once the ingestion pipeline
    // (WI-OI-043) exists. Until then, callers receive empty series.
    return [];
    // eslint-disable-next-line no-unreachable
    const sql = `
      WITH dates AS (
        SELECT generate_series(
          date_trunc('day', NOW() - INTERVAL '6 days'),
          date_trunc('day', NOW()),
          INTERVAL '1 day'
        )::date AS day
      ),
      ar_agg AS (
        SELECT date_trunc('day', issued_at)::date AS day,
               COALESCE(SUM(total_usd), 0)::float AS amount
        FROM gigalibs_platform.billing_invoices
        WHERE tenant_id = $1::text
        GROUP BY 1
      ),
      spend_agg AS (
        SELECT date_trunc('day', created_at)::date AS day,
               COALESCE(SUM(amount_minor), 0) / 100.0 AS amount
        FROM gigalibs_spend.expenses
        WHERE tenant_id = $1::uuid
        GROUP BY 1
      ),
      rec_agg AS (
        SELECT date_trunc('day', created_at)::date AS day,
               COALESCE(SUM(amount_minor), 0) / 100.0 AS amount
        FROM gigalibs_recovery.detected_leaks
        WHERE tenant_id = $1::text
        GROUP BY 1
      ),
      fx_agg AS (
        SELECT date_trunc('day', calculation_timestamp)::date AS day,
               COALESCE(SUM(source_amount_minor), 0) / 100.0 AS amount
        FROM gigalibs_currency.conversion_ledger
        WHERE tenant_id = $1::text
        GROUP BY 1
      )
      SELECT 
        d.day::text AS date,
        COALESCE(ar.amount, 0)::float AS revenue,
        COALESCE(sp.amount, 0)::float AS spend,
        COALESCE(rc.amount, 0)::float AS recovery,
        COALESCE(fx.amount, 0)::float AS fx
      FROM dates d
      LEFT JOIN ar_agg ar ON d.day = ar.day
      LEFT JOIN spend_agg sp ON d.day = sp.day
      LEFT JOIN rec_agg rc ON d.day = rc.day
      LEFT JOIN fx_agg fx ON d.day = fx.day
      ORDER BY d.day ASC;
    `;

    try {
      const res = await this.db.query(sql, [tenantId]);
      return res.rows.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue) || 0,
        spend: Number(r.spend) || 0,
        recovery: Number(r.recovery) || 0,
        fx: Number(r.fx) || 0,
      }));
    } catch {
      return [];
    }
  }

  // CONTAINED_P0: getLineageProof reads gigalibs_platform.billing_invoices and other
  // business-module schemas directly, then emits unconditional lineage attestations.
  // Cross-module reads are forbidden by platform contract; attestation must be derived
  // from the ingestion pipeline (WI-OI-043), not from direct schema access.
  // This method is left in place for type compatibility but must not be called
  // in production-routed paths until the ingestion pipeline is implemented.
  async getLineageProof(tenantId: string, metricKey: string): Promise<MetricLineageProof> {
    switch (metricKey) {
      case 'NET_AR_REVENUE': {
        const ar = await this.getArMetrics(tenantId);
        const rows = await this.db.query(
          `SELECT id, invoice_number, total_usd, status, issued_at AS created_at
           FROM gigalibs_platform.billing_invoices
           WHERE tenant_id = $1::text
           ORDER BY issued_at DESC
           LIMIT 10`,
          [tenantId],
        );
        const hash = createHash('sha256')
          .update(`${tenantId}:gigalibs_platform.billing_invoices:${ar.count}:${ar.total}`)
          .digest('hex');
        return {
          metricKey,
          domain: 'FINANCE',
          sourceTable: 'gigalibs_platform.billing_invoices',
          rowCount: ar.count,
          aggregatedValue: ar.total,
          currency: 'USD',
          lineageSha256: hash,
          verifiedAt: new Date().toISOString(),
          sampleRecords: rows.rows,
        };
      }

      case 'COMMITTED_SPEND': {
        const sp = await this.getSpendMetrics(tenantId);
        const rows = await this.db.query(
          `SELECT id, merchant, amount_minor, currency, status, created_at
           FROM gigalibs_spend.expenses
           WHERE tenant_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT 10`,
          [tenantId],
        );
        const hash = createHash('sha256')
          .update(`${tenantId}:gigalibs_spend.expenses:${sp.count}:${sp.total}`)
          .digest('hex');
        return {
          metricKey,
          domain: 'SPEND',
          sourceTable: 'gigalibs_spend.expenses',
          rowCount: sp.count,
          aggregatedValue: sp.total,
          currency: 'USD',
          lineageSha256: hash,
          verifiedAt: new Date().toISOString(),
          sampleRecords: rows.rows,
        };
      }

      case 'PRESERVED_CASH': {
        const rec = await this.getRecoveryMetrics(tenantId);
        const rows = await this.db.query(
          `SELECT id, title, leak_type, amount_minor, status, created_at
           FROM gigalibs_recovery.detected_leaks
           WHERE tenant_id = $1::text
           ORDER BY created_at DESC
           LIMIT 10`,
          [tenantId],
        );
        const hash = createHash('sha256')
          .update(`${tenantId}:gigalibs_recovery.detected_leaks:${rec.count}:${rec.total}`)
          .digest('hex');
        return {
          metricKey,
          domain: 'RECOVERY',
          sourceTable: 'gigalibs_recovery.detected_leaks',
          rowCount: rec.count,
          aggregatedValue: rec.total,
          currency: 'USD',
          lineageSha256: hash,
          verifiedAt: new Date().toISOString(),
          sampleRecords: rows.rows,
        };
      }

      case 'CROSS_BORDER_FX': {
        const fx = await this.getFxMetrics(tenantId);
        const rows = await this.db.query(
          `SELECT id, document_reference, from_currency, to_currency, source_amount_minor, calculation_timestamp AS created_at
           FROM gigalibs_currency.conversion_ledger
           WHERE tenant_id = $1::text
           ORDER BY calculation_timestamp DESC
           LIMIT 10`,
          [tenantId],
        );
        const hash = createHash('sha256')
          .update(`${tenantId}:gigalibs_currency.conversion_ledger:${fx.count}:${fx.total}`)
          .digest('hex');
        return {
          metricKey,
          domain: 'TREASURY',
          sourceTable: 'gigalibs_currency.conversion_ledger',
          rowCount: fx.count,
          aggregatedValue: fx.total,
          currency: 'USD',
          lineageSha256: hash,
          verifiedAt: new Date().toISOString(),
          sampleRecords: rows.rows,
        };
      }

      default:
        throw new NotFoundException(`Unknown metric key: ${metricKey}`);
    }
  }

  private async getArMetrics(tenantId: string): Promise<{ count: number; total: number }> {
    try {
      const res = await this.db.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(total_usd), 0) AS sm
         FROM gigalibs_platform.billing_invoices
         WHERE tenant_id = $1::text`,
        [tenantId],
      );
      const count = Number(res.rows[0]?.cnt) || 0;
      const total = Number(res.rows[0]?.sm) || 0;
      return { count, total: Math.round(total * 100) / 100 };
    } catch {
      // CONTAINED_P0: silent zero fallback suppresses UNAVAILABLE state;
      // must surface UNAVAILABLE once callers handle it.
      return { count: 0, total: 0 };
    }
  }

  private async getSpendMetrics(tenantId: string): Promise<{ count: number; total: number }> {
    try {
      const res = await this.db.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_minor), 0) AS sm
         FROM gigalibs_spend.expenses
         WHERE tenant_id = $1::uuid`,
        [tenantId],
      );
      const count = Number(res.rows[0]?.cnt) || 0;
      const totalMinor = Number(res.rows[0]?.sm) || 0;
      return { count, total: Math.round((totalMinor / 100) * 100) / 100 };
    } catch {
      // CONTAINED_P0: silent zero fallback suppresses UNAVAILABLE state;
      // must surface UNAVAILABLE once callers handle it.
      return { count: 0, total: 0 };
    }
  }

  private async getFxMetrics(tenantId: string): Promise<{ count: number; total: number }> {
    try {
      const res = await this.db.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(source_amount_minor), 0) AS sm
         FROM gigalibs_currency.conversion_ledger
         WHERE tenant_id = $1::text`,
        [tenantId],
      );
      const count = Number(res.rows[0]?.cnt) || 0;
      const totalMinor = Number(res.rows[0]?.sm) || 0;
      return { count, total: Math.round((totalMinor / 100) * 100) / 100 };
    } catch {
      // CONTAINED_P0: silent zero fallback suppresses UNAVAILABLE state;
      // must surface UNAVAILABLE once callers handle it.
      return { count: 0, total: 0 };
    }
  }

  private async getRecoveryMetrics(tenantId: string): Promise<{ count: number; total: number }> {
    try {
      const res = await this.db.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_minor), 0) AS sm
         FROM gigalibs_recovery.detected_leaks
         WHERE tenant_id = $1::text`,
        [tenantId],
      );
      const count = Number(res.rows[0]?.cnt) || 0;
      const totalMinor = Number(res.rows[0]?.sm) || 0;
      return { count, total: Math.round((totalMinor / 100) * 100) / 100 };
    } catch {
      // CONTAINED_P0: silent zero fallback suppresses UNAVAILABLE state;
      // must surface UNAVAILABLE once callers handle it.
      return { count: 0, total: 0 };
    }
  }
}
