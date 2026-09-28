import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface CurrencyPair {
  id: string;
  tenantId: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  inverseRate: number;
  rateMicros: string;
  inverseRateMicros: string;
  rateSource: string;
  spreadBasisPoints: number;
  status: string;
  effectiveAt: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PairsService {
  private readonly logger = new Logger(PairsService.name);

  constructor(private readonly db: DatabaseService) {}

  async getPairs(tenantId: string): Promise<CurrencyPair[]> {
    const res = await this.db.query(
      `SELECT id, tenant_id, base_currency, target_currency, rate_micros, inverse_rate_micros, 
              rate_source, spread_basis_points, status, effective_at, created_at, updated_at
       FROM gigalibs_currency.currency_pairs
       WHERE tenant_id = $1
       ORDER BY base_currency ASC, target_currency ASC;`,
      [tenantId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      baseCurrency: r.base_currency,
      targetCurrency: r.target_currency,
      rate: Number(r.rate_micros) / 1_000_000,
      inverseRate: Number(r.inverse_rate_micros) / 1_000_000,
      rateMicros: r.rate_micros,
      inverseRateMicros: r.inverse_rate_micros,
      rateSource: r.rate_source,
      spreadBasisPoints: r.spread_basis_points,
      status: r.status,
      effectiveAt: r.effective_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async getPairRate(
    tenantId: string,
    base: string,
    target: string,
  ): Promise<{ rate: number; rateMicros: number; inverseRate: number; source: string } | null> {
    if (base.toUpperCase() === target.toUpperCase()) {
      return { rate: 1.0, rateMicros: 1_000_000, inverseRate: 1.0, source: 'PARITY' };
    }

    const res = await this.db.query(
      `SELECT rate_micros, inverse_rate_micros, rate_source
       FROM gigalibs_currency.currency_pairs
       WHERE tenant_id = $1 AND base_currency = $2 AND target_currency = $3
       LIMIT 1;`,
      [tenantId, base.toUpperCase(), target.toUpperCase()],
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        rate: Number(row.rate_micros) / 1_000_000,
        rateMicros: Number(row.rate_micros),
        inverseRate: Number(row.inverse_rate_micros) / 1_000_000,
        source: row.rate_source,
      };
    }

    // Try finding the inverse pair
    const invRes = await this.db.query(
      `SELECT rate_micros, inverse_rate_micros, rate_source
       FROM gigalibs_currency.currency_pairs
       WHERE tenant_id = $1 AND base_currency = $2 AND target_currency = $3
       LIMIT 1;`,
      [tenantId, target.toUpperCase(), base.toUpperCase()],
    );

    if (invRes.rows.length > 0) {
      const row = invRes.rows[0];
      return {
        rate: Number(row.inverse_rate_micros) / 1_000_000,
        rateMicros: Number(row.inverse_rate_micros),
        inverseRate: Number(row.rate_micros) / 1_000_000,
        source: `${row.rate_source} (Inverted)`,
      };
    }

    return null;
  }
}
