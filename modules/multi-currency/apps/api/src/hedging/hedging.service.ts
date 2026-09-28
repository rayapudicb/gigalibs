import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface HedgingContract {
  id: string;
  tenantId: string;
  contractNumber: string;
  counterpartyBank: string;
  pairId: string;
  notionalAmountMinor: number;
  strikeRate: number;
  maturityDate: string;
  hedgeType: string;
  unrealizedGainLossMinor: number;
  status: string;
  createdAt: string;
}

@Injectable()
export class HedgingService {
  private readonly logger = new Logger(HedgingService.name);

  constructor(private readonly db: DatabaseService) {}

  async getHedgingContracts(tenantId: string): Promise<HedgingContract[]> {
    const res = await this.db.query(
      `SELECT h.id, h.tenant_id, h.contract_number, h.counterparty_bank, h.pair_id,
              h.notional_amount_minor, h.strike_rate_micros, h.maturity_date, h.hedge_type,
              h.unrealized_gain_loss_minor, h.status, h.created_at
       FROM gigalibs_currency.hedging_contracts h
       WHERE h.tenant_id = $1
       ORDER BY h.maturity_date ASC;`,
      [tenantId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      contractNumber: r.contract_number,
      counterpartyBank: r.counterparty_bank,
      pairId: r.pair_id,
      notionalAmountMinor: Number(r.notional_amount_minor),
      strikeRate: Number(r.strike_rate_micros) / 1_000_000,
      maturityDate: r.maturity_date,
      hedgeType: r.hedge_type,
      unrealizedGainLossMinor: Number(r.unrealized_gain_loss_minor),
      status: r.status,
      createdAt: r.created_at,
    }));
  }
}
