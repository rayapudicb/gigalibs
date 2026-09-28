import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(applicationRoot, '../..');

const baseUrl = process.env.CONTROL_PLANE_TEST_URL;
if (!baseUrl || !process.env.DATABASE_URL)
  throw new Error('CONTROL_PLANE_TEST_URL and DATABASE_URL are required');
if (process.env.NODE_ENV === 'production') {
  throw new Error('Configuration Studio HTTP certification must not run with NODE_ENV=production');
}
const certificationDatabaseName = decodeURIComponent(
  new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''),
);
if (
  !/^gigalibs_(?:configuration|config)_(?:cert|uat|test)_[a-z0-9_]+$/i.test(
    certificationDatabaseName,
  )
) {
  throw new Error(
    'Configuration Studio HTTP certification requires a disposable database named gigalibs_configuration_cert_*, gigalibs_config_uat_*, or gigalibs_config_test_*',
  );
}
const [{ prisma }, { hashPassword }] = await Promise.all([
  import('../../../packages/db/dist/index.js'),
  import('../../../packages/auth-core/dist/index.js'),
]);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const password = `Uat-${randomBytes(20).toString('base64url')}!`;
let tenant;
let author;
let reviewer;

function execute(command, args, { cwd = repositoryRoot, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 1_000_000) child.kill('SIGKILL');
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  assert.equal(response.status, expected, `${method} ${path}: ${raw}`);
  return payload;
}

async function tenantToken(email) {
  const login = await request('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  const selected = await request('/api/v1/auth/select-tenant', {
    method: 'POST',
    token: login.accessToken,
    body: { tenantId: tenant.id },
  });
  return selected.accessToken;
}

