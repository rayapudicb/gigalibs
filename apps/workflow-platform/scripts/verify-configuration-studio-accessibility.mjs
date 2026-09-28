import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, firefox, webkit } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);

const baseUrl = process.env.WORKFLOW_PLATFORM_TEST_URL?.trim();
if (!baseUrl) {
  throw new Error('WORKFLOW_PLATFORM_TEST_URL is required.');
}
const parsedBaseUrl = new URL(baseUrl);
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
  throw new Error('WORKFLOW_PLATFORM_TEST_URL must use HTTP or HTTPS.');
}
if (
  !allowedHosts.has(parsedBaseUrl.hostname) &&
  process.env.CONFIGURATION_ACCESSIBILITY_ALLOW_REMOTE !== 'true'
) {
  throw new Error(
    'Accessibility certification defaults to a loopback deployment. Set CONFIGURATION_ACCESSIBILITY_ALLOW_REMOTE=true only for an approved non-production target.',
  );
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration accessibility certification cannot run with NODE_ENV=production.');
}

const browserLaunchers = { chromium, firefox, webkit };
const browserNames = [
  ...new Set(
    (process.env.CONFIGURATION_ACCESSIBILITY_BROWSERS || 'chromium')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  ),
];
if (browserNames.length === 0 || browserNames.some((name) => !(name in browserLaunchers))) {
  throw new Error(
    'CONFIGURATION_ACCESSIBILITY_BROWSERS must contain chromium, firefox and/or webkit.',
  );
}

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const evidencePath = resolve(
  repositoryRoot,
  process.env.CONFIGURATION_ACCESSIBILITY_EVIDENCE_PATH ||
    'docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-accessibility-result.json',
);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `uat.configuration.accessibility.${suffix}@gigalibs.invalid`;
const password = `Accessibility-${randomBytes(20).toString('base64url')}!`;
const tenantSlug = `uat-configuration-accessibility-${suffix}`.slice(0, 63);
const scans = [];
const pageErrors = [];
const failedResponses = [];
const checks = [];
let browser;
let activeBrowserName;
let user;
let tenant;
let runError;
let failureContext;

async function scan(page, name) {
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodeCount: violation.nodes.length,
    help: violation.help,
    nodes: violation.nodes.slice(0, 10).map((node) => ({
      target: node.target.map(String),
      html: node.html.replaceAll(/\s+/g, ' ').slice(0, 300),
      failureSummary: node.failureSummary?.replaceAll(/\s+/g, ' ').slice(0, 300) ?? null,
    })),
  }));
  scans.push({
    name,
    passes: result.passes.length,
    incomplete: result.incomplete.length,
    inapplicable: result.inapplicable.length,
    violations,
  });
  assert.deepEqual(
    violations,
    [],
    `${name} has WCAG A/AA violations: ${JSON.stringify(violations)}`,
  );
}

