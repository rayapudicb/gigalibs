import type { FieldMappingEntry } from '../schema-discovery/schema-discovery.service.js';
import type { ModuleAnalyticsSourceContractV1 } from '@gigalibs/contracts';
import type { SemanticMeasureDto } from './dataset.service.js';

export interface ModuleCompileManifestV1 {
  readonly sourceKey: string;
  readonly contractVersion: number;
  readonly reversalFields: readonly string[];
  readonly measureUnits: Readonly<Record<string, string>>;
  readonly freshnessTargetSeconds: number;
}

export function moduleFactsTableName(sourceKey: string): string {
  return `${sourceKey.replace(/-/g, '_')}_facts`;
}

/** Deterministic field mappings and measures from a registry contract (no tenant-specific data). */
export function compileModuleSourceContract(contract: ModuleAnalyticsSourceContractV1): {
  sourceTableName: string;
  fieldMappings: FieldMappingEntry[];
  measures: SemanticMeasureDto[];
  manifest: ModuleCompileManifestV1;
} {
  const sourceTableName = moduleFactsTableName(contract.sourceKey);
  const fieldMappings: FieldMappingEntry[] = [];
  const seenAnalytical = new Set<string>();

  const push = (entry: FieldMappingEntry) => {
    if (seenAnalytical.has(entry.analyticalField)) return;
    seenAnalytical.add(entry.analyticalField);
    fieldMappings.push(entry);
  };

  push({
    sourceField: contract.factSchema.primaryKeyField,
    analyticalField: contract.factSchema.primaryKeyField,
    analyticalType: 'string',
  });
  push({
    sourceField: contract.factSchema.eventTimeField,
    analyticalField: contract.factSchema.eventTimeField,
    analyticalType: 'timestamp',
  });

  if (contract.factSchema.ownerUnitIdField) {
    push({
      sourceField: contract.factSchema.ownerUnitIdField,
      analyticalField: 'unit_name',
      analyticalType: 'string',
      organizationUnit: { match: 'ID' },
    });
  }

  for (const dimension of contract.dimensions) {
    push({
      sourceField: dimension.factField,
      analyticalField: dimension.key,
      analyticalType: inferAnalyticalType(dimension.factField),
    });
  }

  const reversalFields: string[] = [];
  const measureUnits: Record<string, string> = {};
  for (const measure of contract.measures) {
    push({
      sourceField: measure.factField,
      analyticalField: measure.factField,
      analyticalType: 'number',
    });
    if (measure.reversalPolicy === 'NET') reversalFields.push(measure.factField);
    measureUnits[measure.key] = measure.unit;
  }

  push({
    sourceField: '_moduleFact.eventId',
    analyticalField: 'module_event_id',
    analyticalType: 'string',
  });

  const measures: SemanticMeasureDto[] = contract.measures.map((measure) => ({
    measureName: measure.key,
    aggregateFn: contractAggregationToSemantic(measure.aggregation),
    fieldReference: measure.factField,
    displayLabel: measure.label,
    description: `${measure.unit} · precision ${measure.precision} · reversal ${measure.reversalPolicy}`,
  }));

  return {
    sourceTableName,
    fieldMappings,
    measures,
    manifest: {
      sourceKey: contract.sourceKey,
      contractVersion: contract.contractVersion,
      reversalFields,
      measureUnits,
      freshnessTargetSeconds: contract.freshnessTargetSeconds,
    },
  };
}

function contractAggregationToSemantic(aggregation: string): SemanticMeasureDto['aggregateFn'] {
  if (aggregation === 'COUNT') return 'COUNT_DISTINCT';
  if (aggregation === 'SUM' || aggregation === 'AVG' || aggregation === 'MIN' || aggregation === 'MAX') {
    return aggregation;
  }
  throw new Error(`Unsupported contract aggregation ${aggregation}.`);
}

function inferAnalyticalType(factField: string): FieldMappingEntry['analyticalType'] {
  if (factField.endsWith('_at') || factField.includes('effective')) return 'timestamp';
  if (factField === 'fte' || factField.includes('minutes') || factField.includes('count')) return 'number';
  return 'string';
}
