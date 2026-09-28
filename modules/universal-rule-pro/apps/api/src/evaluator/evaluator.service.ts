import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  UniversalRuleEngine,
  type UniversalRule,
  type RuleEvaluationResult,
} from '@gigalibs/rule-engine-universal';
import { DatabaseService } from '../database/database.service.js';

export interface EvaluationRequest {
  domain: string;
  payload: any;
  context_id?: string;
  department?: string;
  as_of_date?: string;
  preview?: boolean;
}

export interface RuleMatch {
  rule_id: string;
  rule_code: string;
  name: string;
  domain: string;
  scope: string;
  department?: string;
  priority: number;
  published_version: string;
  action_type: string;
  action_params: any;
}

export interface ProposedAction {
  action_type: string;
  action_params: any;
  rule_code: string;
  rule_id: string;
  rule_version: string;
  requires_authorization: boolean;
  is_proposed_only: boolean;
}

export interface EvaluationResponse {
  success: boolean;
  matched: boolean;
  matched_rules_count: number;
  matched_rules: RuleMatch[];
  primary_verdict: 'MATCH' | 'NO_MATCH';
  proposed_actions: ProposedAction[];
  execution_latency_ms: number;
  domain: string;
  context_id?: string;
  as_of_date: string;
  is_preview: boolean;
  evaluated_at: string;
}

@Injectable()
export class EvaluatorService {
  constructor(private readonly db: DatabaseService) {}

  evaluateDeclarativeRule(
    rule: UniversalRule,
    payload: Record<string, unknown>,
  ): RuleEvaluationResult[] {
    const engine = new UniversalRuleEngine();
    engine.addRule(rule);
    return engine.evaluate(payload);
  }

