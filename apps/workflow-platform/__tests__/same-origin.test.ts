import { describe, expect, it } from 'vitest';
import { hasSameOrigin } from '../lib/same-origin';

describe('same-origin write boundary', () => {
  it('uses the public host headers when Next is bound to a wildcard interface', () => {
    const request = new Request('http://0.0.0.0:5180/api/ar/v1/customers', {
      headers: { host: 'localhost:5180', origin: 'http://localhost:5180' },
    });
    expect(hasSameOrigin(request)).toBe(true);
  });

  it('supports an explicitly forwarded HTTPS origin', () => {
    const request = new Request('http://127.0.0.1:5180/api/ar/v1/invoices', {
      headers: {
        host: '127.0.0.1:5180',
        origin: 'https://uat.gigalibs.example',
        'x-forwarded-host': 'uat.gigalibs.example',
        'x-forwarded-proto': 'https',
      },
    });
    expect(hasSameOrigin(request)).toBe(true);
  });

  it.each([
    undefined,
    'https://attacker.example',
    'http://localhost:9999',
    'not a url',
  ])('rejects a missing or foreign origin: %s', (origin) => {
    const headers = new Headers({ host: 'localhost:5180' });
    if (origin) headers.set('origin', origin);
    expect(
      hasSameOrigin(new Request('http://0.0.0.0:5180/api/ar/v1/setup', { headers })),
    ).toBe(false);
  });
});
