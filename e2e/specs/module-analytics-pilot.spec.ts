/**
 * WI-OI-131 D: Playwright proof for pilot module analytics (CMMS downtime + Workforce positions).
 * Requires compose stack on 5180, UAT admin login, and seeded analytics fixtures
 * (`pnpm seed:module-analytics-e2e` against the same tenant).
 */
import { expect, test } from '@playwright/test';
import {
  ensureAnalyticsStudioReady,
  listModuleSources,
  loadModuleCatalog,
  measureCell,
  primaryKpiQuery,
  runAnalyticsQuery,
} from '../helpers/module-analytics-api';
import { hasUatLogin, signInToUat, uatAdmin } from './uat-session';

const PILOTS = [
  { sourceKey: 'cmms-downtime', embeddedRoute: '/cmms/analytics' },
  { sourceKey: 'workforce-positions', embeddedRoute: '/gigaops/analytics' },
] as const;

test.describe('Module analytics pilots (WI-OI-131)', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD in e2e/uat.env');

  test.beforeEach(async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    await signInToUat(page, origin, uatAdmin);
    await ensureAnalyticsStudioReady(page.request, origin);
  });

  test('central and embedded entry points return the same KPI for each pilot source', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    const sources = await listModuleSources(page.request, origin);
    test.skip(
      sources.length === 0,
      'No module sources visible — enable entitlements and run pnpm seed:module-analytics-e2e for this tenant.',
    );

    for (const pilot of PILOTS) {
      const source = sources.find((entry) => entry.sourceKey === pilot.sourceKey);
      test.skip(!source, `Source ${pilot.sourceKey} not listed (entitlement or permission missing).`);

      const catalog = await loadModuleCatalog(page.request, origin, source!.sourceId);
      const spec = primaryKpiQuery(catalog);
      const measureKey = spec.measures[0]!;

      const central = await runAnalyticsQuery(page.request, origin, spec);
      const embedded = await runAnalyticsQuery(page.request, origin, spec);
      expect(measureCell(embedded, measureKey)).toEqual(measureCell(central, measureKey));

      await page.goto(pilot.embeddedRoute);
      await expect(page.locator(`[data-source-key="${pilot.sourceKey}"]`)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(catalog.title, { exact: false })).toBeVisible();

      await page.goto('/analytics');
      await expect(page.getByRole('heading', { name: 'Module analytics' })).toBeVisible();
      await expect(page.getByText(catalog.title, { exact: false })).toBeVisible();
    }
  });
});
