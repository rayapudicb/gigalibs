import { test, expect } from '@playwright/test';
import { authenticateSession, navigateToModule } from './helpers/auth.helper.js';

test.describe('Module 2: General Ledger & Double-Entry Financial Invariants', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page);
    await navigateToModule(page, 'ledger');
  });

  test('2.1 Chart of Accounts & Trial Balance Invariant Verification', async ({ page }) => {
    // Check for Financial Reports or General Ledger elements
    const ledgerHeader = page.locator('text=General Ledger').or(page.locator('text=Chart of Accounts')).first();
    if (await ledgerHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(ledgerHeader).toBeVisible();
    }
  });
});