try {
  const passwordHash = await hashPassword(password);
  [author, reviewer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: `uat.config.http.author.${suffix}@gigalibs.invalid`,
        name: 'UAT HTTP Author',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
    prisma.user.create({
      data: {
        email: `uat.config.http.reviewer.${suffix}@gigalibs.invalid`,
        name: 'UAT HTTP Reviewer',
        passwordHash,
        status: 'ACTIVE',
      },
    }),
  ]);
  tenant = await prisma.tenant.create({
    data: {
      slug: `uat-config-http-${suffix}`.slice(0, 63),
      name: 'UAT Configuration HTTP Tenant',
      status: 'ACTIVE',
      features: ['dynamic-forms'],
      settings: {
        create: {
          branding: {},
          security: { enforceMfa: false },
          localization: {},
          features: {},
          metadata: {},
          updatedById: author.id,
        },
      },
    },
  });
  await prisma.tenantMember.createMany({
    data: [
      { tenantId: tenant.id, userId: author.id, role: 'TENANT_ADMIN' },
      { tenantId: tenant.id, userId: reviewer.id, role: 'TENANT_ADMIN' },
    ],
  });
  const [authorToken, reviewerToken] = await Promise.all([
    tenantToken(author.email),
    tenantToken(reviewer.email),
  ]);
  await request('/api/v1/configuration/change-sets', { expected: 401 });
  const surfaces = await request('/api/v1/configuration/surfaces', { token: authorToken });
  assert.deepEqual(
    surfaces.map((surface) => surface.registrationKey),
    [
      'tenant-profile-extension',
      'tenant-record-application',
      'ar-customer-record',
      'ar-invoice-draft',
    ],
  );
  const arSurfaces = surfaces.filter((surface) => surface.moduleKey === 'accounts-receivable');
  assert.equal(arSurfaces.length, 2);
  assert.ok(arSurfaces.every((surface) => surface.authoringEnabled === false));

  const definition = {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title: 'HTTP UAT fields',
    fields: [
      {
        key: 'site-code',
        label: 'Site code',
        type: 'TEXT',
        component: 'text-input',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
      },
    ],
    sections: [{ key: 'site', title: 'Site', columns: 1, fieldKeys: ['site-code'] }],
  };
  const draft = await request('/api/v1/configuration/change-sets', {
    token: authorToken,
    method: 'POST',
    body: {
      definition,
      reason: 'HTTP contract certification',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  const submitted = await request(`/api/v1/configuration/change-sets/${draft.id}/submit`, {
    token: authorToken,
    method: 'POST',
    body: { reason: 'Submit through HTTP', expectedVersion: draft.version },
  });
  await request(`/api/v1/configuration/change-sets/${draft.id}/approve`, {
    token: authorToken,
    method: 'POST',
    body: { reason: 'Self approval rejection', expectedVersion: submitted.version },
    expected: 403,
  });
  const approved = await request(`/api/v1/configuration/change-sets/${draft.id}/approve`, {
    token: reviewerToken,
    method: 'POST',
    body: { reason: 'Independent HTTP approval', expectedVersion: submitted.version },
  });
  const published = await request(`/api/v1/configuration/change-sets/${draft.id}/publish`, {
    token: reviewerToken,
    method: 'POST',
    body: { reason: 'Publish over HTTP', expectedVersion: approved.version },
  });
  await request('/api/v1/configuration/activations', {
    token: reviewerToken,
    method: 'POST',
    body: {
      publishedVersionId: published.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Activate over HTTP',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  const runtimeManifestPath =
    '/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users';
  const runtime = await request(runtimeManifestPath, { token: authorToken });
  assert.equal(runtime.checksum, published.checksum);
  const javaHttpClient = JSON.parse(
    await execute(process.execPath, ['scripts/verify-configuration-java-http.mjs'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CONFIGURATION_RUNTIME_MANIFEST_URL: `${baseUrl}${runtimeManifestPath}`,
        CONFIGURATION_BEARER_TOKEN: authorToken,
        CONFIGURATION_EXPECTED_CHECKSUM: published.checksum,
      },
    }),
  );
  assert.equal(javaHttpClient.certification, 'WI-OI-039-java-live-http-client');
  assert.equal(javaHttpClient.manifestChecksum, published.checksum);
  assert.equal(javaHttpClient.rawCredentialPersistedInEvidence, false);
  assert.equal(javaHttpClient.releaseAcceptance, false);
  const values = await request(
    `/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`,
    {
      token: authorToken,
      method: 'POST',
      body: {
        publishedVersionId: published.id,
        expectedVersion: 0,
        values: { 'site-code': 'HYD-01' },
        reason: 'Save over HTTP',
        idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
      },
    },
  );
  assert.equal(values.values['site-code'], 'HYD-01');

  const authorMembership = { userId_tenantId: { userId: author.id, tenantId: tenant.id } };
  await prisma.tenantMember.update({ where: authorMembership, data: { status: 'SUSPENDED' } });
  await request('/api/v1/configuration/surfaces', { token: authorToken, expected: 403 });

  await prisma.tenantMember.update({
    where: authorMembership,
    data: { status: 'ACTIVE', role: 'VIEWER' },
  });
  await request('/api/v1/configuration/surfaces', { token: authorToken, expected: 403 });
  const viewerRuntime = await request(
    '/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users',
    { token: authorToken },
  );
  assert.equal(viewerRuntime.checksum, published.checksum);
  await request(`/api/v1/configuration/extension-values/tenant-profile/${tenant.id}`, {
    token: authorToken,
    method: 'POST',
    body: {
      publishedVersionId: published.id,
      expectedVersion: values.version,
      values: { 'site-code': 'DENIED' },
      reason: 'Downgraded role write must fail',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 403,
  });

  await prisma.user.update({ where: { id: author.id }, data: { status: 'SUSPENDED' } });
  await request(
    '/api/v1/configuration/runtime/manifest?moduleKey=tenant-settings&entityKey=tenant-profile&surfaceKey=profile-extension&environmentKey=local-uat&cohortKey=all-users',
    { token: authorToken, expected: 401 },
  );
  await prisma.user.update({ where: { id: author.id }, data: { status: 'ACTIVE' } });

  await prisma.tenantMember.update({ where: authorMembership, data: { role: 'TENANT_ADMIN' } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'SUSPENDED' } });
  await request('/api/v1/configuration/surfaces', { token: authorToken, expected: 403 });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } });
  const restoredSurfaces = await request('/api/v1/configuration/surfaces', { token: authorToken });
  assert.equal(restoredSurfaces.length, surfaces.length);

  const incompatibleDraft = await request('/api/v1/configuration/change-sets', {
    token: authorToken,
    method: 'POST',
    body: {
      definition: {
        ...definition,
        title: 'HTTP incompatible UAT fields',
        fields: [],
        sections: [],
      },
      reason: 'HTTP impact analysis certification',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  const impact = await request(`/api/v1/configuration/change-sets/${incompatibleDraft.id}/impact`, {
    token: authorToken,
  });
  assert.equal(impact.activationAllowed, false);
  assert.equal(impact.incompatible.extensionValues, 1);
  const incompatibleSubmitted = await request(
    `/api/v1/configuration/change-sets/${incompatibleDraft.id}/submit`,
    {
      token: authorToken,
      method: 'POST',
      body: { reason: 'Submit HTTP impact change', expectedVersion: incompatibleDraft.version },
    },
  );
  const incompatibleApproved = await request(
    `/api/v1/configuration/change-sets/${incompatibleDraft.id}/approve`,
    {
      token: reviewerToken,
      method: 'POST',
      body: {
        reason: 'Approve HTTP impact change',
        expectedVersion: incompatibleSubmitted.version,
      },
    },
  );
  const incompatiblePublished = await request(
    `/api/v1/configuration/change-sets/${incompatibleDraft.id}/publish`,
    {
      token: reviewerToken,
      method: 'POST',
      body: { reason: 'Publish HTTP impact change', expectedVersion: incompatibleApproved.version },
    },
  );
  await request('/api/v1/configuration/activations', {
    token: reviewerToken,
    method: 'POST',
    body: {
      publishedVersionId: incompatiblePublished.id,
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      reason: 'Unsafe HTTP activation must be denied',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 409,
  });
  const exportedPackage = await request('/api/v1/configuration/packages/export', {
    token: reviewerToken,
    method: 'POST',
    body: {
      publishedVersionIds: [published.id],
      reason: 'HTTP package export',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
  });
  const importedPackage = await request('/api/v1/configuration/packages/import', {
    token: authorToken,
    method: 'POST',
    body: {
      package: exportedPackage,
      reason: 'HTTP package import',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 201,
  });
  assert.equal(importedPackage.importedChangeSets.length, 1);
  const tamperedPackage = structuredClone(exportedPackage);
  tamperedPackage.payload.definitions[0].definition.title = 'Tampered over HTTP';
  await request('/api/v1/configuration/packages/import', {
    token: authorToken,
    method: 'POST',
    body: {
      package: tamperedPackage,
      reason: 'HTTP tamper rejection',
      idempotencyKey: `http-${randomBytes(12).toString('hex')}`,
    },
    expected: 400,
  });
  console.log(
    JSON.stringify(
      {
        certification: 'WI-OI-039-http-boundary',
        outcomes: [
          'unauthenticated-denied',
          'tenant-rbac-enforced',
          'control-plane-surface-registry-is-authoritative',
          'self-approval-denied',
          'published-and-activated',
          'runtime-and-values-persisted',
          'membership-user-and-tenant-suspension-denied',
          'database-role-downgrade-removes-authoring-but-preserves-viewer-runtime-read',
          'record-aware-impact-and-unsafe-activation-denied',
          'signed-package-export-import-tamper-denied',
          'live-java-11-http-bearer-runtime-manifest-decoded',
        ],
        javaHttpClient,
        testData: 'isolated-attributed-and-deactivated',
      },
      null,
      2,
    ),
  );
} finally {
  const tenantIds = tenant ? [tenant.id] : [];
  const userIds = [author?.id, reviewer?.id].filter(Boolean);
  await prisma
    .$transaction([
      prisma.tenantMember.updateMany({
        where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] },
        data: { status: 'SUSPENDED' },
      }),
      prisma.tenant.updateMany({
        where: { id: { in: tenantIds } },
        data: { status: 'CANCELLED', features: [] },
      }),
      prisma.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'DEACTIVATED' } }),
    ])
    .catch(() => undefined);
  await prisma.$disconnect();
}
