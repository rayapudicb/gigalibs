import { Page, expect } from '@playwright/test';

/**
 * Automates real database authentication into GigaLibs Live Control Plane.
 * Ensures the operator session is fully established in localStorage.
 */
export async function authenticateSession(page: Page) {
  await page.goto('http://localhost:5180');
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Check if Login Screen is visible
  const emailInput = page.locator('label:has-text("Email") input, input[type="email"]').first();
  const isLoginPage = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);

  if (isLoginPage) {
    const switchToRegisterBtn = page.getByRole('button', { name: /Need an operator account\? Register/i });
    if (await switchToRegisterBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await switchToRegisterBtn.click();
      await page.waitForTimeout(300);
    }

    const nameInput = page.locator('label:has-text("Full name") input, input[placeholder*="name"]').first();
    if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameInput.fill('GigaLibs Master Admin');
    }

    const testEmail = `admin-${Date.now().toString().slice(-4)}@gigalibs.com`;
    await emailInput.fill(testEmail);
    const passInput = page.locator('label:has-text("Password") input, input[type="password"]').first();
    await passInput.fill('SecureEnterprisePass123!');

    const submitBtn = page.getByRole('button', { name: /Create account|Sign in/i }).first();
    await submitBtn.click();

    // Wait until login form disappears
    await expect(page.locator('form')).toBeHidden({ timeout: 10000 });
    await page.waitForTimeout(500);
  }
}

const TAB_LABELS: Record<string, RegExp> = {
  invoices: /Invoices & Accounts Receivable|Universal Invoicing|Invoices & AR|Invoicing/i,
  tax: /Tax & Nexus/i,
  fraud: /Fraud & Risk/i,
  esign: /E-Sign|Signatures/i,
  ocr: /OCR & Docs|Document OCR/i,
  geofence: /Geofence|Fleet/i,
  orders: /Store & Checkout|Orders/i,
  forms: /Dynamic Forms/i,
  rules: /Rules & Compliance|Rules Engine/i,
  spend: /Spend & Project Budgets/i,
  analytics: /Analytics & KPIs/i,
};

/**
 * Navigates to a specific studio module tab
 */
export async function navigateToModule(page: Page, tabId: string) {
  await page.goto(`http://localhost:5180/?tab=${tabId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  const labelRegex = TAB_LABELS[tabId];
  if (labelRegex) {
    const tabBtn = page.locator(`a, button, [role="button"]`).filter({ hasText: labelRegex }).or(page.locator(`[id="${tabId}"]`)).first();
    if (await tabBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await tabBtn.click();
      await page.waitForTimeout(400);
    }
  }
}
