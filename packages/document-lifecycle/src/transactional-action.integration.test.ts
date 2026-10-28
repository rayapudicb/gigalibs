import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineDocumentGraph } from './transition-runner.js';
import {
  DocumentIdempotencyConflictError,
  executeTransactionalDocumentAction,
  type TransactionalDocumentActionInput,
  type TransactionalDocumentActionStore,
} from './transactional-action.js';
import type { VersionedDocument } from './types.js';

// Opt in explicitly. The test creates and removes its own anonymous-volume PostgreSQL 16 container.
const enabled = process.env.DOCUMENT_ACTION_PG_PROOF === '1';

interface ProofDocument extends VersionedDocument {
  readonly id: string;
  readonly tenantId: string;
}

const documentId = randomUUID();
const rollbackDocumentId = randomUUID();
const input = (id: string, key: string): TransactionalDocumentActionInput => ({
  tenantId: 'tenant-a',
  actorId: 'clerk-1',
  documentId: id,
  action: 'completeIt',
  expectedVersion: 1,
  idempotencyKey: key,
  requestHash: 'a'.repeat(64),
});

describe.skipIf(!enabled)('transactional document actions on isolated PostgreSQL 16', () => {
  const container = `gigalibs-doc-action-${randomUUID().slice(0, 8)}`;
  const adminPassword = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  let admin: pg.Client;
  let pool: pg.Pool;
  let failOutbox = false;

  beforeAll(async () => {
    execFileSync('docker', [
      'run', '-d', '--rm', '--name', container,
      '-e', `POSTGRES_PASSWORD=${adminPassword}`,
      '-e', 'POSTGRES_DB=document_action_proof',
      '-p', '127.0.0.1::5432', 'postgres:16-alpine',
    ], { stdio: 'ignore' });
    const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
      .trim().split(':').pop();
    const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/document_action_proof`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      admin = new pg.Client({ connectionString: adminUrl });
      try {
        await admin.connect();
        break;
      } catch {
        await admin.end().catch(() => undefined);
        if (attempt === 59) throw new Error('Isolated PostgreSQL did not start.');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    await admin!.query(`
      CREATE ROLE document_action_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
      CREATE SCHEMA proof;
      CREATE TABLE proof.documents (
        tenant_id text NOT NULL, id uuid NOT NULL, status text NOT NULL, version integer NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE proof.outcomes (
        tenant_id text NOT NULL, document_id uuid NOT NULL, action text NOT NULL, key text NOT NULL,
        request_hash char(64) NOT NULL, result jsonb NOT NULL,
        PRIMARY KEY (tenant_id, document_id, action, key)
      );
      CREATE TABLE proof.audit_events (tenant_id text NOT NULL, document_id uuid NOT NULL, action text NOT NULL);
      CREATE TABLE proof.outbox_events (tenant_id text NOT NULL, document_id uuid NOT NULL, action text NOT NULL);
      DO $$ DECLARE name text; BEGIN
        FOREACH name IN ARRAY ARRAY['documents', 'outcomes', 'audit_events', 'outbox_events'] LOOP
          EXECUTE format('ALTER TABLE proof.%I ENABLE ROW LEVEL SECURITY', name);
          EXECUTE format('ALTER TABLE proof.%I FORCE ROW LEVEL SECURITY', name);
          EXECUTE format('CREATE POLICY tenant ON proof.%I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', name);
        END LOOP;
      END $$;
      GRANT USAGE ON SCHEMA proof TO document_action_runtime;
      GRANT SELECT, INSERT, UPDATE ON proof.documents, proof.outcomes TO document_action_runtime;
      GRANT SELECT, INSERT ON proof.audit_events, proof.outbox_events TO document_action_runtime;
    `);
    await admin!.query(
      `INSERT INTO proof.documents (tenant_id, id, status, version) VALUES
       ('tenant-a', $1, 'DRAFT', 1), ('tenant-b', $1, 'DRAFT', 1),
       ('tenant-a', $2, 'DRAFT', 1)`, [documentId, rollbackDocumentId],
    );
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = 'document_action_runtime';
    runtimeUrl.password = runtimePassword;
    pool = new pg.Pool({ connectionString: runtimeUrl.toString(), max: 4 });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
    execFileSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
  });

  function store(tenantId: string): TransactionalDocumentActionStore<pg.PoolClient, ProofDocument, ProofDocument> {
    return {
      withTransaction: async (operation) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
          const result = await operation(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      lockDocument: async (client, action) => {
        const row = await client.query<{ tenant_id: string; id: string; status: string; version: number }>(
          `SELECT tenant_id, id, status, version FROM proof.documents
            WHERE tenant_id = $1 AND id = $2 FOR UPDATE NOWAIT`,
          [action.tenantId, action.documentId],
        );
        if (!row.rows[0]) throw new Error('Document not found in tenant.');
        return { tenantId: row.rows[0].tenant_id, id: row.rows[0].id, status: row.rows[0].status, version: row.rows[0].version };
      },
      authorize: async (_client, context) => {
        if (context.actorId === 'revoked') throw new Error('Action denied.');
      },
      findOutcome: async (client, action) => {
        const row = await client.query<{ request_hash: string; result: ProofDocument }>(
          `SELECT request_hash, result FROM proof.outcomes
            WHERE tenant_id = $1 AND document_id = $2 AND action = $3 AND key = $4`,
          [action.tenantId, action.documentId, action.action, action.idempotencyKey],
        );
        return row.rows[0] ? { requestHash: row.rows[0].request_hash.trim(), result: row.rows[0].result } : null;
      },
      graph: (client) => defineDocumentGraph<ProofDocument>({
        completeIt: {
          from: ['DRAFT'], to: 'COMPLETED',
          effect: async (context) => {
            const row = await client.query<{ tenant_id: string; id: string; status: string; version: number }>(
              `UPDATE proof.documents SET status = 'COMPLETED', version = version + 1
                WHERE tenant_id = $1 AND id = $2 AND version = $3
                RETURNING tenant_id, id, status, version`,
              [context.tenantId, context.documentId, context.expectedVersion],
            );
            if (!row.rows[0]) throw new Error('Document version changed.');
            return { tenantId: row.rows[0].tenant_id, id: row.rows[0].id, status: row.rows[0].status, version: row.rows[0].version };
          },
        },
      }),
      appendAudit: async (client, context) => {
        await client.query('INSERT INTO proof.audit_events VALUES ($1, $2, $3)', [context.tenantId, context.documentId, context.action]);
      },
      appendOutbox: async (client, context) => {
        if (failOutbox) throw new Error('Outbox write failed.');
        await client.query('INSERT INTO proof.outbox_events VALUES ($1, $2, $3)', [context.tenantId, context.documentId, context.action]);
      },
      storeOutcome: async (client, action, result) => {
        await client.query(
          'INSERT INTO proof.outcomes VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
          [action.tenantId, action.documentId, action.action, action.idempotencyKey, action.requestHash, JSON.stringify(result)],
        );
      },
    };
  }

  it('commits one effect/audit/outbox, replays exactly and isolates the other tenant', async () => {
    const command = input(documentId, 'first');
    const first = await executeTransactionalDocumentAction(command, store('tenant-a'));
    expect(first).toMatchObject({ status: 'COMPLETED', version: 2 });
    expect(await executeTransactionalDocumentAction(command, store('tenant-a'))).toEqual(first);
    await expect(executeTransactionalDocumentAction({ ...command, requestHash: 'b'.repeat(64) }, store('tenant-a')))
      .rejects.toBeInstanceOf(DocumentIdempotencyConflictError);
    await expect(executeTransactionalDocumentAction({ ...command, actorId: 'revoked' }, store('tenant-a')))
      .rejects.toThrow('Action denied.');
    const rows = await admin.query<{ tenant_id: string; status: string }>(
      'SELECT tenant_id, status FROM proof.documents WHERE id = $1 ORDER BY tenant_id', [documentId],
    );
    expect(rows.rows).toEqual([
      { tenant_id: 'tenant-a', status: 'COMPLETED' },
      { tenant_id: 'tenant-b', status: 'DRAFT' },
    ]);
    const counts = await admin.query<{ audits: string; events: string }>(
      `SELECT (SELECT count(*) FROM proof.audit_events WHERE document_id = $1) AS audits,
              (SELECT count(*) FROM proof.outbox_events WHERE document_id = $1) AS events`, [documentId],
    );
    expect(counts.rows[0]).toEqual({ audits: '1', events: '1' });
    await expect(executeTransactionalDocumentAction(command, store('tenant-b')))
      .rejects.toThrow('Document not found in tenant.');
  });

  it('rolls back the document and audit if the outbox fails, then accepts a retry', async () => {
    const command = input(rollbackDocumentId, 'retry');
    failOutbox = true;
    try {
      await expect(executeTransactionalDocumentAction(command, store('tenant-a')))
        .rejects.toThrow('Outbox write failed.');
    } finally {
      failOutbox = false;
    }
    const before = await admin.query<{ status: string; version: number }>(
      'SELECT status, version FROM proof.documents WHERE tenant_id = $1 AND id = $2',
      ['tenant-a', rollbackDocumentId],
    );
    expect(before.rows[0]).toEqual({ status: 'DRAFT', version: 1 });
    const evidence = await admin.query<{ n: string }>(
      'SELECT count(*) AS n FROM proof.audit_events WHERE document_id = $1', [rollbackDocumentId],
    );
    expect(evidence.rows[0]?.n).toBe('0');
    await expect(executeTransactionalDocumentAction(command, store('tenant-a')))
      .resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('refuses a document row already locked by another transaction', async () => {
    const heldId = randomUUID();
    await admin.query('INSERT INTO proof.documents VALUES ($1, $2, $3, $4)', ['tenant-a', heldId, 'DRAFT', 1]);
    const locker = await pool.connect();
    try {
      await locker.query('BEGIN');
      await locker.query(`SELECT set_config('app.tenant_id', 'tenant-a', true)`);
      await locker.query('SELECT id FROM proof.documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE', ['tenant-a', heldId]);
      await expect(executeTransactionalDocumentAction(input(heldId, 'locked'), store('tenant-a')))
        .rejects.toMatchObject({ code: '55P03' });
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
  });
});
