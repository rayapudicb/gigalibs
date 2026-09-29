/**
 * Model catalog (WI-OI-103d): the semantic models a tenant has, and for one model everything a query may use —
 * base measures, approved formula measures (with the version a chart may pin) and the dataset's typed fields.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type AnalyticsCatalogMeasureV1,
  type AnalyticsModelCatalogV1,
  type AnalyticsModelSummaryV1,
  FormulaMeasureDefinitionV1Schema,
} from '@gigalibs/contracts';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { loadDatasetFields } from './dataset-fields.js';

const MODEL_COLUMNS = `sm.id, sm.display_name, sm.description, sm.dataset_version_id, sm.updated_at,
       COALESCE((SELECT MAX(v.version_number) FROM gigalibs_analytics.semantic_model_versions v
                 WHERE v.model_id = sm.id), 0) AS version_number`;

@Injectable()
export class ModelCatalogService {
  constructor(private readonly db: DatabaseService) {}

  async listModels(principal: AnalyticsPrincipal): Promise<AnalyticsModelSummaryV1[]> {
    const result = await this.db.queryWithTenant<any>(
      principal.tenantId,
      `SELECT ${MODEL_COLUMNS}
       FROM gigalibs_analytics.semantic_models sm
       ORDER BY sm.display_name, sm.id
       LIMIT 200`,
      [],
    );
    return result.rows.map(toSummary);
  }

  async getCatalog(principal: AnalyticsPrincipal, modelId: string): Promise<AnalyticsModelCatalogV1> {
    const { tenantId } = principal;
    const modelResult = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT ${MODEL_COLUMNS} FROM gigalibs_analytics.semantic_models sm WHERE sm.id = $1`,
      [modelId],
    );
    if (modelResult.rows.length === 0) throw new NotFoundException(`Semantic model '${modelId}' not found.`);
    const model = toSummary(modelResult.rows[0]);

    const baseResult = await this.db.queryWithTenant<{ measure_name: string; aggregate_fn: string; display_label: string }>(
      tenantId,
      `SELECT measure_name, aggregate_fn, display_label
       FROM gigalibs_analytics.semantic_measures
       WHERE model_id = $1
       ORDER BY measure_name`,
      [modelId],
    );
    const formulaResult = await this.db.queryWithTenant<{ measure_name: string; version_id: string; definition: unknown }>(
      tenantId,
      `SELECT fm.measure_name, fmv.id AS version_id, fmv.definition
       FROM gigalibs_analytics.formula_measures fm
       JOIN gigalibs_analytics.formula_measure_versions fmv ON fmv.id = fm.current_published_version_id
       WHERE fm.semantic_model_id = $1
       ORDER BY fm.measure_name`,
      [modelId],
    );

    const measures: AnalyticsCatalogMeasureV1[] = baseResult.rows.map((row) => ({
      name: row.measure_name,
      label: row.display_label || row.measure_name,
      kind: 'base',
      aggregateFn: row.aggregate_fn,
      unit: null,
      versionId: null,
    }));
    for (const row of formulaResult.rows) {
      const definition = FormulaMeasureDefinitionV1Schema.safeParse(row.definition);
      if (!definition.success) continue; // an unreadable stored definition is never offered
      measures.push({
        name: row.measure_name,
        label: definition.data.displayLabel,
        kind: 'formula',
        aggregateFn: null,
        unit: definition.data.unit,
        versionId: row.version_id,
      });
    }

    const fields = await loadDatasetFields(this.db, tenantId, model.datasetVersionId);
    return {
      model,
      measures,
      fields: [...fields].map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}

function toSummary(row: any): AnalyticsModelSummaryV1 {
  return {
    id: row.id,
    displayName: row.display_name,
    description: row.description ?? null,
    datasetVersionId: row.dataset_version_id,
    definitionVersion: Number(row.version_number ?? 0),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
