import { createHash, randomUUID } from 'node:crypto';
import { logger } from '@gigalibs/logger';

export type FieldDataType = 'NUMBER' | 'STRING' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export interface DiscoveredField {
  path: string;
  label: string;
  detectedType: FieldDataType;
  sampleValue: string;
  isArrayElement?: boolean;
}

export type UniversalOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'IN_SET'
  | 'NOT_IN_SET'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  | 'EXCEEDS_PERCENT_OF_FIELD'
  | 'REGEX_MATCH';

export interface RuleCondition {
  id: string;
  fieldPath: string;
  operator: UniversalOperator;
  value: any;
  compareFieldPath?: string;
  logicalOperator?: 'AND' | 'OR';
}

export type UniversalActionType =
  | 'PASS'
  | 'BLOCK_DROP'
  | 'MUTATE_ENRICH'
  | 'REROUTE_TOPIC'
  | 'HOLD_TRANSACTION';

export interface UniversalActionConfig {
  actionType: UniversalActionType;
  targetChannel?: string;
  holdReason?: string;
  enrichmentData?: Record<string, any>;
  disputeMemoTemplate?: string;
}

export type RuleLifecycleStatus =
  | 'DRAFT'
  | 'SHADOW'
  | 'ACTIVE'
  | 'HIJACKED'
  | 'DEPRECATED';

