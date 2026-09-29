import { describe, expect, it } from 'vitest';
import {
  CreateFormulaMeasureV1Schema,
  FormulaMeasureDefinitionV1Schema,
  type FormulaExpressionV1,
} from './formula-measure.js';

const definition = {
  displayLabel: 'Yield per hectare',
  description: 'Harvested yield divided by planted area.',
  unit: 'kg/ha',
  expression: {
    kind: 'binary' as const,
    operator: 'divide' as const,
    left: { kind: 'measure' as const, name: 'harvested_yield' },
    right: { kind: 'measure' as const, name: 'planted_area' },
  },
};

describe('formula measure contracts', () => {
  it('accepts a bounded typed expression and applies nullable description defaults', () => {
    const parsed = CreateFormulaMeasureV1Schema.parse({
      semanticModelId: '00000000-0000-4000-8000-000000000001',
      name: 'yield_per_hectare',
      definition: { ...definition, description: undefined },
    });
    expect(parsed.definition.description).toBeNull();
  });

  it.each([
    { ...definition, expression: { kind: 'sql', value: 'DROP TABLE records' } },
    { ...definition, expression: { kind: 'constant', value: 5 } },
    { ...definition, unit: '' },
    { ...definition, extra: true },
  ])('refuses an unsafe or incomplete definition %#', (candidate) => {
    expect(FormulaMeasureDefinitionV1Schema.safeParse(candidate).success).toBe(false);
  });

  it('refuses expressions deeper than eight levels', () => {
    let expression: FormulaExpressionV1 = { kind: 'measure', name: 'harvested_yield' };
    for (let index = 0; index < 8; index += 1) {
      expression = {
        kind: 'binary',
        operator: 'add',
        left: expression,
        right: { kind: 'constant', value: 1 },
      };
    }
    expect(FormulaMeasureDefinitionV1Schema.safeParse({ ...definition, expression }).success).toBe(false);
  });
});
