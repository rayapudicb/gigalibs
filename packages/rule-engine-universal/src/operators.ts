export type OperatorFn = (factValue: unknown, targetValue: unknown) => boolean;

export class OperatorRegistry {
  private operators = new Map<string, OperatorFn>();

  constructor() {
    this.registerDefaults();
  }

  register(name: string, fn: OperatorFn): void {
    this.operators.set(name, fn);
  }

  get(name: string): OperatorFn | undefined {
    return this.operators.get(name);
  }

  private registerDefaults(): void {
    this.register('equal', (a, b) => a === b);
    this.register('notEqual', (a, b) => a !== b);
    this.register('greaterThan', (a, b) => typeof a === 'number' && typeof b === 'number' && a > b);
    this.register('greaterThanInclusive', (a, b) => typeof a === 'number' && typeof b === 'number' && a >= b);
    this.register('lessThan', (a, b) => typeof a === 'number' && typeof b === 'number' && a < b);
    this.register('lessThanInclusive', (a, b) => typeof a === 'number' && typeof b === 'number' && a <= b);
    this.register('in', (a, b) => Array.isArray(b) && b.includes(a));
    this.register('notIn', (a, b) => Array.isArray(b) && !b.includes(a));
    this.register('contains', (a, b) => {
      if (typeof a === 'string' && typeof b === 'string') return a.includes(b);
      if (Array.isArray(a)) return a.includes(b);
      return false;
    });
    this.register('doesNotContain', (a, b) => {
      if (typeof a === 'string' && typeof b === 'string') return !a.includes(b);
      if (Array.isArray(a)) return !a.includes(b);
      return true;
    });
    this.register('startsWith', (a, b) => typeof a === 'string' && typeof b === 'string' && a.startsWith(b));
    this.register('endsWith', (a, b) => typeof a === 'string' && typeof b === 'string' && a.endsWith(b));
    this.register('regexMatch', (a, b) => {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      try {
        return new RegExp(b).test(a);
      } catch {
        return false;
      }
    });
    this.register('isDateAfter', (a, b) => new Date(String(a)).getTime() > new Date(String(b)).getTime());
    this.register('isDateBefore', (a, b) => new Date(String(a)).getTime() < new Date(String(b)).getTime());
  }
}
