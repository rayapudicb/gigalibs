export class FactExtractor {
  /**
   * Resolves a nested property path from an object fact.
   * e.g. resolvePath({ user: { address: { city: 'Tokyo' } } }, 'user.address.city') -> 'Tokyo'
   */
  static resolvePath(facts: Record<string, unknown>, path: string): unknown {
    if (!path) return undefined;
    if (path in facts) return facts[path];

    const parts = path.split('.');
    let current: any = facts;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
