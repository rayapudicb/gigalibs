/**
 * WI-OI-120g (U7): maker-checker on the UAT instance, with the starter data, as two people on screen.
 * - Price list UAT-USD: uat.admin submits the draft version that holds the prices; uat.admin's own approval is refused;
 *   uat.approver approves and activates it; the bolt's price then resolves to 2.40 USD.
 * - Catalogue UAT-TRADE: uat.admin builds a version with the four products and submits it; uat.approver approves and
 *   publishes it.
 * Idempotent: a step already done is skipped.
 */
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { signInToUat, uatAdmin, uatApprover } from './uat-session';

const today = new Date().toISOString().slice(0, 10);
const PRODUCTS = ['UAT-BOLT-M8', 'UAT-NUT-M8', 'UAT-WASHER-M8', 'UAT-DRILL-18V'];

async function person(browser: Browser, origin: string, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: origin, viewport: { width: 1300, height: 820 } })).newPage();
  await signInToUat(page, origin, user);
  page.on('dialog', (dialog) => void dialog.accept());
  return page;
}

async function open(page: Page, tab: string) {
  await page.goto('/products');
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
}

async function openChildTab(page: Page, label: string) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);
}

async function submitForm(form: Locator) {
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  await expect(async () => {
    if (await form.getByText('Not saved').count()) throw new Error(`Not saved: ${await form.innerText()}`);
    await expect(form).toHaveCount(0);
  }).toPass({ timeout: 15000 });
}

async function pick(form: Locator, label: string, fieldKey: string, search: string) {
  await form.getByLabel(`Search ${label}`, { exact: true }).fill(search);
  const select = form.locator(`#field-${fieldKey}`);
  const option = select.locator('option', { hasText: search }).first();
  await expect(option).toHaveCount(1, { timeout: 10000 });
  await select.selectOption({ label: (await option.textContent()) ?? search });
}

/** Runs a record action that asks for a reason; returns the notice text shown after it. */
async function act(page: Page, action: string, reason: string): Promise<string> {
  await page.getByRole('button', { name: action, exact: true }).click();
  const form = page.getByRole('form', { name: action });
  await form.getByLabel('Reason').fill(reason);
  await form.getByRole('button', { name: action, exact: true }).click();
  const notice = page.getByText(new RegExp(`^${action}: done\\.$|maker cannot approve|changed by someone else|Cannot move`)).first();
  await expect(notice).toBeVisible({ timeout: 15000 });
  return (await notice.textContent()) ?? '';
}

/** Opens the first row matching `text` whose child tab `childTab` has at least one row. */
async function openVersionWithContent(page: Page, tab: string, text: string, childTab: string): Promise<boolean> {
  const rows = page.getByRole('row').filter({ hasText: text });
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    await open(page, tab);
    await page.getByRole('row').filter({ hasText: text }).nth(index).click();
    await openChildTab(page, childTab);
    if ((await page.getByRole('row').count()) > 1) return true;
  }
  return false;
}

