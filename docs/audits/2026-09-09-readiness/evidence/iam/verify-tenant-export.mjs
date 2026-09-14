import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../../apps/playground-api/package.json', import.meta.url));
const { Pool } = require('pg');
const { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { verifyTenantExportArchive } = await import('../../../../../packages/privacy-gdpr/dist/index.js');

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(databaseUrl.hostname, '127.0.0.1');
assert.match(databaseUrl.pathname, /^\/gigalibs_export_cert_[a-f0-9]+$/);
const api = `http://127.0.0.1:${process.env.API_PORT}/api/v1`;
const storage = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.STORAGE_SECRET_KEY,
  },
});
const db = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
const checks = [];

async function request(path, { status = 200, method = 'GET', token, body } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path} returned ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function waitForStatus(token, exportId, expected, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await request('/tenants/current/data-exports', { token });
    const found = rows.find((row) => row.id === exportId);
    if (found?.status === expected) return found;
    if (found?.status === 'FAILED') throw new Error(`Export failed with ${found.failureCode}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for tenant export status ${expected}`);
}

try {
  await storage.send(new CreateBucketCommand({ Bucket: process.env.STORAGE_BUCKET }));
  await storage.send(new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: 'certification/provider-probe.txt',
    Body: Buffer.from('real MinIO certification probe\n'),
    ContentType: 'text/plain',
    Metadata: { 'declared-sha256': 'probe' },
  }));
  await storage.send(new HeadObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: 'certification/provider-probe.txt',
  }));
  await storage.send(new DeleteObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: 'certification/provider-probe.txt',
  }));
  checks.push('Real MinIO bucket accepts, reads and deletes an SDK object');
  const suffix = databaseUrl.pathname.slice('/gigalibs_export_cert_'.length);
  const email = `tenant-export-${suffix}@example.invalid`;
  const password = `Certification-${suffix}-Password-71!`;
  const registered = await request('/auth/register', {
    method: 'POST',
    status: 201,
    body: { name: 'Tenant export certification user', email, password },
  });
  assert.ok(registered.accessToken);
  const tenant = await request('/tenants', {
    method: 'POST',
    status: 201,
    token: registered.accessToken,
    body: {
      name: 'Tenant export certification tenant',
      slug: `export-cert-${suffix}`,
      region: 'certification-local',
      isolationMode: 'ROW_LEVEL_SECURITY',
    },
  });
  const selected = await request('/auth/select-tenant', {
    method: 'POST',
    token: registered.accessToken,
    body: { tenantId: tenant.id },
  });
  let token = selected.accessToken;
  await request('/tenants/current/status', {
    method: 'PATCH',
    token,
    body: { status: 'ACTIVE', reason: 'Enable isolated tenant-export certification' },
  });
  const selectedActive = await request('/auth/select-tenant', {
    method: 'POST',
    token,
    body: { tenantId: tenant.id },
  });
  token = selectedActive.accessToken;

  const created = await request('/tenants/current/data-exports', {
    method: 'POST',
    status: 202,
    token,
    body: { reason: 'Isolated portability certification' },
  });
  assert.equal(created.status, 'REQUESTED');
  assert.equal(created.storageKey, undefined);
  await request('/tenants/current/data-exports', {
    method: 'POST',
    status: 409,
    token,
    body: { reason: 'Must reject concurrent export' },
  });
  checks.push('Authenticated tenant admin creates one durable asynchronous export; concurrent request is rejected');

  const succeeded = await waitForStatus(token, created.id, 'SUCCEEDED');
  assert.equal(succeeded.signatureAlgorithm, 'Ed25519');
  assert.equal(succeeded.signatureKeyId, process.env.TENANT_EXPORT_SIGNING_KEY_ID);
  assert.ok(succeeded.signaturePublicKey);
  assert.match(succeeded.archiveSha256, /^[a-f0-9]{64}$/);
  assert.ok(succeeded.archiveBytes > 0);
  assert.ok(succeeded.totalRecords >= 4);
  assert.equal(succeeded.storageKey, undefined);

  const stored = (
    await db.query(
      `SELECT "storageKey", "archiveSha256", "archiveBytes", status FROM tenant_data_exports WHERE id=$1`,
      [created.id],
    )
  ).rows[0];
  assert.equal(stored.status, 'SUCCEEDED');
  const head = await storage.send(
    new HeadObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: stored.storageKey }),
  );
  assert.equal(Number(head.ContentLength), stored.archiveBytes);
  assert.equal(head.Metadata['declared-sha256'], stored.archiveSha256);
  checks.push('Worker reads all classified models, signs a deterministic archive and verifies the stored size and digest metadata');

  const download = await request(`/tenants/current/data-exports/${created.id}/download`, { token });
  assert.equal(download.archiveSha256, stored.archiveSha256);
  const archiveResponse = await fetch(download.downloadUrl, { signal: AbortSignal.timeout(15_000) });
  assert.equal(archiveResponse.status, 200);
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  assert.equal(archive.length, stored.archiveBytes);
  const trustedPublicKey = createPublicKey({
    key: Buffer.from(succeeded.signaturePublicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  assert.equal(verifyTenantExportArchive(archive, trustedPublicKey), true);
  const archiveText = archive.toString('utf8');
  assert.equal(archiveText.includes(password), false);
  assert.equal(archiveText.includes(process.env.STORAGE_SECRET_KEY), false);
  assert.equal(archiveText.includes(process.env.TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64), false);
  checks.push('Scoped presigned download returns the exact self-verifying archive without authentication or storage secrets');

  await db.query(`UPDATE tenant_members SET role='VIEWER' WHERE "tenantId"=$1`, [tenant.id]);
  await request('/tenants/current/data-exports', { status: 403, token });
  await db.query(`UPDATE tenant_members SET role='TENANT_ADMIN' WHERE "tenantId"=$1`, [tenant.id]);
  checks.push('Live database role downgrade removes export access on the next request');

  await db.query(
    `UPDATE tenant_data_exports SET "completedAt"=NOW()-INTERVAL '2 hours', "expiresAt"=NOW()-INTERVAL '1 hour' WHERE id=$1`,
    [created.id],
  );
  const expired = await waitForStatus(token, created.id, 'EXPIRED');
  assert.ok(expired.archiveDeletedAt);
  await request(`/tenants/current/data-exports/${created.id}/download`, { status: 410, token });
  await assert.rejects(
    storage.send(new HeadObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: stored.storageKey })),
  );
  checks.push('Expired archive is deleted from real object storage and download fails with 410');

  const audit = (
    await db.query(
      `SELECT "after" FROM audit_logs WHERE "tenantId"=$1 AND resource LIKE 'tenant-data-export%' ORDER BY "createdAt"`,
      [tenant.id],
    )
  ).rows;
  assert.ok(audit.length >= 4);
  assert.equal(JSON.stringify(audit).includes(process.env.TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64), false);
  checks.push('Request, completion, download and expiry produce tenant audit evidence without signing material');

  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await db.end();
  storage.destroy();
}
