import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext } from '../auth/authorization.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SafeParser<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };
}

/** Validates a request body or query against its V1 contract; nothing unvalidated reaches SQL. */
export function parseInput<T>(schema: SafeParser<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  throw new BadRequestException({
    code: 'CMMS_VALIDATION_FAILED',
    message: 'The CMMS request is invalid.',
    issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  });
}

/**
 * WI-OI-120be: a chosen sort as SQL. Only columns from the service's fixed map reach ORDER BY, and the record id breaks
 * ties so pages are stable. Answers null when no sort was chosen, so the service keeps its own order.
 */
export function chosenOrder(
  columns: Readonly<Record<string, string>>,
  field: string | undefined,
  direction: 'ASC' | 'DESC',
  idColumn: string,
): string | null {
  if (field === undefined) return null;
  const column = Object.hasOwn(columns, field) ? columns[field] : undefined;
  if (!column) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: `Cannot sort by ${field}.` });
  return `${column} ${direction === 'DESC' ? 'DESC' : 'ASC'} NULLS LAST, ${idColumn} ASC`;
}

export function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: `${field} must be a UUID.` });
  }
}

export function notFound(entity: string): never {
  throw new NotFoundException({ code: 'CMMS_NOT_FOUND', message: `${entity} was not found.` });
}

export function versionConflict(entity: string): never {
  throw new ConflictException({
    code: 'CMMS_VERSION_CONFLICT',
    message: `${entity} was changed by someone else; reload it before retrying.`,
  });
}

/** Maps PostgreSQL constraint violations to client errors; anything else propagates as a server error. */
export function translateConstraint(error: unknown, messages: { readonly unique?: string; readonly reference?: string }): never {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  if (code === '23505' && messages.unique) {
    throw new ConflictException({ code: 'CMMS_UNIQUE_CONFLICT', message: messages.unique });
  }
  if (code === '23503' && messages.reference) {
    throw new BadRequestException({ code: 'CMMS_REFERENCE_INVALID', message: messages.reference });
  }
  throw error;
}

/**
 * Audit evidence and the outbox fact for one state change, written in the caller's transaction so state,
 * audit and event commit or roll back together (Delta 5 D3/D5).
 */
export async function recordMutation(
  client: PoolClient,
  context: CmmsCommandContext,
  mutation: {
    readonly action: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly payload: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  const payload = JSON.stringify(mutation.payload);
  await client.query(
    `INSERT INTO gigalibs_cmms.audit_events
       (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      randomUUID(),
      context.principal.tenantId,
      context.principal.subject,
      mutation.action,
      mutation.aggregateType,
      mutation.aggregateId,
      context.correlationId,
      payload,
    ],
  );
  await client.query(
    `INSERT INTO gigalibs_cmms.outbox_events
       (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
        correlation_id, schema_version, payload)
     VALUES ($1, $2, 'cmms.facts.v1', $3, $4, $5, $6, $7, 1, $8::jsonb)`,
    [
      randomUUID(),
      context.principal.tenantId,
      `${mutation.action}_V1`,
      mutation.aggregateType,
      mutation.aggregateId,
      mutation.aggregateVersion,
      context.correlationId,
      JSON.stringify({ ...mutation.payload, aggregateId: mutation.aggregateId, aggregateVersion: mutation.aggregateVersion }),
    ],
  );
}

export function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

export function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function dateOnlyOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value as Date;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
