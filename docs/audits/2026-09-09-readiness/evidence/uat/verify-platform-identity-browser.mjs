import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const require = createRequire(
  new URL('../../../../../modules/accounts-receivable/apps/e2e/package.json', import.meta.url),
);
const { chromium } = require('@playwright/test');
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../../../packages/db/dist/index.js'),
  import('../../../../../packages/auth-core/dist/index.js'),
]);

const output = fileURLToPath(new URL('./', import.meta.url));
const base = process.env.WORKFLOW_PLATFORM_TEST_URL ?? 'http://127.0.0.1:5180';
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `uat.browser-owner.${suffix}@gigalibs.invalid`;
const password = `Browser-${randomBytes(18).toString('base64url')}!`;
const pageErrors = [];
const checks = [];
let user;
let auditor;
let browser;

try {
  user = await prisma.user.create({
    data: {
      email,
      name: 'UAT Browser Platform Owner',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
      platformRoleAssignments: {
        create: { role: 'PLATFORM_OWNER', reason: 'Isolated browser identity certification' },
      },
    },
  });
  auditor = await prisma.user.create({
    data: {
      email: `uat.browser-auditor.${suffix}@gigalibs.invalid`,
      name: 'UAT Browser Platform Auditor',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
      platformRoleAssignments: {
        create: { role: 'PLATFORM_AUDITOR', reason: 'Isolated browser auditor certification' },
      },
    },
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${base}/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForURL(/\/(select-tenant|modules)$/);
  checks.push('platform owner authenticated through the browser BFF');

  await page.goto(`${base}/settings/profile`);
  await page.getByRole('heading', { name: 'Account Profile & Security' }).waitFor();
  await page.getByRole('button', { name: 'Change Password' }).waitFor();
  await page.getByRole('button', { name: 'RBAC & Permissions' }).waitFor();
  await page.getByLabel('Full Name').fill('UAT Browser Owner Updated');
  const profileResponsePending = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/profile') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save Profile Changes' }).click();
  const profileResponse = await profileResponsePending;
  assert.equal(
    profileResponse.ok(),
    true,
    `profile PATCH failed: ${profileResponse.status()} ${await profileResponse.text()}`,
  );
  await page.getByText('Profile details saved successfully.').waitFor();
  await page.screenshot({ path: `${output}platform-profile-and-security.png`, fullPage: true });
  checks.push('profile update persisted through the profile UI');

  await page.goto(`${base}/platform-admin/users`);
  await page.getByRole('heading', { name: 'Platform users and RBAC' }).waitFor();
  await page.getByPlaceholder('Search name or email').fill(email);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByText(email).first().waitFor();
  await page.getByRole('button', { name: 'Issue secure password recovery' }).click();
  await page.getByRole('heading', { name: 'Display-once password recovery link' }).waitFor();
  const resetUrl = await page.getByLabel('Password recovery link').inputValue();
  assert.match(resetUrl, /^http:\/\/127\.0\.0\.1:5180\/reset-password\?token=/);
  await page.screenshot({
    path: `${output}platform-users-and-rbac.png`,
    fullPage: true,
    mask: [page.getByLabel('Password recovery link')],
    maskColor: '#18181b',
  });
  checks.push('platform user directory and display-once recovery UI completed');

  await context.close();
  const auditorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const auditorPage = await auditorContext.newPage();
  auditorPage.setDefaultTimeout(10_000);
  auditorPage.on('pageerror', (error) => pageErrors.push(error.message));
  await auditorPage.goto(`${base}/login`);
  await auditorPage.getByLabel('Email address').fill(auditor.email);
  await auditorPage.getByLabel('Password').fill(password);
  await auditorPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await auditorPage.waitForURL(/\/(select-tenant|modules)$/);
  await auditorPage.goto(`${base}/platform-admin`);
  await auditorPage.getByText('Platform auditor mode is read-only.').waitFor();
  await assertDisabled(auditorPage.getByRole('button', { name: 'Create 7-day trial tenant' }));
  await auditorPage.goto(`${base}/platform-admin/users`);
  await auditorPage.getByText('Auditor authority is read-only.').waitFor();
  await assertDisabled(auditorPage.getByRole('button', { name: 'Issue secure password recovery' }));
  const deniedStatus = await auditorPage.evaluate(async (userId) => {
    const response = await fetch(`/api/control/platform/users/${userId}/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Auditor denial certification', expiresInMinutes: 30 }),
    });
    return response.status;
  }, user.id);
  assert.equal(deniedStatus, 403);
  await auditorPage.screenshot({
    path: `${output}platform-auditor-read-only.png`,
    fullPage: true,
  });
  checks.push('platform auditor UI rendered read-only controls');
  checks.push('platform auditor mutation was denied by the control plane');
  await auditorContext.close();

  assert.deepEqual(pageErrors, []);
  await writeFile(
    `${output}platform-identity-browser-result.json`,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        base,
        environment: 'local-uat',
        checks,
        pageErrors,
        rawCredentialRecorded: false,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ checks: checks.length, pageErrors: pageErrors.length }));
} finally {
  if (browser) await browser.close();
  const testUsers = [user, auditor].filter(Boolean);
  if (testUsers.length > 0) {
    const now = new Date();
    const userIds = testUsers.map((testUser) => testUser.id);
    await prisma.$transaction(async (transaction) => {
      await transaction.session.updateMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await transaction.platformRoleAssignment.updateMany({
        where: { userId: { in: userIds }, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          reason: 'Browser certification completed',
        },
      });
      await transaction.passwordResetCredential.updateMany({
        where: { userId: { in: userIds }, usedAt: null },
        data: { usedAt: now },
      });
      await transaction.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: 'DEACTIVATED' },
      });
      for (const userId of userIds) {
        await transaction.auditLog.create({
          data: {
            action: 'STATUS_CHANGE',
            resource: 'uat_identity_certification',
            resourceId: userId,
            after: { status: 'DEACTIVATED' },
            metadata: {
              event: 'BROWSER_CERTIFICATION_COMPLETED',
              sessionsRevoked: true,
              platformRolesRevoked: true,
            },
          },
        });
      }
    });
  }
  await prisma.$disconnect();
}

async function assertDisabled(locator) {
  await locator.waitFor();
  assert.equal(await locator.isDisabled(), true);
}
