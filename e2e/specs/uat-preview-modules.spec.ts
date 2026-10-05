/**
 * WI-OI-120a (U1) smoke for the UAT instance: with GIGALIBS_UAT_PREVIEW=enabled every module, PLANNED and
 * CONTAINED ones included, is listed in the menu and opens for an entitled UAT tenant administrator, and every
 * module that is not production-ready carries the UAT banner. The four ERP workspaces say their figures are
 * hard-coded illustrations until their own cards connect them.
 *
 * E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD: an administrator of a clearly named UAT tenant that holds every
 * entitlement-eligible module. The spec reads the generated catalogue, so new modules are covered automatically.
 * It only reads screens; it creates no business data.
 */
import { expect, test, type Page } from '@playwright/test';
import { generatedPlatformModuleCatalog } from '../../packages/contracts/src/modules/catalog.generated';

const admin = {
  email: process.env.E2E_UAT_ADMIN_EMAIL ?? '',
  password: process.env.E2E_UAT_ADMIN_PASSWORD ?? '',
};

const sampleFigureModules = new Set([
  'universal-inventory',
  'universal-procurement',
  'universal-orders',
  'financial-operations',
]);

const tenantModules = generatedPlatformModuleCatalog.filter(
  (module) => module.entitlementEligible && module.key !== 'platform-control',
);

async function signIn(page: Page, origin: string) {
  const response = await page.request.post('/api/auth/login', { data: admin, headers: { Origin: origin } });
  expect(response.status(), await response.text()).toBe(200);
}

test.describe('UAT preview: every module visible and labelled', () => {
  test.skip(!admin.email || !admin.password, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD for the UAT tenant.');

  test.beforeEach(async ({ page, baseURL }) => {
    await signIn(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
  });

  test('the menu lists every entitlement-eligible module, locked ones with a UAT label', async ({ page }) => {
    await page.goto('/modules');
    const navigation = page.locator('aside');
    for (const module of tenantModules) {
      await expect(navigation.getByRole('link', { name: module.navigationLabel }).first(), module.key).toBeVisible();
    }
    const lockedCount = tenantModules.filter((m) => m.readiness === 'PLANNED' || m.readiness === 'CONTAINED').length;
    await expect(navigation.getByTitle('UAT preview: not production-ready')).toHaveCount(lockedCount);
  });

  for (const module of tenantModules) {
    test(`${module.key} opens at ${module.route} with its UAT status`, async ({ page }) => {
      const response = await page.goto(module.route);
      expect(response?.status() ?? 0, `${module.route} HTTP status`).toBeLessThan(400);
      expect(new URL(page.url()).pathname, 'not redirected to sign-in').not.toBe('/login');
      await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);

      const banner = page.locator(`[data-uat-preview-banner="${module.key}"]`);
      const locked = module.readiness === 'PLANNED' || module.readiness === 'CONTAINED';
      if (locked || sampleFigureModules.has(module.key)) {
        await expect(banner).toBeVisible();
        await expect(banner).toHaveAttribute('role', 'status');
        if (sampleFigureModules.has(module.key)) await expect(banner).toContainText('hard-coded illustrations');
      } else {
        await expect(banner).toHaveCount(0);
      }
    });
  }
});
