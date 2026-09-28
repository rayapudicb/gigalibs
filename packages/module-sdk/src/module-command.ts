import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ModuleCommandContext } from './signed-context.js';

// WI-OI-085a: command helpers for new modules, following the certified CMMS helpers (WI-OI-038): validated input,
// stable error codes, and audit plus outbox written in the caller's transaction.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEMA_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const TOPIC_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*\.v[0-9]+$/;

export interface Queryable {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

interface SafeParser<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };
}

/** Error helpers whose codes carry the module's prefix, for example `INSPECTIONS_NOT_FOUND`. */
export function moduleErrors(codePrefix: string, label: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(codePrefix))
    throw new Error('codePrefix must be upper-case letters, digits and underscores.');
  return Object.freeze({
    /** Validates a body or query against its V1 contract; nothing unvalidated reaches SQL. */
    parseInput<T>(schema: SafeParser<T>, value: unknown): T {
      const result = schema.safeParse(value ?? {});
      if (result.success) return result.data;
      throw new BadRequestException({
        code: `${codePrefix}_VALIDATION_FAILED`,
        message: `The ${label} request is invalid.`,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
    },
    assertUuid(value: string, field: string): void {
      if (!UUID_PATTERN.test(value))
        throw new BadRequestException({
          code: `${codePrefix}_VALIDATION_FAILED`,
          message: `${field} must be a UUID.`,
        });
    },
    notFound(entity: string): never {
      throw new NotFoundException({ code: `${codePrefix}_NOT_FOUND`, message: `${entity} was not found.` });
    },
    versionConflict(entity: string): never {
      throw new ConflictException({
        code: `${codePrefix}_VERSION_CONFLICT`,
        message: `${entity} was changed by someone else; reload it before retrying.`,
      });
    },
    /** Maps PostgreSQL constraint violations to client errors; anything else propagates as a server error. */
    translateConstraint(
      error: unknown,
      messages: { readonly unique?: string; readonly reference?: string },
    ): never {
      const code =
        error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === '23505' && messages.unique)
        throw new ConflictException({ code: `${codePrefix}_UNIQUE_CONFLICT`, message: messages.unique });
      if (code === '23503' && messages.reference)
        throw new BadRequestException({ code: `${codePrefix}_REFERENCE_INVALID`, message: messages.reference });
      throw error;
    },
  });
}

export interface MutationRecordOptions {
  /** The module schema holding `audit_events` and `outbox_events`, for example `gigalibs_inspections`. */
  readonly schema: string;
  /** The outbox topic, for example `inspections.facts.v1`. */
  readonly topic: string;
}

/**
 * Audit evidence and the outbox fact for one state change, written in the caller's transaction so state, audit and
 * event commit or roll back together (Delta 5 D3/D5).
 */
export async function recordMutation(
  client: Queryable,
  options: MutationRecordOptions,
  context: ModuleCommandContext,
  mutation: {
    readonly action: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly payload: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  if (!SCHEMA_PATTERN.test(options.schema)) throw new Error('schema must be a lower-case identifier.');
  if (!TOPIC_PATTERN.test(options.topic)) throw new Error('topic must look like <module>.facts.v1.');
  if (!/^[A-Z][A-Z0-9_]*$/.test(mutation.action))
    throw new Error('action must be upper-case letters, digits and underscores.');
  await client.query(
    `INSERT INTO ${options.schema}.audit_events
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
      JSON.stringify(mutation.payload),
    ],
  );
  await client.query(
    `INSERT INTO ${options.schema}.outbox_events
       (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
        correlation_id, schema_version, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9::jsonb)`,
    [
      randomUUID(),
      context.principal.tenantId,
      options.topic,
      `${mutation.action}_V1`,
      mutation.aggregateType,
      mutation.aggregateId,
      mutation.aggregateVersion,
      context.correlationId,
      JSON.stringify({
        ...mutation.payload,
        aggregateId: mutation.aggregateId,
        aggregateVersion: mutation.aggregateVersion,
      }),
    ],
  );
}
