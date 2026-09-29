/**
 * WI-OI-103d — model catalog: lists models, and for one model returns base measures, approved formula measures (with
 * the version a chart may pin) and the dataset's typed fields. Unreadable formula definitions are never offered.
 */
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { ModelCatalogService } from './model-catalog.service.js';

const MODEL = '00000000-0000-4000-8000-000000000001';
const VERSION = '00000000-0000-4000-8000-0000000000aa';
const principal = { tenantId: 'tenant-a' } as AnalyticsPrincipal;
const modelRow = {
  id: MODEL,
  display_name: 'Farm operations',
  description: null,
  dataset_version_id: 'dsv-1',
  updated_at: '2026-09-29T10:00:00Z',
  version_number: 2,
};

function catalog(options: { model?: boolean } = {}) {
  const queryWithTenant = vi.fn(async (_tenant: string, sql: string) => {
    if (sql.includes('FROM gigalibs_analytics.semantic_models sm')) return { rows: options.model === false ? [] : [modelRow] };
    if (sql.includes('FROM gigalibs_analytics.semantic_measures')) {
      return {
        rows: [
          { measure_name: 'area', aggregate_fn: 'SUM', display_label: 'Area (ha)' },
          { measure_name: 'harvest', aggregate_fn: 'SUM', display_label: 'Harvest (t)' },
        ],
      };
    }
    if (sql.includes('FROM gigalibs_analytics.formula_measures fm')) {
      return {
        rows: [
          {
            measure_name: 'yield_per_ha',
            version_id: VERSION,
            definition: {
              displayLabel: 'Yield',
              description: null,
              unit: 't/ha',
              expression: { kind: 'binary', operator: 'divide', left: { kind: 'measure', name: 'harvest' }, right: { kind: 'measure', name: 'area' } },
            },
          },
          { measure_name: 'broken', version_id: VERSION, definition: { nonsense: true } },
        ],
      };
    }
    if (sql.includes('studio_mapping_versions')) {
      return {
        rows: [
          {
            field_mappings: [
              { analyticalField: 'field', analyticalType: 'string' },
              { analyticalField: 'day', analyticalType: 'date' },
              { analyticalField: 'harvest_t', analyticalType: 'number' },
              { analyticalField: 'odd', analyticalType: 'geometry' },
            ],
          },
        ],
      };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
  return new ModelCatalogService({ queryWithTenant } as never);
}

describe('ModelCatalogService', () => {
  it('lists the tenant models', async () => {
    const models = await catalog().listModels(principal);
    expect(models).toEqual([
      { id: MODEL, displayName: 'Farm operations', description: null, datasetVersionId: 'dsv-1', definitionVersion: 2, updatedAt: '2026-09-29T10:00:00.000Z' },
    ]);
  });

  it('returns base and approved formula measures and typed fields', async () => {
    const result = await catalog().getCatalog(principal, MODEL);
    expect(result.measures).toEqual([
      { name: 'area', label: 'Area (ha)', kind: 'base', aggregateFn: 'SUM', unit: null, versionId: null },
      { name: 'harvest', label: 'Harvest (t)', kind: 'base', aggregateFn: 'SUM', unit: null, versionId: null },
      { name: 'yield_per_ha', label: 'Yield', kind: 'formula', aggregateFn: null, unit: 't/ha', versionId: VERSION },
    ]);
    // The unknown 'geometry' type is not offered, matching the query engine's whitelist.
    expect(result.fields).toEqual([
      { name: 'day', type: 'date' },
      { name: 'field', type: 'string' },
      { name: 'harvest_t', type: 'number' },
    ]);
  });

  it('refuses an unknown model', async () => {
    await expect(catalog({ model: false }).getCatalog(principal, MODEL)).rejects.toThrow(NotFoundException);
  });
});
