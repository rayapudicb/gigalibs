import { OperatorRegistry } from './operators.js';
import { FactExtractor } from './fact-extractor.js';
import type {
  UniversalRule,
  RuleCondition,
  ConditionLeaf,
  RuleEvaluationResult,
  GuardEvaluationResult,
} from './types.js';


export class UniversalRuleEngine {
  private operators: OperatorRegistry;
  private rules: UniversalRule[] = [];
  private executedIdempotencyKeys = new Set<string>();

  constructor(customOperators?: OperatorRegistry) {
    this.operators = customOperators ?? new OperatorRegistry();
  }

  addRule(rule: UniversalRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  addRules(rules: UniversalRule[]): void {
    for (const r of rules) this.addRule(r);
  }

  getRules(): UniversalRule[] {
    return this.rules;
  }

  clearRules(): void {
    this.rules = [];
  }

  /**
   * Evaluates an entire condition tree (recursively handling ALL, ANY, and NOT).
   */
  evaluateCondition(condition: RuleCondition, facts: Record<string, unknown>): boolean {
    // 1. Group check: ALL (Logical AND)
    if ('all' in condition && Array.isArray(condition.all)) {
      if (condition.all.length === 0) return true;
      return condition.all.every((sub) => this.evaluateCondition(sub, facts));
    }

    // 2. Group check: ANY (Logical OR)
    if ('any' in condition && Array.isArray(condition.any)) {
      if (condition.any.length === 0) return false;
      return condition.any.some((sub) => this.evaluateCondition(sub, facts));
    }

    // 3. Group check: NOT (Logical Inversion)
    if ('not' in condition && condition.not) {
      return !this.evaluateCondition(condition.not, facts);
    }

    // 4. Leaf Condition check
    if ('fact' in condition && 'operator' in condition) {
      const leaf = condition as ConditionLeaf;
      const factValue = FactExtractor.resolvePath(facts, leaf.fact);
      const operatorFn = this.operators.get(leaf.operator);

      if (!operatorFn) {
        throw new Error(`Operator '${leaf.operator}' is not registered in UniversalRuleEngine.`);
      }

      return operatorFn(factValue, leaf.value);
    }

    return false;
  }

  /**
   * Evaluates State-Aware Precondition Guards ("Do Only This If Done").
   */
  evaluateGuards(rule: UniversalRule, facts: Record<string, unknown>): GuardEvaluationResult {
    const guards = rule.guards;
    if (!guards) {
      return { satisfied: true, reason: 'No guard constraints specified.' };
    }

    // 1. Check Idempotency Key
    if (guards.idempotencyKey) {
      const resolvedKey = String(FactExtractor.resolvePath(facts, guards.idempotencyKey) || guards.idempotencyKey);
      if (this.executedIdempotencyKeys.has(resolvedKey)) {
        return {
          satisfied: false,
          reason: `Guard Blocked: Idempotency key '${resolvedKey}' has already executed.`,
          guardDetails: guards,
        };
      }
    }

    // 2. Check Prerequisite Prior Event
    if (guards.requiresPriorEventId) {
      const priorEvent = FactExtractor.resolvePath(facts, guards.requiresPriorEventId);
      if (!priorEvent) {
        return {
          satisfied: false,
          reason: `Guard Blocked: Required prior event '${guards.requiresPriorEventId}' is missing or incomplete.`,
          guardDetails: guards,
        };
      }
    }

    return {
      satisfied: true,
      reason: 'All state guards and idempotency preconditions satisfied.',
      guardDetails: guards,
    };
  }

  /**
   * Evaluates all active rules against a set of facts.
   * By default, returns only matching rule evaluation results.
   */
  evaluate(facts: Record<string, unknown>, options?: { includeUnmatched?: boolean }): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];

    for (const rule of this.rules) {
      if (rule.isActive === false) continue;

      const auditLog: string[] = [];
      auditLog.push(`Evaluating Rule '${rule.name}' (Priority: ${rule.priority ?? 0})`);

      const isMatched = this.evaluateCondition(rule.conditions, facts);

      if (!isMatched) {
        auditLog.push('Result: Condition AST did not match.');
        if (options?.includeUnmatched) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            isMatched: false,
            actionsToExecute: [],
            auditLog,
          });
        }
        continue;
      }

      auditLog.push('Result: Condition AST matched!');

      // Check State-Aware Precondition Guards
      const guardResult = this.evaluateGuards(rule, facts);
      if (!guardResult.satisfied) {
        auditLog.push(`Guard Blocked: ${guardResult.reason}`);
        if (options?.includeUnmatched) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            isMatched: true,
            guardResult,
            actionsToExecute: [],
            auditLog,
          });
        }
        continue;
      }

      auditLog.push(`Guards verified: ${guardResult.reason}`);

      // Record Idempotency Key
      if (rule.guards?.idempotencyKey) {
        const resolvedKey = String(FactExtractor.resolvePath(facts, rule.guards.idempotencyKey) || rule.guards.idempotencyKey);
        this.executedIdempotencyKeys.add(resolvedKey);
        auditLog.push(`Idempotency key '${resolvedKey}' locked.`);
      }

      auditLog.push(`Dispatched ${rule.actions.length} automated actions.`);

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        isMatched: true,
        guardResult,
        actionsToExecute: rule.actions,
        auditLog,
      });
    }

    return results;
  }
}
