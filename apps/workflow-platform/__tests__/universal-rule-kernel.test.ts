import { describe, it, expect } from 'vitest';
import { universalRuleKernelStore } from '../lib/universal-rule-kernel-store';

describe('Zero-Knowledge Universal Rule Engine Kernel', () => {
  it('dynamically introspects arbitrary unknown payloads into typed field descriptors', () => {
    const unknownPayload = {
      transaction_id: 'TXN-9982',
      account: {
        number: 'ACCT-88910',
        balance_usd: 125000.5,
        is_verified: true,
      },
      line_items: [
        { sku: 'WIDGET-01', rate: 45.0, count: 10 },
        { sku: 'WIDGET-02', rate: 120.0, count: 2 },
      ],
    };

    const fields = universalRuleKernelStore.introspectPayload(unknownPayload);
    expect(fields.length).toBeGreaterThanOrEqual(5);

    const paths = fields.map((f) => f.path);
    expect(paths).toContain('transaction_id');
    expect(paths).toContain('account.number');
    expect(paths).toContain('account.balance_usd');
    expect(paths).toContain('account.is_verified');
    expect(paths).toContain('line_items[*].sku');
    expect(paths).toContain('line_items[*].rate');

    const balanceField = fields.find((f) => f.path === 'account.balance_usd');
    expect(balanceField?.detectedType).toBe('NUMBER');

    const verifiedField = fields.find((f) => f.path === 'account.is_verified');
    expect(verifiedField?.detectedType).toBe('BOOLEAN');
  });

  it('safely resolves nested JSON paths and array expressions without crashing', () => {
    const sample = {
      order: {
        customer: {
          name: 'Apex Corp',
          address: { city: 'Austin' },
        },
        items: [{ id: 'ITEM-1', price: 50 }, { id: 'ITEM-2', price: 75 }],
      },
    };

    expect(universalRuleKernelStore.resolvePath(sample, 'order.customer.name')).toBe('Apex Corp');
    expect(universalRuleKernelStore.resolvePath(sample, 'order.customer.address.city')).toBe('Austin');
    expect(universalRuleKernelStore.resolvePath(sample, 'order.items[0].price')).toBe(50);
    expect(universalRuleKernelStore.resolvePath(sample, 'order.items[*].price')).toEqual([50, 75]);

    // Missing paths return undefined safely
    expect(universalRuleKernelStore.resolvePath(sample, 'order.missing.property')).toBeUndefined();
    expect(universalRuleKernelStore.resolvePath(null, 'order.path')).toBeUndefined();
  });

  it('evaluates universal operators accurately across numeric, string, set, and variance types', () => {
    const payload = {
      amount: 5000,
      country: 'US',
      tags: ['FRAUD_RISK', 'EXPEDITED'],
      invoiced_price: 120.0,
      contract_price: 100.0, // 20% higher
    };

    // Numeric
    expect(
      universalRuleKernelStore.evaluateCondition(
        { id: '1', fieldPath: 'amount', operator: 'GREATER_THAN', value: 4000 },
        payload,
      ),
    ).toBe(true);

    expect(
      universalRuleKernelStore.evaluateCondition(
        { id: '2', fieldPath: 'amount', operator: 'LESS_THAN', value: 1000 },
        payload,
      ),
    ).toBe(false);

    // Set
    expect(
      universalRuleKernelStore.evaluateCondition(
        { id: '3', fieldPath: 'country', operator: 'IN_SET', value: ['US', 'CA', 'GB'] },
        payload,
      ),
    ).toBe(true);

    // Array contains
    expect(
      universalRuleKernelStore.evaluateCondition(
        { id: '4', fieldPath: 'tags', operator: 'CONTAINS', value: 'FRAUD_RISK' },
        payload,
      ),
    ).toBe(true);

    // Exceeds percent of another field
    expect(
      universalRuleKernelStore.evaluateCondition(
        {
          id: '5',
          fieldPath: 'invoiced_price',
          operator: 'EXCEEDS_PERCENT_OF_FIELD',
          value: 10.0, // Allowed variance is 10%
          compareFieldPath: 'contract_price',
        },
        payload,
      ),
    ).toBe(true); // 20% > 10%
  });

  it('executes high-speed evaluation and enforces BLOCK_DROP actions on policy violations', () => {
    // Missing Authorization header on gateway ingress triggers statutory system rule SYS-SEC-AUTH-GATEWAY
    const unauthenticatedPayload = {
      headers: {},
      body: { action: 'transfer_funds', amount: 50000 },
    };

    const verdict = universalRuleKernelStore.evaluate('any-tenant', 'API_GATEWAY_INGRESS', unauthenticatedPayload);

    expect(verdict.actionTaken).toBe('BLOCK_DROP');
    expect(verdict.primaryMatchedRule?.ruleCode).toBe('SYS-SEC-AUTH-GATEWAY');
    expect(verdict.executionLatencyMs).toBeLessThan(10);
    expect(verdict.fipsSha256Receipt.length).toBe(64);
  });

  it('executes REROUTE_TOPIC action for high-value message broker transactions', () => {
    const highValueEvent = {
      payload: { amount_usd: 55000, account: 'CORP-01' },
    };

    const verdict = universalRuleKernelStore.evaluate('demo-tenant', 'KAFKA_TOPIC_INGEST', highValueEvent);

    expect(verdict.actionTaken).toBe('REROUTE_TOPIC');
    expect(verdict.primaryMatchedRule?.action.targetChannel).toBe('t.defense.transactions.priority');
  });

  it('supports emergency kill-switch (HIJACK) to instantly pause rules without deployment', () => {
    const rule = universalRuleKernelStore.createRule({
      tenantId: 'test-tenant',
      ruleCode: 'RULE-KILLSWITCH-TEST',
      name: 'Temporary Freeze Rule',
      description: 'Freezes transactions matching condition',
      triggerEvent: 'CUSTOM_TRIGGER',
      scope: 'TENANT_DEFAULT',
      lifecycleStatus: 'ACTIVE',
      priority: 900,
      systemLocked: false,
      conditions: [
        {
          id: 'c1',
          fieldPath: 'amount',
          operator: 'GREATER_THAN',
          value: 100,
        },
      ],
      action: { actionType: 'BLOCK_DROP' },
    });

    // 1. Initially ACTIVE -> Should block
    const testPayload = { amount: 500 };
    let verdict = universalRuleKernelStore.evaluate('test-tenant', 'CUSTOM_TRIGGER', testPayload);
    expect(verdict.actionTaken).toBe('BLOCK_DROP');

    // 2. Invoke 1-Click Emergency Kill-Switch (HIJACK)
    const hijacked = universalRuleKernelStore.toggleHijack(rule.id, 'Emergency freeze override by Operations Director');
    expect(hijacked.lifecycleStatus).toBe('HIJACKED');

    // 3. Now HIJACKED -> Should PASS normally
    verdict = universalRuleKernelStore.evaluate('test-tenant', 'CUSTOM_TRIGGER', testPayload);
    expect(verdict.actionTaken).toBe('PASS');

    // Clean up
    universalRuleKernelStore.deleteRule(rule.id);
  });

  it('runs shadow simulations against historical events and calculates false-positive rates', () => {
    const candidateRule = {
      name: 'Fraud Surcharge Filter',
      ruleCode: 'SIM-FRAUD-01',
      triggerEvent: 'ALL_EVENTS',
      conditions: [
        {
          id: 'c1',
          fieldPath: 'payload.category',
          operator: 'EQUALS' as const,
          value: 'DEFENSE',
        },
      ],
      action: { actionType: 'HOLD_TRANSACTION' as const },
    };

    const report = universalRuleKernelStore.simulateRule(candidateRule);

    expect(report.totalEvaluated).toBeGreaterThan(0);
    expect(report.matchedCount).toBeGreaterThan(0);
    expect(report.matchRatePct).toBeGreaterThan(0);
    expect(report.simulatedAction).toBe('HOLD_TRANSACTION');
    expect(report.sampleMatches.length).toBeGreaterThan(0);
  });
});
