/**
 * WI-OI-105 live proof (ADR-0016 F15, agriculture phase 3 exit): "a map of fields coloured by a measure, filtered to
 * one farm, shows only what the user may see".
 *  - E2E_PHASE=admin: a Tenant Admin sends a land register (farms and fields with WKT boundaries) from Connector Hub
 *    to Geospatial as places, pulls field scouting into Analytics, tags each record with the field holding its
 *    point, and draws pests per field on Farm B as a place map. Writes the farm ids to E2E_OUT for the harness.
 *  - E2E_PHASE=scoped: a member whose place scope is Farm B opens the unfiltered saved map and sees only Farm B.
 * E2E_PULL_SOURCE is the throwaway source as the throwaway Connector Hub sees it.
 */
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const sourceUrl = process.env.E2E_PULL_SOURCE ?? '';
const phase = process.env.E2E_PHASE ?? '';
const out = process.env.E2E_OUT ?? '';

interface Place {
  id: string;
  name: string;
  path: string;
}

async function signIn(page: Page, baseURL: string | undefined) {
  const response = await page.request.post('/api/auth/login', { data: { email, password }, headers: { Origin: baseURL ?? '' } });
  expect(response.status(), await response.text()).toBe(200);
}

const json = async <T,>(response: Awaited<ReturnType<Page['request']['get']>>): Promise<T> => {
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
};

async function directory(page: Page, query = ''): Promise<Place[]> {
  return (await json<{ places: Place[] }>(await page.request.get(`/api/analytics/v1/places/directory${query}`))).places;
}

