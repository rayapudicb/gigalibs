import { describe, expect, it } from 'vitest';
import {
  evaluateDictionaryCondition,
  validateDictionaryRules,
} from './dictionary-evaluator.js';
import type { DictionaryValidationRuleV1 } from '@gigalibs/contracts';

describe('DictionaryRenderer Safe AST Evaluator', () => {
  it('evaluates primitive comparison predicates securely', () => {
    expect(
      evaluateDictionaryCondition(
        { field: 'status', operator: 'EQ', value: 'ACTIVE' },
        { status: 'ACTIVE' },
      ),
    ).toBe(true);

    expect(
      evaluateDictionaryCondition(
        { field: 'status', operator: 'EQ', value: 'ACTIVE' },
        { status: 'SUSPENDED' },
      ),
    ).toBe(false);

    expect(
      evaluateDictionaryCondition(
        { field: 'name', operator: 'IS_NOT_NULL' },
        { name: 'Acme Corp' },
      ),
    ).toBe(true);

    expect(
      evaluateDictionaryCondition(
        { field: 'name', operator: 'IS_NOT_NULL' },
        { name: null },
      ),
    ).toBe(false);

    expect(
      evaluateDictionaryCondition(
        { field: 'name', operator: 'IS_NULL' },
        { name: '' },
      ),
    ).toBe(true);

    expect(
      evaluateDictionaryCondition(
        { field: 'tier', operator: 'IN', value: ['GOLD', 'PLATINUM'] },
        { tier: 'GOLD' },
      ),
    ).toBe(true);

    expect(
      evaluateDictionaryCondition(
        { field: 'tier', operator: 'IN', value: ['GOLD', 'PLATINUM'] },
        { tier: 'BRONZE' },
      ),
    ).toBe(false);

    expect(
      evaluateDictionaryCondition(
        { field: 'email', operator: 'MATCHES_REGEX', value: '^[^@]+@[^@]+\\.[^@]+$' },
        { email: 'admin@acme.com' },
      ),
    ).toBe(true);

    expect(
      evaluateDictionaryCondition(
        { field: 'email', operator: 'MATCHES_REGEX', value: '^[^@]+@[^@]+\\.[^@]+$' },
        { email: 'invalid-email' },
      ),
    ).toBe(false);
  });

  it('evaluates compound boolean expressions and respects recursion depth bound', () => {
    const compound = {
      all: [
        { field: 'status', operator: 'EQ' as const, value: 'ACTIVE' },
        {
          any: [
            { field: 'tier', operator: 'EQ' as const, value: 'PREMIUM' },
            { field: 'score', operator: 'GT' as const, value: 80 },
          ],
        },
      ],
    };

    expect(
      evaluateDictionaryCondition(compound, {
        status: 'ACTIVE',
        tier: 'STANDARD',
        score: 95,
      }),
    ).toBe(true);

    expect(
      evaluateDictionaryCondition(compound, {
        status: 'ACTIVE',
        tier: 'STANDARD',
        score: 50,
      }),
    ).toBe(false);

    // Deeply nested expression exceeding bound (> 10) must safely evaluate to false
    let deepExpr: any = { field: 'x', operator: 'EQ', value: 1 };
    for (let i = 0; i < 12; i++) {
      deepExpr = { all: [deepExpr] };
    }
    expect(evaluateDictionaryCondition(deepExpr, { x: 1 })).toBe(false);
  });

  it('validates rules and returns structured field errors', () => {
    const rules: DictionaryValidationRuleV1[] = [
      {
        ruleKey: 'rule-name-required',
        label: 'Name Required',
        errorMessage: 'Workspace name is required',
        severity: 'ERROR',
        condition: { field: 'name', operator: 'IS_NOT_NULL' },
      },
      {
        ruleKey: 'rule-active-requires-admin',
        label: 'Active Requires Admin',
        errorMessage: 'Active status requires an admin email',
        severity: 'ERROR',
        condition: {
          any: [
            { field: 'status', operator: 'NEQ', value: 'ACTIVE' },
            { field: 'adminEmail', operator: 'IS_NOT_NULL' },
          ],
        },
      },
    ];

    const errors1 = validateDictionaryRules(rules, {
      name: '',
      status: 'ACTIVE',
      adminEmail: null,
    });
    expect(errors1['name']).toBe('Workspace name is required');
    expect(errors1['rule-active-requires-admin']).toBe('Active status requires an admin email');

    const errors2 = validateDictionaryRules(rules, {
      name: 'Valid Workspace',
      status: 'ACTIVE',
      adminEmail: 'admin@gigalibs.com',
    });
    expect(Object.keys(errors2).length).toBe(0);
  });
});
