import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { signPlatformContextToken } from '@gigalibs/auth-core';
import { AppModule } from '../dist/index.js';

// WI-OI-121g: disposable PostgreSQL 16 only. No supplied DATABASE_URL, no UAT/database fallback.
const name = `gigalibs-assistant-proof-${randomBytes(5).toString('hex')}`;
const adminPassword = randomBytes(18).toString('hex');
const runtimePassword = randomBytes(18).toString('hex');
const ids = [randomUUID(), randomUUID(), randomUUID()];
const migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations/000001_assistant_private_threads.up.sql'), 'utf8');
let started = false;
const stop = () => {
  if (!started) return;
  started = false;
  execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
};
process.once('exit', stop);

async function connectWhenReady(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    try { await client.connect(); return client; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  throw new Error('Disposable PostgreSQL did not become ready.');
}

async function scoped(client, tenant, actor, query, values = []) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    if (actor) await client.query("SELECT set_config('app.actor_id', $1, true)", [actor]);
    return (await client.query(query, values)).rows;
  } finally {
    await client.query('ROLLBACK');
  }
}

try {
  try {
    execFileSync('docker', [
      'run', '-d', '--rm', '--name', name,
      '-e', `POSTGRES_PASSWORD=${adminPassword}`, '-e', 'POSTGRES_DB=assistant_proof',
      '-p', '127.0.0.1::5432', 'postgres:16-alpine',
    ], { stdio: 'ignore' });
  } catch {
    // execFileSync's default error includes the full command and its disposable password.
    throw new Error('Disposable PostgreSQL could not start; check isolated Docker access.');
  }
  started = true;
  const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').pop();
  const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/assistant_proof`;
  const admin = await connectWhenReady(adminUrl);
  try {
    await admin.query(migration);
    const version = await admin.query('SELECT MAX(version)::int AS version FROM gigalibs_assistant.schema_migrations');
    assert.equal(version.rows[0].version, 1);
    const rls = await admin.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='gigalibs_assistant' AND c.relkind='r' AND c.relname<>'schema_migrations'`);
    assert.equal(rls.rows.length, 6);
    assert.ok(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));

    await admin.query(`CREATE ROLE assistant_proof_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query('GRANT USAGE ON SCHEMA gigalibs_assistant TO assistant_proof_runtime');
    await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA gigalibs_assistant TO assistant_proof_runtime');
    await admin.query('GRANT INSERT ON gigalibs_assistant.assistant_threads, gigalibs_assistant.assistant_messages, gigalibs_assistant.audit_events TO assistant_proof_runtime');
    await admin.query('GRANT UPDATE ON gigalibs_assistant.assistant_threads TO assistant_proof_runtime');

    const checksum = 'a'.repeat(64);
    for (const tenant of ['tenant-a', 'tenant-b']) {
      await admin.query(`INSERT INTO gigalibs_assistant.tenant_policies
        (tenant_id, source_manifest_version, source_checksum, retention_days, status, published_at)
        VALUES ($1,'isolated-proof-v1',$2,30,'PUBLISHED',now())`, [tenant, checksum]);
    }
    for (const [index, tenant, owner] of [[0, 'tenant-a', 'alice'], [1, 'tenant-a', 'bob'], [2, 'tenant-b', 'alice']]) {
      await admin.query(`INSERT INTO gigalibs_assistant.assistant_threads
        (id, tenant_id, owner_user_id, title, idempotency_key, request_sha256, policy_version, policy_checksum, expires_at)
        VALUES ($1,$2,$3,'Isolated proof',$4,$5,'isolated-proof-v1',$6,now()+interval '30 days')`,
      [ids[index], tenant, owner, `proof-key-${index}`, checksum, checksum]);
    }
  } finally { await admin.end(); }

  const runtime = new pg.Client({ connectionString: `postgres://assistant_proof_runtime:${runtimePassword}@127.0.0.1:${port}/assistant_proof` });
  await runtime.connect();
  try {
    const query = 'SELECT id FROM gigalibs_assistant.assistant_threads ORDER BY id';
    assert.deepEqual((await scoped(runtime, 'tenant-a', 'alice', query)).map((row) => row.id), [ids[0]]);
    assert.deepEqual((await scoped(runtime, 'tenant-a', 'bob', query)).map((row) => row.id), [ids[1]]);
    assert.deepEqual((await scoped(runtime, 'tenant-b', 'alice', query)).map((row) => row.id), [ids[2]]);
    assert.deepEqual((await scoped(runtime, 'tenant-a', null, query)).map((row) => row.id), []);
    assert.deepEqual((await scoped(runtime, 'tenant-a', 'alice', query)).map((row) => row.id), [ids[0]]);
    await assert.rejects(
      scoped(runtime, 'tenant-a', 'alice', `INSERT INTO gigalibs_assistant.assistant_threads
        (id, tenant_id, owner_user_id, title, idempotency_key, request_sha256, policy_version, policy_checksum, expires_at)
        VALUES ($1,'tenant-a','bob','Forbidden','cross-owner-key',$2,'isolated-proof-v1',$2,now()+interval '30 days')`,
      [randomUUID(), 'a'.repeat(64)]),
      /row-level security policy/,
    );
    await assert.rejects(
      scoped(runtime, 'tenant-a', 'alice', `INSERT INTO gigalibs_assistant.assistant_messages
        (id, tenant_id, thread_id, owner_user_id, actor_user_id, role, content, idempotency_key, request_sha256)
        VALUES ($1,'tenant-a',$2,'alice','bob','USER','Forbidden actor','wrong-actor-proof',$3)`,
      [randomUUID(), ids[0], 'a'.repeat(64)]),
      /row-level security policy/,
    );
  } finally { await runtime.end(); }

  const keys = generateKeyPairSync('ed25519');
  process.env.GIGALIBS_ASSISTANT_DATABASE_URL = `postgres://assistant_proof_runtime:${runtimePassword}@127.0.0.1:${port}/assistant_proof`;
  process.env.GIGALIBS_ASSISTANT_DATABASE_POOL_SIZE = '2';
  process.env.GIGALIBS_ASSISTANT_EXPECTED_MIGRATION_VERSION = '1';
  process.env.GIGALIBS_ASSISTANT_PLATFORM_CONTEXT_AUDIENCE = 'gigalibs-assistant-api';
  process.env.GIGALIBS_ASSISTANT_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64 = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  let app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const apiPort = app.getHttpServer().address().port;
    let endpoint = `http://127.0.0.1:${apiPort}`;
    const token = (tenant, actor, scopes = ['assistant:thread:read', 'assistant:thread:write'], moduleKey = 'gigalibs-assistant', sessionId = randomUUID()) => {
      const now = Math.floor(Date.now() / 1000);
      return signPlatformContextToken({
        iss: 'gigalibs-control-plane', aud: 'gigalibs-assistant-api', sub: actor, tenant_id: tenant,
        session_id: sessionId, auth_version: 1, roles: [], granted_scopes: scopes,
        persona_type: 'OPERATIONS_SUPERVISOR', org_scope: { mode: 'FLAT_TENANT' },
        entitlement: { module_key: moduleKey, status: 'ENABLED', version: 'isolated-proof-v1' },
        iat: now, exp: now + 300, jti: randomUUID(),
      }, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    };
    const aliceSession = randomUUID();
    const alice = token('tenant-a', 'alice', undefined, undefined, aliceSession);
    const bob = token('tenant-a', 'bob');
    const otherTenant = token('tenant-b', 'alice');
    const request = (path, bearer, method = 'GET', body, idempotencyKey) => fetch(`${endpoint}${path}`, {
      method,
      headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal((await request('/v1/threads')).status, 401);
    assert.equal((await request('/v1/threads', token('tenant-a', 'alice', ['*', 'assistant:*']))).status, 403);
    assert.equal((await request('/v1/threads', token('tenant-a', 'alice', ['assistant:thread:read'], 'other-module'))).status, 403);
    assert.equal((await request('/v1/threads', token('tenant-without-policy', 'alice'))).status, 503);
    assert.equal((await request('/v1/threads', alice)).status, 200);
    const create = await request('/v1/threads', alice, 'POST', { title: 'Isolated private conversation' }, 'thread-create-proof-1');
    assert.equal(create.status, 201);
    const thread = await create.json();
    assert.match(thread.id, /^[0-9a-f-]{36}$/);
    const retry = await request('/v1/threads', alice, 'POST', { title: 'Isolated private conversation' }, 'thread-create-proof-1');
    assert.equal(retry.status, 201);
    assert.equal((await retry.json()).id, thread.id);
    assert.equal((await request('/v1/threads', alice, 'POST', { title: 'Different' }, 'thread-create-proof-1')).status, 409);
    assert.equal((await request(`/v1/threads/${thread.id}`, bob)).status, 404);
    assert.equal((await request(`/v1/threads/${thread.id}`, otherTenant)).status, 404);
    assert.equal((await request(`/v1/threads/${thread.id}`, alice)).status, 200);
    const append = await request(`/v1/threads/${thread.id}/messages`, alice, 'POST',
      { content: 'Isolated test message', expectedVersion: thread.version }, 'message-create-proof-1');
    assert.equal(append.status, 201);
    const message = await append.json();
    const appendRetry = await request(`/v1/threads/${thread.id}/messages`, alice, 'POST',
      { content: 'Isolated test message', expectedVersion: thread.version }, 'message-create-proof-1');
    assert.equal(appendRetry.status, 201);
    assert.equal((await appendRetry.json()).id, message.id);
    assert.equal((await request(`/v1/threads/${thread.id}/messages`, bob)).status, 404);
    const history = await request(`/v1/threads/${thread.id}/messages`, alice);
    assert.equal(history.status, 200);
    assert.equal((await history.json()).items.length, 1);
    assert.equal((await request(`/v1/threads/${thread.id}/messages`, alice, 'POST',
      { content: 'Stale', expectedVersion: thread.version }, 'message-create-proof-2')).status, 409);
    const oldThreadId = randomUUID();
    const adminForPolicy = new pg.Client({ connectionString: adminUrl });
    await adminForPolicy.connect();
    try {
      await adminForPolicy.query(`UPDATE gigalibs_assistant.tenant_policies
        SET source_manifest_version='isolated-proof-v2', source_checksum=$1, retention_days=7, updated_at=now()
        WHERE tenant_id='tenant-a'`, ['b'.repeat(64)]);
      await adminForPolicy.query(`INSERT INTO gigalibs_assistant.assistant_threads
        (id, tenant_id, owner_user_id, title, idempotency_key, request_sha256, policy_version,
         policy_checksum, created_at, expires_at)
        VALUES ($1,'tenant-a','alice','Older than current policy','old-policy-proof',$2,
          'isolated-proof-v1',$2,now()-interval '10 days',now()+interval '20 days')`,
      [oldThreadId, 'a'.repeat(64)]);
    } finally { await adminForPolicy.end(); }
    assert.equal((await request(`/v1/threads/${thread.id}`, alice)).status, 200);
    assert.equal((await request(`/v1/threads/${oldThreadId}`, alice)).status, 404);
    const currentThreads = await request('/v1/threads', alice);
    assert.equal(currentThreads.status, 200);
    assert.ok(!(await currentThreads.json()).items.some((item) => item.id === oldThreadId));
    assert.equal((await request(`/v1/threads/${thread.id}/messages`, alice, 'POST',
      { content: 'Policy changed', expectedVersion: thread.version + 1 }, 'message-create-proof-3')).status, 409);
    const nextThread = await request('/v1/threads', alice, 'POST', { title: 'Current policy' }, 'thread-create-proof-2');
    assert.equal(nextThread.status, 201);
    assert.equal((await nextThread.json()).policyVersion, 'isolated-proof-v2');
    assert.equal((await request('/v1/threads', otherTenant)).status, 200);
    const adminForRevocation = new pg.Client({ connectionString: adminUrl });
    await adminForRevocation.connect();
    try {
      await adminForRevocation.query(`INSERT INTO gigalibs_assistant.auth_revocation_events
        (id, tenant_id, revocation_type, session_id) VALUES ($1,'tenant-a','SESSION',$2)`,
      [randomUUID(), aliceSession]);
    } finally { await adminForRevocation.end(); }
    assert.equal((await request('/v1/threads', alice)).status, 401);
    await app.close();
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    endpoint = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const afterRestart = await request('/v1/threads', bob);
    assert.equal(afterRestart.status, 200);
    assert.ok((await afterRestart.json()).items.some((item) => item.id === ids[1]));
    assert.equal((await request('/v1/threads', alice)).status, 401);
  } finally { await app.close(); }
  console.log('ASSISTANT ISOLATED PG16/HTTP PROOF PASSED: forward migration, forced RLS, direct-port auth, tenant/user isolation, unpublished policy, policy version/shorter-retention change, revocation, retry/conflict, service restart; no UAT data');
} finally { stop(); }