test('admin: land becomes places, scouting is tagged by field, and pests are mapped on one farm', async ({ page, baseURL }) => {
  test.skip(phase !== 'admin' || !email || !password || !sourceUrl, 'E2E_PHASE=admin, E2E_EMAIL, E2E_PASSWORD and E2E_PULL_SOURCE are required.');
  test.setTimeout(180_000);
  await signIn(page, baseURL);
  const origin = { Origin: baseURL ?? '' };
  for (const [code, label] of [['FARM', 'Farm'], ['FIELD', 'Field']]) {
    await json(await page.request.post('/api/maps/node-types', { data: { code, label }, headers: origin }));
  }

  // Connector Hub: the land register goes to Geospatial as places (farms and their fields, one source).
  await json(await page.request.post('/api/connectors-hub/connections', {
    data: { connector_code: 'GENERIC_REST_PULL', name: 'Land register', slug: `land-${Date.now()}` },
    headers: origin,
  }));
  await page.goto('/connections');
  await page.getByRole('button', { name: 'Set up a pull source' }).click();
  await page.getByLabel('Base URL').fill(sourceUrl);
  await page.getByLabel('Resource path').fill('/v1/land');
  await page.getByLabel('Records are at').fill('data');
  await page.getByLabel('Login', { exact: true }).selectOption('api-key');
  await page.getByRole('button', { name: 'Save pull source' }).click();
  await expect(page.getByText('Pull source saved.')).toBeVisible();
  await page.getByLabel('API key').fill('proof-key-123');
  await page.getByRole('button', { name: 'Store secrets' }).click();
  await expect(page.getByText(/Login secrets stored/)).toBeVisible();
  await page.getByRole('button', { name: 'Set up', exact: true }).click();
  await page.getByLabel('Place type', { exact: true }).fill('FIELD');
  await page.getByLabel('Type field (optional)').fill('kind');
  await page.getByLabel('Name field').fill('name');
  await page.getByLabel('Shape field').fill('boundary');
  await page.getByLabel('Parent field (optional)').fill('farm_id');
  await page.getByRole('button', { name: 'Save place settings' }).click();
  await expect(page.getByText('Records pulled from now on will also become places in Geospatial.')).toBeVisible();
  await page.getByRole('button', { name: 'Pull now' }).click();
  await expect(page.getByText(/Pulled 1 page\(s\): 6 new/)).toBeVisible();

  // Geospatial makes the places and relays them on to Analytics' place directory within seconds.
  let places: Place[] = [];
  await expect(async () => {
    places = await directory(page);
    expect(places.map((place) => place.name).sort()).toEqual(['A1', 'A2', 'B1', 'B2', 'Farm A', 'Farm B']);
  }).toPass({ timeout: 60_000 });
  const farmA = places.find((place) => place.name === 'Farm A')!;
  const farmB = places.find((place) => place.name === 'Farm B')!;
  expect(places.find((place) => place.name === 'B2')!.path).toBe(`${farmB.path}.field_b2`);

  // Field scouting goes to Analytics (set up through the API; the browser path was proven in WI-OI-104e).
  // The create route answers { connection: { connection: row } } (Connector Hub wraps the service result).
  const created = await json<{ connection: { id?: string; connection?: { id: string } } }>(await page.request.post('/api/connectors-hub/connections', {
    data: {
      connector_code: 'GENERIC_REST_PULL',
      name: 'Field scouting',
      slug: `scouting-${Date.now()}`,
      configuration: { source: { baseUrl: sourceUrl, resourcePath: '/v1/scouting', recordsPath: 'data', paging: { style: 'none' }, auth: { kind: 'api-key', in: 'header', name: 'X-API-Key' } } },
    },
    headers: origin,
  }));
  const scoutingId = created.connection.connection?.id ?? created.connection.id;
  expect(scoutingId).toBeTruthy();
  const hub = (path: string, data: unknown) => page.request.post(`/api/connectors-hub/connections/${scoutingId}/${path}`, { data, headers: origin });
  await json(await hub('credentials', { kind: 'api-key', apiKey: 'proof-key-123' }));
  await json(await hub('delivery', { analytics: true }));
  await json(await hub('sync', {}));

  // Analytics › Sources: each record takes the smallest place holding its point; one lies outside every farm.
  await page.goto('/analytics/sources');
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('Field scouting', { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Map fields' }).click();
  await page.getByRole('button', { name: 'Discover fields' }).click();
  await page.getByLabel('Place of each record').selectOption('point');
  await expect(page.getByLabel('Latitude field')).toHaveValue('lat');
  await expect(page.getByLabel('Longitude field')).toHaveValue('lon');
  await page.getByRole('button', { name: 'Save and publish mapping' }).click();
  await expect(page.getByText(/Mapping “Field scouting” published/)).toBeVisible();
  await page.getByRole('button', { name: 'Build now' }).click();
  await expect(page.getByText('Dataset version 1 built: 6 records. 1 are in no known place (“Unplaced”).')).toBeVisible();
  await expect(page.getByText(/6 records · 1 unplaced/)).toBeVisible();
  await page.getByRole('button', { name: 'Make explorable' }).click();
  await expect(page.getByText(/.Field scouting. is ready in Explore/)).toBeVisible();

  const models = await json<Array<{ id: string; displayName: string }>>(await page.request.get('/api/analytics/v1/semantic-models'));
  const model = models.find((candidate) => candidate.displayName === 'Field scouting')!;
  const byField = { semanticModelId: model.id, measures: ['total_pests'], dimensions: ['place'] };
  const answer = async (query: object) => (await json<{ rows: Array<[string, number]> }>(await page.request.post('/api/analytics/v1/query/spec', { data: query, headers: origin }))).rows;
  expect(Object.fromEntries(await answer(byField))).toEqual({ A1: 10, A2: 4, B1: 20, B2: 7, 'Farm B': 3, Unplaced: 5 });
  expect(Object.fromEntries(await answer({ ...byField, placeUnder: farmB.id }))).toEqual({ B1: 20, B2: 7, 'Farm B': 3 });

  // Saved place maps: one on Farm B, and one of every place (for the scoped member).
  const onPlaces = { semanticModelId: model.id, measures: ['total_pests'], dimensions: ['place_id'] };
  for (const [name, query] of [['Pests on Farm B', { ...onPlaces, placeUnder: farmB.id }], ['Pests by field', onPlaces]] as const) {
    await json(await page.request.post('/api/analytics/v1/chart-views', { data: { name, query, visual: { type: 'place_map' } }, headers: origin }));
  }
  await page.goto('/analytics/explore');
  await page.getByRole('button', { name: /Pests on Farm B/ }).click();
  // ECharts labels the drawn map with its data ("the data for <place id> is <value>"), so the label lists what is drawn.
  const map = page.getByRole('img', { name: /chart with type Map named Pests/ });
  await expect(map.locator('svg path').first()).toBeVisible({ timeout: 20_000 });
  const farmBPlaces = places.filter((place) => place.path === farmB.path || place.path.startsWith(`${farmB.path}.`));
  const drawn = (await map.getAttribute('aria-label')) ?? '';
  for (const place of places) expect(drawn.includes(place.id), place.name).toBe(farmBPlaces.includes(place));
  await map.screenshot({ path: 'artifacts/places-map-admin-farm-b.png' });
  if (out) writeFileSync(out, JSON.stringify({ farmA: farmA.id, farmB: farmB.id }));
});

test('scoped member: the saved map shows only Farm B', async ({ page, baseURL }) => {
  test.skip(phase !== 'scoped' || !email || !password, 'E2E_PHASE=scoped, E2E_EMAIL and E2E_PASSWORD are required.');
  test.setTimeout(90_000);
  await signIn(page, baseURL);
  const origin = { Origin: baseURL ?? '' };
  const visible = await directory(page);
  expect(visible.map((place) => place.name).sort()).toEqual(['B1', 'B2', 'Farm B']);

  const views = await json<Array<{ name: string; query: Record<string, unknown> }>>(await page.request.get('/api/analytics/v1/chart-views'));
  const everywhere = views.find((view) => view.name === 'Pests by field')!;
  const rows = (await json<{ rows: Array<[string | null, number]> }>(await page.request.post('/api/analytics/v1/query/spec', { data: everywhere.query, headers: origin }))).rows;
  const ids = new Set(visible.map((place) => place.id));
  expect(rows.length).toBe(3);
  expect(rows.every(([placeId]) => placeId !== null && ids.has(placeId))).toBe(true);
  expect(rows.map(([, pests]) => pests).sort((a, b) => a - b)).toEqual([3, 7, 20]);
  // Asking about another farm returns nothing rather than that farm's records.
  const farmA = process.env.E2E_FARM_A ?? '';
  expect((await json<{ rows: unknown[] }>(await page.request.post('/api/analytics/v1/query/spec', { data: { ...everywhere.query, placeUnder: farmA }, headers: origin }))).rows).toEqual([]);

  await page.goto('/analytics/explore');
  await page.getByRole('button', { name: /Pests by field/ }).click();
  const map = page.getByRole('img', { name: /chart with type Map named Pests/ });
  await expect(map.locator('svg path').first()).toBeVisible({ timeout: 20_000 });
  const drawn = (await map.getAttribute('aria-label')) ?? '';
  expect(visible.every((place) => drawn.includes(place.id))).toBe(true);
  expect(farmA ? drawn.includes(farmA) : false).toBe(false);
  await map.screenshot({ path: 'artifacts/places-map-scoped-member.png' });
});
