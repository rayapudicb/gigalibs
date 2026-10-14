/**
 * Browser E2E and accessibility for the GigaOps P5–P8 screens, the CMMS P4 screens and the staffing card (WI-OI-038,
 * WI-OI-065 to WI-OI-071), on the web image. Signs in as the Tenant Admin prepared by verify-gigaops-web-path.mjs (E2E_EMAIL/E2E_PASSWORD),
 * drives the screens in Chrome, and fails on any serious or critical WCAG 2.2 AA violation (axe-core).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const siteId = process.env.E2E_SITE_ID ?? '';
const workOrderId = process.env.E2E_WORK_ORDER_ID ?? '';
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.use({
  channel: 'chrome',
  video: 'off',
  geolocation: { latitude: 12.9721, longitude: 77.5951, accuracy: 10 },
  permissions: ['geolocation'],
  timezoneId: 'Asia/Kolkata',
});

test.beforeAll(() => {
  if (!email || !password || !siteId || !workOrderId) throw new Error('E2E_EMAIL, E2E_PASSWORD, E2E_SITE_ID and E2E_WORK_ORDER_ID are required.');
});

async function signIn(page: Page, baseURL: string | undefined) {
  const response = await page.request.post('/api/auth/login', { data: { email, password }, headers: { Origin: baseURL ?? '' } });
  expect(response.status(), await response.text()).toBe(200);
}

/** Fails on serious or critical WCAG 2.2 AA violations; records the full count on the test. */
async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  test.info().annotations.push({
    type: `axe ${name}`,
    description: `${results.violations.length} violation rule(s), ${blocking.length} serious/critical; ${results.passes.length} rules passed`,
  });
  expect(blocking.map((violation) => `${violation.id} (${violation.impact}) ×${violation.nodes.length}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

test('Clock & timesheets: a punch from the browser is checked against the site boundary', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  // WI-OI-120ah: Time & Attendance lives at /gigaops/time (/gigaops/attendance redirects there).
  await page.goto('/gigaops/time');
  await expect(page.getByRole('heading', { name: 'My clock' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timesheet' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Time exceptions' })).toBeVisible();
  await page.locator('#clock-site').selectOption(siteId);
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByRole('button', { name: 'Clock out' })).toBeVisible();
  await expect(page.locator('li', { hasText: 'Clock in' }).filter({ hasText: 'inside' }).first()).toBeVisible();
  await expect(page.getByText('out of fence', { exact: false }).first()).toBeVisible();
  await audit(page, 'attendance');
});

test('Pay-ready outputs: policy packs, rates and runs render', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.goto('/gigaops/pay');
  await expect(page.getByRole('heading', { name: 'Policy packs' })).toBeVisible();
  await expect(page.getByText('US-CA-OT v1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay rates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay runs' })).toBeVisible();
  await audit(page, 'pay');
});

for (const path of ['/gigaops', '/gigaops/resources', '/gigaops/capabilities', '/cmms', '/cmms/assets', '/cmms/inventory', '/cmms/schedules', '/cmms/meters']) {
  test(`${path} renders without accessibility blockers`, async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle');
    await audit(page, path);
  });
}

for (const [section, heading] of [
  ['jobs', null],
  ['availability', null],
  ['scheduling', null],
] as const) {
  test(`GigaOps ${section} renders without accessibility blockers`, async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    const response = await page.goto(`/gigaops/${section}`);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole('navigation', { name: 'GigaOps sections' })).toBeVisible();
    if (heading) await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await audit(page, section);
  });
}

test('CMMS work order: the Staffing card shows the request Workforce accepted', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.goto('/cmms/work-orders');
  await page.getByText('Web staffing', { exact: false }).first().click();
  const details = page.getByRole('complementary', { name: 'Work order details' });
  await expect(details.getByRole('heading', { name: 'Staffing', exact: true })).toBeVisible();
  await expect(details.getByText('ACCEPTED')).toBeVisible();
  await audit(page, 'cmms-work-order');
});
