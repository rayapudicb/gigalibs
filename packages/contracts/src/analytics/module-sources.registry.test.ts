import { describe, expect, it } from 'vitest';
import { generatedModuleAnalyticsSources } from './module-sources.generated.js';
import { parseModuleAnalyticsSourceCatalogV1 } from './module-source-contract.js';

describe('generatedModuleAnalyticsSources', () => {
  it('validates pilot CMMS and Workforce contracts from module YAML', () => {
    expect(generatedModuleAnalyticsSources.length).toBeGreaterThanOrEqual(2);
    const keys = generatedModuleAnalyticsSources.map((entry) => entry.sourceKey).sort();
    expect(keys).toContain('cmms-downtime');
    expect(keys).toContain('workforce-positions');
    parseModuleAnalyticsSourceCatalogV1(generatedModuleAnalyticsSources);
  });
});
