import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  new URL('../../../../../modules/accounts-receivable/apps/e2e/package.json', import.meta.url),
);
const { chromium } = require('@playwright/test');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../../../packages/db/dist/index.js'),
  import('../../../../../packages/auth-core/dist/index.js'),
]);

const baseUrl = process.env.WORKFLOW_PLATFORM_TEST_URL ?? 'http://127.0.0.1:5180';
const output = fileURLToPath(new URL('./', import.meta.url));
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `uat.configuration.browser.${suffix}@gigalibs.invalid`;
const password = `Browser-${randomBytes(20).toString('base64url')}!`;
const tenantSlug = `uat-configuration-browser-${suffix}`.slice(0, 63);
const pageErrors = [];
const failedResponses = [];
let browser;
let user;
let tenant;

try {
  user = await prisma.user.create({
    data: {
      email,
      name: 'UAT Configuration Browser Administrator',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
    },
  });
  tenant = await prisma.tenant.create({
    data: {
      slug: tenantSlug,
      name: 'UAT Configuration Browser Tenant',
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: {},
          updatedById: user.id,
        },
      },
    },
  });
  await prisma.tenantMember.create({
    data: { tenantId: tenant.id, userId: user.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
  });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant)(\?|$)/, { timeout: 30_000 });

  if (page.url().includes('/select-tenant')) {
    const tenantButton = page.getByRole('button').filter({ hasText: tenantSlug });
    assert.ok((await tenantButton.count()) > 0, `Tenant ${tenantSlug} is not selectable.`);
    await tenantButton.first().click();
    await page.waitForURL(/\/modules(\?|$)/, { timeout: 30_000 });
  }

  await page.goto(`${baseUrl}/configuration`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Universal Configuration Studio' }).waitFor();
  await page.getByRole('heading', { name: 'Components' }).waitFor();
  await page.getByText('Canvas', { exact: true }).waitFor();
  await page.getByText('Inspector', { exact: true }).waitFor();

  const componentNames = [
    'Short text',
    'Long text',
    'Number',
    'Whole number',
    'Currency',
    'Dropdown',
    'Multi-select',
    'Checkbox',
    'Date',
    'Date & time',
    'Email',
    'Phone',
    'Website link',
  ];
  for (const name of componentNames) {
    await page.getByRole('button', { name: `Add ${name} field`, exact: true }).waitFor();
  }

  const surfaceOptions = await page.locator('select').first().locator('option').allTextContents();
  assert.deepEqual(surfaceOptions, ['Tenant profile', 'New tenant application']);

  await page.getByRole('button', { name: 'Add Currency field' }).click();
  await page.getByText('2 fields', { exact: true }).waitFor();
  await page
    .locator('aside')
    .last()
    .getByRole('heading', { name: 'Currency' })
    .waitFor();
  await page.getByRole('button', { name: 'Mobile preview' }).click();
  await page.getByRole('button', { name: 'Desktop preview' }).click();
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedResponses, []);

  await page.screenshot({
    path: `${output}configuration-studio-visual-builder.png`,
    fullPage: true,
  });
  await writeFile(
    `${output}configuration-studio-browser.json`,
    `${JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        url: page.url(),
        checks: [
          'authenticated-tenant-route',
          'three-pane-builder-visible',
          'thirteen-component-palette-visible',
          'field-add-and-inspector-selection',
          'responsive-preview-controls',
          'registry-surfaces-loaded',
          'no-page-errors',
          'no-server-errors',
        ],
        surfaceOptions,
      },
      null,
      2,
    )}\n`,
  );
  console.log('Configuration Studio browser certification passed.');
} finally {
  if (browser) await browser.close();
  if (tenant || user) {
    await prisma.$transaction([
      prisma.tenantMember.updateMany({
        where: {
          OR: [
            ...(tenant ? [{ tenantId: tenant.id }] : []),
            ...(user ? [{ userId: user.id }] : []),
          ],
        },
        data: { status: 'SUSPENDED' },
      }),
      prisma.tenant.updateMany({
        where: { id: tenant?.id ?? '' },
        data: { status: 'CANCELLED', features: [] },
      }),
      prisma.user.updateMany({
        where: { id: user?.id ?? '' },
        data: { status: 'DEACTIVATED' },
      }),
    ]).catch(() => undefined);
  }
  await prisma.$disconnect();
}
