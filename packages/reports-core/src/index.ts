/**
 * @gigalibs/reports-core
 *
 * Generic business intelligence query processor, column aggregator,
 * and tabular report generator.
 *
 * @module
 */

import { generateId } from '@gigalibs/crypto';

export type AggregationFunction = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ReportColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'currency';
  aggregate?: AggregationFunction;
}

export interface ReportDefinition {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  entityType: string;
  columns: ReportColumn[];
  groupBy?: string;
}

export class ReportEngine {
  static execute<T extends Record<string, any>>(
    data: T[],
    columns: ReportColumn[],
  ): { rows: T[]; summaries: Record<string, number> } {
    const summaries: Record<string, number> = {};

    for (const col of columns) {
      if (!col.aggregate) continue;

      const numericValues = data
        .map((d) => Number(d[col.key]))
        .filter((v) => !Number.isNaN(v));

      if (numericValues.length === 0) continue;

      switch (col.aggregate) {
        case 'sum':
          summaries[col.key] = numericValues.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          summaries[col.key] = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
          break;
        case 'count':
          summaries[col.key] = data.length;
          break;
        case 'min':
          summaries[col.key] = Math.min(...numericValues);
          break;
        case 'max':
          summaries[col.key] = Math.max(...numericValues);
          break;
      }
    }

    return { rows: data, summaries };
  }

  static createReportDefinition(
    tenantId: string,
    name: string,
    entityType: string,
    columns: ReportColumn[],
  ): ReportDefinition {
    return {
      id: generateId(),
      tenantId,
      name,
      entityType,
      columns,
    };
  }
}
