import { type Page, expect, test } from '@playwright/test';
import { PROJECT_CODE, ROUTE_NAME, SUBSTANCE, failedResponses, openSpeed, typeLikeAPerson } from './lab';

// WI-OI-120ce, part 4: a route from its project to its dossier, as the prototype's journey: a balanced step passes the
// gate (tiles and the route's counts follow), an unbalanced one is blocked with the reason, thermal data assigns a
// Stoessel class, an oxidiser with a flammable solvent is a High interaction that needs a documented control, and the
// dossier is generated with its files.

test.describe.configure({ mode: 'serial' });

async function openRoute(page: Page): Promise<void> {
  await openSpeed(page, 'routes');
  await page.getByPlaceholder('Search').fill(ROUTE_NAME);
  await page.keyboard.press('Enter');
  await page.getByRole('cell', { name: ROUTE_NAME, exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Route & gate' })).toBeVisible();
}

/** Adds a material to the selected step: the substance by name, its role, coefficient and mass. */
async function addMaterial(page: Page, substance: string, role: string, nu: number | null, mass: number | null) {
  const box = page.getByPlaceholder(/Search substances/).first();
  await box.fill(substance);
  const option = page.locator(`datalist option[value^="${substance} "], datalist option[value="${substance}"]`).first();
  await expect(option).toHaveCount(1);
  await box.fill((await option.getAttribute('value')) ?? substance);
  const row = box.locator('xpath=ancestor::div[contains(@class,"grid")][1]');
  await row.locator('select').first().selectOption(role);
  if (nu !== null) await row.locator('input').nth(1).fill(String(nu));
  if (mass !== null) await row.locator('input').nth(2).fill(String(mass));
  await row.getByRole('button', { name: /Add material/ }).click();
  await expect(page.getByRole('cell', { name: substance }).first()).toBeVisible();
}

async function addStep(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.waitForLoadState('networkidle');
  const field = page.getByLabel(/Step name/).first();
  await typeLikeAPerson(field, name);
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('tab', { name: new RegExp(name) }).first()).toBeVisible();
}

test.describe('Routes', () => {
  test('R1 A route is created from its project, its name typed with spaces', async ({ page }) => {
    const failures = failedResponses(page);
    await openSpeed(page, 'projects');
    await page.getByPlaceholder('Search').fill(PROJECT_CODE);
    await page.keyboard.press('Enter');
    await page.getByRole('cell', { name: PROJECT_CODE, exact: true }).click();
    await page.getByRole('button', { name: /^New Route/ }).click();
    await typeLikeAPerson(page.locator('form input[type="text"]:not([disabled])').first(), ROUTE_NAME);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('cell', { name: ROUTE_NAME, exact: true })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('R2 A balanced step passes the gate; the equation, tiles and the route’s counts follow', async ({ page }) => {
    const failures = failedResponses(page);
    await openRoute(page);
    await addStep(page, 'Knoevenagel condensation');
    await addMaterial(page, SUBSTANCE.aldehyde, 'Reactant', 1, 100);
    await addMaterial(page, SUBSTANCE.ester, 'Reactant', 1, 127.8);
    await addMaterial(page, SUBSTANCE.enone, 'Product', 1, 171.4);
    await addMaterial(page, SUBSTANCE.water, 'By-product', 1, null);
    await expect(page.getByText('Gate passed').first()).toBeVisible();
    await expect(page.locator('sub', { hasText: '7' }).first()).toBeVisible();
    await expect(page.getByText(/Reaction extent ξ: 0\.80\d+ mol/)).toBeVisible();
    const gateTile = page.getByText('Steps mole-balanced').first().locator('..');
    await expect(gateTile).toContainText('1/1');
    await expect(page.getByLabel(/^Steps$/).first()).toHaveValue('1');
    expect(failures.filter((line) => !line.startsWith('409'))).toEqual([]);
  });

  test('R3 An unbalanced step is blocked with the reason, and the tiles say so', async ({ page }) => {
    await openRoute(page);
    await addStep(page, 'Unbalanced check');
    await addMaterial(page, SUBSTANCE.aldehyde, 'Reactant', 1, 50);
    await addMaterial(page, SUBSTANCE.water, 'Product', 1, 10);
    await expect(page.getByText('Gate blocked').first()).toBeVisible();
    await expect(page.getByText(/does not close/).first()).toBeVisible();
    const gateTile = page.getByText('Steps mole-balanced').first().locator('..');
    await expect(gateTile).toContainText('1/2');
    await page.getByRole('button', { name: 'Remove step' }).click();
    await expect(gateTile).toContainText('1/1');
  });

  test('R4 Without decomposition data no class is assigned; a cited DSC onset assigns one', async ({ page }) => {
    await openRoute(page);
    await page.getByRole('tab', { name: 'Thermal & runaway' }).click();
    await page.getByLabel(/Process temperature Tp/).fill('40');
    await page.getByLabel(/Maximum technical temperature MTT/).fill('82');
    await page.getByLabel(/Heat capacity Cp/).fill('2.4');
    await page.getByLabel(/Thermal accumulation/).fill('100');
    await page.getByLabel(/ΔHr source/).selectOption({ label: 'Reaction class' });
    await page.getByLabel(/^Reaction class/).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Save thermal inputs' }).click();
    await expect(page.getByText(/ΔTad/).first()).toBeVisible();
    // As the prototype: no TD24 without decomposition data, so no class (never a guess).
    await expect(page.getByText('The class cannot be assigned without TD24 and MTT.')).toBeVisible();
    await page.getByLabel('Add cited value').selectOption({ label: 'DSC onset (°C)' });
    await page.getByLabel('DSC onset (°C)', { exact: true }).fill('210');
    await page.getByLabel('Citation', { exact: true }).fill(`DSC of the reaction mixture, lab report E2E-${Date.now()}`);
    await page.getByRole('button', { name: 'Add cited value' }).click();
    await expect(page.getByText(/Class [1-5], assigned/).first()).toBeVisible();
    await expect(page.getByText(/DSC onset − 100 K \(conservative, BRL-06\)/).first()).toBeVisible();
  });

  test('R5 An oxidiser with a flammable solvent is a High interaction that needs a documented control', async ({ page }) => {
    await openRoute(page);
    await addMaterial(page, SUBSTANCE.permanganate, 'Additive', null, 10);
    await addMaterial(page, SUBSTANCE.acetone, 'Solvent', null, 300);
    await page.getByRole('tab', { name: 'Interactions' }).click();
    await expect(page.getByText(/1 High|High/).first()).toBeVisible();
    await expect(page.getByText(/R-04/).first()).toBeVisible();
    await expect(page.getByText(/strong oxidiser with a flammable solvent/i).first()).toBeVisible();
    const control = page.getByRole('textbox', { name: /^Control for .*permanganate.*Acetone|^Control for .*Acetone.*permanganate/i }).first();
    await control.fill('Dose the oxidant in portions under reaction calorimetry, temperature-controlled.');
    await page.getByRole('button', { name: /Document control/ }).first().click();
    await expect(page.getByText(/Control documented/).first()).toBeVisible();
  });

  test('R6 The dossier is generated, with DOCX and PDF and their SHA-256, and JSON and CSV exports', async ({ page }) => {
    await openRoute(page);
    await page.getByRole('tab', { name: 'Dossier' }).click();
    await expect(page.getByText(/DRAFT — NOT APPROVED/)).toBeVisible();
    await page.getByRole('button', { name: 'Generate dossier' }).click();
    await expect(page.getByText('Ready').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('link', { name: 'Download DOCX' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download PDF' }).first()).toBeVisible();
    await expect(page.getByText(/SHA-256 [0-9a-f]{64}/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Export JSON' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Export CSV' })).toBeVisible();
  });
});
