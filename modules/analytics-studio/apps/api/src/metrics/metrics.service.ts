import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface MetricLineageProof {
  metricKey: string;
  domain: string;
  sourceTable: string;
  rowCount: number;
  aggregatedValue: number;
  currency: string;
  lineageSha256: string;
  verifiedAt: string;
  sampleRecords: Array<Record<string, unknown>>;
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

const LEGACY_METRICS_UNAVAILABLE =
  'Legacy cross-module metrics are contained until WI-OI-043 produces certified analytical datasets.';

@Injectable()
export class MetricsService {
  async getExecutiveSummary(_tenantId: string): Promise<MetricSummary> {
    throw new ServiceUnavailableException(LEGACY_METRICS_UNAVAILABLE);
  }

  async getTimeSeries(_tenantId: string): Promise<ChartTimeSeriesPoint[]> {
    throw new ServiceUnavailableException(LEGACY_METRICS_UNAVAILABLE);
  }

  async getLineageProof(
    _tenantId: string,
    _metricKey: string,
  ): Promise<MetricLineageProof> {
    throw new ServiceUnavailableException(LEGACY_METRICS_UNAVAILABLE);
  }
}
