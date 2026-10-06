/**
 * WI-OI-120 (U28a): the UAT starter data, entered on the screens as a tester would, in a browser the owner can watch.
 * It is the source of the data the owner uses while testing by hand: no SQL seeding. Every step is idempotent: a
 * record whose code already exists is left alone, so the spec can run again after a partial run.
 *
 * - Product Catalogue:
 *   - units EA, BOX10 (10 EA) and KG;
 *   - categories;
 *   - four products;
 *   - a USD price list with a draft version and prices. Activating it needs a second person (maker-checker).
 * - Inventory:
 *   - the main warehouse with a receiving and a storage location;
 *   - stocked items for the products;
 *   - a goods receipt, completed, so balances and the stock ledger show stock.
 *
 * Needs the U7 deploy (Catalogue windows). Run it with e2e/run-uat-walkthrough.sh.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { hasUatLogin, signInToUat } from './uat-session';

const slowMo = Number(process.env.UAT_SLOWMO ?? 0);
// UAT_VIDEO=on records every step, so a run without a visible window can be watched afterwards.
test.use({ launchOptions: { slowMo }, video: process.env.UAT_VIDEO === 'on' ? 'on' : 'retain-on-failure' });
const today = new Date().toISOString().slice(0, 10);

const UNITS = [
  { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT' },
  { code: 'BOX10', name: 'Box of 10', symbol: 'box', dimension: 'COUNT' },
  { code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'WEIGHT' },
];
const CATEGORIES = [
  { code: 'FASTENERS', name: 'Fasteners' },
  { code: 'TOOLS', name: 'Tools' },
];
const PRODUCTS = [
  { code: 'UAT-BOLT-M8', name: 'Hex bolt M8 x 40', category: 'FASTENERS', prices: ['250', '240', '200'] },
  { code: 'UAT-NUT-M8', name: 'Hex nut M8', category: 'FASTENERS', prices: ['120', '110', '100'] },
  { code: 'UAT-WASHER-M8', name: 'Flat washer M8', category: 'FASTENERS', prices: ['30', '28', '25'] },
  { code: 'UAT-DRILL-18V', name: 'Cordless drill 18V', category: 'TOOLS', prices: ['12900', '12500', '11000'] },
];

async function open(page: Page, path: string, tab: string) {
  await page.goto(path);
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
}

/** True when the window's list already holds a row showing this text. */
async function listed(page: Page, view: string, text: string): Promise<boolean> {
  const search = page.getByLabel(`Search ${view}`, { exact: true });
  if (await search.count()) {
    await search.fill(text);
    await search.press('Enter');
  }
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
  return (await page.getByRole('row').filter({ hasText: text }).count()) > 0;
}

/** Fills and saves a create form; a refusal fails the step with the server's message. */
async function save(form: Locator) {
  // The floating "Open Omnichannel Communications" button can sit over a form's Save button (a screen defect, logged);
  // submitting the form is exactly what Save does.
  await expect(form.getByRole('button', { name: 'Save' })).toBeEnabled();
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  const refused = form.getByText('Not saved');
  await expect(async () => {
    if (await refused.count()) throw new Error(`Not saved: ${await form.innerText()}`);
    await expect(form).toHaveCount(0);
  }).toPass({ timeout: 15000 });
}

async function create(page: Page, title: string, fill: (form: Locator) => Promise<void>) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await fill(form);
  await save(form);
}

/** Opens a child tab and waits for its list, so "does it exist?" checks see the saved records. */
async function openChildTab(page: Page, label: string) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
}

async function createChild(page: Page, tabLabel: string, fill: (form: Locator) => Promise<void>) {
  await page.getByRole('tab', { name: tabLabel, exact: true }).click();
  await page.getByRole('button', { name: `New ${tabLabel}`, exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: `New ${tabLabel}`, exact: true }) });
  await fill(form);
  await save(form);
}

