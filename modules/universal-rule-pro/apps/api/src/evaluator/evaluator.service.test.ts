import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvaluatorService, EvaluationRequest } from './evaluator.service.js';

describe('EvaluatorService (RL-01, RL-03, RL-04)', () => {
  let service: EvaluatorService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      withTenantTransaction: vi.fn(async (tenantId: string, op: any) => {
        return op(mockClient);
      }),
    };
    service = new EvaluatorService(mockDb);
  });

  describe('Deterministic Comparison Operators & NaN Guards', () => {
    it('evaluates comparison operators correctly', () => {
      expect(service.evaluateComparison(100, '==', 100)).toBe(true);
      expect(service.evaluateComparison(100, '!=', 200)).toBe(true);
      expect(service.evaluateComparison(50, '>', 40)).toBe(true);
      expect(service.evaluateComparison(50, '>=', 50)).toBe(true);
      expect(service.evaluateComparison(30, '<', 40)).toBe(true);
      expect(service.evaluateComparison(30, '<=', 30)).toBe(true);
      expect(service.evaluateComparison(25, 'BETWEEN', [20, 30])).toBe(true);
      expect(service.evaluateComparison(15, 'BETWEEN', [20, 30])).toBe(false);
      expect(service.evaluateComparison('US', 'IN_SET', ['US', 'CA', 'MX'])).toBe(true);
      expect(service.evaluateComparison('FR', 'NOT_IN_SET', ['US', 'CA', 'MX'])).toBe(true);
      expect(service.evaluateComparison('Enterprise Suite', 'CONTAINS', 'suite')).toBe(true);
      expect(service.evaluateComparison('TXN-9988', 'STARTS_WITH', 'TXN-')).toBe(true);
      expect(service.evaluateComparison('INV-2026.pdf', 'ENDS_WITH', '.pdf')).toBe(true);
      expect(service.evaluateComparison('USER_123', 'REGEX_MATCH', '^USER_\\d+$')).toBe(true);
    });

    it('prevents NaN or non-finite numbers from silently passing range comparisons', () => {
      expect(service.evaluateComparison(NaN, '>', 100)).toBe(false);
      expect(service.evaluateComparison(NaN, '<', 100)).toBe(false);
      expect(service.evaluateComparison(NaN, '>=', 100)).toBe(false);
      expect(service.evaluateComparison(NaN, '<=', 100)).toBe(false);
      expect(service.evaluateComparison(NaN, 'BETWEEN', [0, 100])).toBe(false);
      expect(service.evaluateComparison(Infinity, '>', 100)).toBe(false);
    });

    it('evaluates variance against comparison field (EXCEEDS_PERCENT_OF_FIELD)', () => {
      const payload = {
        invoiced_price: 125,
        contract_baseline: 100, // 25% higher
      };

      const result = service.evaluateComparison(
        payload.invoiced_price,
        'EXCEEDS_PERCENT_OF_FIELD',
        20, // threshold 20%
        payload,
        'contract_baseline'
      );
      expect(result).toBe(true);

      const withinTolerance = service.evaluateComparison(
        105,
        'EXCEEDS_PERCENT_OF_FIELD',
        10,
        { ...payload, invoiced_price: 105 },
        'contract_baseline'
      );
      expect(withinTolerance).toBe(false);
    });

    it('safely handles nested JSON paths and array wildcards', () => {
      const sample = {
        order: {
          items: [{ sku: 'A', price: 10 }, { sku: 'B', price: 50 }],
        },
      };

      expect(service.resolvePath(sample, 'order.items[0].sku')).toBe('A');
      expect(service.resolvePath(sample, 'order.items[*].price')).toEqual([10, 50]);

      // Array wildcard in evaluateComparison
      expect(service.evaluateComparison([10, 50], '>', 40)).toBe(true);
      expect(service.evaluateComparison([10, 20], '>', 40)).toBe(false);
    });
  });

  describe('AST Condition Tree Evaluation', () => {
    it('evaluates nested AND / OR / NOT expressions deterministically', () => {
      const ast = {
        operator: 'AND',
        rules: [
          { field: 'country', operator: '==', value: 'US' },
          {
            operator: 'OR',
            rules: [
              { field: 'amount', operator: '>', value: 1000 },
              { field: 'is_vip', operator: '==', value: true },
            ],
          },
        ],
      };

      expect(service.evaluateAst(ast, { country: 'US', amount: 1500, is_vip: false })).toBe(true);
      expect(service.evaluateAst(ast, { country: 'US', amount: 500, is_vip: true })).toBe(true);
      expect(service.evaluateAst(ast, { country: 'CA', amount: 1500, is_vip: true })).toBe(false);
      expect(service.evaluateAst(ast, { country: 'US', amount: 500, is_vip: false })).toBe(false);
    });
  });

  describe('Full Rule Evaluation (RL-01, RL-03, RL-04)', () => {
    it('evaluates rules hierarchically and awaits audit logging for matched evaluations', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rul-stat-1',
              rule_code: 'STAT-CREDIT-HOLD',
              name: 'Statutory Credit Hold',
              domain: 'CREDIT',
              scope: 'PLATFORM',
              priority: 10,
              published_version: '1.0.0',
              condition_ast: { field: 'overdue_days', operator: '>', value: 60 },
              action_type: 'CREDIT_HOLD',
              action_params: { reason: 'Regulatory delinquency' },
            },
            {
              id: 'rul-dept-1',
              rule_code: 'DEPT-RISK-REVIEW',
              name: 'Department High Risk Check',
              domain: 'CREDIT',
              scope: 'DEPARTMENT',
              department: 'UNDERWRITING',
              priority: 20,
              published_version: '1.2.0',
              condition_ast: { field: 'risk_score', operator: '>=', value: 80 },
              action_type: 'MANUAL_UNDERWRITING_REVIEW',
              action_params: { queue: 'urgent_underwriting' },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // insert log

      const req: EvaluationRequest = {
        domain: 'CREDIT',
        department: 'UNDERWRITING',
        payload: {
          overdue_days: 75,
          risk_score: 85,
        },
      };

      const response = await service.evaluate('tenant-corp-01', req);

      expect(response.success).toBe(true);
      expect(response.matched).toBe(true);
      expect(response.matched_rules_count).toBe(2);
      expect(response.primary_verdict).toBe('MATCH');
      expect(response.proposed_actions).toHaveLength(2);
      expect(response.proposed_actions[0].action_type).toBe('CREDIT_HOLD');
      expect(response.proposed_actions[0].is_proposed_only).toBe(true); // RL-04
      expect(response.is_preview).toBe(false);

      // Verify audit log persistence was awaited
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_rules.rule_evaluation_logs'),
        expect.arrayContaining(['tenant-corp-01', 'rul-stat-1', 'STAT-CREDIT-HOLD', '1.0.0'])
      );
    });

    it('records NO_MATCH in evaluation logs when no rules fire (RL-03)', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rul-1',
              rule_code: 'RULE-100',
              name: 'Rule 100',
              domain: 'ORDERS',
              scope: 'TENANT',
              priority: 100,
              published_version: '1.0.0',
              condition_ast: { field: 'total', operator: '>', value: 1000 },
              action_type: 'FLAG',
              action_params: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // insert log

      const response = await service.evaluate('tenant-corp-01', {
        domain: 'ORDERS',
        payload: { total: 50 },
      });

      expect(response.matched).toBe(false);
      expect(response.primary_verdict).toBe('NO_MATCH');
      expect(response.proposed_actions).toHaveLength(0);

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_rules.rule_evaluation_logs'),
        expect.arrayContaining(['tenant-corp-01', null, 'NONE', null, false, 'NO_MATCH'])
      );
    });

    it('supports isolated preview mode without real action claims', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rul-1',
              rule_code: 'RULE-DISCOUNT',
              name: 'VIP Discount',
              domain: 'PRICING',
              scope: 'TENANT',
              priority: 50,
              published_version: '1.0.0',
              condition_ast: { field: 'tier', operator: '==', value: 'PLATINUM' },
              action_type: 'APPLY_DISCOUNT',
              action_params: { discount_pct: 15 },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const response = await service.evaluate('tenant-corp-01', {
        domain: 'PRICING',
        payload: { tier: 'PLATINUM' },
        preview: true,
      });

      expect(response.is_preview).toBe(true);
      expect(response.matched).toBe(true);
      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_rules.rule_evaluation_logs'),
        expect.arrayContaining([true]) // is_preview parameter
      );
    });

    it('evaluates declarative rule with UniversalRuleEngine', () => {
      const results = service.evaluateDeclarativeRule(
        {
          id: 'rule-vat-relief',
          name: 'Zero-Rate VAT Exemption',
          priority: 10,
          conditions: {
            all: [
              { fact: 'customer.isExempt', operator: 'equal', value: true },
              { fact: 'tax.ratePct', operator: 'equal', value: 0 },
            ],
          },
          actions: [
            {
              type: 'STATE_MUTATION',
              target: 'invoice.applied_taxes',
              params: { exempt: true },
            },
          ],
        },
        {
          customer: { isExempt: true },
          tax: { ratePct: 0 },
        },
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.isMatched).toBe(true);
      expect(results[0]?.actionsToExecute).toHaveLength(1);
      expect(results[0]?.actionsToExecute[0]?.type).toBe('STATE_MUTATION');
    });
  });
});