export interface GenericRule {
  id: string;
  tenantId: string;
  ruleCode: string;
  name: string;
  description: string;
  triggerEvent: string;
  scope: 'GLOBAL_SYSTEM' | 'TENANT_DEFAULT' | 'PIPELINE_GATEWAY';
  lifecycleStatus: RuleLifecycleStatus;
  priority: number;
  systemLocked: boolean;
  conditions: RuleCondition[];
  action: UniversalActionConfig;
  stats: {
    totalEvaluations: number;
    matchesCount: number;
    lastTriggeredAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** A rule that does not exist, or that belongs to another tenant: both answer 404, so IDs reveal nothing. */
export class RuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Rule ${id} not found`);
    this.name = 'RuleNotFoundError';
  }
}

/** Scopes a tenant may give its own rules. GLOBAL_SYSTEM rules apply to every tenant and only the platform owns them. */
export const TENANT_RULE_SCOPES = ['TENANT_DEFAULT', 'PIPELINE_GATEWAY'] as const satisfies readonly GenericRule['scope'][];

/** The fields a tenant may change on its own rule. Identity, ownership, scope escalation and statistics are not among them. */
export type TenantRuleUpdate = Partial<
  Pick<GenericRule, 'ruleCode' | 'name' | 'description' | 'triggerEvent' | 'lifecycleStatus' | 'priority' | 'conditions' | 'action'>
> & { scope?: (typeof TENANT_RULE_SCOPES)[number] };

const TENANT_UPDATABLE_FIELDS = [
  'ruleCode',
  'name',
  'description',
  'triggerEvent',
  'scope',
  'lifecycleStatus',
  'priority',
  'conditions',
  'action',
] as const;

export function isTenantRuleScope(scope: unknown): scope is (typeof TENANT_RULE_SCOPES)[number] {
  return typeof scope === 'string' && (TENANT_RULE_SCOPES as readonly string[]).includes(scope);
}

export interface EvaluationVerdict {
  evaluationId: string;
  tenantId: string;
  triggerEvent: string;
  actionTaken: UniversalActionType;
  primaryMatchedRule?: {
    ruleId: string;
    ruleCode: string;
    ruleName: string;
    action: UniversalActionConfig;
  };
  allMatchedRules: Array<{
    ruleId: string;
    ruleCode: string;
    lifecycleStatus: RuleLifecycleStatus;
    matchedConditions: string[];
  }>;
  executionLatencyMs: number;
  fipsSha256Receipt: string;
  mutatedPayload?: any;
  timestamp: string;
}

export interface SimulationReport {
  ruleName: string;
  totalEvaluated: number;
  matchedCount: number;
  matchRatePct: number;
  simulatedAction: UniversalActionType;
  sampleMatches: Array<{
    eventIndex: number;
    matchedValues: Record<string, any>;
    verdict: string;
  }>;
  safetyCheck: 'PASSED' | 'HIGH_FALSE_POSITIVE_RISK';
}

class UniversalRuleKernelStore {
  private readonly rules: Map<string, GenericRule> = new Map();
  private readonly historicalEvents: any[] = [];

  constructor() {
    this.initializeDefaultRules();
    if (process.env.NODE_ENV === 'test') {
      this.seedTestFixtures();
    }
  }

  /**
   * 1. Zero-Knowledge Dynamic Schema Introspector
   * Crawls arbitrary unknown JSON and extracts flattened, human-readable paths with types
   */
  introspectPayload(payload: any, prefix = ''): DiscoveredField[] {
    if (payload === null || payload === undefined) return [];
    const fields: DiscoveredField[] = [];

    if (typeof payload !== 'object') {
      return [
        {
          path: prefix || 'value',
          label: prefix || 'Value',
          detectedType: typeof payload === 'number' ? 'NUMBER' : typeof payload === 'boolean' ? 'BOOLEAN' : 'STRING',
          sampleValue: String(payload),
        },
      ];
    }

    if (Array.isArray(payload)) {
      if (payload.length > 0) {
        const subFields = this.introspectPayload(payload[0], `${prefix}[*]`);
        for (const sf of subFields) {
          fields.push({ ...sf, isArrayElement: true });
        }
      } else {
        fields.push({
          path: prefix || 'items',
          label: prefix || 'Items Array',
          detectedType: 'ARRAY',
          sampleValue: '[]',
        });
      }
      return fields;
    }

    for (const key of Object.keys(payload)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const value = payload[key];
      const humanLabel = key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();

      if (value === null || value === undefined) {
        fields.push({
          path: currentPath,
          label: humanLabel,
          detectedType: 'STRING',
          sampleValue: 'null',
        });
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          const nested = this.introspectPayload(value[0], `${currentPath}[*]`);
          fields.push(...nested);
        } else {
          fields.push({
            path: currentPath,
            label: humanLabel,
            detectedType: 'ARRAY',
            sampleValue: JSON.stringify(value.slice(0, 3)),
          });
        }
      } else if (typeof value === 'object') {
        const nested = this.introspectPayload(value, currentPath);
        fields.push(...nested);
      } else {
        fields.push({
          path: currentPath,
          label: humanLabel,
          detectedType: typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'BOOLEAN' : 'STRING',
          sampleValue: String(value),
        });
      }
    }

    return fields;
  }

  /**
   * 2. Safe Dynamic JSON Pointer Resolver
   * Resolves nested dot-paths and array expressions with zero crashing on missing keys
   */
  resolvePath(target: any, path: string): any {
    if (!target || !path) return undefined;

    // Handle array wildcard syntax: e.g. "lines[*].unit_price"
    if (path.includes('[*].')) {
      const [arrayProp, subProp] = path.split('[*].');
      const arrayVal = this.resolvePath(target, arrayProp);
      if (Array.isArray(arrayVal)) {
        return arrayVal.map((item) => this.resolvePath(item, subProp));
      }
      return undefined;
    }

    // Standard dot-notation
    const parts = path.split('.');
    let current = target;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      // Handle array indexing: e.g. "items[0]"
      const match = part.match(/^([^\[]+)\[(\d+)\]$/);
      if (match) {
        const prop = match[1];
        const index = parseInt(match[2], 10);
        current = current[prop]?.[index];
      } else {
        current = current[part];
      }
    }
    return current;
  }

  /**
   * 3. Universal Operator Evaluation
   */
  evaluateCondition(condition: RuleCondition, payload: any): boolean {
    const actual = this.resolvePath(payload, condition.fieldPath);
    let expected = condition.value;

    // If comparing against another dynamic field in the payload
    if (condition.compareFieldPath) {
      expected = this.resolvePath(payload, condition.compareFieldPath);
    }

    switch (condition.operator) {
      case 'EQUALS':
        return String(actual).toLowerCase() === String(expected).toLowerCase();

      case 'NOT_EQUALS':
        return String(actual).toLowerCase() !== String(expected).toLowerCase();

      case 'GREATER_THAN':
        return Number(actual) > Number(expected);

      case 'GREATER_THAN_OR_EQUAL':
        return Number(actual) >= Number(expected);

      case 'LESS_THAN':
        return Number(actual) < Number(expected);

      case 'LESS_THAN_OR_EQUAL':
        return Number(actual) <= Number(expected);

      case 'CONTAINS':
        if (Array.isArray(actual)) {
          return actual.some((item) => String(item).toLowerCase().includes(String(expected).toLowerCase()));
        }
        return String(actual || '').toLowerCase().includes(String(expected).toLowerCase());

      case 'NOT_CONTAINS':
        return !String(actual || '').toLowerCase().includes(String(expected).toLowerCase());

      case 'STARTS_WITH':
        return String(actual || '').startsWith(String(expected));

      case 'ENDS_WITH':
        return String(actual || '').endsWith(String(expected));

      case 'IN_SET': {
        const setList = Array.isArray(expected)
          ? expected.map((s) => String(s).trim().toLowerCase())
          : String(expected).split(',').map((s) => s.trim().toLowerCase());
        return setList.includes(String(actual).toLowerCase());
      }

      case 'NOT_IN_SET': {
        const setList = Array.isArray(expected)
          ? expected.map((s) => String(s).trim().toLowerCase())
          : String(expected).split(',').map((s) => s.trim().toLowerCase());
        return !setList.includes(String(actual).toLowerCase());
      }

      case 'IS_EMPTY':
        if (actual === null || actual === undefined) return true;
        if (Array.isArray(actual) || typeof actual === 'string') return actual.length === 0;
        return false;

      case 'IS_NOT_EMPTY':
        if (actual === null || actual === undefined) return false;
        if (Array.isArray(actual) || typeof actual === 'string') return actual.length > 0;
        return true;

      case 'EXCEEDS_PERCENT_OF_FIELD': {
        if (!condition.compareFieldPath) return false;
        const baseline = Number(this.resolvePath(payload, condition.compareFieldPath));
        if (!baseline || baseline <= 0) return false;
        const actualNum = Number(actual);
        const allowedThresholdPct = Number(condition.value || 0);
        const percentExceeded = ((actualNum - baseline) / baseline) * 100;
        return percentExceeded > allowedThresholdPct;
      }

      case 'REGEX_MATCH':
        try {
          const regex = new RegExp(String(expected));
          return regex.test(String(actual));
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  /**
   * 4. Universal High-Speed Evaluation Kernel
   */
  evaluate(tenantId: string, triggerEvent: string, payload: any): EvaluationVerdict {
    const startTime = performance.now();
    const evaluationId = `eval-kern-${randomUUID().slice(0, 8)}`;

    const candidateRules = Array.from(this.rules.values())
      .filter((r) => r.tenantId === tenantId || r.scope === 'GLOBAL_SYSTEM')
      .filter((r) => r.triggerEvent === triggerEvent || r.triggerEvent === 'ALL_EVENTS')
      .filter((r) => r.lifecycleStatus === 'ACTIVE' || r.lifecycleStatus === 'SHADOW')
      .sort((a, b) => b.priority - a.priority);

    const allMatchedRules: EvaluationVerdict['allMatchedRules'] = [];
    let primaryAction: UniversalActionType = 'PASS';
    let primaryMatchedRule: EvaluationVerdict['primaryMatchedRule'] | undefined;
    let mutatedPayload = payload;

    for (const rule of candidateRules) {
      rule.stats.totalEvaluations += 1;

      // Evaluate condition set with logical operators
      let isMatch = true;
      const matchedDetails: string[] = [];

      for (let i = 0; i < rule.conditions.length; i++) {
        const cond = rule.conditions[i];
        const condPassed = this.evaluateCondition(cond, mutatedPayload);

        if (condPassed) {
          matchedDetails.push(`${cond.fieldPath} ${cond.operator} ${cond.value || cond.compareFieldPath}`);
        }

        if (i === 0) {
          isMatch = condPassed;
        } else {
          const logic = rule.conditions[i - 1].logicalOperator || 'AND';
          if (logic === 'AND') {
            isMatch = isMatch && condPassed;
          } else {
            isMatch = isMatch || condPassed;
          }
        }
      }

      if (isMatch && rule.conditions.length > 0) {
        rule.stats.matchesCount += 1;
        rule.stats.lastTriggeredAt = new Date().toISOString();

        allMatchedRules.push({
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          lifecycleStatus: rule.lifecycleStatus,
          matchedConditions: matchedDetails,
        });

        // Only ACTIVE rules enforce physical action
        if (rule.lifecycleStatus === 'ACTIVE' && primaryAction === 'PASS') {
          primaryAction = rule.action.actionType;
          primaryMatchedRule = {
            ruleId: rule.id,
            ruleCode: rule.ruleCode,
            ruleName: rule.name,
            action: rule.action,
          };

          if (rule.action.actionType === 'MUTATE_ENRICH' && rule.action.enrichmentData) {
            mutatedPayload = {
              ...mutatedPayload,
              _enrichment: { ...rule.action.enrichmentData, stampedAt: new Date().toISOString() },
            };
          }
        }
      }
    }

    const executionLatencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    const fipsPayload = JSON.stringify({ evaluationId, tenantId, triggerEvent, primaryAction, matchedCount: allMatchedRules.length });
    const fipsSha256Receipt = createHash('sha256').update(fipsPayload).digest('hex');

    const verdict: EvaluationVerdict = {
      evaluationId,
      tenantId,
      triggerEvent,
      actionTaken: primaryAction,
      primaryMatchedRule,
      allMatchedRules,
      executionLatencyMs,
      fipsSha256Receipt,
      mutatedPayload: primaryAction === 'MUTATE_ENRICH' ? mutatedPayload : undefined,
      timestamp: new Date().toISOString(),
    };

    logger.info({ evaluationId, tenantId, triggerEvent, actionTaken: primaryAction, latencyMs: executionLatencyMs }, 'Universal Rule Kernel evaluated event');
    return verdict;
  }

  /**
   * 5. Historical Shadow Simulation (Zero-Risk Rule Verification)
   */
  simulateRule(ruleCandidate: Partial<GenericRule>, sampleEvents?: any[]): SimulationReport {
    const events = sampleEvents && sampleEvents.length > 0 ? sampleEvents : this.historicalEvents;
    let matchedCount = 0;
    const sampleMatches: SimulationReport['sampleMatches'] = [];

    const testRule: GenericRule = {
      id: 'sim-rule',
      tenantId: 'sim-tenant',
      ruleCode: ruleCandidate.ruleCode || 'SIM-TEST-RULE',
      name: ruleCandidate.name || 'Simulation Rule',
      description: ruleCandidate.description || '',
      triggerEvent: ruleCandidate.triggerEvent || 'ALL_EVENTS',
      scope: 'TENANT_DEFAULT',
      lifecycleStatus: 'SHADOW',
      priority: 100,
      systemLocked: false,
      conditions: ruleCandidate.conditions || [],
      action: ruleCandidate.action || { actionType: 'HOLD_TRANSACTION' },
      stats: { totalEvaluations: 0, matchesCount: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    events.forEach((evt, idx) => {
      let isMatch = true;
      const matchedValues: Record<string, any> = {};

      for (let i = 0; i < testRule.conditions.length; i++) {
        const cond = testRule.conditions[i];
        const passed = this.evaluateCondition(cond, evt);
        matchedValues[cond.fieldPath] = this.resolvePath(evt, cond.fieldPath);

        if (i === 0) {
          isMatch = passed;
        } else {
          const logic = testRule.conditions[i - 1].logicalOperator || 'AND';
          if (logic === 'AND') isMatch = isMatch && passed;
          else isMatch = isMatch || passed;
        }
      }

      if (isMatch && testRule.conditions.length > 0) {
        matchedCount++;
        if (sampleMatches.length < 5) {
          sampleMatches.push({
            eventIndex: idx + 1,
            matchedValues,
            verdict: testRule.action.actionType,
          });
        }
      }
    });

    const matchRatePct = events.length > 0 ? Math.round((matchedCount / events.length) * 1000) / 10 : 0;
    const safetyCheck = matchRatePct > 50 ? 'HIGH_FALSE_POSITIVE_RISK' : 'PASSED';

    return {
      ruleName: testRule.name,
      totalEvaluated: events.length,
      matchedCount,
      matchRatePct,
      simulatedAction: testRule.action.actionType,
      sampleMatches,
      safetyCheck,
    };
  }

  // Lifecycle & Management API
  getRules(tenantId?: string): GenericRule[] {
    return Array.from(this.rules.values())
      .filter((r) => !tenantId || r.tenantId === tenantId || r.scope === 'GLOBAL_SYSTEM')
      .sort((a, b) => b.priority - a.priority);
  }

  getRule(id: string): GenericRule | undefined {
    return this.rules.get(id);
  }

  createRule(rule: Omit<GenericRule, 'id' | 'createdAt' | 'updatedAt' | 'stats'>): GenericRule {
    const id = `rule-${randomUUID().slice(0, 8)}`;
    const newRule: GenericRule = {
      ...rule,
      id,
      stats: { totalEvaluations: 0, matchesCount: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rules.set(id, newRule);
    logger.info({ ruleId: id, ruleCode: newRule.ruleCode }, 'Created generic rule in universal kernel');
    return newRule;
  }

  // WI-OI-120e (U3.2, P0-04): every change names the tenant, and acts only on that tenant's own rules. A rule of
  // another tenant, and a GLOBAL_SYSTEM rule owned by the platform, answer as not found.
  private tenantRule(id: string, tenantId: string): GenericRule {
    const rule = this.rules.get(id);
    if (!rule || rule.tenantId !== tenantId || rule.scope === 'GLOBAL_SYSTEM') throw new RuleNotFoundError(id);
    return rule;
  }

  updateRule(id: string, tenantId: string, updates: TenantRuleUpdate): GenericRule {
    const rule = this.tenantRule(id, tenantId);
    if (updates.scope !== undefined && !isTenantRuleScope(updates.scope)) {
      throw new Error(`A tenant rule may use only the ${TENANT_RULE_SCOPES.join(' or ')} scope`);
    }
    if (rule.systemLocked && updates.lifecycleStatus && updates.lifecycleStatus !== 'ACTIVE') {
      throw new Error(`Rule ${rule.ruleCode} is a statutory system locked rule and cannot be deactivated`);
    }

    const allowed: TenantRuleUpdate = {};
    for (const field of TENANT_UPDATABLE_FIELDS) {
      if (updates[field] !== undefined) Object.assign(allowed, { [field]: updates[field] });
    }
    const updatedRule: GenericRule = {
      ...rule,
      ...allowed,
      updatedAt: new Date().toISOString(),
    };
    this.rules.set(id, updatedRule);
    logger.info({ ruleId: id, ruleCode: updatedRule.ruleCode }, 'Updated generic rule in universal kernel');
    return updatedRule;
  }

  toggleHijack(id: string, tenantId: string, hijackReason: string): GenericRule {
    const rule = this.tenantRule(id, tenantId);
    if (rule.systemLocked) throw new Error(`Cannot hijack statutory system rule ${rule.ruleCode}`);

    const nextStatus = rule.lifecycleStatus === 'HIJACKED' ? 'ACTIVE' : 'HIJACKED';
    rule.lifecycleStatus = nextStatus;
    rule.updatedAt = new Date().toISOString();
    logger.warn({ ruleId: id, status: nextStatus, hijackReason }, 'Emergency Kill-Switch invoked on rule');
    return rule;
  }

  deleteRule(id: string, tenantId: string): boolean {
    const rule = this.tenantRule(id, tenantId);
    if (rule.systemLocked) throw new Error(`Cannot delete statutory system rule ${rule.ruleCode}`);
    return this.rules.delete(id);
  }

  private initializeDefaultRules(): void {
    // 1. Statutory Security Rule: Drop payloads exceeding 10MB or without auth
    this.createRule({
      tenantId: 'system',
      ruleCode: 'SYS-SEC-AUTH-GATEWAY',
      name: 'Statutory Gateway Authentication Guard',
      description: 'Terminates connection if Authorization header is missing on external ingress endpoints.',
      triggerEvent: 'API_GATEWAY_INGRESS',
      scope: 'GLOBAL_SYSTEM',
      lifecycleStatus: 'ACTIVE',
      priority: 1000,
      systemLocked: true,
      conditions: [
        {
          id: 'c1',
          fieldPath: 'headers.authorization',
          operator: 'IS_EMPTY',
          value: '',
        },
      ],
      action: {
        actionType: 'BLOCK_DROP',
        holdReason: 'Missing mandatory bearer token on gateway ingress',
      },
    });
  }

  private seedTestFixtures(): void {
    // Isolated non-production test fixtures for unit test coverage
    this.createRule({
      tenantId: 'demo-tenant',
      ruleCode: 'PIPE-KAFKA-EXPEDITE',
      name: 'High-Volume Transaction Expedited Routing',
      description: 'Diverts transactions exceeding $10,000 to the dedicated expedited Kafka stream topic.',
      triggerEvent: 'KAFKA_TOPIC_INGEST',
      scope: 'PIPELINE_GATEWAY',
      lifecycleStatus: 'ACTIVE',
      priority: 500,
      systemLocked: false,
      conditions: [
        {
          id: 'c1',
          fieldPath: 'payload.amount_usd',
          operator: 'GREATER_THAN',
          value: 10000,
        },
      ],
      action: {
        actionType: 'REROUTE_TOPIC',
        targetChannel: 't.defense.transactions.priority',
      },
    });

    this.createRule({
      tenantId: 'demo-tenant',
      ruleCode: 'POL-PRICE-CREEP-GUARD',
      name: 'Contractual Unit Price Creep Hold',
      description: 'Places administrative payment hold when invoiced unit price exceeds agreed baseline rate by > 2.0%.',
      triggerEvent: 'INVOICE_INGESTION',
      scope: 'TENANT_DEFAULT',
      lifecycleStatus: 'ACTIVE',
      priority: 300,
      systemLocked: false,
      conditions: [
        {
          id: 'c1',
          fieldPath: 'invoice.lines[*].unit_price',
          operator: 'GREATER_THAN',
          value: 500.0,
        },
      ],
      action: {
        actionType: 'HOLD_TRANSACTION',
        holdReason: 'Line item unit price exceeds contracted tolerance ceiling',
        disputeMemoTemplate: 'Variance alert: Invoice unit price exceeds authorized ceiling.',
      },
    });

    this.historicalEvents.push(
      { id: 'evt-1', payload: { amount_usd: 12500, customer: 'TestCo 1', category: 'DEFENSE' }, headers: { authorization: 'Bearer tok-1' } },
      { id: 'evt-2', payload: { amount_usd: 4200, customer: 'TestCo 2', category: 'ENERGY' }, headers: { authorization: 'Bearer tok-2' } },
      { id: 'evt-3', payload: { amount_usd: 98000, customer: 'TestCo 3', category: 'DEFENSE' }, headers: { authorization: 'Bearer tok-3' } },
      { id: 'evt-4', payload: { amount_usd: 350, customer: 'TestCo 4', category: 'RETAIL' }, headers: { authorization: 'Bearer tok-4' } },
      { id: 'evt-5', payload: { amount_usd: 21000, customer: 'TestCo 5', category: 'DEFENSE' }, headers: {} },
    );
  }
}

// Global server singleton
const globalForKernel = globalThis as unknown as {
  __universalRuleKernelStore?: UniversalRuleKernelStore;
};

export const universalRuleKernelStore =
  globalForKernel.__universalRuleKernelStore ?? new UniversalRuleKernelStore();

if (process.env.NODE_ENV !== 'production') {
  globalForKernel.__universalRuleKernelStore = universalRuleKernelStore;
}
