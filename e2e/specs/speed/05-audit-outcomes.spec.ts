import { expect, test } from '@playwright/test';
import { failedResponses, openSpeed } from './lab';

// WI-OI-120ce, part 5: the audit trail (every change by name; SPEED's own work named, not refused by the member
// lookup) and the business outcomes measured from this run's data.

test.describe('Audit trail and outcomes', () => {
  test('A1 The audit trail lists the run’s changes by person, with no failed lookup, and exports CSV', async ({ page }) => {
    const failures = failedResponses(page);
    await openSpeed(page, 'audit');
    await expect(page.getByRole('heading', { name: 'Audit trail' })).toBeVisible();
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    await expect(page.getByText(/SPEED Lab Admin/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByText('system:speed-dossier-worker')).toHaveCount(0);
    expect(failures.filter((line) => line.includes('/lookups/'))).toEqual([]);
  });

  test('A2 SPEED’s own dossier work is named in the audit trail', async ({ page }) => {
    await openSpeed(page, 'audit');
    await page.getByLabel('Action').fill('DOSSIER');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('SPEED dossier generator (automatic)').first()).toBeVisible();
  });

  test('A3 Outcomes: hazards found, screening time and economy, from the run’s routes', async ({ page }) => {
    await openSpeed(page, 'outcomes');
    for (const tile of ['BO-1', 'BO-2', 'BO-3', 'BO-4', 'BO-5'])
      await expect(page.getByText(new RegExp(tile)).first()).toBeVisible();
    await expect(page.getByText(/Worst criticality in portfolio/)).toBeVisible();
  });
});
