import { createRequire } from 'node:module';

const require = createRequire('/Users/rayapudi/dev/gigalibs/modules/accounts-receivable/apps/e2e/package.json');
const { chromium } = require('@playwright/test');
const email = process.env.GIGALIBS_UAT_EMAIL;
const password = process.env.GIGALIBS_UAT_PASSWORD;
if (!email || !password) throw new Error('UAT credentials are required.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const serverFailures = [];
const taxResponses = [];
page.on('response', (response) => {
  if (response.status() >= 500) serverFailures.push(`${response.status()} ${response.url()}`);
  if (response.url().includes('/api/tax/')) taxResponses.push({ status: response.status(), url: response.url() });
});

try {
  await page.goto('http://127.0.0.1:5180/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant)(\?|$)/, { timeout: 15_000 });
  if (!page.url().includes('/modules')) throw new Error(`Sign-in stopped at ${new URL(page.url()).pathname}`);

  await page.goto('http://127.0.0.1:5180/tax', { waitUntil: 'networkidle' });
  if (await page.getByRole('button', { name: 'Configure Tax' }).count()) {
    await page.getByRole('button', { name: 'Configure Tax' }).click();
    await page.waitForTimeout(2_000);
    const setupBody = await page.locator('body').innerText();
    if (!setupBody.includes('Configured')) {
      throw new Error(`Tax setup did not complete. Responses: ${JSON.stringify(taxResponses)}. Screen: ${setupBody.slice(-800)}`);
    }
    await page.getByRole('button', { name: 'Jurisdictions' }).click();
  }
  await page.getByRole('heading', { name: 'Tax Configuration' }).waitFor();
  const body = await page.locator('body').innerText();
  if (body.includes('Visible for local UAT inspection') || body.includes('Actions still blocked')) {
    throw new Error('Tax containment screen is still rendered.');
  }
  for (const label of ['Jurisdictions', 'Rate rules', 'Exemptions', 'Calculator & ledger', 'Nexus monitor']) {
    if (!body.includes(label)) throw new Error(`Tax workbench is missing ${label}.`);
  }
  await page.screenshot({
    path: '/Users/rayapudi/dev/gigalibs/docs/audits/2026-09-09-readiness/evidence/uat/tax-actionable-workbench.png',
    fullPage: true,
  });
  console.log(JSON.stringify({
    result: 'PASS', path: new URL(page.url()).pathname,
    setup: 'ACTIVE', containmentRemoved: true, workbenchSections: 5,
    serverFailures,
  }, null, 2));
} finally {
  await browser.close();
}
