import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { multiplyDecimals } from './catalogue.service.js';

describe('Product Catalogue exact decimal arithmetic', () => {
  it('multiplies without IEEE-754 rounding', () => {
    expect(multiplyDecimals('0.1', '0.2', 12)).toBe('0.02');
    expect(multiplyDecimals('999999999999999999.125', '3.2', 12)).toBe('3199999999999999997.2');
    expect(multiplyDecimals('-2.5', '0.04', 12)).toBe('-0.1');
  });

  it('rounds half away from zero at the supported scale', () => {
    expect(multiplyDecimals('1.0000005', '1', 6)).toBe('1.000001');
    expect(multiplyDecimals('-1.0000005', '1', 6)).toBe('-1.000001');
  });

  it('rejects non-decimal input', () => {
    expect(() => multiplyDecimals('1e3', '2', 12)).toThrow(BadRequestException);
  });
});

describe('Product Catalogue Application Dictionary custom extensions validation', () => {
  it('accepts valid custom extensions', async () => {
    const { validateCustomExtensions } = await import('./catalogue.service.js');
    expect(() =>
      validateCustomExtensions({
        warranty_months: 24,
        sustainability_score: 'GRADE_A',
        country_of_origin: 'DE',
      }),
    ).not.toThrow();
  });

  it('rejects prototype pollution or forbidden keys', async () => {
    const { validateCustomExtensions } = await import('./catalogue.service.js');
    expect(() =>
      validateCustomExtensions({
        __proto__: { injected: true },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      validateCustomExtensions({
        constructor: 'polluted',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects non-object values', async () => {
    const { validateCustomExtensions } = await import('./catalogue.service.js');
    expect(() => validateCustomExtensions('not-an-object' as any)).toThrow(BadRequestException);
    expect(() => validateCustomExtensions([1, 2, 3] as any)).toThrow(BadRequestException);
  });

  it('evaluates Safe AST dictionary rules', async () => {
    const { validateCustomExtensions } = await import('./catalogue.service.js');
    const rules = [
      {
        ruleKey: 'rule-warranty-positive',
        targetField: 'warranty_months',
        ruleType: 'CUSTOM_EXPRESSION' as const,
        condition: {
          field: 'warranty_months',
          operator: 'GTE' as const,
          value: 0,
        },
        errorMessage: 'Warranty must be non-negative',
      },
    ];

    expect(() => validateCustomExtensions({ warranty_months: 12 }, rules)).not.toThrow();
    expect(() => validateCustomExtensions({ warranty_months: -5 }, rules)).toThrow(
      BadRequestException,
    );
  });
});
