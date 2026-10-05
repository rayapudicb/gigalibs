import type {
  DictionaryValidationExpression,
  DictionaryValidationRuleV1,
} from '@gigalibs/contracts';

/**
 * Client-side and server-side Safe AST evaluator for bounded dictionary validation rules.
 * Does not use eval, Function, or SQL. Recursion depth strictly bounded to <= 10.
 *
 * WI-OI-120f (F0.1): the evaluator fails closed. An incomplete comparison, an empty group, an unknown operator or a
 * value of the wrong kind evaluates to false (metadata investigation M-03): a visibility rule then hides, and a
 * validation rule then reports its error. Numbers compare exactly, whether they arrive as numbers or as decimal
 * strings such as "12.50".
 */
export function evaluateDictionaryCondition(
  expr: DictionaryValidationExpression,
  values: Record<string, unknown>,
  currentDepth = 1,
): boolean {
  if (currentDepth > 10) return false;

  if (expr.all) {
    return expr.all.length > 0 && expr.all.every((child) => evaluateDictionaryCondition(child, values, currentDepth + 1));
  }
  if (expr.any) {
    return expr.any.length > 0 && expr.any.some((child) => evaluateDictionaryCondition(child, values, currentDepth + 1));
  }
  if (expr.not) {
    return !evaluateDictionaryCondition(expr.not, values, currentDepth + 1);
  }

  if (!expr.field || !expr.operator) return false;
  const val = values[expr.field];

  switch (expr.operator) {
    case 'EQ':
      return sameValue(val, expr.value);
    case 'NEQ':
      return !sameValue(val, expr.value);
    case 'IS_NULL':
      return val === null || val === undefined || val === '';
    case 'IS_NOT_NULL':
      return val !== null && val !== undefined && val !== '';
    case 'GT':
      return compared(val, expr.value, (order) => order > 0);
    case 'LT':
      return compared(val, expr.value, (order) => order < 0);
    case 'GTE':
      return compared(val, expr.value, (order) => order >= 0);
    case 'LTE':
      return compared(val, expr.value, (order) => order <= 0);
    case 'IN':
      return Array.isArray(expr.value) && expr.value.some((candidate) => sameValue(val, candidate));
    case 'NOT_IN':
      return Array.isArray(expr.value) && !expr.value.some((candidate) => sameValue(val, candidate));
    case 'CONTAINS':
      return typeof val === 'string' && typeof expr.value === 'string' && val.includes(expr.value);
    case 'MATCHES_REGEX':
      if (typeof val !== 'string' || typeof expr.value !== 'string' || expr.value.length > 200) return false;
      try {
        const regex = new RegExp(expr.value);
        return regex.test(val);
      } catch {
        return false;
      }
    default:
      return false;
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

const DECIMAL = /^-?\d{1,30}(?:\.\d{1,12})?$/;

/** A finite number or a plain decimal string as an exact (units, scale) pair, or null when it is neither. */
export function parseExactDecimal(value: unknown): { units: bigint; scale: number } | null {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = String(value);
    if (/e/i.test(text)) return null;
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }
  if (!DECIMAL.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const units = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n);
  return { units, scale: fraction.length };
}

/** Exact comparison of two decimals: negative, zero or positive; null when either is not a decimal. */
export function compareExactDecimals(left: unknown, right: unknown): number | null {
  const a = parseExactDecimal(left);
  const b = parseExactDecimal(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const x = a.units * 10n ** BigInt(scale - a.scale);
  const y = b.units * 10n ** BigInt(scale - b.scale);
  return x === y ? 0 : x < y ? -1 : 1;
}

function compared(left: unknown, right: unknown, test: (order: number) => boolean): boolean {
  const order = compareExactDecimals(left, right);
  return order !== null && test(order);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const order = compareExactDecimals(left, right);
  return order === 0;
}