  async evaluate(tenantId: string, req: EvaluationRequest): Promise<EvaluationResponse> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!req.domain || !req.payload || typeof req.payload !== 'object') {
      throw new BadRequestException('domain and object payload are required for rule evaluation');
    }

    const startTime = performance.now();
    const asOfDate = req.as_of_date ? new Date(req.as_of_date) : new Date();
    const isPreview = Boolean(req.preview);

    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Fetch active rules applicable to tenant, platform statutory rules, and optional department overrides
      // Enforcing effective date window: effective_from <= asOfDate AND (effective_to IS NULL OR effective_to >= asOfDate)
      const rulesSql = `
        SELECT 
          id, rule_code, name, domain, scope, department, priority,
          condition_ast, action_type, action_params, published_version,
          effective_from, effective_to
        FROM gigalibs_rules.rules
        WHERE status = 'ACTIVE'
          AND (lifecycle_status = 'PUBLISHED' OR lifecycle_status = 'ACTIVE')
          AND (domain = $1 OR domain = 'PLATFORM_GOVERNANCE')
          AND (tenant_id = $2 OR scope = 'PLATFORM')
          AND effective_from <= $3
          AND (effective_to IS NULL OR effective_to >= $3)
        ORDER BY 
          CASE scope 
            WHEN 'PLATFORM' THEN 1
            WHEN 'DEPARTMENT' THEN 2
            WHEN 'TENANT' THEN 3
            ELSE 4
          END ASC,
          priority ASC,
          created_at ASC
      `;

      const rulesRes = await client.query(rulesSql, [req.domain, tenantId, asOfDate]);
      const candidateRules = rulesRes.rows;

      const matchedRules: RuleMatch[] = [];
      const proposedActions: ProposedAction[] = [];

      for (const rule of candidateRules) {
        // Department filter: if department rule exists, evaluate only if caller department matches
        if (rule.scope === 'DEPARTMENT') {
          if (!req.department || rule.department !== req.department) {
            continue;
          }
        }

        const matches = this.evaluateAst(rule.condition_ast, req.payload);
        if (matches) {
          matchedRules.push({
            rule_id: rule.id,
            rule_code: rule.rule_code,
            name: rule.name,
            domain: rule.domain,
            scope: rule.scope,
            department: rule.department,
            priority: rule.priority,
            published_version: rule.published_version || '1.0.0',
            action_type: rule.action_type,
            action_params: rule.action_params,
          });

          proposedActions.push({
            action_type: rule.action_type,
            action_params: rule.action_params,
            rule_code: rule.rule_code,
            rule_id: rule.id,
            rule_version: rule.published_version || '1.0.0',
            requires_authorization: true,
            is_proposed_only: true, // RL-04: Return versioned decision and proposed action, not direct execution claim
          });
        }
      }

      const totalLatencyMs = Number((performance.now() - startTime).toFixed(3));
      const hasMatch = matchedRules.length > 0;
      const verdict = hasMatch ? 'MATCH' : 'NO_MATCH';
      const contextId = req.context_id || `ctx-${randomUUID().slice(0, 8)}`;

      // Await evaluation audit log persistence (RL-03: persist decision/no-match with evidence)
      await client.query(
        `INSERT INTO gigalibs_rules.rule_evaluation_logs (
          id, tenant_id, rule_id, rule_code, rule_version_id, context_id, domain,
          input_payload, matched, evaluation_verdict, proposed_action, is_preview,
          execution_latency_ms, action_taken, evaluated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
        [
          `log-${randomUUID().slice(0, 8)}`,
          tenantId,
          hasMatch ? matchedRules[0].rule_id : null,
          hasMatch ? matchedRules[0].rule_code : 'NONE',
          hasMatch ? matchedRules[0].published_version : null,
          contextId,
          req.domain,
          JSON.stringify(req.payload),
          hasMatch,
          verdict,
          JSON.stringify(proposedActions),
          isPreview,
          totalLatencyMs,
          hasMatch ? matchedRules[0].action_type : 'NONE',
        ]
      );

      return {
        success: true,
        matched: hasMatch,
        matched_rules_count: matchedRules.length,
        matched_rules: matchedRules,
        primary_verdict: verdict,
        proposed_actions: proposedActions,
        execution_latency_ms: totalLatencyMs,
        domain: req.domain,
        context_id: contextId,
        as_of_date: asOfDate.toISOString(),
        is_preview: isPreview,
        evaluated_at: new Date().toISOString(),
      };
    });
  }

  // Deterministic in-memory AST evaluator
  evaluateAst(ast: any, payload: any): boolean {
    if (!ast || typeof ast !== 'object') {
      return false;
    }

    // Logical composite operators
    if (ast.operator === 'AND') {
      if (!Array.isArray(ast.rules) || ast.rules.length === 0) return true;
      return ast.rules.every((child: any) => this.evaluateAst(child, payload));
    }

    if (ast.operator === 'OR') {
      if (!Array.isArray(ast.rules) || ast.rules.length === 0) return false;
      return ast.rules.some((child: any) => this.evaluateAst(child, payload));
    }

    if (ast.operator === 'NOT') {
      return !this.evaluateAst(ast.rule, payload);
    }

    // Atomic leaf condition
    if (ast.field && ast.operator) {
      const actualVal = this.resolvePath(payload, ast.field);
      return this.evaluateComparison(actualVal, ast.operator, ast.value, payload, ast.compare_field);
    }

    return false;
  }

  public resolvePath(obj: any, path: string): any {
    if (!obj || !path) return undefined;

    // Handle array wildcard syntax: e.g. "items[*].price"
    if (path.includes('[*].')) {
      const [arrayProp, subProp] = path.split('[*].');
      const arrayVal = this.resolvePath(obj, arrayProp);
      if (Array.isArray(arrayVal)) {
        return arrayVal.map((item) => this.resolvePath(item, subProp));
      }
      return undefined;
    }

    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
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

  public evaluateComparison(
    actual: any,
    op: string,
    expected: any,
    rootPayload?: any,
    compareField?: string,
  ): boolean {
    if (op === 'NOT_NULL' || op === 'IS_NOT_EMPTY') {
      if (Array.isArray(actual)) return actual.length > 0;
      return actual !== undefined && actual !== null && actual !== '';
    }

    if (op === 'IS_EMPTY') {
      if (Array.isArray(actual)) return actual.length === 0;
      return actual === undefined || actual === null || actual === '';
    }

    if (actual === undefined || actual === null) {
      return false;
    }

    // Wildcard array evaluation: if actual is array, match if any element satisfies condition
    if (Array.isArray(actual)) {
      return actual.some((item) => this.evaluateComparison(item, op, expected, rootPayload, compareField));
    }

    switch (op) {
      case '==':
      case 'EQUALS':
        return String(actual) === String(expected);

      case '!=':
      case 'NOT_EQUALS':
        return String(actual) !== String(expected);

      case '>':
      case 'GREATER_THAN': {
        const numActual = Number(actual);
        const numExpected = Number(expected);
        if (!Number.isFinite(numActual) || !Number.isFinite(numExpected)) return false;
        return numActual > numExpected;
      }

      case '>=':
      case 'GREATER_THAN_OR_EQUAL': {
        const numActual = Number(actual);
        const numExpected = Number(expected);
        if (!Number.isFinite(numActual) || !Number.isFinite(numExpected)) return false;
        return numActual >= numExpected;
      }

      case '<':
      case 'LESS_THAN': {
        const numActual = Number(actual);
        const numExpected = Number(expected);
        if (!Number.isFinite(numActual) || !Number.isFinite(numExpected)) return false;
        return numActual < numExpected;
      }

      case '<=':
      case 'LESS_THAN_OR_EQUAL': {
        const numActual = Number(actual);
        const numExpected = Number(expected);
        if (!Number.isFinite(numActual) || !Number.isFinite(numExpected)) return false;
        return numActual <= numExpected;
      }

      case 'BETWEEN': {
        const numActual = Number(actual);
        if (!Number.isFinite(numActual)) return false;
        if (Array.isArray(expected) && expected.length === 2) {
          const min = Number(expected[0]);
          const max = Number(expected[1]);
          if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
          return numActual >= min && numActual <= max;
        }
        return false;
      }

      case 'IN':
      case 'IN_SET':
        return Array.isArray(expected) && expected.map(String).includes(String(actual));

      case 'NOT_IN_SET':
        return Array.isArray(expected) && !expected.map(String).includes(String(actual));

      case 'CONTAINS':
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());

      case 'NOT_CONTAINS':
        return !String(actual).toLowerCase().includes(String(expected).toLowerCase());

      case 'STARTS_WITH':
        return String(actual).startsWith(String(expected));

      case 'ENDS_WITH':
        return String(actual).endsWith(String(expected));

      case 'REGEX_MATCH': {
        try {
          const regex = new RegExp(String(expected));
          return regex.test(String(actual));
        } catch {
          return false;
        }
      }

      case 'EXCEEDS_PERCENT_OF_FIELD': {
        if (!rootPayload || !compareField) return false;
        const baselineVal = Number(this.resolvePath(rootPayload, compareField));
        const currentVal = Number(actual);
        const percentThreshold = Number(expected);
        if (!Number.isFinite(baselineVal) || !Number.isFinite(currentVal) || !Number.isFinite(percentThreshold)) {
          return false;
        }
        if (baselineVal === 0) return false;
        const percentageIncrease = ((currentVal - baselineVal) / baselineVal) * 100;
        return percentageIncrease > percentThreshold;
      }

      default:
        return false;
    }
  }
}
