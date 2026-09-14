import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'modules/accounts-receivable/apps/e2e/package.json'));
const { chromium } = require('@playwright/test');

const email = process.env.GIGALIBS_UAT_EMAIL?.trim() || 'uat.tenant-admin.20260910a@gigalibs.io';
const password = process.env.GIGALIBS_UAT_PASSWORD || 'UatSuitePassword2026!';
const baseUrl = process.env.GIGALIBS_UAT_BASE_URL?.trim() || 'http://127.0.0.1:5180';
const tenantSlug = process.env.GIGALIBS_UAT_TENANT_SLUG?.trim() || 'my-workspace';
const evidenceDirectory = resolve(root, 'docs/audits/2026-09-09-readiness/evidence/uat');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const pageErrors = [];
const serverFailures = [];
const apiResponses = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  const url = response.url();
  if (response.status() >= 500) serverFailures.push(`${response.status()} ${url}`);
  if (/\/api\/(analytics|esign)\//.test(url)) {
    apiResponses.push({ status: response.status(), url });
  }
});

const result = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  tenantSlug,
  modules: [],
  pageErrors,
  serverFailures,
  apiResponses,
};

try {
  console.log('Logging in as tenant admin...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant)(\?|$)/, { timeout: 15_000 });

  if (page.url().includes('/select-tenant')) {
    const tenantButton = page.getByRole('button', { name: new RegExp(tenantSlug, 'i') });
    if ((await tenantButton.count()) > 0) {
      await tenantButton.first().click();
      await page.waitForURL(/\/modules(\?|$)/, { timeout: 15_000 });
    }
  }

  // Verify Modules Catalog
  console.log('Verifying module catalog...');
  await page.waitForSelector('text=Universal Analytics Studio', { timeout: 10_000 });
  await page.waitForSelector('text=Cryptographic Esign Pro', { timeout: 10_000 });
  await page.screenshot({
    path: resolve(evidenceDirectory, 'modules-intelligence-documents.png'),
    fullPage: true,
  });

  // ==========================================
  // 1. Verify Analytics Studio
  // ==========================================
  console.log('Navigating to Analytics Studio...');
  await page.goto(`${baseUrl}/analytics`);
  await page.getByRole('heading', { name: 'Analytics Studio' }).waitFor({ timeout: 15_000 });

  const analyticsBody = await page.locator('body').innerText();
  if (
    analyticsBody.includes('Visible for local UAT inspection') ||
    analyticsBody.includes('Actions still blocked') ||
    analyticsBody.includes('Live metric lineage is incomplete')
  ) {
    throw new Error('Analytics Studio still rendered a containment page.');
  }

  // Verify KPI metric cards
  await page.waitForSelector('text=Net AR Invoiced', { timeout: 10_000 });
  await page.waitForSelector('text=Committed Spend', { timeout: 10_000 });
  await page.waitForSelector('text=Treasury FX Volume', { timeout: 10_000 });
  await page.waitForSelector('text=Cash Leakage Preserved', { timeout: 10_000 });

  // Open Lineage Inspector
  console.log('Testing Cryptographic Lineage Audit Modal...');
  const inspectLineageBtn = page.getByRole('button', { name: 'Inspect Lineage' }).first();
  await inspectLineageBtn.click();
  await page.waitForSelector('text=Live Metric Lineage Proof', { timeout: 8_000 });
  await page.waitForSelector('text=FIPS 186-4 SHA-256 Lineage Seal', { timeout: 8_000 });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("✕")').click();

  // Open Executive Action Modal & Execute Action
  console.log('Testing Governed Executive Action Dispatch...');
  const execActionBtn = page.getByRole('button', { name: 'Executive Action' });
  await execActionBtn.click();
  await page.waitForSelector('text=Dispatch Governed Executive Action', { timeout: 5_000 });
  const dispatchBtn = page.getByRole('button', { name: 'Dispatch Action' });
  await dispatchBtn.click();

  // Wait for signed receipt in modal
  await page.waitForSelector('text=Action Successfully Dispatched', { timeout: 8_000 });
  await page.waitForSelector('text=Action ID:', { timeout: 5_000 });
  await page.waitForSelector('text=Receipt SHA-256:', { timeout: 5_000 });
  const doneActionBtn = page.getByRole('button', { name: 'Done' });
  await doneActionBtn.click();

  await page.screenshot({
    path: resolve(evidenceDirectory, 'analytics-studio-actionable.png'),
    fullPage: true,
  });

  result.modules.push({
    key: 'analytics-studio',
    path: '/analytics',
    contained: false,
    kpiCardsVerified: true,
    lineageInspectorVerified: true,
    actionExecutionVerified: true,
  });

  // ==========================================
  // 2. Verify Cryptographic E-Signature Pro
  // ==========================================
  console.log('Navigating to E-Signature Pro...');
  await page.goto(`${baseUrl}/esign`);
  await page.getByRole('heading', { name: 'Cryptographic E-Signature Pro' }).waitFor({ timeout: 15_000 });

  const esignBody = await page.locator('body').innerText();
  if (
    esignBody.includes('Visible for local UAT inspection') ||
    esignBody.includes('Actions still blocked') ||
    esignBody.includes('Provider evidence and reconciliation are incomplete')
  ) {
    throw new Error('E-Signature still rendered a containment page.');
  }

  // Create Envelope
  const envelopeTitle = `Master Services Agreement ${Date.now()}`;
  console.log(`Creating new cryptographic envelope: ${envelopeTitle}...`);
  await page.getByRole('button', { name: 'New Envelope' }).click();
  await page.waitForSelector('text=Draft Cryptographic E-Signature Envelope', { timeout: 5_000 });
  await page.locator('input[placeholder="Master Services Agreement 2026"]').fill(envelopeTitle);
  await page.locator('input[placeholder*="Full Name"]').first().fill('Jane Doe');
  await page.locator('input[placeholder*="email@organization.com"]').first().fill('jane.doe@enterprise.com');
  await page.locator('textarea').fill('This Master Services Agreement governs enterprise cloud and software licensing between Gigalibs Inc and Enterprise Customer. Valid through 2030.');
  
  // Enable immediate dispatch
  await page.locator('#sendNow').check();
  await page.getByRole('button', { name: 'Create Envelope' }).click();

  // Wait for envelope in table
  console.log(`Verifying envelope ${envelopeTitle} created in table...`);
  await page.waitForSelector(`text=${envelopeTitle}`, { timeout: 10_000 });
  const envelopeRow = page.locator('tr', { hasText: envelopeTitle });

  // Sign Document
  console.log('Opening digital signing modal for envelope...');
  const signBtn = envelopeRow.getByRole('button', { name: 'Sign' });
  await signBtn.click();
  await page.waitForSelector('text=Sign Envelope:', { timeout: 5_000 });
  const signSubmitBtn = page.getByRole('button', { name: 'Sign Document' });
  await signSubmitBtn.click();

  // Wait for signing receipt and close
  await page.waitForSelector('text=Cryptographic Signature Successfully Applied', { timeout: 8_000 });
  const doneSignBtn = page.getByRole('button', { name: 'Done' });
  await doneSignBtn.click();

  // Verify envelope status is COMPLETED
  console.log('Verifying envelope completion status...');
  await envelopeRow.locator('text=COMPLETED').waitFor({ timeout: 8_000 });

  // View Court-Admissible Certificate
  console.log('Viewing PKI Completion Certificate...');
  const certBtn = envelopeRow.getByRole('button', { name: 'Certificate' });
  await certBtn.click();
  await page.waitForSelector('text=Court-Admissible Certificate of Completion', { timeout: 5_000 });
  await page.waitForSelector('text=PKI Trust Authority Credentials', { timeout: 5_000 });
  await page.locator('button:has-text("✕")').click();

  await page.screenshot({
    path: resolve(evidenceDirectory, 'esignature-actionable.png'),
    fullPage: true,
  });

  result.modules.push({
    key: 'esignature',
    path: '/esign',
    contained: false,
    envelopeLifecycleVerified: true,
    digitalSignatureVerified: true,
    pkiCertificateVerified: true,
  });

  if (pageErrors.length > 0 || serverFailures.length > 0) {
    throw new Error(`Browser verification observed errors: ${pageErrors.join(', ')} / ${serverFailures.join(', ')}`);
  }

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'intelligence-documents-browser-result.json'),
    `${JSON.stringify({ result: 'PASS', ...result }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ result: 'PASS', modules: result.modules }, null, 2)}\n`,
  );
} catch (error) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'intelligence-documents-browser-result.json'),
    `${JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error), ...result }, null, 2)}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
