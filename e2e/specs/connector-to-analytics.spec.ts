/**
 * WI-OI-104e live proof: pulled records reach an Analytics dataset without code. A Tenant Admin sets up a REST pull
 * that sends to Analytics, pulls, then on Analytics › Sources maps the fields (quantities written in quintals, qtl,
 * tonnes and kg stored as kg), publishes, builds, makes it explorable, saves a chart and schedules the rebuild. The
 * harness then runs that schedule through the live kernel worker. E2E_PULL_SOURCE is the throwaway source as the
 * throwaway Connector Hub sees it.
 */
import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const sourceUrl = process.env.E2E_PULL_SOURCE ?? '';

async function signIn(page: Page, baseURL: string | undefined) {
  const response = await page.request.post('/api/auth/login', { data: { email, password }, headers: { Origin: baseURL ?? '' } });
  expect(response.status(), await response.text()).toBe(200);
}

test('a Connector Hub pull becomes an explorable Analytics dataset, with units converted', async ({ page, baseURL }) => {
  test.skip(!email || !password || !sourceUrl, 'E2E_EMAIL, E2E_PASSWORD and E2E_PULL_SOURCE are required.');
  test.setTimeout(120_000);
  await signIn(page, baseURL);
  const created = await page.request.post('/api/connectors-hub/connections', {
    data: { connector_code: 'GENERIC_REST_PULL', name: 'Harvest feed', slug: `harvest-feed-${Date.now()}` },
    headers: { Origin: baseURL ?? '' },
  });
  expect(created.ok(), await created.text()).toBe(true);

  // Connector Hub: the pull source, its key, and "send to Analytics" before the first pull.
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
  await page.getByLabel('API key').fill('proof-key-123');
  await page.getByRole('button', { name: 'Store secrets' }).click();
  await expect(page.getByText(/Login secrets stored/)).toBeVisible();
  await page.getByLabel('Send pulled records to Analytics').check();
  await expect(page.getByText(/New records will also go to Analytics/)).toBeVisible();
  await expect(page.getByLabel('Send pulled records to Analytics')).toBeChecked();
  await page.getByRole('button', { name: 'Pull now' }).click();
  await expect(page.getByText('Pulled 3 page(s): 4 new, 0 unchanged, 0 quarantined.')).toBeVisible();

  // Analytics › Sources: the relay delivers within seconds.
  await page.goto('/analytics/sources');
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('Harvest feed', { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText('Connector Hub', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Map fields' }).click();
  await page.getByRole('button', { name: 'Discover fields' }).click();
  await page.getByLabel('Dataset name for quantity').fill('yield_kg');
  await page.getByLabel('Unit conversion of quantity').selectOption('field');
  await page.getByLabel('Field naming the unit of quantity').selectOption('unit');
  await page.getByLabel('Unit quantity is stored in').selectOption('kg');
  await page.getByRole('button', { name: 'Save and publish mapping' }).click();
  await expect(page.getByText(/Mapping “Harvest feed” published with \d+ fields/)).toBeVisible();

  await page.getByRole('button', { name: 'Build now' }).click();
  await expect(page.getByText('Dataset version 1 built: 4 records.')).toBeVisible();
  await page.getByRole('button', { name: 'Make explorable' }).click();
  await expect(page.getByText(/.Harvest feed. is ready in Explore/)).toBeVisible();
  await expect(page.getByText('Model “Harvest feed”')).toBeVisible();

  // The model answers in kilograms: 12 quintals + 2 tonnes of maize = 3200 kg.
  const models = (await (await page.request.get('/api/analytics/v1/semantic-models')).json()) as Array<{ id: string; displayName: string }>;
  const model = models.find((candidate) => candidate.displayName === 'Harvest feed')!;
  const answer = await page.request.post('/api/analytics/v1/query/spec', {
    data: { semanticModelId: model.id, measures: ['total_yield_kg'], dimensions: ['crop'] },
    headers: { Origin: baseURL ?? '' },
  });
  expect(answer.ok(), await answer.text()).toBe(true);
  const result = (await answer.json()) as { rows: Array<[string, number]> };
  expect(Object.fromEntries(result.rows)).toEqual({ maize: 3200, rice: 800, wheat: 500 });

  // A saved chart, so the rebuild has a summary to refresh; then a daily rebuild schedule.
  const saved = await page.request.post('/api/analytics/v1/chart-views', {
    data: { name: 'Yield by crop', query: { semanticModelId: model.id, measures: ['total_yield_kg'], dimensions: ['crop'] }, visual: { type: 'table' } },
    headers: { Origin: baseURL ?? '' },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Add schedule' }).click();
  await expect(page.getByText('Every day at 06:00')).toBeVisible();
});
