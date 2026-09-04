export type StandardOperator =
  | 'equal'
  | 'notEqual'
  | 'greaterThan'
  | 'greaterThanInclusive'
  | 'lessThan'
  | 'lessThanInclusive'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'doesNotContain'
  | 'startsWith'
  | 'endsWith'
  | 'regexMatch'
  | 'isDateAfter'
  | 'isDateBefore';

export interface ConditionLeaf {
  fact: string; // e.g. 'invoice.balanceDue' or 'sensor.windSpeedMph'
  operator: StandardOperator | string;
  value: unknown;
}

export interface ConditionGroup {
  all?: RuleCondition[]; // Logical AND
  any?: RuleCondition[]; // Logical OR
  not?: RuleCondition;   // Logical NOT
}

export type RuleCondition = ConditionLeaf | ConditionGroup;

export type RuleTriggerType =
  | 'WEBHOOK'
  | 'FORM_SUBMISSION'
  | 'INVOICE_EVENT'
  | 'CRON_SCHEDULE'
  | 'DB_CHANGE'
  | 'USER_EVENT'
  | 'IOT_SENSOR';

export interface RuleGuardCondition {
  requiresPriorEventId?: string; // "Do only if event X was completed"
  idempotencyKey?: string;        // Deduplication key (e.g. "inv_settle_${invoiceId}")
  stateLockKey?: string;          // Distributed lock key to prevent race conditions
  maxExecutionCount?: number;     // Maximum times this rule may fire (e.g. 1 per billing cycle)
  circuitBreakerThreshold?: number;
}

export type RuleActionCategory =
  | 'COMMUNICATION_SLACK'
  | 'COMMUNICATION_SMS'
  | 'COMMUNICATION_EMAIL'
  | 'LEDGER_COMMIT'
  | 'DAG_TRIGGER'
  | 'WEBHOOK_OUTBOUND'
  | 'STATE_MUTATION';

export interface RuleAction {
  id?: string;
  type: RuleActionCategory | string;
  target?: string; // e.g. '#finance-alerts' or '+1-555-0199' or 'https://api.salesforce.com'
  params?: Record<string, unknown>;
  description?: string;
}

export interface UniversalRule {
  id: string;
  name: string;
  description?: string;
  category?: string;
  triggerType?: RuleTriggerType;
  priority?: number; // Higher number executes first
  cronExpression?: string; // For recurring schedules (e.g. "0 0 * * *")
  conditions: RuleCondition;
  guards?: RuleGuardCondition;
  actions: RuleAction[];
  isActive?: boolean;
}

export interface GuardEvaluationResult {
  satisfied: boolean;
  reason?: string;
  guardDetails?: RuleGuardCondition;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  isMatched: boolean;
  guardResult?: GuardEvaluationResult;
  actionsToExecute: RuleAction[];
  auditLog: string[];
}
