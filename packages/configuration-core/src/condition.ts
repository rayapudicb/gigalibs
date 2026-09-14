import type { ConfigurationCondition } from '@gigalibs/contracts';

export function evaluateConfigurationCondition(
  condition: ConfigurationCondition,
  values: Record<string, unknown>,
): boolean {
  if (condition.kind === 'GROUP') {
    return condition.combinator === 'ALL'
      ? condition.conditions.every((item) => evaluateConfigurationCondition(item, values))
      : condition.conditions.some((item) => evaluateConfigurationCondition(item, values));
  }
  const actual = values[condition.fieldKey];
  switch (condition.operator) {
    case 'IS_EMPTY':
      return isConfigurationValueEmpty(actual);
    case 'IS_NOT_EMPTY':
      return !isConfigurationValueEmpty(actual);
    case 'EQUALS':
      return comparable(actual) === comparable(condition.value);
    case 'NOT_EQUALS':
      return comparable(actual) !== comparable(condition.value);
    case 'GREATER_THAN':
      return (
        typeof actual === 'number' &&
        typeof condition.value === 'number' &&
        actual > condition.value
      );
    case 'GREATER_THAN_OR_EQUAL':
      return (
        typeof actual === 'number' &&
        typeof condition.value === 'number' &&
        actual >= condition.value
      );
    case 'LESS_THAN':
      return (
        typeof actual === 'number' &&
        typeof condition.value === 'number' &&
        actual < condition.value
      );
    case 'LESS_THAN_OR_EQUAL':
      return (
        typeof actual === 'number' &&
        typeof condition.value === 'number' &&
        actual <= condition.value
      );
    case 'IN':
      return (
        Array.isArray(condition.value) &&
        condition.value.some((item) => comparable(item) === comparable(actual))
      );
    case 'CONTAINS':
      return Array.isArray(actual)
        ? actual.some((item) => comparable(item) === comparable(condition.value))
        : typeof actual === 'string' &&
            typeof condition.value === 'string' &&
            actual.includes(condition.value);
  }
}

export function isConfigurationValueEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(comparable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${comparable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