/** Chooses a lookup option: types `search` (a code or name) and picks the option showing `shown` (`code — name`). */
async function pick(form: Locator, label: string, fieldKey: string, search: string, shown = search) {
  await form.getByLabel(`Search ${label}`, { exact: true }).fill(search);
  const select = form.locator(`#field-${fieldKey}`);
  const option = select.locator('option', { hasText: shown }).first();
  await expect(option).toHaveCount(1, { timeout: 10000 });
  await select.selectOption({ label: (await option.textContent()) ?? search });
}

async function openRow(page: Page, view: string, text: string, search = true) {
  if (search) await listed(page, view, text);
  else await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.getByRole('row').filter({ hasText: text }).first().click();
}

test.describe('UAT starter data, entered on the screens', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD (run e2e/run-uat-walkthrough.sh).');
  // Each step runs even when an earlier one fails, so one fault does not hold back the rest of the data.
  test.describe.configure({ timeout: 5 * 60 * 1000 });

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToUat(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
    page.on('dialog', (dialog) => void dialog.accept());
  });

  test('Catalogue: units and a conversion', async ({ page }) => {
    for (const unit of UNITS) {
      await open(page, '/products', 'Units');
      if (await listed(page, 'Units of measure', unit.code)) continue;
      await create(page, 'New Unit', async (form) => {
        await form.locator('#field-code').fill(unit.code);
        await form.locator('#field-name').fill(unit.name);
        await form.locator('#field-symbol').fill(unit.symbol);
        await form.locator('#field-dimension').selectOption(unit.dimension);
      });
    }
    await open(page, '/products', 'Units');
    await openRow(page, 'Units of measure', 'BOX10');
    await openChildTab(page, 'Conversions');
    if ((await page.getByRole('row').filter({ hasText: 'EA' }).count()) === 0) {
      await createChild(page, 'Conversions', async (form) => {
        await pick(form, 'To unit', 'to-uom-id', 'Each', 'EA — Each');
        await form.locator('#field-conversion-rate').fill('10');
      });
    }
  });

  test('Catalogue: categories and products', async ({ page }) => {
    for (const category of CATEGORIES) {
      await open(page, '/products', 'Categories');
      if (await listed(page, 'Categories', category.code)) continue;
      await create(page, 'New Category', async (form) => {
        await form.locator('#field-code').fill(category.code);
        await form.locator('#field-name').fill(category.name);
      });
    }
    for (const product of PRODUCTS) {
      await open(page, '/products', 'Products');
      if (await listed(page, 'Products', product.code)) continue;
      await create(page, 'New Product', async (form) => {
        await form.locator('#field-code').fill(product.code);
        await form.locator('#field-name').fill(product.name);
        await form.locator('#field-product-type').selectOption('GOOD');
        await pick(form, 'Base unit', 'base-uom-id', 'Each', 'EA — Each');
        await pick(form, 'Category', 'category-id', product.category);
        for (const flag of ['is-sold', 'is-purchased', 'is-stocked']) await form.locator(`#field-${flag}`).check();
      });
    }
  });

  test('Catalogue: a USD price list with a draft version and prices', async ({ page }) => {
    await open(page, '/products', 'Price lists');
    if (!(await listed(page, 'Price lists', 'UAT-USD'))) {
      await create(page, 'New Price list', async (form) => {
        await form.locator('#field-code').fill('UAT-USD');
        await form.locator('#field-name').fill('UAT trade prices');
        await form.locator('#field-currency-code').fill('USD');
      });
      await open(page, '/products', 'Price lists');
    }
    await openRow(page, 'Price lists', 'UAT-USD');
    await openChildTab(page, 'Versions');
    if ((await page.getByRole('row').filter({ hasText: /Draft|Submitted|Approved|Active/ }).count()) === 0) {
      await createChild(page, 'Versions', async (form) => {
        await form.locator('#field-effective-from').fill(today);
        await form.locator('#field-notes').fill('UAT starter prices');
      });
    }
    // A version's list row shows its price list, not its notes (long text stays off lists).
    await open(page, '/products', 'Price-list versions');
    await openRow(page, 'Price-list versions', 'UAT-USD', false);
    await openChildTab(page, 'Prices');
    for (const product of PRODUCTS) {
      if ((await page.getByRole('row').filter({ hasText: product.code }).count()) > 0) continue;
      if ((await page.getByRole('button', { name: 'New Prices', exact: true }).count()) === 0) break; // no longer a draft
      await createChild(page, 'Prices', async (form) => {
        await pick(form, 'Product', 'product-id', product.code);
        await pick(form, 'Unit', 'uom-id', 'Each', 'EA — Each');
        await form.locator('#field-list-price-minor').fill(product.prices[0]!);
        await form.locator('#field-standard-price-minor').fill(product.prices[1]!);
        await form.locator('#field-limit-price-minor').fill(product.prices[2]!);
      });
    }
  });

  test('Inventory: the main warehouse and its locations', async ({ page }) => {
    await open(page, '/inventory', 'Warehouses');
    if (!(await listed(page, 'Warehouses', 'WH-MAIN'))) {
      await create(page, 'New Warehouse', async (form) => {
        await form.locator('#field-code').fill('WH-MAIN');
        await form.locator('#field-name').fill('Main warehouse');
        await form.locator('#field-warehouse-type').selectOption('PHYSICAL');
      });
      await open(page, '/inventory', 'Warehouses');
    }
    await openRow(page, 'Warehouses', 'WH-MAIN');
    for (const location of [
      { code: 'RCV-01', name: 'Receiving dock', type: 'RECEIVING' },
      { code: 'STO-A1', name: 'Aisle A, shelf 1', type: 'STORAGE' },
    ]) {
      await openChildTab(page, 'Locations');
      if ((await page.getByRole('row').filter({ hasText: location.code }).count()) > 0) continue;
      await createChild(page, 'Locations', async (form) => {
        await form.locator('#field-code').fill(location.code);
        await form.locator('#field-name').fill(location.name);
        await form.locator('#field-location-type').selectOption(location.type);
      });
    }
  });

  test('Inventory: stocked items for the products', async ({ page }) => {
    for (const product of PRODUCTS) {
      await open(page, '/inventory', 'Items');
      if (await listed(page, 'Stocked items', product.code)) continue;
      await create(page, 'New Item', async (form) => {
        await pick(form, 'Product', 'product-id', product.code);
        await pick(form, 'Default warehouse', 'default-warehouse-id', 'WH-MAIN');
        await form.locator('#field-valuation-method').selectOption('STANDARD');
        await form.locator('#field-reorder-point').fill('10');
      });
    }
  });

  test('Inventory: a goods receipt, completed', async ({ page }) => {
    await open(page, '/inventory', 'Receipts');
    if (await listed(page, 'Goods receipts', 'UAT-ASN-001')) return;
    await create(page, 'New Receipt', async (form) => {
      await pick(form, 'Warehouse', 'warehouse-id', 'WH-MAIN');
      await form.locator('#field-external-document-reference').fill('UAT-ASN-001');
    });
    await open(page, '/inventory', 'Receipts');
    await openRow(page, 'Goods receipts', 'UAT-ASN-001');
    for (const line of [
      { product: 'UAT-BOLT-M8', quantity: '100' },
      { product: 'UAT-NUT-M8', quantity: '200' },
    ]) {
      await createChild(page, 'Lines', async (form) => {
        await pick(form, 'Product', 'product-id', line.product);
        await pick(form, 'Unit', 'uom-id', 'Each', 'EA — Each');
        await form.locator('#field-expected-quantity').fill(line.quantity);
        await pick(form, 'Put-away location', 'target-location-id', 'STO-A1');
      });
    }
    await page.getByRole('button', { name: 'Complete receipt', exact: true }).click();
    await expect(page.getByText('Complete receipt: done.')).toBeVisible({ timeout: 15000 });
    await open(page, '/inventory', 'Balances');
    await expect(page.getByRole('row').filter({ hasText: 'UAT-BOLT-M8' }).first()).toBeVisible();
  });
});
