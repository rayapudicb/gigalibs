import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { RUN, failedResponses, openSpeed } from './lab';

// WI-OI-120ce, part 1: the master data a project needs. Criteria and library packs from every source the screens offer:
// the starter packs shipped with SPEED, a JSON file and an Excel workbook; files that are not packs are refused with a
// reason; an imported version is put in force with a reason and becomes the set in force.

const PACKS = join(__dirname, '../../../modules/process-safety-screening/web/src/packs');
const FILES = 'test-results/speed-lab/files';
const starter = (file: string) => JSON.parse(readFileSync(join(PACKS, file), 'utf8'));
const CRITERIA = starter('speed-criteria-brd-0.1.json');
const LIBRARY = starter('speed-library-starter-0.1.json');

function file(name: string, content: string | Buffer): string {
  mkdirSync(FILES, { recursive: true });
  const path = join(FILES, name);
  writeFileSync(path, content);
  return path;
}

const importBox = (page: Page) => page.getByRole('region', { name: 'Import a pack' });

/** Imports the uploaded file by the Import button on its own row (never a starter pack's). */
async function importFile(page: Page, version: string): Promise<void> {
  await importBox(page).locator('div.rounded-md', { hasText: version }).getByRole('button', { name: 'Import' }).click();
}

async function upload(page: Page, path: string): Promise<void> {
  await importBox(page).locator('input[type="file"]').setInputFiles(path);
}

async function putInForce(page: Page, version: string, back: string): Promise<void> {
  await page.getByRole('cell', { name: version, exact: true }).first().click();
  await page.getByRole('button', { name: 'Put in force' }).first().click();
  const form = page.locator('form[aria-label="Put in force"]');
  await form.locator('textarea, input').first().fill(`End-to-end ${RUN}: put the tested pack in force`);
  await form.getByRole('button', { name: 'Put in force' }).click();
  await expect(page.getByText('Put in force: done.')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(back) }).first().click();
}

/** The library pack as a workbook, one sheet per part (the layout the screen's template uses). */
async function libraryWorkbook(versionLabel: string): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const pack = book.addWorksheet('Pack');
  pack.addRow(['Version label', versionLabel]);
  pack.addRow(['Source', LIBRARY.source]);
  const lib = LIBRARY.library;
  const sheets: [string, string[], unknown[][]][] = [
    ['Materials', ['ID', 'Name', 'CAS number', 'Formula', 'Reactivity classes', 'Note', 'Citation'],
      lib.materials.map((m: Record<string, unknown>) => [m.id, m.name ?? '', m.casNumber ?? '', m.formula ?? '', (m.classes as string[]).join(', '), m.note ?? '', m.citation])],
    ['Interaction rules', ['ID', 'Class A', 'Class B', 'Severity', 'Finding', 'Control', 'Recommended test', 'Citation'],
      lib.rules.map((r: Record<string, unknown>) => [r.id, r.classA, r.classB, r.severity, r.finding ?? '', r.control ?? '', r.recommendedTest ?? '', r.citation])],
    ['Reaction classes', ['ID', 'Name', 'Typical ΔHr (kJ/mol)', 'Citation'],
      lib.reactionClasses.map((c: Record<string, unknown>) => [c.id, c.name ?? '', c.typicalReactionEnthalpyKJPerMol, c.citation])],
    ['Energetic groups', ['ID', 'Name', 'Citation'], lib.energeticGroups.map((g: Record<string, unknown>) => [g.id, g.name ?? '', g.citation])],
    ['Gases', ['Formula (Hill)', 'ID', 'Name', 'Citation'],
      Object.entries(lib.gases).map(([hill, g]) => [hill, (g as Record<string, unknown>).id, (g as Record<string, unknown>).name ?? '', (g as Record<string, unknown>).citation])],
    ['Formation enthalpies', ['Formula (Hill)', 'ΔHf (kJ/mol)', 'Phase', 'Citation'],
      Object.entries(lib.formationEnthalpies).map(([hill, f]) => [hill, (f as Record<string, unknown>).kJPerMol, (f as Record<string, unknown>).phase, (f as Record<string, unknown>).citation])],
  ];
  for (const [name, columns, rows] of sheets) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(columns);
    for (const row of rows) sheet.addRow(row);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

