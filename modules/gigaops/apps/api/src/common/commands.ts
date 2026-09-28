import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';

/** Shared command plumbing for the canonical Workforce services (WI-OI-065, WI-OI-066). */
export interface CommandContext {
  readonly principal: GigaOpsPrincipal;
  readonly correlationId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function commandContext(principal: GigaOpsPrincipal, correlationId: string | undefined): CommandContext {
  return {
    principal,
    correlationId: correlationId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationId) ? correlationId : randomUUID(),
  };
}

export type VersionedTable =
  | 'job_profiles'
  | 'positions'
  | 'engagements'
  | 'availability_patterns'
  | 'absence_types'
  | 'absences'
  | 'working_calendars'
  | 'work_requirements'
  | 'bookings';

/**
 * Advances an aggregate's version for its outbox fact. Absences carry `requested_by`/`decided_by` instead of
 * `updated_by`, so only their version, correlation and timestamp move.
 */
export async function bumpVersion(client: PoolClient, context: CommandContext, table: VersionedTable, id: string): Promise<number> {
  const result =
    table === 'absences'
      ? await client.query<{ version: number }>(
          `UPDATE gigalibs_workforce.absences SET version = version + 1, correlation_id = $3, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 RETURNING version`,
          [context.principal.tenantId, id, context.correlationId],
        )
      : await client.query<{ version: number }>(
          `UPDATE gigalibs_workforce.${table}
              SET version = version + 1, updated_by = $3, correlation_id = $4, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 RETURNING version`,
          [context.principal.tenantId, id, context.principal.subject, context.correlationId],
        );
  return Number(result.rows[0]!.version);
}

export async function recordMutation(
  client: PoolClient,
  context: CommandContext,
  action: string,
  entityType: string,
  entityId: string,
  aggregateVersion: number,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  // Audit evidence and the outbox fact in one statement (both rows are written or neither).
  await client.query(
    `WITH audit AS (
       INSERT INTO gigalibs_workforce.audit_events (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING 1)
     INSERT INTO gigalibs_workforce.outbox_events
       (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
     SELECT $9, $10, 'workforce.facts.v1', $11, $12, $13, $14, $15, 1, $16::jsonb FROM audit`,
    [
      randomUUID(), context.principal.tenantId, context.principal.subject, action, entityType, entityId, context.correlationId, JSON.stringify(payload),
      randomUUID(), context.principal.tenantId, `${action}_V1`, entityType, entityId, aggregateVersion, context.correlationId,
      JSON.stringify({ entityId, aggregateVersion, ...payload }),
    ],
  );
}

export function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  throw new BadRequestException({
    code: 'WORKFORCE_VALIDATION_FAILED',
    message: 'The Workforce request is invalid.',
    issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  });
}

export function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: `${field} must be a UUID.` });
}

export function conflict(entity: string): never {
  throw new ConflictException({ code: 'WORKFORCE_VERSION_CONFLICT', message: `The ${entity} was changed by another request. Reload and try again.` });
}

export function translate(error: unknown, message: string): never {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
  if (code === '23505' || code === '23P01') throw new ConflictException({ code: 'WORKFORCE_CONFLICT', message });
  if (code === '23503') throw new BadRequestException({ code: 'WORKFORCE_REFERENCE_INVALID', message: 'A referenced record does not exist.' });
  throw error;
}

/** Today's calendar date (UTC). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}
