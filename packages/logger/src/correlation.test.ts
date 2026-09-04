import { describe, expect, it, vi } from 'vitest';
import { correlationMiddleware, resolveCorrelationId } from './correlation.js';

describe('correlation boundary', () => {
  it('preserves a bounded opaque identifier', () => {
    expect(resolveCorrelationId('01J8VXW6F1J2G3H4K5M6N7P8Q9')).toBe('01J8VXW6F1J2G3H4K5M6N7P8Q9');
  });

  it.each(['short', 'contains whitespace', 'line\nbreak', `x${'a'.repeat(128)}`])(
    'replaces an invalid value without reflecting it: %s',
    (invalid) => {
      const resolved = resolveCorrelationId(invalid);
      expect(resolved).toMatch(/^[a-f0-9]{16}$/);
      expect(resolved).not.toContain(invalid);
    },
  );

  it('returns the resolved identifier on the response boundary', () => {
    const setHeader = vi.fn();
    const next = vi.fn();
    correlationMiddleware(
      { headers: { 'x-correlation-id': 'invalid\nvalue' } },
      { setHeader },
      next,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'X-Correlation-ID',
      expect.stringMatching(/^[a-f0-9]{16}$/),
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
