import { resolveMetricSpec } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_COUNTRY_PACKS,
  bundledGovernedCatalogue,
  classifyGovernedCatalogueChange,
  compileGovernedCatalogue,
  listBundledGovernedCatalogues,
} from './index.js';

// WI-OI-064c: governed catalogues compile deterministically and every platform-shipped one is valid.
describe('governed catalogue compiler', () => {
  it('compiles every bundled catalogue with a stable checksum', () => {
    const bundled = listBundledGovernedCatalogues();
    expect(bundled.filter((item) => item.kind === 'INDUSTRY_PACK')).toHaveLength(9);
    expect(bundled.filter((item) => item.kind === 'COUNTRY_PACK').map((item) => item.surfaceKey)).toEqual(['au', 'eu', 'gb', 'in', 'jp', 'us']);
    for (const item of bundled) {
      const definition = bundledGovernedCatalogue(item.kind, item.surfaceKey);
      const first = compileGovernedCatalogue(definition);
      expect(first.findings, `${item.kind}/${item.surfaceKey}`).toEqual([]);
      expect(first.manifest?.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(compileGovernedCatalogue(structuredClone(definition)).manifest?.checksum).toBe(first.manifest?.checksum);
    }
  });

  it('ships the Japan pack with all 47 prefectures and statutory working-time defaults', () => {
    const japan = BUNDLED_COUNTRY_PACKS.find((pack) => pack.code === 'JP')!;
    expect(japan.subdivisions).toHaveLength(47);
    expect(japan.subdivisions[0]).toEqual({ code: 'JP-01', label: 'Hokkaido' });
    expect(japan.subdivisions[12]).toEqual({ code: 'JP-13', label: 'Tokyo' });
    expect(japan.subdivisions[46]).toEqual({ code: 'JP-47', label: 'Okinawa' });
    expect(japan).toMatchObject({ currency: 'JPY', timeZones: ['Asia/Tokyo'], weeklyOtThreshold: 40 });
    expect(japan.payroll).toMatchObject({ dailyRegularCap: 8, otMultiplier: 1.25, holidayOtMultiplier: 1.35 });
    expect(japan.payroll.deductions).toBeUndefined();
  });

  it('rejects a ratio over an unknown metric, a mismatched pack key and a foreign subdivision', () => {
    const metrics = bundledGovernedCatalogue('METRIC_CATALOGUE', 'operations')!;
    const brokenRatio = structuredClone(metrics) as typeof metrics & { catalogue: { metrics: Array<Record<string, unknown>> } };
    brokenRatio.catalogue.metrics.push({ kind: 'RATIO', key: 'bad', label: 'Bad', unit: 'RATIO', numerator: 'nope', denominator: 'labour_hours' });
    expect(compileGovernedCatalogue(brokenRatio).findings.map((finding) => finding.path)).toContain('catalogue.metrics.7.numerator');

    const qsr = bundledGovernedCatalogue('INDUSTRY_PACK', 'qsr')!;
    expect(compileGovernedCatalogue({ ...qsr, surfaceKey: 'warehouse' }).valid).toBe(false);

    const japan = structuredClone(bundledGovernedCatalogue('COUNTRY_PACK', 'jp')!) as { catalogue: { subdivisions: { code: string; label: string }[] } };
    japan.catalogue.subdivisions.push({ code: 'US-CA', label: 'California' });
    expect(compileGovernedCatalogue(japan).valid).toBe(false);
  });

  it('treats removing a metric as breaking and adding one as compatible', () => {
    const metrics = bundledGovernedCatalogue('METRIC_CATALOGUE', 'operations')!;
    if (metrics.kind !== 'METRIC_CATALOGUE') throw new Error('unexpected kind');
    const fewer = { ...metrics, catalogue: { metrics: metrics.catalogue.metrics.filter((metric) => metric.key !== 'carbon_per_labour_hour') } };
    expect(classifyGovernedCatalogueChange(metrics, fewer)).toBe('BREAKING');
    expect(classifyGovernedCatalogueChange(fewer, metrics)).toBe('COMPATIBLE');
  });

  it('returns nothing for an unknown bundled catalogue', () => {
    expect(bundledGovernedCatalogue('INDUSTRY_PACK', 'shipbuilding')).toBeUndefined();
    expect(bundledGovernedCatalogue('COUNTRY_PACK', 'zz')).toBeUndefined();
  });
});

describe('catalogue metric resolution', () => {
  it('resolves aggregates and ratios from the bundled catalogue into typed specs', () => {
    const operations = bundledGovernedCatalogue('METRIC_CATALOGUE', 'operations')!;
    if (operations.kind !== 'METRIC_CATALOGUE') throw new Error('unexpected kind');
    expect(resolveMetricSpec(operations.catalogue, 'labour_hours')).toMatchObject({ kind: 'AGGREGATE', factType: 'LABOUR_HOURS', aggregate: 'SUM' });
    expect(resolveMetricSpec(operations.catalogue, 'cost_per_labour_hour')).toMatchObject({
      kind: 'RATIO',
      numerator: { factType: 'LABOUR_COST', aggregate: 'SUM' },
      denominator: { factType: 'LABOUR_HOURS', aggregate: 'SUM' },
    });
    expect(resolveMetricSpec(operations.catalogue, 'unknown')).toBeUndefined();
  });
});
