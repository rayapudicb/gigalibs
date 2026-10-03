import type {
  DictionaryValidationExpression,
  DictionaryValidationRuleV1,
} from '@gigalibs/contracts';

/**
 * Client-side and server-side Safe AST evaluator for bounded dictionary validation rules.
 * Does not use eval, Function, or SQL. Recursion depth strictly bounded to <= 10.
 */
export function evaluateDictionaryCondition(
  expr: DictionaryValidationExpression,
  values: Record<string, unknown>,
  currentDepth = 1,
): boolean {
  if (currentDepth > 10) return false;

  if (expr.all && expr.all.length > 0) {
    return expr.all.every((child) => evaluateDictionaryCondition(child, values, currentDepth + 1));
  }
  if (expr.any && expr.any.length > 0) {
    return expr.any.some((child) => evaluateDictionaryCondition(child, values, currentDepth + 1));
  }
  if (expr.not) {
    return !evaluateDictionaryCondition(expr.not, values, currentDepth + 1);
  }

  if (!expr.field || !expr.operator) return true;
  const val = values[expr.field];

  switch (expr.operator) {
    case 'EQ':
      return val === expr.value;
    case 'NEQ':
      return val !== expr.value;
    case 'IS_NULL':
      return val === null || val === undefined || val === '';
    case 'IS_NOT_NULL':
      return val !== null && val !== undefined && val !== '';
    case 'GT':
      return typeof val === 'number' && typeof expr.value === 'number' && val > expr.value;
    case 'LT':
      return typeof val === 'number' && typeof expr.value === 'number' && val < expr.value;
    case 'GTE':
      return typeof val === 'number' && typeof expr.value === 'number' && val >= expr.value;
    case 'LTE':
      return typeof val === 'number' && typeof expr.value === 'number' && val <= expr.value;
    case 'IN':
      return Array.isArray(expr.value) && expr.value.includes(val);
    case 'NOT_IN':
      return Array.isArray(expr.value) && !expr.value.includes(val);
    case 'CONTAINS':
      return typeof val === 'string' && typeof expr.value === 'string' && val.includes(expr.value);
    case 'MATCHES_REGEX':
      if (typeof val !== 'string' || typeof expr.value !== 'string') return false;
      try {
        const regex = new RegExp(expr.value);
        return regex.test(val);
      } catch {
        return false;
      }
    default:
      return true;
  }
}

/**
 * Evaluates all validation rules declared in the manifest against form values.
 */
export function validateDictionaryRules(
  rules: readonly DictionaryValidationRuleV1[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const rule of rules) {
    const passed = evaluateDictionaryCondition(rule.condition, values);
    if (!passed) {
      const fieldKey = rule.condition.field || rule.ruleKey;
      errors[fieldKey] = rule.errorMessage;
    }
  }
  return errors;
}
