import { describe, expect, it } from 'vitest';
import { FactExtractor } from './fact-extractor.js';

describe('FactExtractor', () => {
  it('resolves direct and nested object paths', () => {
    const facts = {
      user: {
        id: 'usr_123',
        profile: {
          address: {
            city: 'London',
            postalCode: 'EC1A 1BB',
          },
        },
      },
      invoice: {
        totalMinor: 15000,
      },
    };

    expect(FactExtractor.resolvePath(facts, 'user.id')).toBe('usr_123');
    expect(FactExtractor.resolvePath(facts, 'user.profile.address.city')).toBe('London');
    expect(FactExtractor.resolvePath(facts, 'invoice.totalMinor')).toBe(15000);
  });

  it('returns undefined for non-existent paths', () => {
    const facts = { user: { name: 'Alice' } };
    expect(FactExtractor.resolvePath(facts, 'user.email')).toBeUndefined();
    expect(FactExtractor.resolvePath(facts, 'user.profile.address.city')).toBeUndefined();
    expect(FactExtractor.resolvePath(facts, 'nonExistent')).toBeUndefined();
  });

  it('blocks prototype pollution attempts', () => {
    const facts = { normal: 'data' };
    expect(FactExtractor.resolvePath(facts, '__proto__')).toBeUndefined();
    expect(FactExtractor.resolvePath(facts, 'constructor')).toBeUndefined();
    expect(FactExtractor.resolvePath(facts, 'prototype')).toBeUndefined();
    expect(FactExtractor.resolvePath(facts, '__proto__.polluted')).toBeUndefined();
    expect(FactExtractor.resolvePath(facts, 'normal.constructor.prototype')).toBeUndefined();
  });

  it('handles empty and nullish inputs gracefully', () => {
    expect(FactExtractor.resolvePath({}, '')).toBeUndefined();
    expect(FactExtractor.resolvePath(null as any, 'user.id')).toBeUndefined();
    expect(FactExtractor.resolvePath(undefined as any, 'user.id')).toBeUndefined();
  });
});
