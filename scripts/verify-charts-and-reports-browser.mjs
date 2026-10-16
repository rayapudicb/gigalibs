import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'modules/accounts-receivable/apps/e2e/package.json'));
const { chromium } = require('@playwright/test');

// WI-OI-120bd: the sign-in comes from the environment only; no credential lives in code.
const email = process.env.GIGALIBS_UAT_EMAIL?.trim() ?? '';
const password = process.env.GIGALIBS_UAT_PASSWORD ?? '';
if (!email || !password) {
  console.error('Set GIGALIBS_UAT_EMAIL and GIGALIBS_UAT_PASSWORD (read the password with read -rs, never on the command line).');
  process.exit(1);
}
const baseUrl = process.env.GIGALIBS_UAT_BASE_URL?.trim() || 'http://127.0.0.1:5180';
const evidenceDirectory = resolve(root, 'docs/audits/2026-09-09-readiness/evidence/uat');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const pageErrors = [];
const serverFailures = [];

page.on('console', (msg) => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) {
    console.log(`[HTTP ${response.status()}]:`, response.url());
  }
  if (response.status() >= 500) {
    serverFailures.push(`${response.status()} ${response.url()}`);
  }
});

const result = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  analytics36ChartsVerified: false,
  reportsStudioVerified: false,
  reportsDownloadOptionsVerified: false,
  sidebarNavigationVerified: false,
  reportCategoriesTested: [],
};

