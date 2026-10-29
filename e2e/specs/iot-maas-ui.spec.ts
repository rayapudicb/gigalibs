/**
 * WI-OI-130: IoT Gateway UI smoke on the workflow shell (5180). Requires a deployed web image that includes /iot routes.
 * Does not create business data; read-only navigation checks.
 */
import { expect, test } from '@playwright/test';
import { hasUatLogin, signInToUat, uatAdmin } from './uat-session';

const IOT_ROUTES = [
  { path: '/iot', label: 'IoT overview' },
  { path: '/iot/devices', label: 'Devices' },
  { path: '/iot/rules', label: 'Condition rules' },
  { path: '/iot/alerts', label: 'Alerts' },
  { path: '/iot/protocols', label: 'Protocols' },
  { path: '/iot/discovery', label: 'Discovery' },
] as const;

test.describe('IoT MaaS UI (WI-OI-130)', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD in e2e/uat.env');

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToUat(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin, uatAdmin);
  });

  for (const route of IOT_ROUTES) {
    test(`${route.label} opens at ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path);
      if (response?.status() === 404) {
        test.skip(true, 'Web on 5180 does not include IoT routes yet — redeploy WEB_IMAGE from release worktree.');
      }
      expect(response?.status() ?? 0, `${route.path} HTTP status`).toBeLessThan(400);
      expect(new URL(page.url()).pathname, 'not redirected to sign-in').not.toBe('/login');
      await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
    });
  }
});
