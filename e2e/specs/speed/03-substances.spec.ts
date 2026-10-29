import { type Page, expect, test } from '@playwright/test';
import { SUBSTANCE, choose, failedResponses, openSpeed, picker, typeLikeAPerson } from './lab';

// WI-OI-120ce, part 3: substances, linked to the library in force by name (the lookup answered 400 before), with the
// molar mass from the formula; invalid formulas and CAS numbers are refused.

type Library = { readonly search: string; readonly option: RegExp } | null;

async function createSubstance(page: Page, name: string, formula: string, library: Library, cas?: string) {
  await openSpeed(page, 'substances');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await typeLikeAPerson(page.getByLabel(/^Name/).first(), name);
  await typeLikeAPerson(page.getByLabel(/^Formula/).first(), formula);
  if (cas) await typeLikeAPerson(page.getByLabel(/^CAS number/), cas);
  if (library) await choose(page, picker(page, /^Library material/), library.search, library.option);
  await page.getByRole('button', { name: 'Save' }).click();
}

test.describe('Substances', () => {
  test('S1 A substance linked to a library material by name gets its molar mass', async ({ page }) => {
    const failures = failedResponses(page);
    await createSubstance(page, SUBSTANCE.aldehyde, 'C7H5FO', { search: 'Fluoro', option: /4-Fluorobenzaldehyde \(L01\)/ }, '459-57-4');
    await expect(page.getByRole('heading', { name: SUBSTANCE.aldehyde })).toBeVisible();
    await expect(page.locator('input[value^="124.1"]')).toHaveCount(1);
    await expect(picker(page, /^Library material/)).toHaveValue(/4-Fluorobenzaldehyde \(L01\)/);
    expect(failures).toEqual([]);
  });

  test('S2 The route materials: an ester, the product, water, the oxidiser and the solvent', async ({ page }) => {
    const failures = failedResponses(page);
    for (const [name, formula, library] of [
      [SUBSTANCE.ester, 'C7H12O3', { search: 'isobutyryl', option: /Methyl isobutyrylacetate \(L02\)/ }],
      [SUBSTANCE.enone, 'C14H15FO3', { search: 'intermediate', option: /Route intermediate \(L26\)/ }],
      [SUBSTANCE.water, 'H2O', { search: 'Water', option: /^Water \(L06\)/ }],
      [SUBSTANCE.permanganate, 'KMnO4', { search: 'permanganate', option: /Potassium permanganate \(L11\)/ }],
      [SUBSTANCE.acetone, 'C3H6O', { search: 'Acetone', option: /^Acetone \(L12\)/ }],
    ] as const) {
      await createSubstance(page, name, formula, library);
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    expect(failures).toEqual([]);
  });

  test('S3 A formula that is not a formula is refused', async ({ page }) => {
    await createSubstance(page, `Bad formula ${Date.now()}`, 'C7H5Fo', null);
    await expect(page.getByText(/Not saved|formula/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bad formula/ })).toHaveCount(0);
  });

  test('S4 A CAS number with a wrong check digit or shape is refused', async ({ page }) => {
    await createSubstance(page, `Bad CAS ${Date.now()}`, 'H2O', null, '7732-18-4');
    await expect(page.getByText(/Not saved|CAS/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bad CAS/ })).toHaveCount(0);
  });

  test('S5 The list shows each substance’s library material by name, with no failed lookup', async ({ page }) => {
    const failures = failedResponses(page);
    await openSpeed(page, 'substances');
    await page.getByPlaceholder('Search').fill(SUBSTANCE.aldehyde);
    await page.keyboard.press('Enter');
    const row = page.getByRole('row', { name: new RegExp(SUBSTANCE.aldehyde) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('4-Fluorobenzaldehyde (L01)');
    expect(failures.filter((line) => line.includes('/lookups/'))).toEqual([]);
  });
});
