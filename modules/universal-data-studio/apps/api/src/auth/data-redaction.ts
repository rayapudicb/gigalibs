const DATA_SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /credit[-_]?card/i,
  /card[-_]?number/i,
  /cvv/i,
  /cvc/i,
  /api[-_]?key/i,
  /bank[-_]?account/i,
  /routing[-_]?number/i,
  /iban/i,
  /swift/i,
  /ssn/i,
  /tax[-_]?id/i,
  /sin/i,
];

function isSensitiveKey(key: string): boolean {
  return DATA_SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Deeply sanitizes sensitive data fields, credentials, and PII from datasets and audit records before persistence.
 */
export function redactSensitiveData(payload: unknown, parentPath = ''): {
  sanitized: any;
  redactedFields: string[];
} {
  const redactedFields: string[] = [];

  function sanitizeRecursive(val: unknown, currentPath: string): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item, index) =>
        sanitizeRecursive(item, currentPath ? `${currentPath}[${index}]` : `[${index}]`),
      );
    }

    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = currentPath ? `${currentPath}.${key}` : key;

        if (isSensitiveKey(key)) {
          result[key] = '[REDACTED]';
          redactedFields.push(fieldPath);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = sanitizeRecursive(value, fieldPath);
        } else {
          result[key] = value;
        }
      }

      return result;
    }

    return val;
  }

  const sanitized = sanitizeRecursive(payload, parentPath);
  return { sanitized, redactedFields };
}
