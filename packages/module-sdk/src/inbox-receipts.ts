import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';

/** The envelope fields an inbox receipt records. */
export interface ReceiptEnvelope {
  readonly tenantId: string;
  readonly messageId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly correlationId: string;
}

export interface InboxReceiptOptions {
  /** The consuming module's schema, which holds `inbox_receipts`. */
  readonly schema: string;
  /** Consumer name; receipts are unique per (tenant, consumer, message). */
  readonly consumer: string;
  /** The producing module, recorded on the receipt. */
  readonly sourceModule: string;
}

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

/**
 * Inbox receipt de-duplication (ADR-0007): inside the caller's tenant transaction, records a PROCESSING receipt
 * once per message and runs `apply`; a redelivery returns DUPLICATE without applying. The receipt ends PROCESSED,
 * or FAILED with the outcome's code, in the same transaction as the projection.
 */
export async function receiveOnce<O extends { readonly status: string; readonly code?: string }>(
  client: pg.PoolClient,
  options: InboxReceiptOptions,
  envelope: ReceiptEnvelope,
  rawBody: string,
  apply: () => Promise<O>,
): Promise<O | { readonly status: 'DUPLICATE' }> {
  if (!IDENTIFIER_PATTERN.test(options.schema))
    throw new Error('The inbox schema name is invalid.');
  const receipt = await client.query<{ id: string }>(
    `INSERT INTO ${options.schema}.inbox_receipts
       (id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256, status, attempt_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSING', 1)
     ON CONFLICT (tenant_id, consumer_name, message_id) DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      envelope.tenantId,
      options.consumer,
      envelope.messageId,
      envelope.eventType,
      options.sourceModule,
      envelope.schemaVersion,
      envelope.correlationId,
      createHash('sha256').update(rawBody, 'utf8').digest('hex'),
    ],
  );
  const receiptId = receipt.rows[0]?.id;
  if (!receiptId) return { status: 'DUPLICATE' as const };
  const outcome = await apply();
  await client.query(
    `UPDATE ${options.schema}.inbox_receipts SET status = $3, processed_at = now(), last_error_code = $4 WHERE tenant_id = $1 AND id = $2`,
    [
      envelope.tenantId,
      receiptId,
      outcome.status === 'PROCESSED' ? 'PROCESSED' : 'FAILED',
      outcome.code ?? null,
    ],
  );
  return outcome;
}
