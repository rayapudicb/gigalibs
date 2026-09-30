/**
 * WI-OI-104d live proof: a Tenant Admin sets up a REST pull source in the browser, stores its API key (write-only),
 * pulls, and sees what arrived and what was quarantined; a second pull asks only for changes. The source is a
 * throwaway container reachable only by a throwaway Connector Hub (E2E_PULL_SOURCE is its address as the Hub sees it).
 */
import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const sourceUrl = process.env.E2E_PULL_SOURCE ?? '';

async function signIn(page: Page, baseURL: string | undefined) {
  const response = await page.request.post('/api/auth/login', { data: { email, password }, headers: { Origin: baseURL ?? '' } });
  expect(response.status(), await response.text()).toBe(200);
}

test('a REST source is set up, logged into and pulled from the browser', async ({ page, baseURL }) => {
  test.skip(!email || !password || !sourceUrl, 'E2E_EMAIL, E2E_PASSWORD and E2E_PULL_SOURCE are required.');
  await signIn(page, baseURL);
  const created = await page.request.post('/api/connectors-hub/connections', {
    data: { connector_code: 'GENERIC_REST_PULL', name: 'Harvest feed', slug: `harvest-feed-${Date.now()}` },
    headers: { Origin: baseURL ?? '' },
  });
  expect(created.ok(), await created.text()).toBe(true);

  await page.goto('/connections');
  await page.getByRole('button', { name: 'Set up a pull source' }).click();
  await page.getByLabel('Base URL').fill(sourceUrl);
  await page.getByLabel('Resource path').fill('/v1/harvests');
  await page.getByLabel('Records are at').fill('data');
  await page.getByLabel('Changed-at field (optional)').fill('updated_at');
  await page.getByLabel('Sent as parameter').fill('updated_since');
  await page.getByLabel('Paging', { exact: true }).selectOption('page');
  await page.getByLabel('Page size, first page').fill('2');
  await page.getByLabel('Login', { exact: true }).selectOption('api-key');
  await page.getByRole('button', { name: 'Save pull source' }).click();
  await expect(page.getByText('Pull source saved.')).toBeVisible();
  await expect(page.getByText(`${sourceUrl}/v1/harvests`)).toBeVisible();

  // Without the key the source refuses, and the pull says what to fix.
  await page.getByRole('button', { name: 'Pull now' }).click();
  await expect(page.getByText(/store its credentials first/)).toBeVisible();

  const key = page.getByLabel('API key');
  await key.fill('proof-key-123');
  await expect(key).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Store secrets' }).click();
  await expect(page.getByText(/Login secrets stored/)).toBeVisible();
  await expect(key).toHaveValue('');

  await page.getByRole('button', { name: 'Pull now' }).click();
  await expect(page.getByText('Pulled 3 page(s): 4 new, 0 unchanged, 1 quarantined.')).toBeVisible();
  await expect(page.getByText('Quarantined records (1)')).toBeVisible();
  await expect(page.getByText(/The record has no usable id at "id"/)).toBeVisible();

  await page.getByRole('button', { name: 'Pull now' }).click();
  await expect(page.getByText('Pulled 1 page(s): 0 new, 1 unchanged, 0 quarantined.')).toBeVisible();
  await expect(page.getByText(/4 new · 0 unchanged · 1 quarantined · 3 page\(s\)/)).toBeVisible();
  await expect(page.getByText(/0 new · 1 unchanged · 0 quarantined · 1 page\(s\)/)).toBeVisible();
  await expect(page.getByText('proof-key-123')).toHaveCount(0);
});
