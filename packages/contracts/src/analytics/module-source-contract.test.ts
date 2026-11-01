import { describe, expect, it } from 'vitest';
import {
  catalogModuleKeyForLegacySourceKey,
  parseModuleAnalyticsSourceCatalogV1,
  parseModuleAnalyticsSourceContractV1,
} from './module-source-contract.js';

const cmmsDowntime = {
  contractVersion: 1 as const,
  catalogModuleKey: 'asset-maintenance',
  sourceKey: 'cmms-downtime',
  title: 'CMMS asset downtime',
  requiredReadPermission: 'cmms.analytics.read',
  factSchema: {
    schemaVersion: 1,
    primaryKeyField: 'event_id',
    eventTimeField: 'occurred_at',
    ownerUnitIdField: 'owning_unit_id',
  },
  ownerScopePolicy: 'UNIT_REQUIRED' as const,
  dataClassification: 'OPERATIONAL' as const,
  dimensions: [{ key: 'failure_code', label: 'Failure code', factField: 'failure_code' }],
  measures: [
    {
      key: 'downtime_minutes',
      label: 'Downtime minutes',
      aggregation: 'SUM' as const,
      unit: 'MINUTES',
      precision: 0,
      factField: 'duration_minutes',
      reversalPolicy: 'NET' as const,
    },
  ],
  defaultViews: [
    {
      key: 'reliability_overview',
      label: 'Reliability overview',
      kpiMeasureKeys: ['downtime_minutes'],
      trendMeasureKey: 'downtime_minutes',
      breakdownDimensionKey: 'failure_code',
    },
  ],
  freshnessTargetSeconds: 900,
};

describe('ModuleAnalyticsSourceContractV1', () => {
  it('parses a pilot CMMS downtime contract', () => {
    expect(parseModuleAnalyticsSourceContractV1(cmmsDowntime).sourceKey).toBe('cmms-downtime');
  });

  it('rejects duplicate source keys in a catalog', () => {
    expect(() => parseModuleAnalyticsSourceCatalogV1([cmmsDowntime, cmmsDowntime])).toThrow();
  });

  it('maps legacy inbox keys to catalogue entitlement keys', () => {
    expect(catalogModuleKeyForLegacySourceKey('cmms:downtime')).toBe('asset-maintenance');
    expect(catalogModuleKeyForLegacySourceKey('workforce:positions')).toBe('gigaops');
  });
});
