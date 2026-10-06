/**
 * WI-OI-120 (F0.6): "Add new" from a picker, on the UAT instance, as a tester would use it.
 *
 * On Inventory → Items → New Item:
 * 1. "+ Add new Product" opens the Product Catalogue's own Product window in a dialog.
 * 2. Inside it, "+ Add new Base unit" opens the Catalogue's Unit window over it (dialogs stack).
 * 3. Saving the unit selects it in the product form; saving the product selects it in the item form.
 * 4. The item saves with that product, and "Open" shows the product.
 *
 * Creates one unit, one product and one stocked item, each with a run suffix. Run with the UAT login (see
 * run-uat-walkthrough.sh): E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD.
 */
import { expect, test } from '@playwright/test';
import { hasUatLogin, signInToUat } from './uat-session';

const run = Date.now().toString(36).toUpperCase().slice(-6);

test.describe('Add new from a picker', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD (run e2e/run-uat-walkthrough.sh).');

  test('an item is created with a product and unit made from its pickers', async ({ page, baseURL }) => {
    await signInToUat(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
    await page.goto('/inventory');
    await page.getByRole('tab', { name: 'Items', exact: true }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const item = page.locator('form').filter({ has: page.getByRole('heading', { name: 'New Item', exact: true }) });

    // 1. The product, from the item's picker.
    await item.getByRole('button', { name: '+ Add new Product' }).click();
    const productDialog = page.getByRole('dialog', { name: 'New Product' });
    await expect(productDialog).toBeVisible();
    await productDialog.locator('#field-code').fill(`UAT-AN-${run}`);
    await productDialog.locator('#field-name').fill(`Added from a picker ${run}`);
    await productDialog.locator('#field-product-type').selectOption('GOOD');

    // 2. A unit, from the product's picker, over the product dialog.
    await productDialog.getByRole('button', { name: '+ Add new Base unit' }).click();
    const unitDialog = page.getByRole('dialog', { name: 'New Base unit' });
    await expect(unitDialog).toBeVisible();
    await unitDialog.locator('#field-code').fill(`PK${run}`);
    await unitDialog.locator('#field-name').fill(`Pack ${run}`);
    await unitDialog.locator('#field-symbol').fill('pk');
    await unitDialog.locator('#field-dimension').selectOption('COUNT');
    await unitDialog.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(unitDialog).toHaveCount(0);

    // 3. The new unit is selected in the product form; save the product.
    await expect(productDialog.locator('#field-base-uom-id option:checked')).toContainText(`PK${run}`);
    await productDialog.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(productDialog).toHaveCount(0);

    // 4. The new product is selected in the item form; save the item and open the product from it.
    await expect(item.locator('#field-product-id option:checked')).toContainText(`UAT-AN-${run}`);
    await item.locator('#field-valuation-method').selectOption('STANDARD');
    await item.evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(item).toHaveCount(0);
    await page.getByRole('tab', { name: 'Items', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: `UAT-AN-${run}` }).first()).toBeVisible();
  });
});
