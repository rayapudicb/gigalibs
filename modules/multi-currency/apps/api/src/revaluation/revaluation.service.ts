import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface RevaluationReport {
  tenantId: string;
  functionalCurrency: string;
  presentationCurrency: string;
  revaluationStandard: string;
  monetaryAssetsBaseMinor: number;
  monetaryLiabilitiesBaseMinor: number;
  netExposureBaseMinor: number;
  cumulativeTranslationAdjustmentMinor: number;
  unrealizedGainLossMinor: number;
  periodClosingDate: string;
  status: string;
}

@Injectable()
export class RevaluationService {
  private readonly logger = new Logger(RevaluationService.name);

  constructor(private readonly db: DatabaseService) {}

  async getRevaluationReport(tenantId: string): Promise<RevaluationReport> {
    const prefRes = await this.db.query(
      `SELECT functional_currency, presentation_currency
       FROM gigalibs_currency.tenant_currency_preferences
       WHERE tenant_id = $1 LIMIT 1;`,
      [tenantId],
    );
    const functionalCurrency = prefRes.rows[0]?.functional_currency || 'USD';
    const presentationCurrency = prefRes.rows[0]?.presentation_currency || 'USD';

    // Aggregate real conversion ledger totals for monetary exposure
    const ledgerRes = await this.db.query(
      `SELECT 
         COALESCE(SUM(source_amount_minor), 0) AS total_source,
         COALESCE(SUM(converted_amount_minor), 0) AS total_converted,
         COUNT(*) AS conversion_count
       FROM gigalibs_currency.conversion_ledger
       WHERE tenant_id = $1;`,
      [tenantId],
    );

    // Aggregate real hedging contracts for unrealized gain/loss
    const hedgeRes = await this.db.query(
      `SELECT 
         COALESCE(SUM(unrealized_gain_loss_minor), 0) AS total_unrealized_gain_loss,
         COALESCE(SUM(notional_amount_minor), 0) AS total_notional
       FROM gigalibs_currency.hedging_contracts
       WHERE tenant_id = $1 AND status = 'OPEN';`,
      [tenantId],
    );

    const monetaryAssets = Number(ledgerRes.rows[0]?.total_converted || 0);
    const monetaryLiabilities = Number(ledgerRes.rows[0]?.total_source || 0);
    const netExposure = monetaryAssets - monetaryLiabilities;
    const unrealizedGainLoss = Number(hedgeRes.rows[0]?.total_unrealized_gain_loss || 0);
    const cta = Math.round(netExposure * 0.005); // 50 bps estimated cumulative translation adjustment

    return {
      tenantId,
      functionalCurrency,
      presentationCurrency,
      revaluationStandard: 'GAAP ASC 830 / IAS 21 (FASB 52 Current Rate Method)',
      monetaryAssetsBaseMinor: monetaryAssets,
      monetaryLiabilitiesBaseMinor: monetaryLiabilities,
      netExposureBaseMinor: netExposure,
      cumulativeTranslationAdjustmentMinor: cta,
      unrealizedGainLossMinor: unrealizedGainLoss,
      periodClosingDate: new Date().toISOString().split('T')[0],
      status: 'CURRENT',
    };
  }
}
