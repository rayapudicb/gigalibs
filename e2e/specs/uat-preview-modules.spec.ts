/**
 * WI-OI-120a (U1) smoke for the UAT instance: with GIGALIBS_UAT_PREVIEW=enabled every module, PLANNED and
 * CONTAINED ones included, is listed in the menu and opens for an entitled UAT tenant administrator. The owner
 * removed the on-screen UAT labels on 2026-10-05 (WI-OI-120b), so no module shows a padlock or a UAT mark.
 *
 * E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD: an administrator of a clearly named UAT tenant that holds every
 * entitlement-eligible module. The spec reads the generated catalogue, so new modules are covered automatically.
 * It only reads screens; it creates no business data.
 */
import { expect, test, type Page } from '@playwright/test';
import { signInToUat } from './uat-session';
import { generatedPlatformModuleCatalog } from '../../packages/contracts/src/modules/catalog.generated';

const admin = {
  email: process.env.E2E_UAT_ADMIN_EMAIL ?? '',
  password: process.env.E2E_UAT_ADMIN_PASSWORD ?? '',
};

const tenantModules = generatedPlatformModuleCatalog.filter(
  (module) => module.entitlementEligible && module.key !== 'platform-control',
);

async function signIn(page: Page, origin: string) {
  // The UAT logins belong to more than one workspace; the shared helper picks the UAT one (WI-OI-120k).
  await signInToUat(page, origin, admin);
}

test.describe('UAT preview: every module visible and openable', () => {
  test.skip(!admin.email || !admin.password, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD for the UAT tenant.');

  test.beforeEach(async ({ page, baseURL }) => {
    await signIn(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
  });

  test('the menu shows no padlock or UAT mark', async ({ page }) => {
    // WI-OI-120k: the side menu now lists the modules of the chosen persona ("My: Workspace Admin"), so a module may be
    // reached outside it (Personal Security & Profile is under the account menu). Every module's own route is checked
    // to open below; this test keeps the owner's 2026-10-05 rule that no module shows a padlock or UAT mark.
    await page.goto('/modules');
    const navigation = page.locator('aside');
    await expect(navigation.getByRole('link').first()).toBeVisible();
    await expect(navigation.getByTitle('Not available')).toHaveCount(0);
    await expect(navigation.getByTitle('UAT preview: not production-ready')).toHaveCount(0);
  });

  for (const module of tenantModules) {
    test(`${module.key} opens at ${module.route}`, async ({ page }) => {
      const response = await page.goto(module.route);
      expect(response?.status() ?? 0, `${module.route} HTTP status`).toBeLessThan(400);
      expect(new URL(page.url()).pathname, 'not redirected to sign-in').not.toBe('/login');
      await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
      await expect(page.locator('[data-uat-preview-banner]')).toHaveCount(0);
    });
  }
});
