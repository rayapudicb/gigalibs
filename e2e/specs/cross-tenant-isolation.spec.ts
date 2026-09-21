import { test, expect } from '@playwright/test';

test.describe('Cross-Tenant Isolation & Persona Boundary Tests', () => {
  const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:5180';

  test('Unauthenticated user cannot access protected /settings route', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/settings`, { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(response.status());
  });

  test('Unauthenticated user cannot access protected /platform-admin route', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/platform-admin`, { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(response.status());
  });

  test('BFF rejects forged direct tenant header without session', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/cmms/v1/work-orders`, {
      headers: {
        'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('OAuth callback requires a verified session before processing a code', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/connections/oauth-callback`, {
      maxRedirects: 0,
    });
    expect([302, 307, 401]).toContain(response.status());
    if (response.status() !== 401) {
      expect(response.headers().location).toMatch(/\/login/);
    }
  });
});