try {
  // 1. Authenticate as Tenant Admin
  console.log('Logging in as tenant admin...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant)(\?|$)/, { timeout: 15_000 });

  if (page.url().includes('/select-tenant')) {
    const tenantButton = page.getByRole('button', { name: /my-workspace/i });
    if ((await tenantButton.count()) > 0) {
      await tenantButton.first().click();
      await page.waitForURL(/\/modules(\?|$)/, { timeout: 15_000 });
    }
  }

  // 2. Verify Reports Studio Link in Sidebar
  console.log('Verifying sidebar navigation for Reports Studio...');
  const reportsSidebarLink = page.locator('aside').getByRole('link', { name: /Reports Studio/i });
  await reportsSidebarLink.waitFor({ timeout: 5_000 });
  result.sidebarNavigationVerified = true;

  // 3. Test 36 Industry Visualizations on /analytics
  console.log('Navigating to Analytics Studio...');
  await page.goto(`${baseUrl}/analytics`);
  await page.getByRole('heading', { name: 'Analytics Studio' }).waitFor({ timeout: 15_000 });

  // Verify Executive tab
  await page.waitForSelector('text=Net AR Invoiced', { timeout: 5_000 });

  // Switch to 36 Industry Visualizations Tab
  console.log('Switching to 36 Industry Visualizations tab...');
  const chartsTabBtn = page.getByRole('button', { name: /36 Industry Visualizations/i });
  await chartsTabBtn.click();

  // Verify 36 charts view loaded
  await page.waitForSelector('text=36 Industrial Telemetry & Operational Charts', { timeout: 8_000 });
  await page.waitForSelector('text=Showing 36 of 36 Charts', { timeout: 8_000 });

  // Test Sector filter
  console.log('Testing sector filter for Smart Farming...');
  await page.getByRole('button', { name: '🌾 Smart Farming (6)' }).click();
  await page.waitForSelector('text=Active Monitored Silos', { timeout: 5_000 });

  // Test Search
  console.log('Testing search query filter...');
  const searchInput = page.locator('input[placeholder*="Search across all 36 charts"]');
  await searchInput.fill('vibration');
  await page.waitForSelector('text=Vibration FFT Spectrum Harmonic Signature', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Reset Filters' }).click();
  await page.waitForSelector('text=Showing 36 of 36 Charts', { timeout: 5_000 });

  // Take screenshot of 36 Charts Catalog
  await page.screenshot({
    path: resolve(evidenceDirectory, 'analytics-36-charts-catalog.png'),
    fullPage: true,
  });
  result.analytics36ChartsVerified = true;

  // 4. Test Universal Reports Studio on /reports
  console.log('Navigating to Universal Reports Studio...');
  await page.goto(`${baseUrl}/reports`);
  await page.getByRole('heading', { name: 'Universal Dynamic Reports Studio' }).waitFor({ timeout: 15_000 });

  // Verify default report (GL_TRIAL_BALANCE)
  await page.waitForSelector('text=General Ledger Double-Entry Trial Balance', { timeout: 8_000 });
  await page.waitForSelector('text=Total Balanced GL', { timeout: 5_000 });
  result.reportCategoriesTested.push('GL_TRIAL_BALANCE');

  // Verify Download Buttons exist
  const excelBtn = page.getByRole('button', { name: /Excel/i });
  const csvBtn = page.getByRole('button', { name: /CSV/i });
  const pdfBtn = page.getByRole('button', { name: /PDF/i });
  const jsonBtn = page.getByRole('button', { name: /JSON/i });

  await excelBtn.waitFor({ timeout: 5_000 });
  await csvBtn.waitFor({ timeout: 5_000 });
  await pdfBtn.waitFor({ timeout: 5_000 });
  await jsonBtn.waitFor({ timeout: 5_000 });

  result.reportsDownloadOptionsVerified = true;

  // Test switching reports in select dropdown
  console.log('Switching to Income Statement (P&L)...');
  const reportSelect = page.locator('select').first();
  await reportSelect.selectOption('INCOME_STATEMENT');
  await page.waitForSelector('text=Enterprise SaaS & Platform Subscriptions', { timeout: 5_000 });
  result.reportCategoriesTested.push('INCOME_STATEMENT');

  console.log('Switching to Accounts Receivable Aging...');
  await reportSelect.selectOption('AR_AGING');
  await page.waitForSelector('text=Total AR Portfolio', { timeout: 5_000 });
  result.reportCategoriesTested.push('AR_AGING');

  console.log('Switching to Autonomous Value Recovery Ledger...');
  await reportSelect.selectOption('VALUE_RECOVERY');
  await page.waitForSelector('text=Net Verified Cash Realized', { timeout: 5_000 });
  result.reportCategoriesTested.push('VALUE_RECOVERY');

  // Test JSON download event
  console.log('Testing JSON export event...');
  const [downloadJson] = await Promise.all([
    page.waitForEvent('download', { timeout: 5_000 }),
    jsonBtn.click(),
  ]);
  console.log(`Successfully downloaded: ${downloadJson.suggestedFilename()}`);

  // Test CSV download event
  console.log('Testing CSV export event...');
  const [downloadCsv] = await Promise.all([
    page.waitForEvent('download', { timeout: 5_000 }),
    csvBtn.click(),
  ]);
  console.log(`Successfully downloaded: ${downloadCsv.suggestedFilename()}`);

  // Take screenshot of Reports Studio
  await page.screenshot({
    path: resolve(evidenceDirectory, 'reports-multi-format-studio.png'),
    fullPage: true,
  });
  result.reportsStudioVerified = true;

  if (pageErrors.length > 0 || serverFailures.length > 0) {
    throw new Error(`Browser test observed errors: ${pageErrors.join(', ')} / ${serverFailures.join(', ')}`);
  }

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'charts-and-reports-browser-result.json'),
    `${JSON.stringify({ result: 'PASS', ...result }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ result: 'PASS', ...result }, null, 2)}\n`,
  );
} catch (error) {
  await mkdir(evidenceDirectory, { recursive: true });
  try {
    await page.screenshot({
      path: resolve(evidenceDirectory, 'test-failure-debug.png'),
      fullPage: true,
    });
  } catch {}
  await writeFile(
    resolve(evidenceDirectory, 'charts-and-reports-browser-result.json'),
    `${JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error), ...result }, null, 2)}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