test.describe('UAT maker-checker', () => {
  test.skip(!uatAdmin.email || !uatApprover.email, 'Set the UAT admin and approver logins.');
  test.describe.configure({ timeout: 6 * 60 * 1000 });

  test('the UAT-USD price list is approved by a second person and resolves', async ({ browser, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    const maker = await person(browser, origin, uatAdmin);
    await open(maker, 'Price-list versions');
    expect(await openVersionWithContent(maker, 'Price-list versions', 'UAT-USD', 'Prices'), 'a UAT-USD version with prices').toBe(true);
    if (await maker.getByRole('button', { name: 'Submit for approval', exact: true }).count()) {
      expect(await act(maker, 'Submit for approval', 'UAT prices ready for review')).toContain('done');
    }
    if (await maker.getByRole('button', { name: 'Approve', exact: true }).count()) {
      expect(await act(maker, 'Approve', 'Approving my own prices')).toContain('maker cannot approve');
    }

    const checker = await person(browser, origin, uatApprover);
    await open(checker, 'Price-list versions');
    await openVersionWithContent(checker, 'Price-list versions', 'UAT-USD', 'Prices');
    if (await checker.getByRole('button', { name: 'Approve', exact: true }).count()) {
      expect(await act(checker, 'Approve', 'Checked the UAT prices')).toContain('done');
    }
    if (await checker.getByRole('button', { name: 'Activate', exact: true }).count()) {
      expect(await act(checker, 'Activate', 'UAT prices go live')).toContain('done');
    }

    await open(maker, 'Price resolver');
    await maker.getByLabel('Search Product', { exact: true }).fill('UAT-BOLT-M8');
    const product = maker.getByLabel('Product', { exact: true });
    await expect(product.locator('option', { hasText: 'UAT-BOLT-M8' })).toHaveCount(1, { timeout: 10000 });
    await product.selectOption({ label: (await product.locator('option', { hasText: 'UAT-BOLT-M8' }).textContent()) ?? '' });
    await maker.getByLabel('Currency (optional)').fill('USD');
    await maker.getByRole('button', { name: 'Resolve price' }).click();
    await expect(maker.getByText('2.40 USD')).toBeVisible({ timeout: 10000 });
  });

  test('the UAT-TRADE catalogue is built, approved by a second person and published', async ({ browser, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    const maker = await person(browser, origin, uatAdmin);
    await open(maker, 'Catalogues');
    await maker.getByLabel('Search Catalogues', { exact: true }).fill('UAT-TRADE');
    await maker.getByLabel('Search Catalogues', { exact: true }).press('Enter');
    await maker.waitForTimeout(800);
    if ((await maker.getByRole('row').filter({ hasText: 'UAT-TRADE' }).count()) === 0) {
      await maker.getByRole('button', { name: 'New', exact: true }).click();
      const form = maker.locator('form').filter({ has: maker.getByRole('heading', { name: 'New Catalogue', exact: true }) });
      await form.locator('#field-code').fill('UAT-TRADE');
      await form.locator('#field-name').fill('UAT trade catalogue');
      await form.locator('#field-purpose').fill('Distributors');
      await submitForm(form);
      await open(maker, 'Catalogues');
    }
    await maker.getByRole('row').filter({ hasText: 'UAT-TRADE' }).first().click();
    await openChildTab(maker, 'Versions');
    if ((await maker.getByRole('row').count()) <= 1) {
      await maker.getByRole('button', { name: 'New Versions', exact: true }).click();
      const form = maker.locator('form').filter({ has: maker.getByRole('heading', { name: 'New Versions', exact: true }) });
      await form.locator('#field-effective-from').fill(today);
      await form.locator('#field-notes').fill('UAT trade range');
      await submitForm(form);
    }

    await open(maker, 'Catalogue versions');
    await maker.getByRole('row').filter({ hasText: 'UAT-TRADE' }).first().click();
    await openChildTab(maker, 'Entries');
    if (await maker.getByRole('button', { name: 'New Entries', exact: true }).count()) {
      for (const [index, product] of PRODUCTS.entries()) {
        if ((await maker.getByRole('row').filter({ hasText: product }).count()) > 0) continue;
        await maker.getByRole('button', { name: 'New Entries', exact: true }).click();
        const form = maker.locator('form').filter({ has: maker.getByRole('heading', { name: 'New Entries', exact: true }) });
        await pick(form, 'Product', 'product-id', product);
        await form.locator('#field-sort-order').fill(String(index + 1));
        await submitForm(form);
        await openChildTab(maker, 'Entries');
      }
    }
    if (await maker.getByRole('button', { name: 'Submit for approval', exact: true }).count()) {
      expect(await act(maker, 'Submit for approval', 'UAT trade range ready')).toContain('done');
    }

    const checker = await person(browser, origin, uatApprover);
    await open(checker, 'Catalogue versions');
    await checker.getByRole('row').filter({ hasText: 'UAT-TRADE' }).first().click();
    if (await checker.getByRole('button', { name: 'Approve', exact: true }).count()) {
      expect(await act(checker, 'Approve', 'Checked the range')).toContain('done');
    }
    if (await checker.getByRole('button', { name: 'Publish', exact: true }).count()) {
      expect(await act(checker, 'Publish', 'Range goes live')).toContain('done');
    }
    await expect(checker.locator('#field-status')).toHaveValue('PUBLISHED');
  });
});
