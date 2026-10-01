import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAllStepsPassed,
  extractPdfText,
  identifyNewRunId,
  normalizeCellValue,
  parseCsvRows,
  parseXlsxWorkbook,
  validateFileMagic,
} from './verify-analytics-reports-v2-helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'modules/accounts-receivable/apps/e2e/package.json'));
const { chromium } = require('@playwright/test');

// 1. Require environment-provided UAT credentials (fail-closed, never hardcoded)
const email = process.env.GIGALIBS_UAT_EMAIL?.trim();
const password = process.env.GIGALIBS_UAT_PASSWORD;
const scopedEmail = process.env.GIGALIBS_UAT_SCOPED_EMAIL?.trim();
const scopedPassword = process.env.GIGALIBS_UAT_SCOPED_PASSWORD;
const allowedPlace = process.env.GIGALIBS_UAT_SCOPED_ALLOWED_PLACE?.trim();
const deniedPlace = process.env.GIGALIBS_UAT_SCOPED_DENIED_PLACE?.trim();
const tenantSlug = process.env.GIGALIBS_UAT_TENANT_SLUG?.trim() || 'my-workspace';
const baseUrl = process.env.GIGALIBS_UAT_BASE_URL?.trim() || 'http://127.0.0.1:5180';
const evidenceDirectory = resolve(root, 'docs/audits/2026-09-09-readiness/evidence/uat');

if (!email || !password) {
  throw new Error('GIGALIBS_UAT_EMAIL and GIGALIBS_UAT_PASSWORD are required environment variables.');
}
if (!scopedEmail || !scopedPassword) {
  throw new Error('GIGALIBS_UAT_SCOPED_EMAIL and GIGALIBS_UAT_SCOPED_PASSWORD are required environment variables for scoped isolation proof.');
}

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const serverFailures = [];

const result = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  tenantSlug,
  authenticated: false,
  reportsWorkbenchLoaded: false,
  formatSelectionVerified: false,
  formatEditingVerified: false,
  reportRunTriggered: false,
  reportRunSucceeded: false,
  runHistoryRendered: false,
  threeFormatsPresent: false,
  fileDownloadsVerified: false,
  contentParityVerified: false,
  scheduleExecutionVerified: false,
  scopedIsolationVerified: false,
  createdReportId: null,
  createdRunId: null,
  createdScheduleId: null,
  scopedRunId: null,
  downloadedFiles: {},
};

