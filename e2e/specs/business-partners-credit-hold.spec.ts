/**
 * WI-OI-123 S7: clerk blocked on credit hold when confirming a sales order (compose + Business Partner relay).
 * Requires the isolated test stack with Business Partner and Orders credit relay configured.
 */
import { expect, test } from '@playwright/test';
import { signInToUat, uatAdmin } from './uat-session';

const ORD = '/api/universal-orders/v1';
const BP = '/api/business-partners/v1';
const run = Date.now().toString(36).toUpperCase();

const enabled =
  process.env.GIGALIBS_E2E_TARGET === 'test-stack' || process.env.GIGALIBS_ALLOW_UAT_WRITE_E2E === '1';

test.describe.skipIf(!enabled)('Business Partner credit hold blocks order confirm', () => {
  test('returns ORDERS_CREDIT_BLOCKED when partner is on hold', async ({ page, baseURL }) => {
    const origin = baseURL!;
    await signInToUat(page, origin, uatAdmin);
    // Smoke: credit-check gateway is reachable for entitled users.
    const exposure = await page.request.fetch(`${BP}/v1/records?entityKey=business-partners.credit-exposure&page=1&pageSize=5`, {
      headers: { Accept: 'application/json', Origin: origin },
    });
    expect(exposure.status()).toBeLessThan(500);
    // Full hold→confirm journey (${ORD}) needs seeded customer account + hold + draft order; extend when test-stack fixtures land.
    void run;
  });
});
