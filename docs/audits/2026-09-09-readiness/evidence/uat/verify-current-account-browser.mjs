import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const email = process.env.GIGALIBS_UAT_EMAIL?.trim();
const password = process.env.GIGALIBS_UAT_PASSWORD;
const base = process.env.GIGALIBS_UAT_BASE_URL?.trim() || 'http://127.0.0.1:5180';
const tenantSlug = process.env.GIGALIBS_UAT_TENANT_SLUG?.trim() || 'my-workspace';
if (!email || !password) {
  throw new Error('GIGALIBS_UAT_EMAIL and GIGALIBS_UAT_PASSWORD are required.');
}

const require = createRequire(
  new URL('../../../../../modules/accounts-receivable/apps/e2e/package.json', import.meta.url),
);
const { chromium } = require('@playwright/test');
const output = fileURLToPath(new URL('./current-account-browser-result.json', import.meta.url));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
const checks = [];
page.setDefaultTimeout(30_000);
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant)(\?|$)/);

  if (page.url().includes('/select-tenant')) {
    await page.getByRole('button').filter({ hasText: tenantSlug }).click();
    await page.waitForURL(/\/modules(\?|$)/);
  }
  assert.match(page.url(), /\/modules(\?|$)/);
  const catalogText = await page.locator('body').innerText();
  assert.match(catalogText, /30\s+Registered modules/i);
  checks.push('named account authenticated and opened the 30-module catalogue');

  await page.goto(`${base}/settings/profile`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Account Profile & Security' }).waitFor();
  await page.getByText('Sign-in Methods', { exact: true }).waitFor();
  checks.push('personal profile, password security and external sign-in methods rendered');

  await page.goto(`${base}/platform-admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Platform tenant control' }).waitFor();
  await page.getByText('Tenant registry', { exact: true }).waitFor();
  checks.push('global platform tenant control rendered for the supplied authority');

  await page.goto(`${base}/reports`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'This capability is unavailable' }).waitFor();
  await page.getByText('No business action has been performed from this screen.').waitFor();
  checks.push('contained Reports route rendered no fabricated business result');

  assert.deepEqual(pageErrors, []);
  const result = {
    result: 'PASS',
    recordedAt: new Date().toISOString(),
    environment: 'local-uat',
    base,
    tenantSlug,
    checks,
    pageErrors,
    credentialsRecorded: false,
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ result: result.result, checks: checks.length })}\n`);
} catch (error) {
  const result = {
    result: 'FAIL',
    recordedAt: new Date().toISOString(),
    environment: 'local-uat',
    base,
    tenantSlug,
    checks,
    pageErrors,
    credentialsRecorded: false,
    error: error instanceof Error ? error.message : String(error),
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
