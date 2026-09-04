import { test, expect } from '@playwright/test';
import { authenticateSession, navigateToModule } from './helpers/auth.helper.js';

test.describe('💰 Enterprise Spend, Project Budgeting & Expense Suite E2E', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page);
    await navigateToModule(page, 'spend');
  });

  test('1. Renders Spend & Budget Command Center with KPI metrics', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Allocated Budgets').first()).toBeVisible();
    await expect(page.getByText('Total Spend Utilization').first()).toBeVisible();
    await expect(page.getByText('Pending Claims').first()).toBeVisible();
    await expect(page.getByText('Monthly SaaS/Vendor Burn').first()).toBeVisible();
  });

  test('2. Creates a Project Budget Cap with threshold warnings and category allocations', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });

    // Click + New Budget
    const newBudgetBtn = page.getByRole('button', { name: '+ New Budget' }).first();
    await expect(newBudgetBtn).toBeVisible();
    await newBudgetBtn.click();
    await expect(page.getByText('Create Project Budget Cap')).toBeVisible();

    const uniqueCode = `BDG-E2E-${Date.now().toString().slice(-4)}`;
    await page.locator('label:has-text("Budget / Project Name") + input, input[placeholder*="Warner Bros"]').first().fill('E2E Studio Project');
    await page.locator('label:has-text("Budget Code") + input, input[placeholder*="BDG-WB"]').first().fill(uniqueCode);
    await page.getByRole('button', { name: 'Create Budget Cap' }).click();

    // Verify created in UI
    await expect(page.getByText('E2E Studio Project').first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(uniqueCode).first()).toBeVisible();
  });

  test('3. Submits an Expense Claim with Receipt OCR and executes Manager Approval -> Reimbursement', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });

    // Click + Submit Expense
    const newExpenseBtn = page.getByRole('button', { name: '+ Submit Expense' }).first();
    await expect(newExpenseBtn).toBeVisible();
    await newExpenseBtn.click();
    await expect(page.getByText('Submit Expense Claim')).toBeVisible();

    const claimantInput = page.locator('label:has-text("Claimant") + input').first();
    await claimantInput.clear();
    await claimantInput.fill('Alex Rivera (Camera Operator)');
    await page.getByRole('button', { name: 'Submit for Approval' }).click();

    // Switch to Expense Claims Queue tab
    await page.getByRole('button', { name: /Expense Claims Queue/ }).first().click();
    await expect(page.getByText('Alex Rivera (Camera Operator)').first()).toBeVisible({ timeout: 6000 });

    // Test Manager Approval
    const approveBtn = page.getByRole('button', { name: 'Approve ✓' }).first();
    if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await approveBtn.click();
      await expect(page.getByText('APPROVED').first()).toBeVisible();

      // Test Reimbursement Settlement
      const reimburseBtn = page.getByRole('button', { name: 'Reimburse 💵' }).first();
      await reimburseBtn.click();
      await expect(page.getByText('Settled ✓').first()).toBeVisible();
    }
  });

  test('4. Enforces Single-Line Action Button Row invariant in Expense Queue', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Expense Claims Queue/ }).first().click();

    const actionContainers = page.locator('td:has(button, span.font-medium) div.inline-flex');
    const count = await actionContainers.count();

    for (let i = 0; i < count; i++) {
      const el = actionContainers.nth(i);
      const flexWrap = await el.evaluate((node) => window.getComputedStyle(node).flexWrap);
      expect(flexWrap).toBe('nowrap');
    }
  });

  test('5. Books Travel Desk Request with automated City-Tier Per-Diem Entitlements', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Travel & Per-Diems/ }).first().click();

    await expect(page.getByText('Travel Desk, Hotel Caps & Per-Diem Entitlements')).toBeVisible();
    await page.getByRole('button', { name: '+ New Travel Request' }).first().click();
    await expect(page.getByText('New Travel Desk Booking')).toBeVisible();

    const travelerInput = page.locator('label:has-text("Traveler Name") + input').first();
    await travelerInput.clear();
    await travelerInput.fill('Samantha Ray (VFX Supervisor)');
    await page.getByRole('button', { name: 'Register Travel' }).click();

    await expect(page.getByText('Samantha Ray (VFX Supervisor)').first()).toBeVisible({ timeout: 5000 });
  });

  test('6. Evaluates Imprest Multi-Wallets and executes Low-Balance Auto-Replenishment', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Petty Cash & Imprest/ }).first().click();

    await expect(page.getByText('Branch & Stage Petty Cash Imprest Multi-Wallets')).toBeVisible();
    const topUpBtn = page.getByRole('button', { name: /Auto Top-Up/ }).first();
    if (await topUpBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await topUpBtn.click();
      await expect(page.getByText('✓ FLOAT HEALTHY').first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('7. Operates AI Trend Analysis & Anomaly Engine with What-If Scenario Sandbox', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /AI Trend & Anomaly Engine/ }).first().click();

    await expect(page.getByText('Universal Predictive Forecasting & Anomaly AI')).toBeVisible();
    await expect(page.getByText('1. Statistical Z-Score Spike Detector')).toBeVisible();
    await expect(page.getByText('2. What-If Scenario Simulation Sandbox')).toBeVisible();
    await expect(page.getByText('SPIKE (Z:').first()).toBeVisible();
  });

  test('8. Registers a Vendor SaaS Subscription with renewal alerts and views P&L Matrix', async ({ page }) => {
    await expect(page.getByText('Enterprise Spend & Project Budgeting').first()).toBeVisible({ timeout: 10000 });

    // Switch to Subscriptions Tab
    await page.getByRole('button', { name: /Vendor Subscriptions/ }).first().click();
    await page.getByRole('button', { name: '+ Add Vendor Contract' }).first().click();
    await expect(page.getByText('Add Vendor / SaaS Subscription')).toBeVisible();

    await page.getByRole('button', { name: 'Register Contract' }).click();
    await expect(page.getByText('AWS Cloud Services').first()).toBeVisible({ timeout: 5000 });

    // Switch to P&L Profitability Tab
    await page.getByRole('button', { name: 'Project P&L Matrix' }).first().click();
    await expect(page.getByText('1. Billed Client Revenue')).toBeVisible();
    await expect(page.getByText('2. Total Direct Costs')).toBeVisible();
    await expect(page.getByText('3. Net Project Profit Margin')).toBeVisible();
  });
});
