import { describe, expect, it } from 'vitest';
import { OperatorRegistry } from './operators.js';

describe('OperatorRegistry', () => {
  const registry = new OperatorRegistry();

  it('correctly evaluates equality operators', () => {
    const eq = registry.get('equal')!;
    const neq = registry.get('notEqual')!;

    expect(eq(10, 10)).toBe(true);
    expect(eq('USD', 'USD')).toBe(true);
    expect(eq('USD', 'EUR')).toBe(false);

    expect(neq(10, 20)).toBe(true);
    expect(neq('USD', 'EUR')).toBe(true);
    expect(neq('USD', 'USD')).toBe(false);
  });

  it('correctly evaluates numeric comparison operators', () => {
    const gt = registry.get('greaterThan')!;
    const gte = registry.get('greaterThanInclusive')!;
    const lt = registry.get('lessThan')!;
    const lte = registry.get('lessThanInclusive')!;

    expect(gt(100, 50)).toBe(true);
    expect(gt(50, 100)).toBe(false);
    expect(gt(50, 50)).toBe(false);

    expect(gte(50, 50)).toBe(true);
    expect(gte(51, 50)).toBe(true);
    expect(gte(49, 50)).toBe(false);

    expect(lt(25, 50)).toBe(true);
    expect(lt(50, 25)).toBe(false);
    expect(lt(50, 50)).toBe(false);

    expect(lte(50, 50)).toBe(true);
    expect(lte(49, 50)).toBe(true);
    expect(lte(51, 50)).toBe(false);
  });

  it('correctly evaluates set inclusion operators', () => {
    const inOp = registry.get('in')!;
    const notInOp = registry.get('notIn')!;

    expect(inOp('APPROVED', ['APPROVED', 'PENDING'])).toBe(true);
    expect(inOp('REJECTED', ['APPROVED', 'PENDING'])).toBe(false);

    expect(notInOp('REJECTED', ['APPROVED', 'PENDING'])).toBe(true);
    expect(notInOp('APPROVED', ['APPROVED', 'PENDING'])).toBe(false);
  });

  it('correctly evaluates string and array containment operators', () => {
    const contains = registry.get('contains')!;
    const doesNotContain = registry.get('doesNotContain')!;
    const startsWith = registry.get('startsWith')!;
    const endsWith = registry.get('endsWith')!;

    expect(contains('Enterprise Tier', 'Enterprise')).toBe(true);
    expect(contains([1, 2, 3], 2)).toBe(true);
    expect(contains('Basic Tier', 'Enterprise')).toBe(false);

    expect(doesNotContain('Basic Tier', 'Enterprise')).toBe(true);
    expect(doesNotContain('Enterprise Tier', 'Enterprise')).toBe(false);

    expect(startsWith('INV-2026-001', 'INV-')).toBe(true);
    expect(startsWith('BILL-2026-001', 'INV-')).toBe(false);

    expect(endsWith('report.pdf', '.pdf')).toBe(true);
    expect(endsWith('report.docx', '.pdf')).toBe(false);
  });

  it('correctly evaluates regex matches safely', () => {
    const regex = registry.get('regexMatch')!;

    expect(regex('ACME-12345', '^ACME-\\d+$')).toBe(true);
    expect(regex('BETA-XYZ', '^ACME-\\d+$')).toBe(false);
    // Invalid regex pattern should fail safely
    expect(regex('test', '[invalid')).toBe(false);
  });

  it('correctly evaluates date comparison operators', () => {
    const isAfter = registry.get('isDateAfter')!;
    const isBefore = registry.get('isDateBefore')!;

    const d1 = '2026-09-25T12:00:00Z';
    const d2 = '2026-09-20T12:00:00Z';

    expect(isAfter(d1, d2)).toBe(true);
    expect(isAfter(d2, d1)).toBe(false);

    expect(isBefore(d2, d1)).toBe(true);
    expect(isBefore(d1, d2)).toBe(false);
  });

  it('allows registering custom operators', () => {
    const customRegistry = new OperatorRegistry();
    customRegistry.register('isEven', (val) => typeof val === 'number' && val % 2 === 0);

    const isEven = customRegistry.get('isEven')!;
    expect(isEven(4, null)).toBe(true);
    expect(isEven(5, null)).toBe(false);
  });
});
