const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class FactExtractor {
  /**
   * Resolves a nested property path from an object fact safely.
   * e.g. resolvePath({ user: { address: { city: 'Tokyo' } } }, 'user.address.city') -> 'Tokyo'
   */
  static resolvePath(facts: Record<string, unknown>, path: string): unknown {
    if (!path || typeof facts !== 'object' || facts === null) return undefined;
    if (Object.prototype.hasOwnProperty.call(facts, path) && !FORBIDDEN_KEYS.has(path)) {
      return facts[path];
    }

    const parts = path.split('.');
    let current: any = facts;

    for (const part of parts) {
      if (FORBIDDEN_KEYS.has(part)) {
        return undefined;
      }
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
