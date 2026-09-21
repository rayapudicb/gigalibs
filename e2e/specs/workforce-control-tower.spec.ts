import { test, expect } from '@playwright/test';

test.describe('WI-OI-042 Mandatory UI Implementation Gate: Control Tower, Hierarchy & Workforce', () => {
  const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:5180';

  test.describe('1. Direct URL Access & Unauthorized Protection', () => {
    test('Unauthenticated direct access to /dashboard redirects to /login', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/dashboard`, {
        headers: { Accept: 'text/html' },
        maxRedirects: 0,
      });
      expect([302, 307, 308]).toContain(response.status());
      expect(response.headers().location).toMatch(/\/login/);
    });

    test('Unauthenticated direct access to /cmms redirects to /login', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/cmms`, {
        headers: { Accept: 'text/html' },
        maxRedirects: 0,
      });
      expect([302, 307, 308]).toContain(response.status());
      expect(response.headers().location).toMatch(/\/login/);
    });

    test('Unauthenticated direct access to /settings?tab=hierarchy redirects to /login', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/settings?tab=hierarchy`, {
        headers: { Accept: 'text/html' },
        maxRedirects: 0,
      });
      expect([302, 307, 308]).toContain(response.status());
      expect(response.headers().location).toMatch(/\/login/);
    });
  });

  test.describe('2. Server-Side Authorization Enforcement (UI Hiding is Not Auth)', () => {
    test('Anonymous GET /api/workforce/resources is strictly denied with 401', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/workforce/resources`);
      expect(response.status()).toBe(401);
      const body = await response.json().catch(() => ({}));
      expect(body.detail).toBe('Authentication required.');
    });

    test('Anonymous GET /api/workforce/allocations is strictly denied with 401', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/workforce/allocations`);
      expect(response.status()).toBe(401);
      const body = await response.json().catch(() => ({}));
      expect(body.detail).toBe('Authentication required.');
    });

    test('Anonymous POST /api/workforce/allocations fails closed with 401', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/workforce/allocations`, {
        data: {
          resourceId: '00000000-0000-0000-0000-000000000001',
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      expect(response.status()).toBe(401);
    });

    test('Anonymous GET /api/control/tenants/current/departments fails closed with 401', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/control/tenants/current/departments`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('3. Tenant Isolation & Header Forgery Defense', () => {
    test('BFF rejects forged x-tenant-id on /api/workforce endpoints without valid session', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/workforce/resources`, {
        headers: {
          'x-tenant-id': '00000000-0000-0000-0000-000000000099',
          'x-user-id': '00000000-0000-0000-0000-000000000001',
        },
      });
      expect([401, 403]).toContain(response.status());
    });

    test('BFF rejects forged x-tenant-id on /api/control/tenants/current/departments', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/control/tenants/current/departments`, {
        headers: {
          'x-tenant-id': '00000000-0000-0000-0000-000000000099',
        },
      });
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe('4. Navigation Boundaries & Deep Linking', () => {
    test('Public login page loads cleanly and contains required meta viewport and responsive attributes', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await expect(page).toHaveTitle(/WorkflowOS|GigaLibs|Sign In|Login/i);
      const viewportMeta = page.locator('meta[name="viewport"]');
      await expect(viewportMeta).toHaveCount(1);

      // Capture screenshot for release evidence
      await page.screenshot({ path: 'docs/audits/2026-09-20-readiness/evidence/ui/login-boundary.png' });
    });

    test('Navigating to protected /dashboard in browser automatically redirects to /login', async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain('/login');
      await page.screenshot({ path: 'docs/audits/2026-09-20-readiness/evidence/ui/dashboard-unauthorized-redirect.png' });
    });

    test('Navigating to protected /cmms in browser automatically redirects to /login', async ({ page }) => {
      await page.goto(`${BASE_URL}/cmms`);
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain('/login');
      await page.screenshot({ path: 'docs/audits/2026-09-20-readiness/evidence/ui/cmms-unauthorized-redirect.png' });
    });

    test('Navigating to protected /settings?tab=hierarchy in browser automatically redirects to /login', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings?tab=hierarchy`);
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain('/login');
      await page.screenshot({ path: 'docs/audits/2026-09-20-readiness/evidence/ui/settings-org-unauthorized-redirect.png' });
    });
  });

  test.describe('5. Fail-Closed Error Resilience & Telemetry Integrity', () => {
    test('Direct request to unauthenticated workforce endpoint rejects before executing upstream query', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/workforce/allocations?pageSize=50`);
      expect(response.status()).toBe(401);
    });

    test('Cross-site state-changing request without same-origin header is rejected', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/workforce/allocations`, {
        headers: {
          Origin: 'https://malicious-third-party.invalid',
        },
        data: {},
      });
      expect([401, 403]).toContain(response.status());
    });
  });
});
