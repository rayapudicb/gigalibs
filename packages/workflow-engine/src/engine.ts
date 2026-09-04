import type { WorkflowRule, WorkflowCondition, WorkflowAction } from './types.js';

export class WorkflowEngine {
  /**
   * Evaluate a single condition against event payload data.
   */
  static evaluateCondition(data: Record<string, unknown>, condition: WorkflowCondition): boolean {
    const actual = data[condition.field];
    const expected = condition.value;

    switch (condition.operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      case 'greater_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'less_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return false;
    }
  }

  /**
   * Check if all conditions for a rule are satisfied.
   */
  static matchesRule(rule: WorkflowRule, eventData: Record<string, unknown>): boolean {
    if (!rule.isActive) return false;
    return rule.conditions.every((cond) => this.evaluateCondition(eventData, cond));
  }

  /**
   * Process an event against a set of rules and return actions to execute.
   */
  static getActionsToExecute(rules: WorkflowRule[], eventName: string, eventData: Record<string, unknown>): WorkflowAction[] {
    const matchedRules = rules.filter(
      (r) => r.triggerEvent === eventName && this.matchesRule(r, eventData),
    );

    return matchedRules.flatMap((r) => r.actions);
  }
}
