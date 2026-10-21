import { randomUUID } from 'node:crypto';
import type { ModuleCommandContext } from '@gigalibs/module-sdk';
import type pg from 'pg';
import { SCHEMA } from './config.js';

// WI-OI-120bw/120bx: what a change did, field by field, for the audit row (FR-AUD-01).

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export function changes<T extends object>(
  before: T | null,
  after: T,
  fields: readonly (keyof T)[],
): FieldChanges {
  const changed: FieldChanges = {};
  for (const field of fields) {
    const from = before ? before[field] : null;
    if (from !== after[field]) changed[String(field)] = { from, to: after[field] };
  }
  return changed;
}

/** Escapes LIKE wildcards in a search term. */
export function likePattern(search: string): string {
  return `%${search.toLocaleLowerCase('en-US').replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * WI-OI-120ca: an audit row for a read that must be traced (a dossier file served or refused). It changes no record,
 * so it publishes no fact; changes go through `recordMutation`.
 */
export async function recordAccess(
  client: pg.PoolClient,
  context: ModuleCommandContext,
  access: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly payload: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.audit_events (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      randomUUID(),
      context.principal.tenantId,
      context.principal.subject,
      access.action,
      access.entityType,
      access.entityId,
      context.correlationId,
      JSON.stringify(access.payload),
    ],
  );
}
