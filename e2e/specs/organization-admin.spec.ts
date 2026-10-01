/**
 * WI-OI-109d proof (ADR-0018): a tenant administrator configures levels, units and a primary tree in Settings ›
 * Organization with no code; a second administrator approves; the version is published and activated; grants are
 * given and revoked; refusals (self-approval, rule breaches, stale edits, missing permission) are explained on screen.
 * E2E_EMAIL/E2E_PASSWORD author, E2E_APPROVER_EMAIL/E2E_APPROVER_PASSWORD approve; E2E_MEMBER_EMAIL/E2E_MEMBER_PASSWORD
 * is a member without organization permissions. Use a fresh tenant: the spec expects an empty organization.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const author = { email: process.env.E2E_EMAIL ?? '', password: process.env.E2E_PASSWORD ?? '' };
const approver = { email: process.env.E2E_APPROVER_EMAIL ?? '', password: process.env.E2E_APPROVER_PASSWORD ?? '' };
const member = { email: process.env.E2E_MEMBER_EMAIL ?? '', password: process.env.E2E_MEMBER_PASSWORD ?? '' };

async function signIn(page: Page, who: { email: string; password: string }, origin: string) {
  const response = await page.request.post('/api/auth/login', { data: who, headers: { Origin: origin } });
  expect(response.status(), await response.text()).toBe(200);
}

async function openOrganization(page: Page, section: 'Structure' | 'Units' | 'Unit types' | 'Access' = 'Structure') {
  await page.goto('/settings?tab=hierarchy');
  await expect(page.getByRole('heading', { name: 'Organization', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: section }).click();
}

const status = (page: Page, text: string | RegExp) => expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();

test('an administrator builds, a second approves, and the tree goes into force from the screen', async ({ browser, baseURL }) => {
  test.skip(!author.email || !approver.email || !member.email, 'E2E_EMAIL, E2E_APPROVER_EMAIL and E2E_MEMBER_EMAIL credentials are required.');
  test.setTimeout(240_000);
  const origin = baseURL ?? '';
  const page = await (await browser.newContext()).newPage();
  const checker = await (await browser.newContext()).newPage();
  await signIn(page, author, origin);
  await signIn(checker, approver, origin);

  // Empty organization: the primary tree is the first step.
  await openOrganization(page);
  await expect(page.getByText('There is no organization tree yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create the primary tree', exact: true }).click();
  await expect(page.getByText('No changes in progress.')).toBeVisible();

  // Levels named by the tenant.
  await page.getByRole('tab', { name: 'Unit types' }).click();
  const addType = async (code: string, one: string, other: string, options: { grouping?: boolean; top?: boolean; under?: string; capability?: string }) => {
    await page.getByRole('button', { name: 'Add unit type', exact: true }).click();
    const form = page.getByRole('form', { name: 'New unit type' });
    await form.getByLabel('Code').fill(code);
    await form.getByLabel('Name (one)').fill(one);
    await form.getByLabel('Name (many)').fill(other);
    if (options.grouping) await form.getByRole('checkbox', { name: /own records/ }).click();
    if (options.capability) await form.getByRole('checkbox', { name: options.capability }).click();
    if (options.top) await form.getByRole('checkbox', { name: 'Allowed at the top of a tree' }).click();
    if (options.under) await form.getByRole('checkbox', { name: options.under, exact: true }).click();
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await status(page, `Unit type ${code} created.`);
  };
  await addType('COMPANY', 'Company', 'Companies', { grouping: true, top: true, capability: 'Legal entity' });
  await addType('REGION', 'Region', 'Regions', { grouping: true, under: 'COMPANY' });
  await addType('STORE', 'Store', 'Stores', { under: 'REGION', capability: 'Operational' });
  await expect(page.getByRole('row').filter({ hasText: 'REGION' }).getByText('Grouping')).toBeVisible();

  // Units, with legal identity only where the type is a legal entity.
  await page.getByRole('tab', { name: 'Units' }).click();
  const addUnit = async (typeLabel: string, code: string, name: string, legal?: boolean) => {
    await page.getByRole('button', { name: 'Add unit', exact: true }).click();
    const form = page.getByRole('form', { name: 'New unit' });
    await form.getByLabel('Type').selectOption({ label: typeLabel });
    await form.getByLabel('Code').fill(code);
    await form.getByLabel('Name', { exact: true }).fill(name);
    if (legal) {
      await form.getByLabel('Legal name').fill('FreshMart Retail Private Limited');
      await form.getByRole('group', { name: 'Legal entity' }).getByLabel('Country (2 letters)').fill('IN');
      await form.getByLabel('Functional currency').fill('INR');
    } else {
      await expect(form.getByLabel('Legal name')).toHaveCount(0);
    }
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await status(page, `Unit ${code} created.`);
  };
  await addUnit('Company (COMPANY)', 'FRESHMART', 'FreshMart Group', true);
  await addUnit('Region (REGION)', 'NORTH', 'North');
  await addUnit('Store (STORE)', 'STORE-101', 'Store 101');
  await page.getByLabel('Search').fill('store');
  await expect(page.getByRole('row').filter({ hasText: 'STORE-101' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'NORTH' })).toHaveCount(0);

  // A draft: place the three units, validate, submit.
  await page.getByRole('tab', { name: 'Structure' }).click();
  await page.getByRole('button', { name: 'Start a draft', exact: true }).click();
  await status(page, 'Draft started from the version in force.');
  const place = async (search: string, option: RegExp, under?: { search: string; option: RegExp }) => {
    await page.getByRole('button', { name: 'Place a unit', exact: true }).click();
    const form = page.getByRole('form', { name: 'Place a unit' });
    await form.getByLabel('Unit', { exact: true }).fill(search);
    await form.getByRole('button', { name: option }).click();
    if (under) {
      await form.getByLabel('Under', { exact: true }).fill(under.search);
      await form.getByRole('button', { name: under.option }).click();
    } else {
      await form.getByRole('checkbox', { name: 'At the top of the tree' }).click();
    }
    await form.getByRole('button', { name: 'Place', exact: true }).click();
    await status(page, 'Unit placed in the draft.');
  };
  await place('FRESH', /FRESHMART · FreshMart Group/);
  await place('NORTH', /NORTH · North/, { search: 'FRESH', option: /FRESHMART · FreshMart Group/ });
  await place('101', /STORE-101 · Store 101/, { search: 'NORTH', option: /NORTH · North/ });
  const draftTree = page.getByRole('navigation', { name: 'Version 1 draft' });
  await draftTree.getByRole('button', { name: /Expand North/ }).click();
  await expect(draftTree.getByText('Store 101')).toBeVisible();

  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('The draft passes every rule and is ready to submit.')).toBeVisible();
  await page.getByLabel('Reason').fill('First structure for FreshMart');
  await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
  await status(page, 'Submitted for approval.');

  // Maker-checker: the author cannot approve; the second administrator does.
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await expect(page.getByText(/Approve: A second person approves/)).toBeVisible();
  await openOrganization(checker);
  await checker.getByLabel('Reason').fill('Checked against the store list');
  await checker.getByRole('button', { name: 'Approve', exact: true }).click();
  await status(checker, 'Approved.');

  // Publish and activate; the tree is in force and readable by level.
  await openOrganization(page);
  await page.getByLabel('Reason').fill('Go live');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await status(page, /Published/);
  await page.getByLabel('Reason').fill('Go live');
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await status(page, 'Version activated.');
  const inForce = page.getByRole('navigation', { name: 'Version 1 in force' });
  await inForce.getByRole('button', { name: /Expand North/ }).click();
  await expect(inForce.getByText('Store 101')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Go live' })).toBeVisible();

  // Rule breaches are listed by unit; the impact preview shows the move; the draft is withdrawn.
  await page.getByRole('button', { name: 'Start a draft', exact: true }).click();
  await status(page, 'Draft started from the version in force.');
  const secondDraft = page.getByRole('navigation', { name: 'Version 2 draft' });
  await secondDraft.getByRole('button', { name: /Expand North/ }).click();
  await secondDraft.getByRole('button', { name: 'Move Store 101', exact: true }).click();
  const move = page.getByRole('form', { name: 'Move Store 101' });
  await move.getByRole('checkbox', { name: 'At the top of the tree' }).click();
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  await status(page, 'Unit moved in the draft.');
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Fix these before submitting:')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Validation problems' }).getByText('Not allowed at the top')).toBeVisible();
  await page.getByRole('button', { name: 'Preview impact', exact: true }).click();
  await expect(page.getByText(/0 added, 0 removed, 1 moved/)).toBeVisible();
  await expect(page.getByText(/Moved: STORE-101 · Store 101 from NORTH · North to the top/)).toBeVisible();
  await page.getByLabel('Reason').fill('Not this way');
  await page.getByRole('button', { name: 'Withdraw draft', exact: true }).click();
  await status(page, 'Draft withdrawn.');

  // Access: grant a unit and everything below it, then revoke.
  await page.getByRole('tab', { name: 'Access' }).click();
  await page.getByRole('button', { name: 'Grant access', exact: true }).click();
  const grant = page.getByRole('form', { name: 'Grant access' });
  await grant.getByLabel('Member').selectOption({ index: 1 });
  await grant.getByLabel('Unit', { exact: true }).fill('NORTH');
  await grant.getByRole('button', { name: /NORTH · North/ }).click();
  await grant.getByLabel('Reason').fill('Regional manager');
  await grant.getByRole('button', { name: 'Grant', exact: true }).click();
  await status(page, /now has read access to NORTH and everything below it/);
  const grantRow = page.getByRole('row').filter({ hasText: 'NORTH · North' });
  await expect(grantRow.getByText('Active')).toBeVisible();
  await grantRow.getByRole('button', { name: 'Revoke', exact: true }).click();
  const revoke = page.getByRole('dialog', { name: 'Revoke grant' });
  await revoke.getByLabel('Reason').fill('Moved to another region');
  await revoke.getByRole('button', { name: 'Revoke', exact: true }).click();
  await status(page, 'Grant revoked.');

  // A stale edit is refused with a way to reload.
  await page.getByRole('tab', { name: 'Units' }).click();
  await page.getByLabel('Search').fill('NORTH');
  await page.getByRole('row').filter({ hasText: 'NORTH' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const units = (await (await page.request.get('/api/control/tenants/current/organization/units?q=NORTH')).json()) as { items: Array<{ id: string; version: number }> };
  const north = units.items[0]!;
  const elsewhere = await checker.request.patch(`/api/control/tenants/current/organization/units/${north.id}`, {
    data: { expectedVersion: north.version, name: 'North region', reason: 'Renamed elsewhere' },
    headers: { Origin: origin },
  });
  expect(elsewhere.status(), await elsewhere.text()).toBe(200);
  const edit = page.getByRole('form', { name: 'Edit NORTH' });
  await edit.getByLabel('Reason').fill('Rename');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'It changed since you loaded it' })).toBeVisible();
  await expect(page.getByRole('alert').getByRole('button', { name: 'Reload', exact: true })).toBeVisible();

  // Accessibility of the organization screens (WCAG 2.2 AA rules).
  for (const section of ['Structure', 'Units', 'Unit types', 'Access'] as const) {
    await openOrganization(page, section);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).include('section[aria-labelledby="organization-heading"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((violation) => `${section}: ${violation.id} at ${violation.nodes.map((node) => node.target.join(' ')).join('; ')}`)).toEqual([]);
  }
});

test('a member without organization permissions is told so and sees no organization data', async ({ browser, baseURL }) => {
  test.skip(!member.email, 'E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD are required.');
  const page = await (await browser.newContext()).newPage();
  await signIn(page, member, baseURL ?? '');
  const api = await page.request.get('/api/control/tenants/current/organization/units');
  expect(api.status()).toBe(403);
  await page.goto('/settings?tab=hierarchy');
  await expect(page.getByText('Viewing the organization needs the organization:read permission.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Structure' })).toHaveCount(0);
});
