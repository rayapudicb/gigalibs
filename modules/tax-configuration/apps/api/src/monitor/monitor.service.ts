import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface NexusMonitorSummary {
  jurisdictionCode: string;
  jurisdictionName: string;
  countryCode: string;
  currentRevenueMinor: number;
  thresholdRevenueMinor: number;
  revenuePercent: number;
  currentTransactions: number;
  thresholdTransactions: number;
  transactionPercent: number;
  hasNexus: boolean;
  status: 'SAFE' | 'WARNING_75_PERCENT' | 'NEXUS_ESTABLISHED';
}

@Injectable()
export class MonitorService {
  constructor(private readonly db: DatabaseService) {}

  async getNexusStatus(tenantId: string): Promise<NexusMonitorSummary[]> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
    const res = await client.query(
      `SELECT 
        jurisdiction_code as "jurisdictionCode", jurisdiction_name as "jurisdictionName",
        country_code as "countryCode",
        current_period_revenue_minor as "currentRevenueMinor",
        economic_threshold_revenue_minor as "thresholdRevenueMinor",
        current_period_transactions as "currentTransactions",
        economic_threshold_transactions as "thresholdTransactions",
        has_physical_nexus as "hasPhysicalNexus",
        has_economic_nexus as "hasEconomicNexus"
       FROM gigalibs_tax.tax_jurisdictions
       WHERE tenant_id = $1 AND status = 'ACTIVE'
       ORDER BY (current_period_revenue_minor::float / NULLIF(economic_threshold_revenue_minor, 0)) DESC`,
      [tenantId]
    );

    return res.rows.map((row: any) => {
      const revPct = Math.round(((row.currentRevenueMinor || 0) / (row.thresholdRevenueMinor || 1)) * 100);
      const txPct = Math.round(((row.currentTransactions || 0) / (row.thresholdTransactions || 1)) * 100);

      const hasNexus = row.hasPhysicalNexus || revPct >= 100 || txPct >= 100;
      let status: 'SAFE' | 'WARNING_75_PERCENT' | 'NEXUS_ESTABLISHED' = 'SAFE';

      if (hasNexus) {
        status = 'NEXUS_ESTABLISHED';
      } else if (revPct >= 75 || txPct >= 75) {
        status = 'WARNING_75_PERCENT';
      }

      return {
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        countryCode: row.countryCode,
        currentRevenueMinor: Number(row.currentRevenueMinor || 0),
        thresholdRevenueMinor: Number(row.thresholdRevenueMinor || 0),
        revenuePercent: revPct,
        currentTransactions: Number(row.currentTransactions || 0),
        thresholdTransactions: Number(row.thresholdTransactions || 0),
        transactionPercent: txPct,
        hasNexus,
        status,
      };
    });
    });
  }
}
