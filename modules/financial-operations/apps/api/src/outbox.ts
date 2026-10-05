import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from './config.js';

export interface FinanceOutboxEvent {
  /** Event id; also the outbox row id. */
  readonly id: string;
  /** Versioned event type, for example `finance.costing.layer.created.v1`. */
  readonly type: string;
  /** The record the event is about; events for one record are delivered in version order. */
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly correlationId?: string;
  readonly causationId?: string | null;
  /** Stored as the payload. */
  readonly data: unknown;
}

/**
 * Appends an event to the Finance outbox inside the caller's transaction (WI-OI-120c, audit P1-03). Every required
 * column is set, and the aggregate version is the next one for the record, so a second event about the same record
 * never collides with the unique key (tenant, aggregate type, aggregate id, aggregate version, event type). A
 * transaction-scoped advisory lock serialises concurrent writers for the same record.
 */
export async function appendOutboxEvent(
  client: PoolClient,
  tenantId: string,
  event: FinanceOutboxEvent,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `${SCHEMA}:outbox:${tenantId}:${event.aggregateType}:${event.aggregateId}`,
  ]);
  const next = await client.query<{ version: number }>(
    `SELECT COALESCE(MAX(aggregate_version), 0)::int + 1 AS version
       FROM ${SCHEMA}.outbox_events
      WHERE tenant_id = $1 AND aggregate_type = $2 AND aggregate_id = $3`,
    [tenantId, event.aggregateType, event.aggregateId],
  );
  await client.query(
    `INSERT INTO ${SCHEMA}.outbox_events (
       id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
       correlation_id, causation_id, schema_version, payload, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, 'PENDING')`,
    [
      event.id,
      tenantId,
      TOPIC,
      event.type,
      event.aggregateType,
      event.aggregateId,
      next.rows[0]?.version ?? 1,
      event.correlationId ?? event.id,
      event.causationId ?? null,
      JSON.stringify(event.data),
    ],
  );
}
