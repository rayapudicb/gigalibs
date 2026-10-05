/**
 * WI-OI-120g (U7): the Product Catalogue's UAT business flow, entered through the application as testers would, on its
 * metadata windows. It is the source of the Catalogue's UAT data: no SQL seeding.
 *
 * - The maker (a tenant administrator) defines a unit, a category and a product, builds a catalogue version with the
 *   product and a price-list version with its price, and submits both.
 * - The maker's own approval is refused (maker-checker).
 * - The checker (a second user holding the approver roles) approves; the checker publishes the catalogue version and
 *   activates the price-list version.
 * - The maker resolves the product's price for the day and sees the one price in force.
 *
 * E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD: a tenant administrator of the UAT tenant (Product Catalogue
 * entitlement). E2E_UAT_APPROVER_EMAIL / E2E_UAT_APPROVER_PASSWORD: a second user of the same tenant with
 * catalogues:approve, catalogues:publish, pricing:approve and pricing:activate. Codes carry a run suffix, so the flow can
 * run repeatedly.
 */
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';

const maker = { email: process.env.E2E_UAT_ADMIN_EMAIL ?? '', password: process.env.E2E_UAT_ADMIN_PASSWORD ?? '' };
const checker = { email: process.env.E2E_UAT_APPROVER_EMAIL ?? '', password: process.env.E2E_UAT_APPROVER_PASSWORD ?? '' };
const run = Date.now().toString(36).toUpperCase();
const codes = { uom: `EA${run}`.slice(0, 20), category: `FIX-${run}`, product: `UAT-NUT-${run}`, catalogue: `TRADE-${run}`, priceList: `USD-${run}` };
const today = new Date().toISOString().slice(0, 10);

async function signedIn(browser: Browser, origin: string, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: origin })).newPage();
  const response = await page.request.post('/api/auth/login', { data: user, headers: { Origin: origin } });
  expect(response.status(), await response.text()).toBe(200);
  page.on('dialog', (dialog) => void dialog.accept());
  return page;
}

/** Picks a lookup option by typing in the picker's search box and choosing the matching option. */
async function pick(scope: Locator, label: string, search: string) {
  await scope.getByLabel(`Search ${label}`).fill(search);
  const select = scope.locator('select').filter({ has: scope.page().locator('option', { hasText: search }) }).first();
  await expect(select.locator('option', { hasText: search })).toHaveCount(1);
  await select.selectOption({ label: (await select.locator('option', { hasText: search }).textContent()) ?? search });
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}

async function newRecord(page: Page, title: string, fill: (form: Locator) => Promise<void>) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const form = page.locator('form', { hasText: title });
  await fill(form);
  await form.getByRole('button', { name: 'Save' }).click();
}

/** Runs a record action that asks for a reason, and waits for it to finish. */
async function act(page: Page, action: string, reason: string) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const form = page.getByRole('form', { name: action });
  await form.getByLabel('Reason').fill(reason);
  await form.getByRole('button', { name: action, exact: true }).click();
}

