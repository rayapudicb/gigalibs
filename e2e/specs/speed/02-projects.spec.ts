import { expect, test } from '@playwright/test';
import {
  PROJECT_CODE,
  PROJECT_NAME,
  choose,
  failedResponses,
  openSpeed,
  picker,
  pickerOptions,
  typeLikeAPerson,
} from './lab';

// WI-OI-120ce, part 2: projects. The create form (no fields the system fills, one searchable field per picker), the
// required fields, text with spaces typed key by key, a site from the organization in force only, duplicate codes.

test.describe('Projects', () => {
  test('J1 New project: only the fields a person fills, each picker one searchable field', async ({ page }) => {
    await openSpeed(page, 'projects');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const form = page.locator('form', { has: page.getByRole('heading', { name: /New Project/ }) });
    await expect(form.getByLabel(/^Project code/)).toBeVisible();
    for (const system of ['Status', 'Created by', 'Created', 'Last change'])
      await expect(form.getByText(system, { exact: true })).toHaveCount(0);
    await expect(form.getByRole('combobox')).toHaveCount(2);
    await expect(form.locator('select')).toHaveCount(0);
  });

  test('J2 The site list offers only sites of the organization in force', async ({ page }) => {
    const failures = failedResponses(page);
    await openSpeed(page, 'projects');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const site = picker(page, /^Site/);
    await site.click();
    const options = await pickerOptions(page, site);
    await expect(options.first()).toBeVisible();
    const names = await options.allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/\(.+\)$/);
    expect(failures.filter((line) => line.includes('/lookups/'))).toEqual([]);
  });

  test('J3 Saving without the required fields names each one', async ({ page }) => {
    await openSpeed(page, 'projects');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/required/i).first()).toBeVisible();
  });

  test('J4 A project with spaces typed key by key is saved exactly as typed', async ({ page }) => {
    const failures = failedResponses(page);
    await openSpeed(page, 'projects');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await typeLikeAPerson(page.getByLabel(/^Project code/), PROJECT_CODE);
    await typeLikeAPerson(page.getByLabel(/^Name/).first(), PROJECT_NAME);
    await expect(page.getByLabel(/^Name/).first()).toHaveValue(PROJECT_NAME);
    await choose(page, picker(page, /^Site/), 'Process', /Process Development/);
    await typeLikeAPerson(page.getByLabel(/^Notes/), 'Screening before the kilo-lab, route A first');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: PROJECT_CODE })).toBeVisible();
    await expect(page.getByLabel(/^Name/).first()).toHaveValue(PROJECT_NAME);
    await expect(page.getByLabel(/^Notes/)).toHaveValue('Screening before the kilo-lab, route A first');
    expect(failures).toEqual([]);
  });

  test('J5 The same project code twice is refused', async ({ page }) => {
    await openSpeed(page, 'projects');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await typeLikeAPerson(page.getByLabel(/^Project code/), PROJECT_CODE);
    await typeLikeAPerson(page.getByLabel(/^Name/).first(), 'Duplicate code');
    await choose(page, picker(page, /^Site/), 'Process', /Process Development/);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Not saved')).toBeVisible();
  });

  test('J6 The project is listed with its site by name', async ({ page }) => {
    await openSpeed(page, 'projects');
    await page.getByPlaceholder('Search').fill(PROJECT_CODE);
    await page.keyboard.press('Enter');
    const row = page.getByRole('row', { name: new RegExp(PROJECT_CODE) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Process Development');
  });
});