test.describe('Packs: the criteria and library a project needs', () => {
  test('P1 Criteria page: the set in force and, for an administrator, the pack import with its format', async ({ page }) => {
    await openSpeed(page, 'criteria');
    await expect(page.getByRole('heading', { name: 'Criteria in force' })).toBeVisible();
    await expect(importBox(page)).toBeVisible();
    await expect(importBox(page).getByText('BRD 0.1 (starter)')).toBeVisible();
    await expect(importBox(page).getByText('23 cited values')).toBeVisible();
    await expect(importBox(page).getByText(/sheet "Criteria" with the columns Criterion, Key, Value and Citation/)).toBeVisible();
  });

  test('P2 Criteria: the starter pack downloads as an Excel workbook', async ({ page }) => {
    await openSpeed(page, 'criteria');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      importBox(page).getByRole('button', { name: 'Download as Excel' }).first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const path = join(FILES, `criteria-starter-${RUN}.xlsx`);
    await download.saveAs(path);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(path);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Pack', 'Criteria']);
    expect(book.getWorksheet('Criteria')?.rowCount).toBe(24);
  });

  test('P3 Criteria: a JSON pack file is checked, imported unreviewed and put in force', async ({ page }) => {
    const failures = failedResponses(page);
    const version = `BRD 0.1 e2e ${RUN}`;
    await openSpeed(page, 'criteria');
    await upload(page, file(`criteria-${RUN}.json`, JSON.stringify({ ...CRITERIA, versionLabel: version })));
    await expect(importBox(page).getByText(version)).toBeVisible();
    await importFile(page, version);
    await expect(page.getByText(`Imported "${version}" as unreviewed.`)).toBeVisible();
    await putInForce(page, version, 'Criteria sets');
    const card = page.getByRole('region', { name: 'Criteria in force' });
    await expect(card).toContainText(version);
    await expect(card).toContainText('Oxygen-balance alert band, lower limit (%)');
    expect(failures.filter((line) => line.startsWith('5'))).toEqual([]);
  });

  test('P4 Criteria: files that are not criteria packs are refused with the reason', async ({ page }) => {
    await openSpeed(page, 'criteria');
    await upload(page, file(`not-json-${RUN}.json`, '{ this is not json'));
    await expect(page.getByText('This file is not a criteria pack SPEED can import: not JSON')).toBeVisible();
    await upload(page, file(`library-as-criteria-${RUN}.json`, JSON.stringify(LIBRARY)));
    await expect(page.getByText(/This file is not a criteria pack SPEED can import/)).toBeVisible();
    // Uncited values: refused by the file check or, failing that, by the server; never imported.
    const uncited = { ...CRITERIA, versionLabel: `uncited ${RUN}`, citations: {} };
    await upload(page, file(`uncited-${RUN}.json`, JSON.stringify(uncited)));
    if (await importBox(page).getByText(`uncited ${RUN}`).isVisible()) await importFile(page, `uncited ${RUN}`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('cell', { name: `uncited ${RUN}`, exact: true })).toHaveCount(0);
  });

  test('P5 Criteria: importing a version that already exists is refused, not duplicated', async ({ page }) => {
    await openSpeed(page, 'criteria');
    const version = `BRD 0.1 e2e ${RUN}`;
    await upload(page, file(`criteria-again-${RUN}.json`, JSON.stringify({ ...CRITERIA, versionLabel: version })));
    await importFile(page, version);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('cell', { name: version, exact: true })).toHaveCount(1);
  });

  test('P6 Library: an Excel workbook pack is imported, put in force and shows its entries', async ({ page }) => {
    const failures = failedResponses(page);
    const version = `Starter 0.1 e2e ${RUN}`;
    await openSpeed(page, 'library');
    await expect(page.getByRole('heading', { name: 'Library in force' })).toBeVisible();
    await upload(page, file(`library-${RUN}.xlsx`, await libraryWorkbook(version)));
    await expect(importBox(page).getByText(version)).toBeVisible();
    await expect(importBox(page).getByText('26 materials, 12 interaction rules, 5 reaction classes, 12 energetic groups, 11 gases').last()).toBeVisible();
    await importFile(page, version);
    await expect(page.getByText(`Imported "${version}" as unreviewed.`)).toBeVisible();
    await putInForce(page, version, 'Library sets');
    const card = page.getByRole('region', { name: 'Library in force' });
    await expect(card).toContainText(version);
    await expect(card).toContainText('4-Fluorobenzaldehyde');
    await card.getByRole('tab', { name: 'Interaction rules' }).click();
    await expect(card).toContainText('Strong bases can lower the decomposition onset of DMSO');
    await card.getByRole('tab', { name: 'Reaction classes' }).click();
    await expect(card).toContainText('Knoevenagel condensation');
    expect(failures.filter((line) => line.startsWith('5'))).toEqual([]);
  });

  test('P7 Library: a blank template and a workbook without the sheets are refused with the reason', async ({ page }) => {
    await openSpeed(page, 'library');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      importBox(page).getByRole('button', { name: 'Download a blank Excel template' }).click(),
    ]);
    const blank = join(FILES, `library-template-${RUN}.xlsx`);
    await download.saveAs(blank);
    await upload(page, blank);
    await expect(page.getByText(/This file is not a library pack SPEED can import/)).toBeVisible();
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Pack').addRow(['Version label', 'x']);
    await upload(page, file(`no-sheets-${RUN}.xlsx`, Buffer.from(await book.xlsx.writeBuffer())));
    await expect(page.getByText('This file is not a library pack SPEED can import: the sheet "Materials" is missing')).toBeVisible();
  });
});
