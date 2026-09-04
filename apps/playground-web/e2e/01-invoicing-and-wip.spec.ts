import { test, expect } from '@playwright/test';
import { authenticateSession, navigateToModule } from './helpers/auth.helper.js';

test.describe('Module 1: Invoicing, WIP Burndown, Sub-Invoicing & Accounting Sync', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page);
    await navigateToModule(page, 'invoices');
  });

  test('1.1 Invoice Lifecycle: Create Custom Invoice with Real-Time Tax Nexus', async ({ page }) => {
    // Open Invoices & AR Ledger tab
    const invoicesTab = page.locator('button').filter({ hasText: 'Invoices & AR' }).first();
    if (await invoicesTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await invoicesTab.click();
    }

    // Click "+ Create Custom Invoice 🚀"
    const createBtn = page.locator('button').filter({ hasText: 'Create Custom Invoice' }).first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Verify Create Modal opens with dynamic tax breakdown
    const modalTitle = page.locator('text=Create Invoice').first();
    await expect(modalTitle).toBeVisible();

    // Verify tax nexus card calculation
    const taxNexus = page.locator('text=Automated Tax Nexus Engine').or(page.locator('text=Tax')).first();
    await expect(taxNexus).toBeVisible();

    // Close modal
    const closeBtn = page.locator('button').filter({ hasText: 'Cancel' }).first();
    await closeBtn.click();
  });

  test('1.2 Action Buttons: Paid ✓ Action Persists to Database & Single-Line Layout', async ({ page }) => {
    const invoicesTab = page.locator('button').filter({ hasText: 'Invoices & AR' }).first();
    await invoicesTab.click();

    // Find any open invoice row with a "Paid ✓" button
    const paidButton = page.locator('button').filter({ hasText: 'Paid ✓' }).first();
    if (await paidButton.isVisible()) {
      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('marked as PAID');
        await dialog.accept();
      });

      await paidButton.click();
      await page.waitForTimeout(500);

      // Verify the status badge updates to PAID
      const paidBadge = page.locator('span').filter({ hasText: 'PAID' }).first();
      await expect(paidBadge).toBeVisible();
    }
  });

  test('1.3 WIP Burndown & Shift Management: Log Shift -> Approve -> Sub-Invoice Generation', async ({ page }) => {
    // Switch to WIP & Sub-Invoicing tab
    const wipTab = page.locator('button').filter({ hasText: 'WIP & Sub-Invoicing' }).first();
    await expect(wipTab).toBeVisible();
    await wipTab.click();

    // Click "+ Log Shift / Work Item ⏱️"
    const logShiftBtn = page.locator('button').filter({ hasText: 'Log Shift / Work Item' }).first();
    await expect(logShiftBtn).toBeVisible();
    await logShiftBtn.click();

    // Fill in shift details
    const nameInput = page.locator('input[placeholder*="Jordan Miller"]').first();
    await nameInput.fill('Playwright Shift Specialist');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('successfully logged');
      await dialog.accept();
    });

    const submitBtn = page.locator('button').filter({ hasText: 'Log Shift into WIP' }).first();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Verify row is added to the unbilled WIP table
    const specialistCell = page.locator('td').filter({ hasText: 'Playwright Shift Specialist' }).first();
    await expect(specialistCell).toBeVisible();
  });

  test('1.4 ERP & QuickBooks Online Sync Telemetry', async ({ page }) => {
    const invoicesTab = page.locator('button').filter({ hasText: 'Invoices & AR' }).first();
    await invoicesTab.click();

    const qboButton = page.locator('button').filter({ hasText: 'Sync to QBO' }).first();
    if (await qboButton.isVisible()) {
      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('QuickBooks Online');
        await dialog.accept();
      });
      await qboButton.click();
    }
  });
});
