import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Uses the repository's installed browser; no HTTP stubs or authenticated business data.
const require = createRequire(new URL('../../../../../modules/accounts-receivable/apps/e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const output = fileURLToPath(new URL('./', import.meta.url));
const base = 'http://127.0.0.1:5199';
const checks = [];
const errors = [];
let completed = false;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByRole('heading', { name: 'Sign in to GigaLibs' }).waitFor();
  assert.equal(await page.getByText('Switch Simulation Persona').count(), 0);
  checks.push('Login exposes the credential form without simulated personas');
  await page.getByLabel('Email', { exact: true }).fill('iam-browser@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('isolated-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('form').getByRole('alert').waitFor();
  assert.match(await page.locator('form').getByRole('alert').innerText(), /unavailable/i);
  assert.equal((await context.cookies()).some(cookie => cookie.name === 'gigalibs_access_token'), false);
  checks.push('Real unavailable login stays on the form and creates no authenticated cookie');
  await page.screenshot({ path: `${output}login-unavailable.png`, fullPage: true });

  await page.goto(`${base}/register`);
  await page.getByRole('heading', { name: 'Create your GigaLibs account' }).waitFor();
  await page.getByLabel('Name', { exact: true }).fill('Isolated browser check');
  await page.getByLabel('Email', { exact: true }).fill('iam-browser@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('short');
  let registrationRequests = 0;
  page.on('request', request => { if (request.url().endsWith('/api/auth/register')) registrationRequests++; });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  assert.equal(await page.getByLabel('Password', { exact: true }).evaluate(input => input.validity.tooShort), true);
  assert.equal(registrationRequests, 0);
  checks.push('Browser password validation rejects short registration before an API call');
  await page.getByLabel('Password', { exact: true }).fill('isolated-browser-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.locator('form').getByRole('alert').waitFor();
  assert.match(await page.locator('form').getByRole('alert').innerText(), /unavailable/i);
  assert.equal((await context.cookies()).some(cookie => cookie.name === 'gigalibs_access_token'), false);
  checks.push('Unavailable registration shows failure without a workspace-provisioning claim');

  await page.goto(`${base}/ar/invoices/IAM-NONEXISTENT`);
  await page.waitForURL(`${base}/login`);
  checks.push('Direct invoice navigation redirects anonymous users to sign in');
  await context.addCookies([{ name: 'gigalibs_access_token', value: 'invalid-audit-token', url: base }]);
  await page.goto(`${base}/ar`);
  await page.getByRole('heading', { name: 'Sign-in service is unavailable' }).waitFor();
  assert.equal(await page.getByText('FALLBACK_INVOICES').count(), 0);
  checks.push('Unverified cookie cannot open the workspace during an identity outage');
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/login`);
  await page.getByRole('heading', { name: 'Sign in to GigaLibs' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: `${output}login-mobile.png`, fullPage: true });
  checks.push('Login form fits a 390-pixel viewport');
  assert.deepEqual(errors, []);
  completed = true;
} finally {
  await browser.close();
  const report = { kind: 'Real Chromium browser verification', base,
    identityService: 'deliberately unconfigured', mockedHttpResponses: false,
    scope: 'negative identity/containment flows; not manual human UAT or DB E2E',
    passed: completed, checks, pageErrors: errors };
  writeFileSync(`${output}browser-results.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: checks.length, passed: completed, pageErrors: errors.length }));
}
