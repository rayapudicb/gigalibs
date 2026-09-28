const DEFAULT_SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apiKey/i,
  /api_key/i,
  /authorization/i,
  /creditCard/i,
  /credit_card/i,
  /cvv/i,
  /ssn/i,
  /totp/i,
  /privateKey/i,
  /private_key/i,
];

export interface RedactionResult<T> {
  sanitized: T;
  redactedFields: string[];
}

export function redactSensitiveFields<T>(
  value: T,
  customSensitiveKeys?: string[],
  parentPath = '',
): RedactionResult<T> {
  const redactedFields: string[] = [];

  function isSensitiveKey(key: string): boolean {
    if (customSensitiveKeys && customSensitiveKeys.includes(key)) {
      return true;
    }
    return DEFAULT_SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
  }

  function sanitize(val: unknown, currentPath: string): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;

    if (Array.isArray(val)) {
      return val.map((item, index) => sanitize(item, `${currentPath}[${index}]`));
    }

    const result: Record<string, unknown> = {};
    for (const [key, propVal] of Object.entries(val as Record<string, unknown>)) {
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
        redactedFields.push(fieldPath);
      } else {
        result[key] = sanitize(propVal, fieldPath);
      }
    }
    return result;
  }

  const sanitized = sanitize(value, parentPath) as T;
  return { sanitized, redactedFields };
}
