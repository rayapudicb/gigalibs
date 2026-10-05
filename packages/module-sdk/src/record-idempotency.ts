import type { ModuleDatabase } from './database.js';
import type { IdempotencyEntry, IdempotencyStore, RecordValues } from './record-dispatcher.js';

/** A claim left IN_PROGRESS longer than this (a crashed request) may be taken over by a retry. */
const ABANDONED_AFTER_SECONDS = 600;

/**
 * WI-OI-120f (F0.3): Idempotency-Key results in the module's own `record_idempotency` table (each module's migration
 * creates it with forced tenant RLS). The tenant transaction sets the search path to the module schema.
 *
 * - The first request inserts an IN_PROGRESS claim.
 * - A concurrent duplicate finds the claim and is told to wait.
 * - On success the response is stored and replayed to any repeat.
 * - On failure the claim is released so the caller can retry.
 */
export class ModuleIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: Pick<ModuleDatabase, 'withTenantTransaction'>) {}

  claim(tenantId: string, key: string, operation: string, requestHash: string): Promise<IdempotencyEntry | null> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const claimed = await client.query(
        `INSERT INTO record_idempotency (tenant_id, idempotency_key, operation, request_hash, state)
         VALUES ($1, $2, $3, $4, 'IN_PROGRESS')
         ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
           SET operation = EXCLUDED.operation, request_hash = EXCLUDED.request_hash, created_at = now()
           WHERE record_idempotency.state = 'IN_PROGRESS'
             AND record_idempotency.created_at < now() - make_interval(secs => $5)
         RETURNING idempotency_key`,
        [tenantId, key, operation, requestHash, ABANDONED_AFTER_SECONDS],
      );
      if (claimed.rowCount === 1) return null;
      const existing = await client.query<{ request_hash: string; state: 'IN_PROGRESS' | 'COMPLETED'; response: RecordValues | null }>(
        'SELECT request_hash, state, response FROM record_idempotency WHERE tenant_id = $1 AND idempotency_key = $2',
        [tenantId, key],
      );
      const row = existing.rows[0];
      if (!row) throw new Error('The idempotency claim disappeared.');
      return { requestHash: row.request_hash, state: row.state, response: row.response };
    });
  }

  async complete(tenantId: string, key: string, response: RecordValues): Promise<void> {
    await this.database.withTenantTransaction(tenantId, (client) =>
      client.query(
        `UPDATE record_idempotency SET state = 'COMPLETED', response = $3::jsonb, completed_at = now()
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, key, JSON.stringify(response)],
      ),
    );
  }

  async release(tenantId: string, key: string): Promise<void> {
    await this.database.withTenantTransaction(tenantId, (client) =>
      client.query(`DELETE FROM record_idempotency WHERE tenant_id = $1 AND idempotency_key = $2 AND state = 'IN_PROGRESS'`, [
        tenantId,
        key,
      ]),
    );
  }
}

/**
 * The table each module's migration creates, with the module's tenant domain and RLS, for example:
 *
 *   CREATE TABLE record_idempotency (
 *     tenant_id text NOT NULL,
 *     idempotency_key uuid NOT NULL,
 *     operation text NOT NULL,
 *     request_hash char(64) NOT NULL,
 *     state text NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
 *     response jsonb,
 *     created_at timestamptz NOT NULL DEFAULT now(),
 *     completed_at timestamptz,
 *     PRIMARY KEY (tenant_id, idempotency_key)
 *   );
 */
export const RECORD_IDEMPOTENCY_TABLE = 'record_idempotency';
