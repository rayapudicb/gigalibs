import type { FormulaMeasureVersionStateV1 } from './formula-measure.js';

/**
 * WI-OI-103d d7: the labelled sample farm source of a Demo Lab workspace. Its records are synthetic (generated, not
 * real farm records) and flow through the real discovery, mapping, dataset and model steps.
 */
export interface SampleFarmStatusV1 {
  loaded: boolean;
  connectionId: string | null;
  rawRecords: number;
  datasetVersionId: string | null;
  semanticModelId: string | null;
  /** "Yield per hectare", created by the member who loaded the sample and waiting for a second member's review. */
  formula: { id: string; versionId: string; state: FormulaMeasureVersionStateV1 } | null;
}
