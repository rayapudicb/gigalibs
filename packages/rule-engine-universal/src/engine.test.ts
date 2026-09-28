import { describe, expect, it } from 'vitest';
import { UniversalRuleEngine } from './engine.js';
import type { UniversalRule } from './types.js';

describe('UniversalRuleEngine', () => {
  it('evaluates boolean condition trees (ALL, ANY, NOT)', () => {
    const engine = new UniversalRuleEngine();

    const rule: UniversalRule = {
      id: 'rule-high-value-credit-check',
      name: 'High Value Credit Check',
      priority: 10,
      conditions: {
        all: [
          { fact: 'invoice.totalMinor', operator: 'greaterThan', value: 100000 },
          {
            any: [
              { fact: 'customer.tier', operator: 'equal', value: 'TIER_1' },
              { fact: 'customer.tier', operator: 'equal', value: 'TIER_2' },
            ],
          },
          {
            not: {
              fact: 'customer.creditHold',
              operator: 'equal',
              value: true,
            },
          },
        ],
      },
      actions: [
        {
          type: 'DAG_TRIGGER',
          target: 'fast-track-approval',
          params: { queue: 'executive' },
        },
      ],
    };

    engine.addRule(rule);

    // Matching facts
    const factsMatch = {
      invoice: { totalMinor: 150000 },
      customer: { tier: 'TIER_1', creditHold: false },
    };
    const res1 = engine.evaluate(factsMatch);
    expect(res1).toHaveLength(1);
    expect(res1[0]?.isMatched).toBe(true);
    expect(res1[0]?.actionsToExecute).toEqual(rule.actions);

    // Fails on creditHold = true
    const factsFailHold = {
      invoice: { totalMinor: 150000 },
      customer: { tier: 'TIER_1', creditHold: true },
    };
    const res2 = engine.evaluate(factsFailHold);
    expect(res2).toHaveLength(0);

    // Fails on totalMinor <= 100000
    const factsFailAmount = {
      invoice: { totalMinor: 50000 },
      customer: { tier: 'TIER_1', creditHold: false },
    };
    const res3 = engine.evaluate(factsFailAmount);
    expect(res3).toHaveLength(0);
  });

  it('sorts rules by priority descending', () => {
    const engine = new UniversalRuleEngine();

    engine.addRule({
      id: 'low-priority',
      name: 'Low Priority',
      priority: 1,
      conditions: { fact: 'value', operator: 'equal', value: 1 },
      actions: [],
    });
    engine.addRule({
      id: 'high-priority',
      name: 'High Priority',
      priority: 100,
      conditions: { fact: 'value', operator: 'equal', value: 1 },
      actions: [],
    });
    engine.addRule({
      id: 'med-priority',
      name: 'Medium Priority',
      priority: 50,
      conditions: { fact: 'value', operator: 'equal', value: 1 },
      actions: [],
    });

    const results = engine.evaluate({ value: 1 });
    expect(results.map((r) => r.ruleId)).toEqual([
      'high-priority',
      'med-priority',
      'low-priority',
    ]);
  });

  it('skips inactive rules', () => {
    const engine = new UniversalRuleEngine();

    engine.addRule({
      id: 'inactive-rule',
      name: 'Inactive',
      isActive: false,
      conditions: { fact: 'value', operator: 'equal', value: 1 },
      actions: [],
    });

    const results = engine.evaluate({ value: 1 });
    expect(results).toHaveLength(0);
  });

  it('enforces precondition guards: requiresPriorEventId', () => {
    const engine = new UniversalRuleEngine();

    const rule: UniversalRule = {
      id: 'settlement-rule',
      name: 'Invoice Settlement Rule',
      conditions: { fact: 'status', operator: 'equal', value: 'PAYMENT_RECEIVED' },
      guards: {
        requiresPriorEventId: 'invoice.verifiedEventId',
      },
      actions: [{ type: 'LEDGER_COMMIT', target: 'ar_ledger' }],
    };
    engine.addRule(rule);

    // Prior event missing -> guard fails
    const failFacts = {
      status: 'PAYMENT_RECEIVED',
      invoice: {},
    };
    const resFail = engine.evaluate(failFacts, { includeUnmatched: true });
    expect(resFail[0]?.guardResult?.satisfied).toBe(false);
    expect(resFail[0]?.actionsToExecute).toHaveLength(0);

    // Prior event present -> guard succeeds
    const passFacts = {
      status: 'PAYMENT_RECEIVED',
      invoice: { verifiedEventId: 'evt_001' },
    };
    const resPass = engine.evaluate(passFacts);
    expect(resPass).toHaveLength(1);
    expect(resPass[0]?.guardResult?.satisfied).toBe(true);
    expect(resPass[0]?.actionsToExecute).toEqual(rule.actions);
  });

  it('enforces idempotency key deduplication locking', () => {
    const engine = new UniversalRuleEngine();

    const rule: UniversalRule = {
      id: 'one-time-credit-note',
      name: 'Issue One-Time Credit Note',
      conditions: { fact: 'issueCredit', operator: 'equal', value: true },
      guards: {
        idempotencyKey: 'transactionId',
      },
      actions: [{ type: 'STATE_MUTATION', target: 'credit_notes' }],
    };
    engine.addRule(rule);

    const facts = {
      issueCredit: true,
      transactionId: 'tx_abc_123',
    };

    // First execution -> succeeds and locks idempotency key
    const firstRun = engine.evaluate(facts);
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.actionsToExecute).toHaveLength(1);

    // Second execution with same idempotency key -> blocked by guard
    const secondRun = engine.evaluate(facts, { includeUnmatched: true });
    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.guardResult?.satisfied).toBe(false);
    expect(secondRun[0]?.guardResult?.reason).toContain('Idempotency key');
    expect(secondRun[0]?.actionsToExecute).toHaveLength(0);
  });

  it('captures structured audit logs during execution', () => {
    const engine = new UniversalRuleEngine();
    engine.addRule({
      id: 'audit-test-rule',
      name: 'Audited Rule',
      conditions: { fact: 'role', operator: 'equal', value: 'ADMIN' },
      actions: [{ type: 'NOTIFY' }],
    });

    const res = engine.evaluate({ role: 'ADMIN' });
    expect(res[0]?.auditLog).toContain("Evaluating Rule 'Audited Rule' (Priority: 0)");
    expect(res[0]?.auditLog).toContain('Result: Condition AST matched!');
    expect(res[0]?.auditLog).toContain('Dispatched 1 automated actions.');
  });
});