try {
  user = await prisma.user.create({
    data: {
      email,
      name: 'UAT Configuration Accessibility Administrator',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
    },
  });
  tenant = await prisma.tenant.create({
    data: {
      slug: tenantSlug,
      name: 'UAT Configuration Accessibility Tenant',
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: { certificationData: true },
          updatedById: user.id,
        },
      },
    },
  });
  await prisma.tenantMember.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'TENANT_ADMIN',
      status: 'ACTIVE',
    },
  });

  for (const browserName of browserNames) {
    activeBrowserName = browserName;
    const pageErrorOffset = pageErrors.length;
    const failedResponseOffset = failedResponses.length;
    browser = await browserLaunchers[browserName].launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1720, height: 1100 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on('pageerror', (error) => pageErrors.push(`${browserName}: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedResponses.push(
          `${browserName}: ${response.status()} ${new URL(response.url()).pathname}`,
        );
      }
    });

    const loginResponse = await context.request.post(`${baseUrl}/api/auth/login`, {
      data: { email, password },
    });
    assert.equal(loginResponse.status(), 200, 'The real authentication boundary rejected login.');
    const loginPayload = await loginResponse.json();
    assert.equal(loginPayload.authenticated, true, 'Authentication did not create a session.');
    assert.equal(
      loginPayload.requiresTenantSelection,
      false,
      'The generated one-tenant identity unexpectedly requires tenant selection.',
    );
    assert.equal(
      loginPayload.requiresMfa,
      false,
      'The generated UAT identity unexpectedly requires MFA.',
    );

    const configurationResponse = await page.goto(`${baseUrl}/studio/configuration`, {
      waitUntil: 'networkidle',
    });
    assert.equal(
      configurationResponse?.status(),
      200,
      `Configuration Studio returned HTTP ${configurationResponse?.status() ?? 'unknown'}.`,
    );
    try {
      await page.getByRole('heading', { name: 'Universal Configuration Studio' }).waitFor();
    } catch (error) {
      failureContext = {
        browser: browserName,
        pathname: new URL(page.url()).pathname,
        title: (await page.title()).slice(0, 120),
        visibleText: (await page.locator('body').innerText()).replaceAll(/\s+/g, ' ').slice(0, 300),
      };
      throw error;
    }
    await page.getByRole('heading', { name: 'Components' }).waitFor();
    await page.getByRole('button', { name: 'Add Currency field' }).click();
    await page.locator('aside').last().getByRole('heading', { name: 'Currency' }).waitFor();
    await scan(page, `${browserName}-designer-desktop-reduced-motion`);

    const designTab = page.getByRole('tab', { name: '1. Design' });
    await designTab.focus();
    await designTab.press('ArrowRight');
    await assertSelectedTab(page, '2. Review');
    await page.getByRole('tab', { name: '2. Review' }).press('End');
    await assertSelectedTab(page, '5. Package');
    await page.getByRole('tab', { name: '5. Package' }).press('Home');
    await assertSelectedTab(page, '1. Design');
    checks.push(`${browserName}-roving-tab-focus-arrow-home-end`);

    await page.getByRole('button', { name: 'Mobile preview' }).click();
    await scan(page, `${browserName}-designer-mobile-preview`);

    const workflowStates = [
      ['2. Review', 'governance-empty'],
      ['3. Publish & activate', 'published-empty'],
      ['4. Runtime preview', 'runtime-empty'],
      ['5. Package', 'portability-empty'],
    ];
    for (const [tabName, scanName] of workflowStates) {
      await page.getByRole('tab', { name: tabName }).click();
      await assertSelectedTab(page, tabName);
      await scan(page, `${browserName}-${scanName}`);
    }

    await page.getByRole('tab', { name: '1. Design' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await scan(page, `${browserName}-designer-compact-viewport`);
    checks.push(
      `${browserName}-desktop-and-compact-responsive-scan`,
      `${browserName}-reduced-motion-browser-context`,
    );

    assert.deepEqual(
      pageErrors.slice(pageErrorOffset),
      [],
      `${browserName} page errors: ${JSON.stringify(pageErrors.slice(pageErrorOffset))}`,
    );
    assert.deepEqual(
      failedResponses.slice(failedResponseOffset),
      [],
      `${browserName} server errors: ${JSON.stringify(failedResponses.slice(failedResponseOffset))}`,
    );
    checks.push(`${browserName}-no-browser-page-errors`, `${browserName}-no-http-5xx-responses`);
    await browser.close();
    browser = undefined;
  }
} catch (error) {
  runError = error;
} finally {
  if (browser) await browser.close();
  if (tenant || user) {
    await prisma
      .$transaction([
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
      ])
      .catch(() => undefined);
  }
  await prisma.$disconnect();
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        certification: 'WI-OI-039-configuration-accessibility-local',
        status: runError ? 'failed' : 'passed',
        standard: 'WCAG 2.2 A/AA automated rules supported by axe-core',
        browsers: browserNames.map((name) => `${name}-headless`),
        testData: 'generated-attributable-non-production-identities-deactivated-after-run',
        scans,
        scanCount: scans.length,
        checks,
        failure: runError
          ? {
              name: runError instanceof Error ? runError.name : 'UnknownError',
              message:
                runError instanceof Error
                  ? runError.message.replaceAll(email, '[generated-user]').slice(0, 500)
                  : 'Unknown failure.',
              context: failureContext,
              activeBrowser: activeBrowserName,
            }
          : null,
        limitations: [
          'Automated axe-core coverage cannot replace manual keyboard, zoom, high-contrast or screen-reader review.',
          'This local browser-matrix run does not prove managed-cloud or customer-managed deployment profiles.',
          'The contextual Studio overlay and adopting module journeys require separate accessibility acceptance.',
        ],
        releaseAcceptance: false,
      },
      null,
      2,
    )}\n`,
  );
}

if (runError) throw runError;
console.log(
  `Configuration Studio accessibility certification passed for ${browserNames.join(', ')} with ${scans.length} axe scans.`,
);

async function assertSelectedTab(page, name) {
  const tab = page.getByRole('tab', { name });
  await assertEventually(async () => (await tab.getAttribute('aria-selected')) === 'true');
  assert.equal(await tab.getAttribute('tabindex'), '0');
}

async function assertEventually(check, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.fail('Expected browser state was not reached.');
}