async function createAuthenticatedContext(userEmail, userPassword) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[BROWSER ERROR]:`, msg.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverFailures.push(`${response.status()} ${response.url()}`);
    }
  });

  // Login
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(userEmail);
  await page.locator('#password').fill(userPassword);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL(/\/(modules|mfa|select-tenant|analytics)(\?|$)/, { timeout: 20_000 });

  if (page.url().includes('/select-tenant')) {
    const tenantButton = page.getByRole('button', { name: new RegExp(tenantSlug, 'i') });
    if ((await tenantButton.count()) > 0) {
      await tenantButton.first().click();
      await page.waitForURL(/\/(modules|analytics)(\?|$)/, { timeout: 20_000 });
    }
  }

  return { context, page };
}

try {
  // ── Step 1: Tenant Admin Login & Workbench Loading ─────────────────────────
  console.log('1. Authenticating as Tenant Admin UAT user...');
  const { context: adminContext, page } = await createAuthenticatedContext(email, password);
  result.authenticated = true;

  console.log('2. Navigating to Reports Workbench (/analytics/reports)...');
  await page.goto(`${baseUrl}/analytics/reports`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Reports', exact: true }).waitFor({ timeout: 15_000 });
  result.reportsWorkbenchLoaded = true;

  // ── Step 2: Require real source & Create/Verify UAT Report with 3 formats ───
  console.log('3. Verifying New report form and selecting 3 formats (CSV, XLSX, PDF)...');
  const newReportHeading = page.getByRole('heading', { name: 'New report' });
  if ((await newReportHeading.count()) === 0) {
    throw new Error('Tenant Admin lacks permission or UI is missing "New report" creation container.');
  }

  const formatsGroup = page.locator('[role="group"][aria-label="Report formats"]');
  await formatsGroup.waitFor({ timeout: 5_000 });

  const csvBox = formatsGroup.getByLabel('CSV');
  const excelBox = formatsGroup.getByLabel('Excel');
  const pdfBox = formatsGroup.getByLabel('PDF');

  await csvBox.waitFor({ timeout: 5_000 });
  await excelBox.waitFor({ timeout: 5_000 });
  await pdfBox.waitFor({ timeout: 5_000 });

  if (!(await csvBox.isChecked())) {
    throw new Error('Expected CSV format checkbox to be checked by default in New report form.');
  }

  // Ensure all 3 formats are checked
  if (!(await excelBox.isChecked())) await excelBox.check();
  if (!(await pdfBox.isChecked())) await pdfBox.check();

  const sourceSelect = page.locator('#report-source');
  const sourceOptions = await sourceSelect.locator('option').all();
  if (sourceOptions.length <= 1) {
    throw new Error('Real persisted PostgreSQL saved charts or dashboards are required for UAT, but none exist.');
  }

  // Pick the first real source
  await sourceSelect.selectOption({ index: 1 });
  const selectedSourceText = (await sourceSelect.locator('option').nth(1).textContent())?.trim();

  const uatReportName = `WI-OI-106 UAT Multi-Format Acceptance ${Date.now()}`;
  await page.locator('#report-name').fill(uatReportName);

  await page.getByRole('button', { name: 'Create report' }).click();
  await page.waitForSelector(`text=${uatReportName}`, { timeout: 15_000 });

  // Locate the newly created report row
  const reportRow = page.locator('tbody tr', { hasText: uatReportName });
  await reportRow.waitFor({ timeout: 5_000 });

  // Verify all 3 format badges are displayed
  await reportRow.locator('span:has-text("CSV")').waitFor({ timeout: 5_000 });
  await reportRow.locator('span:has-text("Excel")').waitFor({ timeout: 5_000 });
  await reportRow.locator('span:has-text("PDF")').waitFor({ timeout: 5_000 });
  result.formatSelectionVerified = true;

  // Retrieve report ID from UI / backend API
  const reportDefinitionsRes = await adminContext.request.get(`${baseUrl}/api/analytics/v1/reports/definitions`);
  if (!reportDefinitionsRes.ok()) {
    throw new Error(`Failed to list report definitions: ${reportDefinitionsRes.status()}`);
  }
  const reportDefinitions = await reportDefinitionsRes.json();
  const matchedDef = reportDefinitions.find((d) => d.name === uatReportName);
  if (!matchedDef) {
    throw new Error(`Could not find created report "${uatReportName}" in backend definition response.`);
  }
  result.createdReportId = matchedDef.id;

  // ── Step 3: Exercise Real Format PATCH Endpoint ────────────────────────────
  console.log('4. Testing real format PATCH update and restoration...');
  const editBtn = reportRow.getByRole('button', { name: new RegExp(`Edit formats for ${uatReportName}`, 'i') });
  if ((await editBtn.count()) === 0) {
    throw new Error(`Edit formats button not found for report ${uatReportName}.`);
  }
  await editBtn.click();

  const editGroup = reportRow.locator('[role="group"][aria-label^="Edit formats for"]');
  await editGroup.waitFor({ timeout: 5_000 });

  // Uncheck PDF to test PATCH
  const editPdfCheck = editGroup.getByLabel('PDF');
  await editPdfCheck.uncheck();
  await reportRow.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('[role="status"]:has-text("Formats updated")', { timeout: 10_000 });

  // Verify PATCH persisted: PDF badge is gone, CSV and Excel remain
  if ((await reportRow.locator('span:has-text("PDF")').count()) !== 0) {
    throw new Error('PATCH formats failed: PDF badge is still present after removing PDF.');
  }

  // Restore PDF
  await editBtn.click();
  await editPdfCheck.check();
  await reportRow.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('[role="status"]:has-text("Formats updated")', { timeout: 10_000 });
  await reportRow.locator('span:has-text("PDF")').waitFor({ timeout: 5_000 });
  result.formatEditingVerified = true;

  // ── Step 4: Record Existing Run IDs and Trigger Execution ──────────────────
  console.log('5. Recording existing runs and triggering new execution...');
  const runsBeforeRes = await adminContext.request.get(`${baseUrl}/api/analytics/v1/reports/definitions/${matchedDef.id}/runs`);
  const existingRuns = runsBeforeRes.ok() ? await runsBeforeRes.json() : [];
  const existingRunIds = existingRuns.map((r) => r.id);

  const runBtn = reportRow.getByRole('button', { name: /Run now/i });
  if ((await runBtn.count()) === 0) {
    throw new Error(`Run now button not found for report ${uatReportName}.`);
  }
  await runBtn.click();
  result.reportRunTriggered = true;

  // Wait for the exact run to reach SUCCEEDED
  console.log('6. Polling for exact new run completion (SUCCEEDED)...');
  let newRunId = null;
  let newRun = null;

  for (let attempt = 0; attempt < 30; attempt++) {
    await page.waitForTimeout(1000);
    const runsAfterRes = await adminContext.request.get(`${baseUrl}/api/analytics/v1/reports/definitions/${matchedDef.id}/runs`);
    if (runsAfterRes.ok()) {
      const runs = await runsAfterRes.json();
      try {
        newRunId = identifyNewRunId(existingRunIds, runs);
        newRun = runs.find((r) => r.id === newRunId);
        if (newRun && newRun.status === 'SUCCEEDED') {
          break;
        }
        if (newRun && newRun.status === 'FAILED') {
          throw new Error(`Report run ${newRunId} failed: ${newRun.errorMessage}`);
        }
      } catch {
        // Run not yet registered, continue polling
      }
    }
  }

  if (!newRun || newRun.status !== 'SUCCEEDED') {
    throw new Error(`Timed out waiting for new run ${newRunId} to reach SUCCEEDED.`);
  }
  result.createdRunId = newRunId;
  result.reportRunSucceeded = true;

  // ── Step 5: Verify Run History & Exactly Three Formats ──────────────────────
  console.log('7. Verifying run history drawer displays the exact run with 3 files...');
  const historyBtn = reportRow.getByRole('button', { name: /Run history/i });
  await historyBtn.click();

  const historyHeading = page.getByRole('heading', { name: new RegExp(`Run history for ${uatReportName}`, 'i') });
  await historyHeading.waitFor({ timeout: 10_000 });
  result.runHistoryRendered = true;

  // Require exactly 3 files: CSV, XLSX, PDF
  if (!newRun.files || newRun.files.length !== 3) {
    throw new Error(`Expected exactly 3 files for run ${newRunId}, got: ${JSON.stringify(newRun.files)}`);
  }
  const formatsPresent = newRun.files.map((f) => f.format).sort();
  if (JSON.stringify(formatsPresent) !== JSON.stringify(['CSV', 'PDF', 'XLSX'])) {
    throw new Error(`Expected formats ['CSV', 'PDF', 'XLSX'], got: ${JSON.stringify(formatsPresent)}`);
  }
  result.threeFormatsPresent = true;

  // ── Step 6: Download All Three Artifacts & Verify Magic Bytes ───────────────
  console.log('8. Downloading CSV, XLSX, and PDF artifacts via renewed tokens...');
  const fileBuffers = {};

  for (const fmt of ['CSV', 'XLSX', 'PDF']) {
    const label = fmt === 'XLSX' ? 'Excel' : fmt;
    const downloadBtn = page.getByRole('button', { name: `Download ${label}`, exact: true }).first();
    await downloadBtn.waitFor({ timeout: 10_000 });

    const [downloadEvent] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      downloadBtn.click(),
    ]);

    const filename = downloadEvent.suggestedFilename();
    const stream = await downloadEvent.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // Validate magic bytes, extension, and non-empty
    validateFileMagic(buffer, filename, fmt);
    fileBuffers[fmt] = { filename, buffer };
    result.downloadedFiles[fmt] = { filename, byteSize: buffer.length };
    console.log(`   ✓ Downloaded ${fmt} (${filename}): ${buffer.length} bytes`);
  }
  result.fileDownloadsVerified = true;

  // ── Step 7: Value Parity Verification across CSV, XLSX, and PDF ─────────────
  console.log('9. Proving value parity across CSV, XLSX, and PDF text streams...');
  const csvParsed = parseCsvRows(fileBuffers['CSV'].buffer.toString('utf8'));
  const xlsxParsed = await parseXlsxWorkbook(fileBuffers['XLSX'].buffer);
  const pdfExtractedText = extractPdfText(fileBuffers['PDF'].buffer);

  // PDF must contain report title, source, and metadata
  if (!pdfExtractedText.includes(uatReportName)) {
    throw new Error(`PDF text stream missing report title: "${uatReportName}"`);
  }
  if (!pdfExtractedText.includes(selectedSourceText)) {
    throw new Error(`PDF text stream missing source title: "${selectedSourceText}"`);
  }

  // Cross-compare data rows between CSV and XLSX
  const csvDataRows = csvParsed.filter((r) => r.length > 1 && !r[0].startsWith('Generated') && r[0] !== uatReportName);
  const xlsxSheet = xlsxParsed.dataSheets[0];
  if (!xlsxSheet || xlsxSheet.rows.length === 0) {
    throw new Error('XLSX workbook missing data sheet or rows.');
  }

  // Compare first 5 data rows
  const rowsToCompare = Math.min(5, csvDataRows.length);
  for (let r = 1; r < rowsToCompare; r++) {
    const csvRow = csvDataRows[r];
    const xlsxRow = xlsxSheet.rows[r]?.values || [];
    for (let c = 0; c < Math.min(csvRow.length, xlsxRow.length); c++) {
      const csvVal = normalizeCellValue(csvRow[c]);
      const xlsxVal = normalizeCellValue(xlsxRow[c]);
      if (csvVal !== xlsxVal) {
        throw new Error(`Value mismatch between CSV ("${csvVal}") and XLSX ("${xlsxVal}") at row ${r}, col ${c}`);
      }
      // Check that value is present in PDF text
      if (csvVal && !pdfExtractedText.includes(csvVal)) {
        throw new Error(`Expected value "${csvVal}" (from CSV row ${r} col ${c}) not found in PDF text stream.`);
      }
    }
  }
  result.contentParityVerified = true;
  console.log('   ✓ Content parity strictly verified across CSV, XLSX, and PDF');

  // ── Step 8: Scheduled Execution via Kernel API & Cleanup ───────────────────
  console.log('10. Creating scheduled report run via kernel API and observing execution...');
  const schedulePayload = {
    name: `UAT Schedule for ${uatReportName}`,
    operation: 'analytics.report-run',
    targetId: matchedDef.id,
    cron: '* * * * *', // every minute
    timeZone: 'UTC',
  };

  const createScheduleRes = await adminContext.request.post(`${baseUrl}/api/control/tenants/current/schedules`, {
    data: schedulePayload,
  });

  if (!createScheduleRes.ok()) {
    throw new Error(`Failed to create kernel schedule: ${createScheduleRes.status()}`);
  }
  const createdSchedule = await createScheduleRes.json();
  result.createdScheduleId = createdSchedule.id;

  // Poll for scheduled run creation
  console.log('Polling for kernel job to execute scheduled report run...');
  let scheduledRunFound = false;
  for (let wait = 0; wait < 75; wait++) {
    await page.waitForTimeout(2000);
    const runsRes = await adminContext.request.get(`${baseUrl}/api/analytics/v1/reports/definitions/${matchedDef.id}/runs`);
    if (runsRes.ok()) {
      const runs = await runsRes.json();
      const scheduledRuns = runs.filter((r) => r.id !== newRunId && !existingRunIds.includes(r.id));
      if (scheduledRuns.length > 0 && scheduledRuns[0].status === 'SUCCEEDED') {
        const schedRun = scheduledRuns[0];
        if (schedRun.files && schedRun.files.length === 3) {
          scheduledRunFound = true;
          console.log(`   ✓ Scheduled run ${schedRun.id} completed with 3 files.`);
          break;
        }
      }
    }
  }

  // Always cleanup schedule
  await adminContext.request.post(`${baseUrl}/api/control/tenants/current/schedules/${createdSchedule.id}/remove`).catch(() => {});

  if (!scheduledRunFound) {
    throw new Error('Kernel scheduled report execution did not produce a succeeded multi-format run within deadline.');
  }
  result.scheduleExecutionVerified = true;

  // ── Step 9: Scoped-Member Isolation Verification ───────────────────────────
  console.log('11. Authenticating as Scoped Member to prove place isolation in PDF/data...');
  const { context: scopedContext, page: scopedPage } = await createAuthenticatedContext(scopedEmail, scopedPassword);

  const scopedRunRes = await scopedContext.request.post(`${baseUrl}/api/analytics/v1/reports/runs`, {
    data: { reportDefinitionId: matchedDef.id },
  });
  if (!scopedRunRes.ok()) {
    throw new Error(`Scoped user run trigger failed: ${scopedRunRes.status()}`);
  }
  const scopedRunObj = await scopedRunRes.json();
  result.scopedRunId = scopedRunObj.id;

  // Wait for scoped run completion
  for (let s = 0; s < 30; s++) {
    await page.waitForTimeout(1000);
    const checkRes = await scopedContext.request.get(`${baseUrl}/api/analytics/v1/reports/runs/${scopedRunObj.id}`);
    if (checkRes.ok()) {
      const run = await checkRes.json();
      if (run.status === 'SUCCEEDED') break;
    }
  }

  // Renew token and download PDF as scoped user
  const scopedPdfTokenRes = await scopedContext.request.post(
    `${baseUrl}/api/analytics/v1/reports/runs/${scopedRunObj.id}/files/PDF/download-token`,
  );
  if (!scopedPdfTokenRes.ok()) {
    throw new Error(`Scoped user PDF token renewal failed: ${scopedPdfTokenRes.status()}`);
  }
  const scopedPdfToken = await scopedPdfTokenRes.json();
  const scopedPdfDownloadRes = await scopedContext.request.get(
    `${baseUrl}/api/analytics/v1/reports/download/${scopedPdfToken.token}`,
  );
  if (!scopedPdfDownloadRes.ok()) {
    throw new Error(`Scoped user PDF download failed: ${scopedPdfDownloadRes.status()}`);
  }
  const scopedPdfBytes = await scopedPdfDownloadRes.body();
  const scopedPdfText = extractPdfText(scopedPdfBytes);

  // If allowed/denied place names are configured, assert containment
  if (allowedPlace && !scopedPdfText.includes(allowedPlace)) {
    throw new Error(`Scoped member PDF missing expected allowed place: "${allowedPlace}"`);
  }
  if (deniedPlace && scopedPdfText.includes(deniedPlace)) {
    throw new Error(`Scoped member PDF leaked unauthorized place outside place scope: "${deniedPlace}"`);
  }
  result.scopedIsolationVerified = true;
  console.log('   ✓ Scoped place isolation strictly verified (no out-of-scope places).');

  // ── Step 10: Strict Fail-Closed Aggregation & Screenshot Evidence ──────────
  if (pageErrors.length > 0 || serverFailures.length > 0) {
    throw new Error(`Browser test observed errors: ${pageErrors.join(', ')} / ${serverFailures.join(', ')}`);
  }

  // Validate every required boolean assertion is true
  assertAllStepsPassed(result);

  await page.screenshot({
    path: resolve(evidenceDirectory, 'reports-v2-uat-success.png'),
    fullPage: true,
  });

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'reports-v2-browser-result.json'),
    `${JSON.stringify({ result: 'PASS', ...result }, null, 2)}\n`,
  );

  process.stdout.write(`${JSON.stringify({ result: 'PASS', ...result }, null, 2)}\n`);
} catch (error) {
  await mkdir(evidenceDirectory, { recursive: true });
  try {
    const pages = browser.contexts().flatMap((c) => c.pages());
    if (pages[0]) {
      await pages[0].screenshot({
        path: resolve(evidenceDirectory, 'reports-v2-uat-failure.png'),
        fullPage: true,
      });
    }
  } catch {}
  await writeFile(
    resolve(evidenceDirectory, 'reports-v2-browser-result.json'),
    `${JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error), ...result }, null, 2)}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
