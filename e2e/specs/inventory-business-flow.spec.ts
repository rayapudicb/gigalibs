/**
 * WI-OI-120f (F0.5): Inventory's UAT business flow, entered through the application as a tester would. It is the
 * source of Inventory's UAT data: no SQL seeding.
 *
 * - The Catalogue's unit and product are created through the app's own Catalogue API (the same signed gateway its
 *   screen uses); the Catalogue's screens move to metadata windows in U7.
 * - Everything in Inventory is entered on its metadata windows:
 *   - a warehouse and its receiving location;
 *   - a stocked item;
 *   - a goods receipt with one line, completed;
 *   - then the resulting balance and ledger entry are checked.
 *
 * E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD: a tenant administrator of the UAT tenant, which must hold the
 * Product Catalogue and Universal Inventory entitlements. Codes carry a run suffix, so the flow can run repeatedly.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { signInToUat } from './uat-session';

const admin = { email: process.env.E2E_UAT_ADMIN_EMAIL ?? '', password: process.env.E2E_UAT_ADMIN_PASSWORD ?? '' };
const run = Date.now().toString(36).toUpperCase();
const codes = { uom: `EA${run}`.slice(0, 20), product: `UAT-BOLT-${run}`, warehouse: `WH-UAT-${run}`, location: `RCV-${run}` };

async function signIn(page: Page, origin: string) {
  // The UAT logins belong to more than one workspace; the shared helper picks the UAT one (WI-OI-120k).
  await signInToUat(page, origin, admin);
}

async function postThroughApp(page: Page, origin: string, path: string, data: unknown) {
  const response = await page.request.post(path, {
    data,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string };
}

/** Picks a lookup option by typing in the picker's search box and choosing the matching option. */
async function pick(scope: Locator, label: string, search: string) {
  await scope.getByLabel(`Search ${label}`).fill(search);
  const select = scope.locator('select').filter({ has: scope.page().locator('option', { hasText: search }) }).first();
  await expect(select.locator('option', { hasText: search })).toHaveCount(1);
  await select.selectOption({ label: (await select.locator('option', { hasText: search }).textContent()) ?? search });
}

function openTab(page: Page, name: string) {
  return page.getByRole('tab', { name, exact: true }).click();
}

test.describe('Inventory business flow on metadata windows', () => {
  test.skip(!admin.email || !admin.password, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD for the UAT tenant administrator.');
  test.describe.configure({ mode: 'serial' });

  test('receive goods into a new warehouse and see the stock', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    await signIn(page, origin);
    page.on('dialog', (dialog) => void dialog.accept());

    // 1. The Catalogue's unit and product (U7 moves these onto windows).
    const uom = await postThroughApp(page, origin, '/api/product-catalogue/v1/uoms', { code: codes.uom, name: `Each ${run}`, symbol: 'ea', dimension: 'COUNT' });
    await postThroughApp(page, origin, '/api/product-catalogue/v1/products', {
      code: codes.product, name: `Hex bolt M8 ${run}`, productType: 'GOOD', baseUomId: uom.id, isSold: true, isPurchased: true, isStocked: true,
    });

    // 2. A warehouse, on the Warehouses window.
    await page.goto('/inventory');
    await openTab(page, 'Warehouses');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    let form = page.locator('form', { hasText: 'New Warehouse' });
    await form.locator('#field-code').fill(codes.warehouse);
    await form.locator('#field-name').fill(`UAT warehouse ${run}`);
    await form.locator('#field-warehouse-type').selectOption('PHYSICAL');
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByRole('heading', { name: codes.warehouse })).toBeVisible();

    // 3. Its receiving location, on the Locations child tab.
    await page.getByRole('button', { name: 'New Locations' }).click();
    form = page.locator('form', { hasText: 'New Locations' });
    await form.locator('#field-code').fill(codes.location);
    await form.locator('#field-name').fill('Receiving dock');
    await form.locator('#field-location-type').selectOption('RECEIVING');
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByRole('cell', { name: codes.location })).toBeVisible();

    // 4. The stocked item, on the Items window, with the product picked from the Catalogue.
    await openTab(page, 'Items');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    form = page.locator('form', { hasText: 'New Item' });
    await pick(form, 'Product', codes.product);
    await form.locator('#field-valuation-method').selectOption('STANDARD');
    await form.locator('#field-reorder-point').fill('10');
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByRole('button', { name: 'Edit' }).or(page.getByText(codes.product)).first()).toBeVisible();

    // 5. A goods receipt with one line, completed.
    await openTab(page, 'Receipts');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    form = page.locator('form', { hasText: 'New Receipt' });
    await pick(form, 'Warehouse', codes.warehouse);
    await form.locator('#field-external-document-reference').fill(`ASN-${run}`);
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByRole('button', { name: 'Complete receipt' })).toBeVisible();
    await page.getByRole('button', { name: 'New Lines' }).click();
    form = page.locator('form', { hasText: 'New Lines' });
    await pick(form, 'Product', codes.product);
    await pick(form, 'Unit', codes.uom);
    await form.locator('#field-expected-quantity').fill('5');
    await pick(form, 'Put-away location', codes.location);
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(page.getByRole('cell', { name: codes.product, exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Complete receipt' }).click();
    await expect(page.getByText('Complete receipt: done.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete receipt' })).toHaveCount(0);

    // 6. The stock it produced.
    await openTab(page, 'Balances');
    const balanceRow = page.getByRole('row').filter({ hasText: codes.product });
    await expect(balanceRow).toContainText('5');
    await openTab(page, 'Stock ledger');
    await expect(page.getByRole('row').filter({ hasText: codes.product }).first()).toContainText('In (debit)');
  });
});
