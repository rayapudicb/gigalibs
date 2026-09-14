import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'modules/accounts-receivable/apps/e2e/package.json'));
const { chromium } = require('@playwright/test');

const email = process.env.GIGALIBS_UAT_EMAIL?.trim();
const password = process.env.GIGALIBS_UAT_PASSWORD;
const baseUrl = process.env.GIGALIBS_UAT_BASE_URL?.trim() || 'http://127.0.0.1:5180';
const tenantSlug = process.env.GIGALIBS_UAT_TENANT_SLUG?.trim() || 'my-workspace';
const evidenceDirectory = resolve(root, 'docs/audits/2026-09-09-readiness/evidence/uat');

if (!email || !password) {
  throw new Error('GIGALIBS_UAT_EMAIL and GIGALIBS_UAT_PASSWORD are required.');
}

const financeModules = [
  {
    key: 'accounts-receivable',
    path: '/ar',
    heading: 'Accounts Receivable',
    setupButton: /Configure this tenant for AR/i,
  },
  {
    key: 'spend-management',
    path: '/spend',
    heading: 'Spend Management & AP',
    setupButton: /Configure Spend Management/i,
  },
  {
    key: 'tax-configuration',
    path: '/tax',
    heading: 'Tax Configuration',
    setupButton: /Configure Tax/i,
  },
  {
    key: 'multi-currency',
    path: '/currency',
    heading: 'Multi-Currency & Treasury FX',
    setupButton: /Configure Multi-Currency Engine/i,
  },
  {
    key: 'autonomous-recovery',
    path: '/recovery',
    heading: 'Autonomous Cash Leakage & Recovery Studio',
    setupButton: /Bind Tenant & Initialize Recovery Engine/i,
  },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const pageErrors = [];
const serverFailures = [];
const financeResponses = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  const url = response.url();
  if (response.status() >= 500) serverFailures.push(`${response.status()} ${url}`);
  if (/\/api\/(ar|spend|tax|currency|recovery|analytics|esign)\//.test(url)) {
    financeResponses.push({ status: response.status(), url });
  }
});

const result = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  tenantSlug,
  catalogCount: 0,
  financeLinks: [],
  modules: [],
  pageErrors,
  serverFailures,
  financeResponses,
};

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant)(\?|$)/, { timeout: 30_000 });

  if (page.url().includes('/select-tenant')) {
    await page.getByRole('button').filter({ hasText: tenantSlug }).click();
    await page.waitForURL(/\/modules(\?|$)/, { timeout: 30_000 });
  }
  if (!page.url().includes('/modules')) {
    throw new Error(`Sign-in stopped at ${new URL(page.url()).pathname}.`);
  }

  await page.getByRole('heading', { name: 'GigaLibs modules' }).waitFor();
  const catalogText = await page.locator('body').innerText();
  const countMatch = catalogText.match(/(\d+)\s+Registered modules/i);
  result.catalogCount = countMatch ? Number(countMatch[1]) : 0;
  result.financeLinks = [
    ...new Set(
      await page
        .locator(
          'a[href="/ar"], a[href="/spend"], a[href="/tax"], a[href="/currency"], a[href="/recovery"]',
        )
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ),
  ];
  await page.screenshot({
    path: resolve(evidenceDirectory, 'finance-suite-modules.png'),
    fullPage: true,
  });

  for (const module of financeModules) {
    const responseStart = financeResponses.length;
    await page.goto(`${baseUrl}${module.path}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: module.heading }).waitFor({ timeout: 15_000 });

    const setupButton = page.getByRole('button', { name: module.setupButton });
    if ((await setupButton.count()) > 0 && (await setupButton.first().isEnabled())) {
      await setupButton.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }

    const body = await page.locator('body').innerText();
    const contained =
      body.includes('Visible for local UAT inspection') ||
      body.includes('Actions still blocked') ||
      body.includes('This capability is unavailable');
    const responses = financeResponses.slice(responseStart);
    result.modules.push({
      key: module.key,
      path: new URL(page.url()).pathname,
      contained,
      apiStatuses: [...new Set(responses.map((item) => item.status))].sort(),
    });
    await page.screenshot({
      path: resolve(evidenceDirectory, `finance-suite-${module.key}.png`),
      fullPage: true,
    });
  }

  if (result.catalogCount < 30)
    throw new Error(`Expected at least 30 modules; found ${result.catalogCount}.`);
  if (new Set(result.financeLinks).size !== financeModules.length) {
    throw new Error(`Expected five actionable finance links; found ${result.financeLinks.length}.`);
  }
  if (result.modules.some((module) => module.contained)) {
    throw new Error('At least one finance route still rendered a containment page.');
  }
  if (pageErrors.length > 0 || serverFailures.length > 0) {
    throw new Error('Browser verification observed page errors or server failures.');
  }

  await writeFile(
    resolve(evidenceDirectory, 'finance-suite-browser-result.json'),
    `${JSON.stringify({ result: 'PASS', ...result }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ result: 'PASS', catalogCount: result.catalogCount, financeLinks: result.financeLinks.length, modules: result.modules }, null, 2)}\n`,
  );
} catch (error) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'finance-suite-browser-result.json'),
    `${JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error), ...result }, null, 2)}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