test.describe('Product Catalogue business flow on metadata windows', () => {
  test.skip(
    !maker.email || !maker.password || !checker.email || !checker.password,
    'Set E2E_UAT_ADMIN_EMAIL/PASSWORD and E2E_UAT_APPROVER_EMAIL/PASSWORD for two users of the UAT tenant.',
  );
  test.describe.configure({ mode: 'serial' });

  test('a product is priced through maker-checker and resolves to one price', async ({ browser, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    const page = await signedIn(browser, origin, maker);
    await page.goto('/products');

    // 1. A unit, a category and a product.
    await openTab(page, 'Units');
    await newRecord(page, 'New Unit', async (form) => {
      await form.getByLabel('Code').fill(codes.uom);
      await form.getByLabel('Name').fill(`Each ${run}`);
      await form.getByLabel('Symbol').fill('ea');
      await form.getByLabel('Dimension').selectOption('COUNT');
    });
    await expect(page.getByRole('heading', { name: codes.uom })).toBeVisible();

    await openTab(page, 'Categories');
    await newRecord(page, 'New Category', async (form) => {
      await form.getByLabel('Code').fill(codes.category);
      await form.getByLabel('Name').fill(`Fixings ${run}`);
    });
    await expect(page.getByRole('heading', { name: codes.category })).toBeVisible();

    await openTab(page, 'Products');
    await newRecord(page, 'New Product', async (form) => {
      await form.getByLabel('Code').fill(codes.product);
      await form.getByLabel('Name', { exact: true }).fill(`Hex nut M8 ${run}`);
      await form.getByLabel('Type').selectOption('GOOD');
      await pick(form, 'Base unit', codes.uom);
      await pick(form, 'Category', codes.category);
      await form.getByLabel('Sold').check();
      await form.getByLabel('Stocked').check();
    });
    await expect(page.getByRole('heading', { name: codes.product })).toBeVisible();

    // 2. A catalogue with a version holding the product, submitted; the maker cannot approve it.
    await openTab(page, 'Catalogues');
    await newRecord(page, 'New Catalogue', async (form) => {
      await form.getByLabel('Code').fill(codes.catalogue);
      await form.getByLabel('Name').fill(`Trade catalogue ${run}`);
    });
    await page.getByRole('button', { name: 'New Versions' }).click();
    const catalogueVersion = page.locator('form', { hasText: 'New Versions' });
    await catalogueVersion.getByLabel('Effective from').fill(today);
    await catalogueVersion.getByRole('button', { name: 'Save' }).click();

    await openTab(page, 'Catalogue versions');
    await page.getByRole('row').filter({ hasText: codes.catalogue }).first().click();
    await page.getByRole('button', { name: 'New Entries' }).click();
    const entry = page.locator('form', { hasText: 'New Entries' });
    await pick(entry, 'Product', codes.product);
    await entry.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('cell', { name: codes.product, exact: false })).toBeVisible();
    await act(page, 'Submit for approval', 'Spring range ready');
    await expect(page.getByText('Submit for approval: done.')).toBeVisible();
    await act(page, 'Approve', 'Approving my own work');
    await expect(page.getByText('The maker cannot approve their own version.')).toBeVisible();

    // 3. A price list with a version holding the product's price, submitted.
    await openTab(page, 'Price lists');
    await newRecord(page, 'New Price list', async (form) => {
      await form.getByLabel('Code').fill(codes.priceList);
      await form.getByLabel('Name').fill(`Trade prices ${run}`);
      await form.getByLabel('Currency').fill('USD');
    });
    await page.getByRole('button', { name: 'New Versions' }).click();
    const priceVersion = page.locator('form', { hasText: 'New Versions' });
    await priceVersion.getByLabel('Effective from').fill(today);
    await priceVersion.getByRole('button', { name: 'Save' }).click();

    await openTab(page, 'Price-list versions');
    await page.getByRole('row').filter({ hasText: codes.priceList }).first().click();
    await page.getByRole('button', { name: 'New Prices' }).click();
    const price = page.locator('form', { hasText: 'New Prices' });
    await pick(price, 'Product', codes.product);
    await pick(price, 'Unit', codes.uom);
    await price.getByLabel('List price (minor units)').fill('1250');
    await price.getByLabel('Standard price (minor units)').fill('1200');
    await price.getByLabel('Limit price (minor units)').fill('1000');
    await price.getByRole('button', { name: 'Save' }).click();
    await act(page, 'Submit for approval', 'Prices ready');
    await expect(page.getByText('Submit for approval: done.')).toBeVisible();

    // 4. The checker approves, publishes and activates.
    const second = await signedIn(browser, origin, checker);
    await second.goto('/products');
    await openTab(second, 'Catalogue versions');
    await second.getByRole('row').filter({ hasText: codes.catalogue }).first().click();
    await act(second, 'Approve', 'Checked the range');
    await expect(second.getByText('Approve: done.')).toBeVisible();
    await act(second, 'Publish', 'Go live');
    await expect(second.getByText('Publish: done.')).toBeVisible();
    await openTab(second, 'Price-list versions');
    await second.getByRole('row').filter({ hasText: codes.priceList }).first().click();
    await act(second, 'Approve', 'Checked the prices');
    await expect(second.getByText('Approve: done.')).toBeVisible();
    await act(second, 'Activate', 'Go live');
    await expect(second.getByText('Activate: done.')).toBeVisible();

    // 5. The maker resolves the product's price for today.
    await page.reload();
    await openTab(page, 'Price resolver');
    await pick(page.locator('form'), 'Product', codes.product);
    await page.getByLabel('Currency (optional)').fill('USD');
    await page.getByRole('button', { name: 'Resolve price' }).click();
    await expect(page.getByText('12.00 USD')).toBeVisible();
  });
});
