/**
 * WI-OI-107 live proof (ADR-0016 F10): an industry pack is a solution-level file that a workspace installs in
 * Configuration Studio, approves (a second administrator), publishes and activates, with no code and no deploy.
 * Activation sends each module its section through kernel jobs: Workforce holds its wording and settings, Geospatial
 * adds the pack's place types. One industry pack is active at a time; switching keeps the place types already made.
 * E2E_EMAIL/E2E_PASSWORD install and activate; E2E_APPROVER_EMAIL/E2E_APPROVER_PASSWORD approve (maker-checker).
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const author = { email: process.env.E2E_EMAIL ?? '', password: process.env.E2E_PASSWORD ?? '' };
const approver = { email: process.env.E2E_APPROVER_EMAIL ?? '', password: process.env.E2E_APPROVER_PASSWORD ?? '' };

interface ChangeSet {
  id: string;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  status: string;
  version: number;
}

async function signIn(page: Page, who: { email: string; password: string }, origin: string) {
  const response = await page.request.post('/api/auth/login', { data: who, headers: { Origin: origin } });
  expect(response.status(), await response.text()).toBe(200);
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

test('a pack activated in Configuration Studio reaches Workforce and Geospatial, one industry pack at a time', async ({ browser, baseURL }) => {
  test.skip(!author.email || !approver.email, 'E2E_EMAIL, E2E_PASSWORD, E2E_APPROVER_EMAIL and E2E_APPROVER_PASSWORD are required.');
  test.setTimeout(180_000);
  const origin = { Origin: baseURL ?? '' };
  const page = await (await browser.newContext()).newPage();
  const checker = await (await browser.newContext()).newPage();
  await signIn(page, author, baseURL ?? '');
  await signIn(checker, approver, baseURL ?? '');
  const post = (who: Page, url: string, data: unknown) => who.request.post(url, { data, headers: origin });

  /** Submit (author), approve (second administrator), publish and activate (author); returns the activation. */
  const release = async (entityKey: 'industry-pack' | 'country-pack', surfaceKey: string) => {
    const changeSets = await json<ChangeSet[] | { items: ChangeSet[] }>(await page.request.get('/api/control/configuration/change-sets'));
    const list = Array.isArray(changeSets) ? changeSets : changeSets.items;
    let changeSet = list.find((item) => item.moduleKey === 'solution' && item.entityKey === entityKey && item.surfaceKey === surfaceKey && item.status === 'VALIDATED')!;
    expect(changeSet, `a validated ${surfaceKey} change set`).toBeTruthy();
    changeSet = await json<ChangeSet>(await post(page, `/api/control/configuration/change-sets/${changeSet.id}/submit`, { reason: 'WI-OI-107 proof', expectedVersion: changeSet.version }));
    expect((await post(page, `/api/control/configuration/change-sets/${changeSet.id}/approve`, { reason: 'Self-approval', expectedVersion: changeSet.version })).status()).toBe(403);
    changeSet = await json<ChangeSet>(await post(checker, `/api/control/configuration/change-sets/${changeSet.id}/approve`, { reason: 'Checked by a second administrator', expectedVersion: changeSet.version }));
    await json(await post(page, `/api/control/configuration/change-sets/${changeSet.id}/publish`, { reason: 'WI-OI-107 proof', expectedVersion: changeSet.version }));
    const versions = await json<Array<{ id: string; moduleKey: string; entityKey: string; surfaceKey: string; sequence: number }> | { items: Array<{ id: string; moduleKey: string; entityKey: string; surfaceKey: string; sequence: number }> }>(
      await page.request.get('/api/control/configuration/published-versions'),
    );
    const published = (Array.isArray(versions) ? versions : versions.items)
      .filter((item) => item.moduleKey === 'solution' && item.entityKey === entityKey && item.surfaceKey === surfaceKey)
      .sort((a, b) => b.sequence - a.sequence)[0]!;
    return json<{ id: string; packApplications?: Array<{ moduleKey: string; jobId: string }> }>(
      await post(page, '/api/control/configuration/activations', {
        publishedVersionId: published.id,
        environmentKey: 'local-uat',
        cohortKey: 'all-users',
        reason: `Activate the ${surfaceKey} pack`,
        idempotencyKey: `wi-oi-107-${surfaceKey}-${Date.now()}`,
      }),
    );
  };
  const workforcePacks = async () => (await json<{ items: Array<{ kind: string; key: string; section: Record<string, any> }> }>(await page.request.get('/api/workforce/pack'))).items;
  const placeTypes = async () => {
    const body = await json<{ items: Array<{ code: string; label: string }> }>(await page.request.get('/api/maps/node-types'));
    return body.items.map((type) => type.code).sort();
  };

  // Configuration › Industry packs: the shipped packs, installed with one click.
  await page.goto('/configuration');
  await page.getByRole('button', { name: /Industry packs/ }).click();
  await expect(page.getByRole('heading', { name: 'Industry and country packs' })).toBeVisible();
  const agricultureRow = page.getByRole('listitem').filter({ hasText: 'Agriculture' });
  await expect(agricultureRow.getByText('Not installed')).toBeVisible();
  await agricultureRow.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByText(/Agriculture is installed as a draft/)).toBeVisible();

  // Approve, publish, activate: Workforce and Geospatial each receive their section by kernel job.
  const activation = await release('industry-pack', 'agriculture');
  expect(activation.packApplications?.map((item) => item.moduleKey).sort()).toEqual(['geospatial', 'gigaops']);
  await expect(async () => {
    const held = await workforcePacks();
    expect(held.find((item) => item.kind === 'INDUSTRY')).toMatchObject({ key: 'agriculture', section: { vocabulary: { terms: { worker: 'Farm Hand', workUnit: 'Harvest Run' } } } });
    expect(await placeTypes()).toEqual(expect.arrayContaining(['BLOCK', 'FARM', 'FIELD']));
  }).toPass({ timeout: 60_000 });
  expect((await json<{ items: Array<{ key: string }> }>(await page.request.get('/api/maps/pack'))).items.map((item) => item.key)).toEqual(['agriculture']);

  // A country pack: Workforce receives its pay-rule settings; Geospatial reads no country packs.
  await json(await post(page, '/api/control/configuration/catalogues/install', { kind: 'COUNTRY_PACK', surfaceKey: 'in', reason: 'WI-OI-107 proof', idempotencyKey: `install-in-${Date.now()}` }));
  expect((await release('country-pack', 'in')).packApplications?.map((item) => item.moduleKey)).toEqual(['gigaops']);
  await expect(async () => {
    expect((await workforcePacks()).find((item) => item.kind === 'COUNTRY')).toMatchObject({ key: 'IN', section: { rules: { weeklyOtThreshold: expect.any(Number) } } });
  }).toPass({ timeout: 60_000 });

  // Switching the industry: manufacturing becomes the one active industry pack; agriculture's place types stay.
  const before = await placeTypes();
  await json(await post(page, '/api/control/configuration/catalogues/install', { kind: 'INDUSTRY_PACK', surfaceKey: 'manufacturing', reason: 'WI-OI-107 proof', idempotencyKey: `install-mfg-${Date.now()}` }));
  await release('industry-pack', 'manufacturing');
  const active = await json<{ industry: { surfaceKey: string } | null; country: { surfaceKey: string } | null }>(await page.request.get('/api/control/configuration/packs/active'));
  expect([active.industry?.surfaceKey, active.country?.surfaceKey]).toEqual(['manufacturing', 'in']);
  await expect(async () => {
    expect((await workforcePacks()).find((item) => item.kind === 'INDUSTRY')).toMatchObject({ key: 'manufacturing', section: { vocabulary: { terms: { worker: 'Operator' } } } });
    const after = await placeTypes();
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after.length).toBeGreaterThan(before.length);
  }).toPass({ timeout: 60_000 });
  await page.reload();
  await page.getByRole('button', { name: /Industry packs/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Manufacturing' }).getByText('Active')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Agriculture' }).getByText('Active')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/packs-configuration.png', fullPage: false });
});
